import { Injectable } from '@nitrostack/core';
import { randomUUID } from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import { MongoService, COLLECTIONS } from '../../services/mongodb.service.js';
import {
    HousingService,
    type BrokerCandidate,
    type HousingPreferenceSummary
} from '../housing/housing.service.js';
import type { VisaCaseRecord } from '../case/case.service.js';

/** Model used for the ranking stage. */
export const RANKING_MODEL = 'gemini-2.5-flash';

/* ------------------------------ Result shapes ----------------------------- */

export interface RankedBroker {
    brokerId: string;
    rank: number;
    reason: string;
}

/** The validated ranking, exactly as returned to the caller. */
export interface BrokerRanking {
    recommendedBroker: string;
    confidence: number;
    reason: string;
    topThree: RankedBroker[];
}

/**
 * Response schema handed to Gemini. Constraining the model to this shape at
 * the API level (rather than only asking for JSON in the prompt) is the first
 * of two defences; `validateRanking` below is the second, because a schema
 * still cannot guarantee the model stays inside the candidate set.
 */
const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        recommendedBroker: {
            type: Type.STRING,
            description: 'brokerId of the single best-fitting broker. Must be one of the supplied candidate brokerIds.'
        },
        confidence: {
            type: Type.NUMBER,
            description: 'Confidence in the recommendation, between 0 and 1.'
        },
        reason: {
            type: Type.STRING,
            description: 'Why this broker fits, citing only supplied candidate attributes.'
        },
        topThree: {
            type: Type.ARRAY,
            description: 'The three best candidates in rank order. Fewer than three only if fewer candidates were supplied.',
            items: {
                type: Type.OBJECT,
                properties: {
                    brokerId: { type: Type.STRING, description: 'Must be one of the supplied candidate brokerIds.' },
                    rank: { type: Type.INTEGER, description: 'Rank position, starting at 1.' },
                    reason: { type: Type.STRING, description: 'Why this broker holds this rank.' }
                },
                required: ['brokerId', 'rank', 'reason']
            }
        }
    },
    required: ['recommendedBroker', 'confidence', 'reason', 'topThree']
} as const;

const SYSTEM_INSTRUCTION = [
    'You are an experienced relocation advisor.',
    '',
    'You are given a user\'s housing preferences and a list of candidate relocation brokers.',
    '',
    'Rank ONLY the brokers provided.',
    'Never invent brokers.',
    'Never modify ratings.',
    'Never modify budgets.',
    'Never hallucinate.',
    '',
    'Rank using: coverage, experience, rating, languages, budget fit, and family suitability.',
    '',
    'Return STRICT JSON matching the required schema and nothing else.'
].join('\n');

/** Thrown when the model returns something unusable. */
export class RankingResponseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RankingResponseError';
    }
}

/**
 * RecommendationService
 *
 * Sixth vertical slice: the AI ranking layer over the Housing Module's
 * deterministic shortlist.
 *
 * Division of responsibility, deliberately strict:
 * - The Housing Module decides *which* brokers are eligible. That filtering
 *   is deterministic, auditable, and is not repeated or second-guessed here.
 * - This service decides only the *order* of that fixed set, and every
 *   returned brokerId is verified to come from it.
 *
 * TODO(recommendation): a ranking is advisory. Human approval is mandatory
 * before broker assignment (docs/MODULES.md §46) — nothing here selects,
 * assigns, or may be presented as assigning a broker.
 * TODO(recommendation): no audit entry or `broker.ranked` event is written
 * yet (docs/EVENTS.md). Model name, prompt version, and token usage should
 * be recorded against each recommendation for traceability.
 * TODO(recommendation): no retry/backoff, timeout, or rate-limit handling
 * around the model call yet (docs/ARCHITECTURE.md §183).
 */
@Injectable({ deps: [HousingService, MongoService] })
export class RecommendationService {
    constructor(
        private housingService: HousingService,
        private mongo: MongoService
    ) { }

    /**
     * Lazily constructs the client so importing this module never throws and
     * the server still boots without GEMINI_API_KEY — the same contract
     * MongoService uses. The failure surfaces on first use, where it can be
     * reported to a caller.
     */
    private createClient(): GoogleGenAI {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error(
                'GEMINI_API_KEY is not set. recommend_best_brokers requires a Google AI Studio API key ' +
                '— copy .env.example to .env and set GEMINI_API_KEY.'
            );
        }
        return new GoogleGenAI({ apiKey });
    }

    /**
     * Builds the structured JSON payload sent to the model.
     *
     * Reuses `HousingService.prepareBrokerRankingPrompt()` rather than
     * rebuilding the payload, so the deterministic module stays the single
     * definition of what a ranking stage is allowed to see.
     */
    buildRankingPayload(
        preferences: HousingPreferenceSummary,
        candidates: BrokerCandidate[]
    ) {
        return this.housingService.prepareBrokerRankingPrompt(preferences, candidates);
    }

    /**
     * Validates a parsed model response against the candidate set.
     *
     * The schema constrains shape but not content, so this enforces what
     * actually matters: every brokerId must exist in the supplied
     * candidates. A model that invents or substitutes an ID is rejected
     * rather than silently passed through as a recommendation.
     */
    validateRanking(parsed: unknown, candidates: BrokerCandidate[]): BrokerRanking {
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new RankingResponseError('Ranking response was not a JSON object.');
        }

        const raw = parsed as Record<string, unknown>;
        const allowed = new Set(candidates.map((c) => c.brokerId));

        const recommendedBroker = raw.recommendedBroker;
        if (typeof recommendedBroker !== 'string' || recommendedBroker.length === 0) {
            throw new RankingResponseError('Ranking response is missing a valid "recommendedBroker".');
        }
        if (!allowed.has(recommendedBroker)) {
            throw new RankingResponseError(
                `Ranking response recommended "${recommendedBroker}", which is not one of the candidate brokers.`
            );
        }

        const confidence = raw.confidence;
        if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
            throw new RankingResponseError('Ranking response is missing a numeric "confidence".');
        }
        if (confidence < 0 || confidence > 1) {
            throw new RankingResponseError(
                `Ranking response returned confidence ${confidence}, which is outside the range 0-1.`
            );
        }

        const reason = raw.reason;
        if (typeof reason !== 'string' || reason.trim().length === 0) {
            throw new RankingResponseError('Ranking response is missing a non-empty "reason".');
        }

        if (!Array.isArray(raw.topThree)) {
            throw new RankingResponseError('Ranking response is missing a "topThree" array.');
        }

        const seen = new Set<string>();
        const topThree: RankedBroker[] = raw.topThree.map((entry, index) => {
            if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
                throw new RankingResponseError(`topThree[${index}] is not an object.`);
            }
            const item = entry as Record<string, unknown>;

            const brokerId = item.brokerId;
            if (typeof brokerId !== 'string' || !allowed.has(brokerId)) {
                throw new RankingResponseError(
                    `topThree[${index}] references "${String(brokerId)}", which is not one of the candidate brokers.`
                );
            }
            if (seen.has(brokerId)) {
                throw new RankingResponseError(`topThree lists "${brokerId}" more than once.`);
            }
            seen.add(brokerId);

            const rank = item.rank;
            if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1) {
                throw new RankingResponseError(`topThree[${index}] has an invalid "rank".`);
            }

            const itemReason = item.reason;
            if (typeof itemReason !== 'string' || itemReason.trim().length === 0) {
                throw new RankingResponseError(`topThree[${index}] is missing a non-empty "reason".`);
            }

            return { brokerId, rank, reason: itemReason };
        });

        if (topThree.length === 0) {
            throw new RankingResponseError('Ranking response returned an empty "topThree".');
        }

        // Never claim more entries than there were candidates to rank.
        const expected = Math.min(3, candidates.length);
        if (topThree.length > expected) {
            throw new RankingResponseError(
                `Ranking response returned ${topThree.length} entries in topThree but only ${candidates.length} candidates were supplied.`
            );
        }

        topThree.sort((a, b) => a.rank - b.rank);

        return { recommendedBroker, confidence, reason, topThree };
    }

    /**
     * Calls Gemini to rank the supplied candidates, then validates the result.
     *
     * `temperature: 0` and a fixed candidate set keep the call as close to
     * reproducible as a model allows — the deterministic shortlist upstream
     * is unaffected either way.
     */
    async rankCandidates(
        preferences: HousingPreferenceSummary,
        candidates: BrokerCandidate[]
    ): Promise<BrokerRanking> {
        const client = this.createClient();
        const payload = this.buildRankingPayload(preferences, candidates);

        const response = await client.models.generateContent({
            model: RANKING_MODEL,
            contents: JSON.stringify(payload),
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
                temperature: 0
            }
        });

        const text = response.text;
        if (typeof text !== 'string' || text.trim().length === 0) {
            throw new RankingResponseError('The ranking model returned an empty response.');
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            throw new RankingResponseError('The ranking model returned malformed JSON.');
        }

        return this.validateRanking(parsed, candidates);
    }

    /**
     * Persists the ranked recommendation.
     *
     * Written directly through MongoService rather than
     * `HousingService.saveRecommendation()`, because that method is fixed at
     * status `PENDING_RANKING` and stores an unranked candidate set — this
     * record is a different thing and must not overwrite or impersonate it.
     *
     * `status` is `RANKED`, never `ASSIGNED`: selection and assignment are
     * owned by the Approval and Broker modules.
     */
    async saveRankedRecommendation(params: {
        caseId: string;
        preferences: HousingPreferenceSummary;
        candidates: BrokerCandidate[];
        ranking: BrokerRanking;
    }): Promise<string> {
        const collection = await this.mongo.collection(COLLECTIONS.brokerRecommendations);
        const recommendationId = randomUUID();

        await collection.insertOne({
            recommendationId,
            caseId: params.caseId,
            requirements: params.preferences,
            candidates: params.candidates,
            candidateCount: params.candidates.length,
            recommendedBroker: params.ranking.recommendedBroker,
            confidence: params.ranking.confidence,
            reason: params.ranking.reason,
            topThree: params.ranking.topThree,
            model: RANKING_MODEL,
            status: 'RANKED',
            createdAt: new Date().toISOString()
        });

        return recommendationId;
    }

    /**
     * Reads the case's stored preferences and its deterministic shortlist.
     *
     * Composes the Housing Module's existing public methods — the same three
     * calls `recommend_brokers` makes — so the filtering rules live in
     * exactly one place and are not reimplemented here.
     */
    async loadShortlist(visaCase: VisaCaseRecord): Promise<{
        preferences: HousingPreferenceSummary;
        candidates: BrokerCandidate[];
    }> {
        const stored = await this.housingService.getPreferences(visaCase.caseId);
        const candidates = await this.housingService.findEligibleBrokers(visaCase, stored);
        const preferences = this.housingService.buildPreferenceSummary(visaCase, stored);
        return { preferences, candidates };
    }
}
