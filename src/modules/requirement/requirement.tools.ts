import { ToolDecorator as Tool, Widget, ExecutionContext, z, UseGuards, Injectable } from '@nitrostack/core';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { RequirementService } from './requirement.service.js';
import { VisaCaseService } from '../case/case.service.js';

/**
 * RequirementTools
 *
 * Third vertical slice: retrieves a case via VisaCaseService (injected
 * from the Case Module, the same NitroStack DI pattern the Onboarding
 * Module uses — not HTTP, not a tool-to-tool call), resolves requirements
 * for that case's nationality/destinationCountry/visaType via
 * RequirementService, and returns a checklist/timeline/notes summary.
 *
 * TODO(requirement): required scopes per docs/ARCHITECTURE.md §15 would be
 * `case:read` (reads an existing case). OAuthGuard is applied for
 * consistency with the rest of the codebase; no fine-grained scope or
 * tenant check is enforced yet.
 * TODO(requirement): no audit logging or event emission yet.
 */
@Injectable({ deps: [RequirementService, VisaCaseService] })
export class RequirementTools {
    constructor(
        private requirementService: RequirementService,
        private visaCaseService: VisaCaseService
    ) { }

    @Tool({
        name: 'resolve_requirements',
        description: 'Retrieves a visa case, resolves its visa requirements from a small in-memory rules dataset (nationality + destinationCountry + visaType), caches the result for that case, and returns a checklist, timeline, and notes. No MongoDB, Qdrant, Firecrawl, LLM, or web scraping is used.',
        inputSchema: z.object({
            caseId: z.string().describe('The case ID returned by case_start or onboarding_extract')
        }),
        examples: {
            request: {
                caseId: '3fa85f64-5717-4562-b3fc-2c963f66afa6'
            },
            response: {
                caseId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                checklist: [
                    'Valid passport',
                    'University admission/enrollment letter',
                    'Proof of financial resources (e.g., blocked account)'
                ],
                timeline: '6-12 weeks for appointment scheduling and processing',
                notes: [
                    'Requirements vary by German consulate jurisdiction and can change without notice.',
                    'This is illustrative sample data, not verified embassy guidance.'
                ]
            }
        }
    })
    @Widget('migrate-ease')
    @UseGuards(OAuthGuard)
    async resolveRequirements(input: any, ctx: ExecutionContext) {
        ctx.logger.info('Resolving visa requirements for case', {
            user: ctx.auth?.subject,
            caseId: input.caseId
        });

        // 1. Retrieve the case via VisaCaseService.
        const visaCase = await this.visaCaseService.getCase(input.caseId);

        // 2. Pass nationality, destinationCountry, and visaType into RequirementService.
        const summary = this.requirementService.resolveAndCacheForCase(visaCase.caseId, {
            nationality: visaCase.nationality,
            destinationCountry: visaCase.destinationCountry,
            visaType: visaCase.visaType
        });

        ctx.logger.info('Visa requirements resolved', {
            user: ctx.auth?.subject,
            caseId: visaCase.caseId
        });

        // 3. Return checklist, timeline, and notes.
        return {
            caseId: summary.caseId,
            checklist: summary.requiredDocuments,
            timeline: summary.estimatedTimeline,
            notes: summary.specialNotes
        };
    }
}
