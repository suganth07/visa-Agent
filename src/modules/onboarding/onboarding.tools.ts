import { ToolDecorator as Tool, Widget, ExecutionContext, z, UseGuards, Injectable } from '@nitrostack/core';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { OnboardingService } from './onboarding.service.js';
import { OnboardingWorkflowGuard } from '../../services/onboarding-workflow.guard.js';

/**
 * OnboardingTools
 *
 * Second vertical slice: MCP surface for natural-language onboarding.
 * Deterministic extraction only — no LLM call happens anywhere in this
 * module. See onboarding-extraction.service.ts for the regex/heuristics.
 *
 * TODO(onboarding): required scopes per docs/ARCHITECTURE.md §15 would be
 * `case:write` (this tool can start a case). OAuthGuard is applied for
 * consistency with the rest of the codebase; no fine-grained scope or
 * tenant check is enforced yet.
 * TODO(onboarding): no audit logging or event emission yet — case
 * creation triggered from here has the same gaps as `case_start` itself
 * (see TODOs in src/modules/case/case.service.ts).
 */
@Injectable({ deps: [OnboardingService, OnboardingWorkflowGuard] })
export class OnboardingTools {
    constructor(
        private onboardingService: OnboardingService,
        private workflowGuard: OnboardingWorkflowGuard
    ) { }

    @Tool({
        name: 'onboarding_extract',
        description: 'First step of the deterministic onboarding workflow. Extracts nationality, destinationCountry, and visaType from a free-form message. If information is missing, ask only for the missing fields and stop. If a case is started, call resolve_requirements exactly once with its caseId, then provide the final response and stop. Do not call case_start, case_get, or any additional tool after resolve_requirements.',
        inputSchema: z.object({
            message: z.string().min(1).describe('Free-form user message describing their onboarding intent, e.g. "I am from India and moving to Germany for Masters"')
        }),
        examples: {
            request: {
                message: 'I am from India and moving to Germany for Masters'
            },
            response: {
                outcome: 'case_started',
                extracted: {
                    nationality: 'India',
                    destinationCountry: 'Germany',
                    visaType: 'Student'
                },
                caseId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
                status: 'DRAFT',
                createdAt: '2026-07-25T12:00:00.000Z',
                nextStep: 'Complete onboarding.'
            }
        }
    })
    @Widget('migrate-ease')
    @UseGuards(OAuthGuard)
    async onboardingExtract(input: any, ctx: ExecutionContext) {
        ctx.logger.info('Processing onboarding message', {
            user: ctx.auth?.subject,
            messageLength: input.message?.length
        });

        const workflowKey = this.workflowGuard.onboardingKey(ctx, input.message);
        const result = await this.workflowGuard.executeOnce(workflowKey, async () => {
            const processed = await this.onboardingService.processMessage(input.message);

            if (processed.outcome === 'missing_information') {
                return {
                    outcome: processed.outcome,
                    extracted: processed.extracted,
                    missingFields: processed.missingFields,
                    message: `Missing required information: ${processed.missingFields.join(', ')}`
                };
            }

            this.workflowGuard.linkCase(ctx, workflowKey, processed.caseId);
            return {
                outcome: processed.outcome,
                extracted: processed.extracted,
                caseId: processed.caseId,
                status: processed.status,
                createdAt: processed.createdAt,
                nextStep: 'Resolve visa requirements.'
            };
        });

        if (result.outcome === 'missing_information') {
            ctx.logger.info('Onboarding message missing required fields', {
                user: ctx.auth?.subject,
                missingFields: result.missingFields
            });

            return result;
        }

        ctx.logger.info('Onboarding extraction complete, case started', {
            user: ctx.auth?.subject,
            caseId: result.caseId
        });

        return {
            outcome: result.outcome,
            extracted: result.extracted,
            caseId: result.caseId,
            status: result.status,
            createdAt: result.createdAt,
            nextStep: result.nextStep
        };
    }
}
