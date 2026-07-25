import { PromptDecorator as Prompt, ExecutionContext, Injectable } from '@nitrostack/core';
import { VisaProviderService } from '../../services/visa-provider.service.js';

// TODO(visa-agent): These prompts are a terminology migration of the
// NitroStack Flight Booking OAuth template. The canonical Visa Agent prompt
// catalog and safety rules (never give legal advice, always cite policy
// sources and freshness, never bypass approval gates, minimize PII in
// conversation) are defined in docs/PROMPTS.md and must be applied before
// these are used for real visa guidance.

// Note: Using explicit deps for ESM compatibility
@Injectable({ deps: [VisaProviderService] })
export class VisaPrompts {
    constructor(private visaProviderService: VisaProviderService) { }

    @Prompt({
        name: 'visa_pathway_assistant',
        description: 'An AI assistant specialized in helping users search for visa pathways, understand jurisdiction options, and make case decisions.',
        arguments: [
            {
                name: 'userQuery',
                description: 'The user\'s visa pathway search query or question',
                required: true
            },
            {
                name: 'context',
                description: 'Optional context including previous searches and selected pathways',
                required: false
            }
        ]
    })
    async visaPathwayAssistant(input: any, ctx: ExecutionContext) {
        const systemPrompt = `You are a professional visa case assistant with expertise in helping applicants find visa pathway information.

⚠️ CRITICAL: Only do what the user specifically asks. Do NOT assume additional steps.
⚠️ This assistant does not give legal advice, guarantee eligibility, or guarantee an outcome. TODO(visa-agent): align with docs/PROMPTS.md safety rules before production use.

Your capabilities:
- Search for jurisdictions using search_jurisdictions tool
- Search for visa pathways using the search_visa_pathways tool
- Get detailed pathway information using get_pathway_details tool
- Help initiate a case when explicitly requested

**IMPORTANT RULES:**
1. If user asks about jurisdictions, ONLY search jurisdictions - do NOT search for pathways
2. If user asks about pathways, ONLY search pathways - do NOT automatically create a case
3. If user asks to start a case, ONLY then proceed with the case workflow
4. NEVER chain operations unless user explicitly requests it

**EXAMPLES:**
- "show me jurisdictions for France" → search_jurisdictions("France") → show results → STOP
- "find visa pathways from US to FR" → search_visa_pathways → show results → STOP
- "start this case" → THEN start the case workflow

CASE WORKFLOW (only when user explicitly wants to start a case):
1. FIRST, collect ALL applicant information (name, title, gender, date of birth, email, phone)
2. THEN, call create_case tool with complete applicant details
⚠️ NEVER call create_case without collecting applicant information first!
⚠️ All cases are automatically initiated - no fee payment is required at intake time

Current user query: ${input.userQuery}

${input.context?.previousSearches?.length ? `Previous searches in this conversation:\n${JSON.stringify(input.context.previousSearches, null, 2)}` : ''}

Respond to EXACTLY what the user asked - nothing more.`;

        return {
            role: 'assistant',
            content: systemPrompt
        };
    }

    @Prompt({
        name: 'pathway_comparison',
        description: 'Compare multiple visa pathway options and provide recommendations based on various factors.',
        arguments: [
            {
                name: 'pathwayIds',
                description: 'Visa pathway IDs to compare (2-5 pathways)',
                required: true
            },
            {
                name: 'priorities',
                description: 'User priorities for comparison (fee, duration, handoffs, authority, appointment_time, flexibility)',
                required: false
            }
        ]
    })
    async pathwayComparison(input: any, ctx: ExecutionContext) {
        let ids: string[] = [];
        if (Array.isArray(input.pathwayIds)) {
            ids = input.pathwayIds;
        } else if (typeof input.pathwayIds === 'string') {
            const trimmed = input.pathwayIds.trim();
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    ids = Array.isArray(parsed) ? parsed : [parsed];
                } catch {
                    ids = trimmed.split(',').map((s: string) => s.trim());
                }
            } else {
                ids = trimmed.split(',').map((s: string) => s.trim());
            }
        }
        ids = ids.filter(Boolean);

        const pathways = await Promise.all(
            ids.map((id: string) => this.visaProviderService.getPathway(id))
        );

        const comparisonData = pathways.map((pathway: any) => {
            const primaryStage = pathway.stages[0];
            return {
                pathwayId: pathway.id,
                fee: `${pathway.total_amount} ${pathway.total_currency}`,
                authority: primaryStage.steps[0].authority.name,
                duration: primaryStage.duration,
                handoffs: primaryStage.steps.length - 1,
                startAt: primaryStage.steps[0].start_at,
                completeAt: primaryStage.steps[primaryStage.steps.length - 1].complete_at,
                withdrawable: pathway.conditions?.withdrawal_before_submission?.allowed || false,
                amendable: pathway.conditions?.amendment_before_submission?.allowed || false
            };
        });

        const priorities = input.priorities || ['fee', 'duration', 'handoffs'];

        const prompt = `Compare these visa pathway options and provide a recommendation:

${JSON.stringify(comparisonData, null, 2)}

User priorities: ${priorities.join(', ')}

Provide:
1. A clear comparison of the key differences
2. Pros and cons of each option
3. Your recommendation based on the user's priorities
4. Any important considerations (processing times, authority reputation, flexibility, etc.)

Do not state or imply a guaranteed visa outcome, eligibility determination, or legal conclusion.`;

        return {
            role: 'assistant',
            content: prompt
        };
    }

    @Prompt({
        name: 'visa_preparation_tips',
        description: 'Provide preparation tips and advice for a specific visa pathway and travel dates.',
        arguments: [
            {
                name: 'nationality',
                description: 'Applicant nationality/residence code',
                required: true
            },
            {
                name: 'destination',
                description: 'Destination jurisdiction code',
                required: true
            },
            {
                name: 'intendedTravelDate',
                description: 'Intended travel date',
                required: true
            },
            {
                name: 'tripType',
                description: 'Type of trip: business, leisure, or family',
                required: false
            }
        ]
    })
    async visaPreparationTips(input: any, ctx: ExecutionContext) {
        const prompt = `Provide helpful preparation tips for a visa case from ${input.nationality} to ${input.destination} with intended travel on ${input.intendedTravelDate}.

Include advice on:
1. Best time to start the case for this pathway
2. Typical processing time at this destination during this period
3. Appointment tips (documents to bring, facility check-in, wait times)
4. Document recommendations
5. Multi-stage processing considerations if applicable
6. Time zone differences and appointment scheduling tips
${input.tripType ? `7. Specific tips for ${input.tripType} travel` : ''}

Be concise but informative. Do not give legal advice or guarantee an outcome.`;

        return {
            role: 'assistant',
            content: prompt
        };
    }

    @Prompt({
        name: 'case_assistant',
        description: 'Guide users through the visa case initiation process, collecting all necessary applicant information before creating a case.',
        arguments: [
            {
                name: 'pathwayId',
                description: 'The visa pathway ID the user wants to start a case for',
                required: true
            },
            {
                name: 'applicantCount',
                description: 'Number of applicants (default: 1)',
                required: false
            }
        ]
    })
    async caseAssistant(input: any, ctx: ExecutionContext) {
        const applicantCount = input.applicantCount || 1;

        const prompt = `You are helping the user start a case for visa pathway: ${input.pathwayId}

IMPORTANT CASE WORKFLOW:
Before you can create the case, you MUST collect the following information for ${applicantCount} applicant(s):

For EACH applicant, ask for:
1. **Title**: Mr, Ms, Mrs, Miss, or Dr
2. **Full Name**: First name and last name (as it appears on their passport/ID)
3. **Gender**: Male (M) or Female (F)
4. **Date of Birth**: In YYYY-MM-DD format (e.g., 1990-01-15)
5. **Email Address**: For case confirmation
6. **Phone Number**: With country code (e.g., +1234567890)

COLLECTION STRATEGY:
- Ask for all information in a friendly, conversational way
- You can ask for multiple fields at once to make it efficient
- Validate the format (especially date of birth and email)
- Confirm all details with the user before proceeding

EXAMPLE QUESTIONS:
"Great! To start your case, I'll need some applicant details. Could you please provide:
- Full name (first and last)
- Title (Mr/Ms/Mrs/Miss/Dr)
- Date of birth (YYYY-MM-DD)
- Gender (M/F)
- Email address
- Phone number with country code"

CASE PROCESS:
Once you have ALL applicant information:
- Call create_case with the pathway ID and applicant details
- The case will be automatically initiated (no fee payment required yet)
- The user will receive case confirmation with expiration details
- Fee payment and document collection can happen later before the case expires

DO NOT ask for payment details - case initiation does not require fee payment.
ALWAYS inform the user that their case is initiated and they have time to complete fee payment and document collection.`;

        return {
            role: 'assistant',
            content: prompt
        };
    }
}
