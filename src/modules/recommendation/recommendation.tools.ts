import { ToolDecorator as Tool, ExecutionContext, z, UseGuards, Injectable } from '@nitrostack/core';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { RecommendationService } from './recommendation.service.js';
import { VisaCaseService } from '../case/case.service.js';

/**
 * RecommendationTools
 *
 * Sixth vertical slice: the AI ranking stage over the Housing Module's
 * deterministic shortlist.
 *
 * Cross-module access uses the same NitroStack DI pattern as every other
 * slice: VisaCaseService is injected from the Case Module and called
 * directly — never over HTTP, never tool-to-tool. The Housing Module's
 * filtering is reached through RecommendationService, which composes
 * HousingService's existing public methods rather than re-querying Mongo or
 * duplicating any filter rule.
 *
 * TODO(recommendation): required scopes per docs/ARCHITECTURE.md §15 would
 * be `case:read`. OAuthGuard is applied for consistency with the rest of the
 * codebase; no fine-grained scope or tenant check is enforced yet.
 * TODO(recommendation): no audit logging or event emission yet.
 */
@Injectable({ deps: [RecommendationService, VisaCaseService] })
export class RecommendationTools {
    constructor(
        private recommendationService: RecommendationService,
        private visaCaseService: VisaCaseService
    ) { }

    @Tool({
        name: 'recommend_best_brokers',
        description: 'Ranks the deterministic broker shortlist for a case using Gemini 2.5 Flash and returns the best-fitting broker with a confidence score, a reason, and the top three in rank order. The candidate set comes from the Housing Module\'s deterministic filters and is never widened here — the model only orders the brokers it is given, and any response referencing an unknown broker is rejected. Advisory only: this does not assign a broker.',
        inputSchema: z.object({
            caseId: z.string().describe('The case ID to rank brokers for. Housing preferences must already be stored via collect_housing_preferences.')
        }),
        examples: {
            request: {
                caseId: '3fa85f64-5717-4562-b3fc-2c963f66afa6'
            },
            response: {
                caseId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                recommendationId: 'b7c2e1d0-4f8a-4c11-9d33-5a1e2f7b9c04',
                candidateCount: 2,
                recommendedBroker: 'broker_berlin_001',
                confidence: 0.94,
                reason: 'Covers Mitte and Kreuzberg, handles 2bhk apartments within the stated budget, and lists Hindi language support for a family of two.',
                topThree: [
                    {
                        brokerId: 'broker_berlin_001',
                        rank: 1,
                        reason: 'Strongest area coverage and the highest prior case volume of the candidates.'
                    },
                    {
                        brokerId: 'broker_berlin_002',
                        rank: 2,
                        reason: 'Covers two preferred areas but does not list Hindi language support.'
                    }
                ]
            }
        }
    })
    @UseGuards(OAuthGuard)
    async recommendBestBrokers(input: any, ctx: ExecutionContext) {
        ctx.logger.info('Ranking brokers for case', {
            user: ctx.auth?.subject,
            caseId: input.caseId
        });

        // 1. Load the case via VisaCaseService.
        const visaCase = await this.visaCaseService.getCase(input.caseId);

        // 2. Load stored housing preferences and the deterministic Top 10 by
        //    composing the Housing Module's existing methods. Mongo is not
        //    queried again here and no filter rule is reimplemented.
        const { preferences, candidates } = await this.recommendationService.loadShortlist(visaCase);

        // 3. Nothing to rank means nothing to recommend. Returning early keeps
        //    the model from being asked to choose from an empty set, which is
        //    the only way it could be tempted to invent a broker.
        if (candidates.length === 0) {
            ctx.logger.info('No eligible brokers to rank', {
                user: ctx.auth?.subject,
                caseId: visaCase.caseId
            });

            return {
                caseId: visaCase.caseId,
                candidateCount: 0,
                recommendedBroker: null,
                confidence: 0,
                reason: 'No brokers matched this case\'s destination, preferred areas, budget, and apartment type. Nothing was ranked.',
                topThree: []
            };
        }

        // 4. Rank via Gemini, then validate every returned brokerId against
        //    the candidate set before it is trusted.
        const ranking = await this.recommendationService.rankCandidates(preferences, candidates);

        // 5. Persist the ranked recommendation.
        const recommendationId = await this.recommendationService.saveRankedRecommendation({
            caseId: visaCase.caseId,
            preferences,
            candidates,
            ranking
        });

        ctx.logger.info('Broker ranking complete', {
            user: ctx.auth?.subject,
            caseId: visaCase.caseId,
            recommendationId,
            recommendedBroker: ranking.recommendedBroker
        });

        return {
            caseId: visaCase.caseId,
            recommendationId,
            candidateCount: candidates.length,
            recommendedBroker: ranking.recommendedBroker,
            confidence: ranking.confidence,
            reason: ranking.reason,
            topThree: ranking.topThree
        };
    }
}
