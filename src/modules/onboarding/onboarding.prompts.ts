import { PromptDecorator as Prompt, ExecutionContext, Injectable } from '@nitrostack/core';

/**
 * OnboardingPrompts
 *
 * This prompt only returns an instruction template for whatever AI client
 * is orchestrating the conversation — it does not call any LLM itself, and
 * neither does anything else in this module. All field extraction is done
 * by the deterministic OnboardingExtractionService via the
 * `onboarding_extract` tool. The prompt's only job is to tell the AI client
 * to call that tool and how to react to its structured output.
 *
 * TODO(onboarding): if/when a real LLM-backed extraction path is added
 * (see onboarding-extraction.service.ts TODOs), this prompt should keep
 * instructing the AI client to rely on the tool's structured result rather
 * than extracting fields itself, per docs/PROMPTS.md ("never hallucinate",
 * "always use authorized resources/tools before summarizing state").
 */
@Injectable()
export class OnboardingPrompts {
    @Prompt({
        name: 'onboarding_assistant',
        description: 'Guides a natural-language visa onboarding conversation: calls onboarding_extract with the user\'s raw message, reports the started case when complete, or asks only for the specific missing fields when incomplete.',
        arguments: [
            {
                name: 'userMessage',
                description: 'The user\'s free-form onboarding message',
                required: true
            }
        ]
    })
    async onboardingAssistant(input: any, ctx: ExecutionContext) {
        const systemPrompt = `You are helping a visa applicant through onboarding.

⚠️ CRITICAL: Do not extract nationality, destination country, or visa type yourself, and do not guess them. Call the \`onboarding_extract\` tool with the user's message exactly as written, and rely only on its structured output.
⚠️ This assistant does not give legal advice, guarantee eligibility, or guarantee an outcome. TODO(visa-agent): align with docs/PROMPTS.md safety rules before production use.

WORKFLOW:
1. Call \`onboarding_extract\` with { message: <the user's raw message> }.
2. If the result's \`outcome\` is "case_started":
   - Tell the user their case ID, status, and next step exactly as returned.
   - Do not imply approval, eligibility, or that anything beyond a DRAFT case exists.
3. If the result's \`outcome\` is "missing_information":
   - Look at \`missingFields\` and ask the user ONLY for those specific fields, in plain language.
   - Do not ask about fields that were already extracted.
   - Once the user replies, call \`onboarding_extract\` again with their new message (you may combine it with previously known context if the tool supports it; otherwise ask the user to restate everything in one message).
4. Never call \`case_start\` or any other case tool directly from this flow — onboarding_extract is the only entry point here.

Current user message: ${input.userMessage}

Respond to EXACTLY what the workflow above requires - nothing more.`;

        return {
            role: 'assistant',
            content: systemPrompt
        };
    }
}
