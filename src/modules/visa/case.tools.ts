import { ToolDecorator as Tool, Widget, ExecutionContext, z, UseGuards, Injectable } from '@nitrostack/core';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { VisaProviderService } from '../../services/visa-provider.service.js';

// TODO(visa-agent): This module is a terminology migration of the NitroStack
// Flight Booking OAuth template's booking tools. It is not the real Visa
// Case Module described in docs/MODULES.md and docs/TOOLS.md. In
// particular, case creation here has none of the required consent capture,
// tenant validation, or Case Intake task creation, and case withdrawal has
// none of the required transition-policy enforcement. Document acceptance,
// broker assignment, and final submission remain intentionally absent —
// those require the mandatory human approval gates described in
// docs/ARCHITECTURE.md and must never be simulated as succeeding.

// Note: Using explicit deps for ESM compatibility
@Injectable({ deps: [VisaProviderService] })
export class CaseTools {
    constructor(private visaProviderService: VisaProviderService) { }

    @Tool({
        name: 'create_case',
        description: 'Create a visa case for a selected pathway (case intake, no fee payment required yet). IMPORTANT: Before calling this tool, you MUST collect applicant information from the user. Ask for: full name (first and last), title (Mr/Ms/Mrs/Miss/Dr), gender (M/F), date of birth (YYYY-MM-DD), email, and phone number with country code. The case will be initiated for later fee payment and document collection.',
        inputSchema: z.object({
            pathwayId: z.string().describe('The pathway ID to create a case for'),
            applicants: z.string().describe('JSON string containing array of applicant objects. Each applicant must have: title (mr/ms/mrs/miss/dr), givenName (first name), familyName (last name), gender (M/F), bornOn (YYYY-MM-DD), email, phoneNumber. Example: \'[{"title":"mr","givenName":"John","familyName":"Doe","gender":"M","bornOn":"1990-01-15","email":"john@example.com","phoneNumber":"+1234567890"}]\'')
        }),
        examples: {
            request: {
                pathwayId: 'pth_123456',
                applicants: '[{"title":"mr","givenName":"John","familyName":"Doe","gender":"M","bornOn":"1990-01-15","email":"john.doe@example.com","phoneNumber":"+1234567890"}]'
            },
            response: {
                caseId: 'case_123456',
                status: 'initiated',
                feeAmount: '450.00',
                feeCurrency: 'USD',
                expiresAt: '2024-03-01T12:00:00Z',
                applicants: [],
                stages: [],
                message: 'Case initiated successfully.'
            }
        }
    })
    @UseGuards(OAuthGuard)
    @Widget('case-summary')
    async createCase(input: any, ctx: ExecutionContext) {
        ctx.logger.info('Creating visa case (intake)', {
            user: ctx.auth?.subject,
            pathwayId: input.pathwayId
        });

        // Validate and parse applicants
        let applicantsArray;
        try {
            if (typeof input.applicants === 'string') {
                // Try to parse the JSON string
                // Handle both regular JSON and double-encoded JSON
                let applicantsStr = input.applicants;

                // If the string starts with escaped quotes, it might be double-encoded
                if (applicantsStr.startsWith('\\"') || applicantsStr.includes('\\"')) {
                    // Remove escape characters
                    applicantsStr = applicantsStr.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                }

                applicantsArray = JSON.parse(applicantsStr);
            } else if (Array.isArray(input.applicants)) {
                applicantsArray = input.applicants;
            } else {
                throw new Error('Applicants must be a JSON string or array');
            }
        } catch (error: any) {
            ctx.logger.error('Failed to parse applicants', {
                input: input.applicants,
                error: error.message
            });
            throw new Error(`Invalid applicants format: ${error.message}. Expected JSON string like '[{"title":"mr","givenName":"John","familyName":"Doe","gender":"M","bornOn":"1990-01-15","email":"john@example.com","phoneNumber":"+1234567890"}]'`);
        }

        if (!applicantsArray || !Array.isArray(applicantsArray) || applicantsArray.length === 0) {
            throw new Error('At least one applicant is required to create a case');
        }

        // Transform applicants to the provider format
        const applicants = applicantsArray.map((applicant: any) => ({
            title: applicant.title,
            given_name: applicant.givenName,
            family_name: applicant.familyName,
            gender: applicant.gender,
            born_on: applicant.bornOn,
            email: applicant.email,
            phone_number: applicant.phoneNumber
        }));

        const caseParams: any = {
            selectedPathway: input.pathwayId,
            applicants,
        };

        const visaCase = await this.visaProviderService.createCase(caseParams);

        ctx.logger.info('Case created successfully', {
            user: ctx.auth?.subject,
            caseId: visaCase.id,
            status: 'initiated'
        });

        return {
            caseId: visaCase.id,
            status: 'initiated',
            feeAmount: visaCase.total_amount,
            feeCurrency: visaCase.total_currency,
            expiresAt: (visaCase as any).expires_at,
            referenceNumber: visaCase.reference_number,
            applicants: visaCase.applicants.map((applicant: any) => ({
                id: applicant.id,
                name: `${applicant.given_name} ${applicant.family_name}`,
                type: applicant.type
            })),
            stages: visaCase.stages.map((stage: any) => ({
                origin: stage.origin.code,
                destination: stage.destination.code,
                startAt: stage.steps[0].start_at,
                completeAt: stage.steps[stage.steps.length - 1].complete_at
            })),
            message: 'Case initiated successfully.'
        };
    }



    @Tool({
        name: 'get_case_details',
        description: 'Get detailed information about a visa case',
        inputSchema: z.object({
            caseId: z.string().describe('The case ID')
        }),
        examples: {
            request: {
                caseId: 'case_123456'
            },
            response: {
                caseId: 'case_123456',
                status: 'submitted',
                referenceNumber: 'ABC123',
                feeAmount: '450.00',
                feeCurrency: 'USD',
                applicants: [],
                stages: []
            }
        }
    })
    @UseGuards(OAuthGuard)
    @Widget('case-summary')
    async getCaseDetails(input: any, ctx: ExecutionContext) {
        ctx.logger.info('Getting case details', {
            user: ctx.auth?.subject,
            caseId: input.caseId
        });

        const visaCase = await this.visaProviderService.getCase(input.caseId);

        return {
            caseId: visaCase.id,
            status: (visaCase as any).status || 'submitted',
            referenceNumber: visaCase.reference_number,
            feeAmount: visaCase.total_amount,
            feeCurrency: visaCase.total_currency,
            createdAt: visaCase.created_at,
            expiresAt: (visaCase as any).expires_at,
            applicants: visaCase.applicants.map((applicant: any) => ({
                id: applicant.id,
                name: `${applicant.given_name} ${applicant.family_name}`,
                type: applicant.type,
                email: applicant.email,
                phoneNumber: applicant.phone_number
            })),
            stages: visaCase.stages.map((stage: any) => ({
                id: stage.id,
                origin: {
                    code: stage.origin.code,
                    name: stage.origin.name,
                    region: stage.origin.region
                },
                destination: {
                    code: stage.destination.code,
                    name: stage.destination.name,
                    region: stage.destination.region
                },
                duration: stage.duration,
                steps: stage.steps.map((step: any) => ({
                    id: step.id,
                    origin: step.origin,
                    destination: step.destination,
                    startAt: step.start_at,
                    completeAt: step.complete_at,
                    authority: step.authority.name,
                    referenceNumber: step.reference_number,
                    processingFacility: step.processing_facility
                }))
            }))
        };
    }

    @Tool({
        name: 'get_appointment_slots',
        description: 'Get available appointment slots for a visa pathway to allow appointment selection',
        inputSchema: z.object({
            pathwayId: z.string().describe('The pathway ID to get appointment slots for')
        }),
        examples: {
            request: {
                pathwayId: 'pth_123456'
            },
            response: {
                pathwayId: 'pth_123456',
                centers: [
                    {
                        facilityType: 'standard',
                        timeBlocks: [
                            {
                                blockLabel: 'Morning',
                                slots: [
                                    {
                                        id: 'slot_10a',
                                        label: '09:00',
                                        available: true,
                                        fee: '25.00',
                                        currency: 'USD',
                                        type: 'in-person'
                                    },
                                    {
                                        id: 'slot_10b',
                                        label: '09:30',
                                        available: true,
                                        fee: '0',
                                        currency: 'USD',
                                        type: 'in-person'
                                    }
                                ]
                            }
                        ]
                    }
                ],
                message: 'Select your preferred appointment slot from the available options'
            }
        }
    })
    @UseGuards(OAuthGuard)
    @Widget('appointment-slot-selection')
    async getAppointmentSlots(input: any, ctx: ExecutionContext) {
        ctx.logger.info('Getting appointment slots', {
            user: ctx.auth?.subject,
            pathwayId: input.pathwayId
        });

        const centers = await this.visaProviderService.getAppointmentSlots(input.pathwayId);

        return {
            pathwayId: input.pathwayId,
            centers: centers.map((center: any) => ({
                facilityType: center.facility_type,
                timeBlocks: center.time_blocks.map((block: any) => ({
                    blockLabel: block.block_label,
                    slots: block.sections.flatMap((section: any) =>
                        section.elements.filter((el: any) => el.type === 'slot').map((slot: any) => ({
                            id: slot.id,
                            label: slot.designator,
                            available: slot.available_services?.length > 0,
                            fee: slot.available_services?.[0]?.total_amount,
                            currency: slot.available_services?.[0]?.total_currency,
                            type: slot.disclosures?.join(', ') || 'standard'
                        }))
                    )
                }))
            })),
            message: 'Select your preferred appointment slot from the available options'
        };
    }

    @Tool({
        name: 'withdraw_case',
        description: 'Withdraw a visa case and request a fee refund if applicable',
        inputSchema: z.object({
            caseId: z.string().describe('The case ID to withdraw')
        }),
        examples: {
            request: {
                caseId: 'case_123456'
            },
            response: {
                caseId: 'case_123456',
                withdrawalId: 'wcr_123456',
                status: 'withdrawn',
                feeRefundAmount: '450.00',
                feeRefundCurrency: 'USD',
                confirmedAt: '2024-03-01T12:00:00Z',
                message: 'Case withdrawn. Refund of USD 450.00 will be processed.'
            }
        }
    })
    @UseGuards(OAuthGuard)
    @Widget('case-withdrawal')
    async withdrawCase(input: any, ctx: ExecutionContext) {
        ctx.logger.info('Withdrawing case', {
            user: ctx.auth?.subject,
            caseId: input.caseId
        });

        const withdrawal = await this.visaProviderService.withdrawCase(input.caseId);

        return {
            caseId: input.caseId,
            withdrawalId: withdrawal.id,
            status: 'withdrawn',
            feeRefundAmount: withdrawal.refund_amount,
            feeRefundCurrency: withdrawal.refund_currency,
            confirmedAt: withdrawal.confirmed_at,
            message: withdrawal.refund_amount
                ? `Case withdrawn. Refund of ${withdrawal.refund_currency} ${withdrawal.refund_amount} will be processed.`
                : 'Case withdrawn. No refund available.'
        };
    }
}
