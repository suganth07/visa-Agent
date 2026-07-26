import { Module } from '@nitrostack/core';
import { RecommendationTools } from './recommendation.tools.js';
import { RecommendationService } from './recommendation.service.js';
import { HousingService } from '../housing/housing.service.js';
import { MongoService } from '../../services/mongodb.service.js';
import { CaseModule } from '../case/case.module.js';

/**
 * Broker Recommendation Module
 *
 * Sixth vertical slice: the AI ranking layer over the Housing Module's
 * deterministic broker shortlist.
 *
 * `recommend_best_brokers` loads the case, reads its stored housing
 * preferences and eligible brokers through HousingService, sends that fixed
 * candidate set to Gemini 2.5 Flash for ordering, validates the response
 * against the candidate set, and persists the result to
 * `broker_recommendations`.
 *
 * Boundary with the Housing Module, kept deliberately strict:
 * - Housing decides WHICH brokers are eligible — deterministic, auditable,
 *   and untouched by this module.
 * - This module decides only the ORDER of that fixed set, and verifies every
 *   returned brokerId came from it.
 *
 * Wiring note: HousingService and MongoService are listed as providers here
 * rather than exported from HousingModule, so that module needs no change.
 * NitroStack's DIContainer is a process-wide singleton that caches instances
 * by class token (core/di/container.js), so these resolve to the very same
 * instances HousingModule uses — this is genuine reuse, not a second copy.
 * HousingModule itself is deliberately NOT imported: it is already imported
 * by AppModule, and importing it again would register HousingTools' tools a
 * second time.
 *
 * Explicitly out of scope: re-querying Mongo for brokers, reimplementing any
 * filter rule, broker selection, approval, assignment, and notifications.
 *
 * TODO(recommendation): promote MongoService to a shared infrastructure
 * module now that two modules depend on it (docs/ARCHITECTURE.md §7), rather
 * than listing it in each consumer.
 * TODO(recommendation): a ranking is advisory. Human approval is mandatory
 * before broker assignment (docs/MODULES.md §46); no tool here may select,
 * assign, or imply assignment of a broker.
 */
@Module({
    name: 'recommendation',
    description: 'Broker Recommendation Module (sixth vertical slice): Gemini 2.5 Flash ranking over the Housing Module\'s deterministic broker shortlist, with strict response validation against the candidate set. Does not filter, select, or assign brokers.',
    imports: [CaseModule],
    controllers: [RecommendationTools],
    providers: [MongoService, HousingService, RecommendationService]
})
export class BrokerRecommendationModule { }
