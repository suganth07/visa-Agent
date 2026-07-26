import { Injectable } from '@nitrostack/core';
import { randomUUID } from 'node:crypto';
import { MongoService, COLLECTIONS } from '../../services/mongodb.service.js';
import {
    type BrokerCandidate,
    type BrokerProfile
} from '../housing/housing.service.js';
import type { VisaCaseRecord } from '../case/case.service.js';

export interface RankedBroker {
    brokerId: string;
    rank: number;
    reason: string;
}

/** Kept unchanged for the public `recommend_best_brokers` response contract. */
export interface BrokerRanking {
    recommendedBroker: string;
    confidence: number;
    reason: string;
    topThree: RankedBroker[];
}

export interface DemoBrokerRecommendation {
    recommendationId: string;
    candidateCount: number;
    ranking: BrokerRanking | null;
}

const DEMO_REASON = 'Demo mode random broker selection.';

function normalize(value: string): string {
    return value.trim().toLowerCase();
}

function toCandidate(broker: BrokerProfile): BrokerCandidate {
    return {
        brokerId: broker.brokerId,
        name: broker.name,
        description: broker.description,
        rating: broker.rating,
        areasCovered: broker.areasCovered,
        languages: broker.languages,
        previousCasesHandled: broker.previousCasesHandled
    };
}

/** One random shuffle drives both the selected broker and the top-three list. */
function shuffle<T>(items: T[]): T[] {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const replacement = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[replacement]] = [shuffled[replacement], shuffled[index]];
    }

    return shuffled;
}

/**
 * Hackathon-only broker selection. This deliberately does not load housing
 * preferences, invoke a model, build embeddings, rank candidates, or persist
 * a recommendation. It only reads active profiles and optionally filters by
 * the case destination country.
 */
@Injectable({ deps: [MongoService] })
export class RecommendationService {
    constructor(private mongo: MongoService) { }

    async recommendDemoBroker(visaCase: VisaCaseRecord): Promise<DemoBrokerRecommendation> {
        const collection = await this.mongo.collection<BrokerProfile>(COLLECTIONS.brokerProfiles);
        const available = await collection
            .find({ active: true }, { projection: { _id: 0 } })
            .toArray();

        const destination = visaCase.destinationCountry.trim();
        const countryMatches = destination.length > 0
            ? available.filter((broker) => normalize(broker.country) === normalize(destination))
            : [];

        // When there is no destination match, use all available brokers.
        const candidates = (countryMatches.length > 0 ? countryMatches : available).map(toCandidate);

        if (candidates.length === 0) {
            return {
                recommendationId: randomUUID(),
                candidateCount: 0,
                ranking: null
            };
        }

        const randomlyOrdered = shuffle(candidates);
        const selected = randomlyOrdered[0];

        return {
            recommendationId: randomUUID(),
            candidateCount: candidates.length,
            ranking: {
                recommendedBroker: selected.brokerId,
                confidence: 1.0,
                reason: DEMO_REASON,
                topThree: randomlyOrdered.slice(0, 3).map((broker, index) => ({
                    brokerId: broker.brokerId,
                    rank: index + 1,
                    reason: DEMO_REASON
                }))
            }
        };
    }
}
