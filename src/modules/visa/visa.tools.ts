import { ToolDecorator as Tool, Widget, ExecutionContext, z, UseGuards, Injectable } from '@nitrostack/core';
import { OAuthGuard } from '../../guards/oauth.guard.js';
import { VisaProviderService } from '../../services/visa-provider.service.js';

// TODO(visa-agent): This module is a terminology migration of the NitroStack
// Flight Booking OAuth template, not a real implementation of the Visa Case
// or Policy Knowledge modules described in docs/MODULES.md and docs/TOOLS.md.
// Real tools must add tenant isolation, scope enforcement (case:read,
// case:write), audit logging, and approval-gate checks before they can be
// considered production Visa Agent capabilities.

// Note: Using explicit deps for ESM compatibility
@Injectable({ deps: [VisaProviderService] })
export class VisaPathwayTools {
    constructor(private visaProviderService: VisaProviderService) { }

    @Tool({
        name: 'search_visa_pathways',
        description: 'Search for candidate visa pathways based on applicant nationality, destination jurisdiction, dates, and preferences. Returns available pathway options with fees and processing details.',
        inputSchema: z.object({
            nationality: z.string().min(2).describe('Applicant nationality or current country of residence (e.g., "US", "GB")'),
            destination: z.string().min(2).describe('Destination jurisdiction/country code for the visa application (e.g., "FR", "JP")'),
            intendedTravelDate: z.string().describe('Intended travel date in YYYY-MM-DD format'),
            intendedReturnDate: z.string().optional().describe('Intended return date in YYYY-MM-DD format for round-trip travel'),
            primaryApplicants: z.number().min(1).max(9).default(1).describe('Number of primary applicants (18+)'),
            dependents: z.number().min(0).max(9).default(0).describe('Number of dependent applicants (2-17)'),
            minors: z.number().min(0).max(9).default(0).describe('Number of minor applicants (under 2)'),
            serviceTier: z.enum(['standard', 'premium', 'expedited', 'priority']).default('standard').describe('Preferred processing service tier'),
            maxProcessingStages: z.number().min(0).max(3).optional().describe('Maximum number of processing stages (0 for direct processing only)'),
            preferredWindowFrom: z.string().optional().describe('Earliest preferred appointment time in HH:MM format'),
            preferredWindowTo: z.string().optional().describe('Latest preferred appointment time in HH:MM format')
        }),
        examples: {
            request: {
                nationality: 'US',
                destination: 'FR',
                intendedTravelDate: '2024-03-15',
                intendedReturnDate: '2024-03-22',
                primaryApplicants: 2,
                serviceTier: 'standard'
            },
            response: {
                requestId: 'req_123456',
                searchParams: {
                    nationality: 'US',
                    destination: 'FR',
                    intendedTravelDate: '2024-03-15',
                    intendedReturnDate: '2024-03-22',
                    applicants: {
                        primaryApplicants: 2,
                        dependents: 0,
                        minors: 0
                    },
                    serviceTier: 'standard'
                },
                totalPathways: 15,
                pathways: [
                    {
                        id: 'pth_123456',
                        feeAmount: '450.00',
                        feeCurrency: 'USD',
                        expiresAt: '2024-03-01T12:00:00Z',
                        primaryStage: {
                            origin: 'US',
                            destination: 'FR',
                            startAt: '2024-03-15T08:00:00Z',
                            completeAt: '2024-03-15T14:30:00Z',
                            duration: 'PT6H30M',
                            handoffs: 0,
                            authority: 'French Consular Services',
                            referenceNumber: 'FR-VISA-123',
                            steps: []
                        },
                        returnStage: {
                            origin: 'FR',
                            destination: 'US',
                            startAt: '2024-03-22T16:00:00Z',
                            completeAt: '2024-03-23T00:30:00Z',
                            duration: 'PT5H30M',
                            handoffs: 0,
                            authority: 'French Consular Services',
                            referenceNumber: 'FR-VISA-456',
                            steps: []
                        },
                        caseComplexity: 'Standard',
                        withdrawable: false,
                        amendable: true
                    }
                ],
                message: 'Found 15 visa pathway options. Showing top 10 results.'
            }
        }
    })
    @UseGuards(OAuthGuard)
    @Widget('pathway-search-results')
    async searchVisaPathways(input: any, ctx: ExecutionContext) {
        ctx.logger.info('Searching for visa pathways', {
            user: ctx.auth?.subject,
            nationality: input.nationality,
            destination: input.destination,
            intendedTravelDate: input.intendedTravelDate
        });

        // Ensure we have applicant counts with defaults
        const primaryApplicants = input.primaryApplicants || 1;
        const dependents = input.dependents || 0;
        const minors = input.minors || 0;

        // Build applicants array
        const applicants: any[] = [];
        for (let i = 0; i < primaryApplicants; i++) {
            applicants.push({ type: 'primary' });
        }
        for (let i = 0; i < dependents; i++) {
            applicants.push({ type: 'dependent', age: 12 }); // Default age for dependents
        }
        for (let i = 0; i < minors; i++) {
            applicants.push({ type: 'minor' });
        }

        // Build time window filter if provided
        const preferredWindow = input.preferredWindowFrom && input.preferredWindowTo
            ? { from: input.preferredWindowFrom, to: input.preferredWindowTo }
            : undefined;

        ctx.logger.info('Calling visa provider service with applicants:', {
            applicantsCount: applicants.length,
            applicants,
            primaryApplicants,
            dependents,
            minors
        });

        const result = await this.visaProviderService.searchPathways({
            nationality: input.nationality.toUpperCase(),
            destination: input.destination.toUpperCase(),
            intendedTravelDate: input.intendedTravelDate,
            intendedReturnDate: input.intendedReturnDate,
            applicants,
            serviceTier: input.serviceTier,
            maxProcessingStages: input.maxProcessingStages
        });

        // TODO(visa-agent): pathways is always empty until VisaProviderService
        // is wired to the real Policy Knowledge / Visa Case services. This
        // transform preserves the intended output shape for future use.
        const pathways = (result.pathways || []).map((pathway: any) => ({
            id: pathway.id,
            feeAmount: pathway.total_amount,
            feeCurrency: pathway.total_currency,
            expiresAt: pathway.expires_at,
            primaryStage: pathway.primaryStage,
            returnStage: pathway.returnStage,
            caseComplexity: pathway.requires_identity_documents ? 'Enhanced' : 'Standard',
            withdrawable: pathway.conditions?.withdrawal_before_submission?.allowed || false,
            amendable: pathway.conditions?.amendment_before_submission?.allowed || false
        }));

        ctx.logger.info('Visa pathway search completed', {
            user: ctx.auth?.subject,
            pathwaysFound: pathways.length
        });

        return {
            requestId: result.id,
            searchParams: {
                nationality: input.nationality.toUpperCase(),
                destination: input.destination.toUpperCase(),
                intendedTravelDate: input.intendedTravelDate,
                intendedReturnDate: input.intendedReturnDate,
                applicants: {
                    primaryApplicants,
                    dependents,
                    minors
                },
                serviceTier: input.serviceTier
            },
            totalPathways: pathways.length,
            pathways: pathways.slice(0, 10), // Return top 10 pathways
            message: `Found ${pathways.length} visa pathway options. Showing top 10 results.`
        };
    }

    @Tool({
        name: 'get_pathway_details',
        description: 'Get detailed information about a specific visa pathway option including required documents, case conditions, and appointment availability.',
        inputSchema: z.object({
            pathwayId: z.string().describe('The pathway ID from search results')
        }),
        examples: {
            request: {
                pathwayId: 'pth_123456'
            },
            response: {
                id: 'pth_123456',
                feeAmount: '450.00',
                feeCurrency: 'USD',
                expiresAt: '2024-03-01T12:00:00Z',
                stages: [
                    {
                        origin: {
                            code: 'US',
                            name: 'United States',
                            region: 'North America'
                        },
                        destination: {
                            code: 'FR',
                            name: 'France',
                            region: 'Europe'
                        },
                        duration: 'PT6H30M',
                        steps: [
                            {
                                id: 'stp_123',
                                origin: 'US',
                                destination: 'FR',
                                startAt: '2024-03-15T08:00:00Z',
                                completeAt: '2024-03-15T14:30:00Z',
                                duration: 'PT6H30M',
                                authority: {
                                    name: 'French Consular Services',
                                    code: 'FR-CS',
                                    referenceNumber: '123'
                                },
                                processingFacility: 'Visa Application Center'
                            }
                        ]
                    }
                ],
                applicants: [
                    {
                        id: 'app_123',
                        type: 'primary',
                        caseTier: 'standard',
                        requiredDocuments: [
                            {
                                type: 'primary',
                                quantity: 1
                            },
                            {
                                type: 'supporting',
                                quantity: 1
                            }
                        ]
                    }
                ],
                conditions: {
                    withdrawalBeforeSubmission: {
                        allowed: false
                    },
                    amendmentBeforeSubmission: {
                        allowed: true,
                        penaltyAmount: '75.00',
                        penaltyCurrency: 'USD'
                    }
                },
                feeRequirements: {
                    requiresInstantFee: true,
                    feeGuaranteeExpiresAt: '2024-03-01T12:00:00Z'
                }
            }
        }
    })
    @UseGuards(OAuthGuard)
    @Widget('pathway-details')
    async getPathwayDetails(input: any, ctx: ExecutionContext) {
        ctx.logger.info('Getting pathway details', {
            user: ctx.auth?.subject,
            pathwayId: input.pathwayId
        });

        const pathway = await this.visaProviderService.getPathway(input.pathwayId);

        return {
            id: pathway.id,
            feeAmount: pathway.total_amount,
            feeCurrency: pathway.total_currency,
            expiresAt: pathway.expires_at,

            stages: pathway.stages.map((stage: any) => ({
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
                    duration: step.duration,
                    authority: {
                        name: step.authority.name,
                        code: step.authority.code,
                        referenceNumber: step.reference_number
                    },
                    processingFacility: step.processing_facility,
                    operatingAuthority: step.operating_authority
                }))
            })),

            applicants: pathway.applicants.map((applicant: any) => ({
                id: applicant.id,
                type: applicant.type,
                caseTier: applicant.case_tier,
                requiredDocuments: applicant.required_documents?.map((doc: any) => ({
                    type: doc.type,
                    quantity: doc.quantity
                }))
            })),

            conditions: {
                withdrawalBeforeSubmission: {
                    allowed: pathway.conditions?.withdrawal_before_submission?.allowed || false,
                    penaltyAmount: pathway.conditions?.withdrawal_before_submission?.penalty_amount,
                    penaltyCurrency: pathway.conditions?.withdrawal_before_submission?.penalty_currency
                },
                amendmentBeforeSubmission: {
                    allowed: pathway.conditions?.amendment_before_submission?.allowed || false,
                    penaltyAmount: pathway.conditions?.amendment_before_submission?.penalty_amount,
                    penaltyCurrency: pathway.conditions?.amendment_before_submission?.penalty_currency
                }
            },

            feeRequirements: {
                requiresInstantFee: pathway.fee_requirements?.requires_instant_fee,
                feeGuaranteeExpiresAt: pathway.fee_requirements?.fee_guarantee_expires_at,
                feeRequiredBy: pathway.fee_requirements?.fee_required_by
            }
        };
    }

    @Tool({
        name: 'search_jurisdictions',
        description: 'Search for destination jurisdictions (countries/issuing authorities) by name or code. Useful for finding jurisdiction codes.',
        inputSchema: z.object({
            query: z.string().min(2).describe('Country name or jurisdiction code to search for')
        }),
        examples: {
            request: {
                query: 'France'
            },
            response: {
                query: 'France',
                results: [
                    {
                        id: 'jur_fr',
                        name: 'France',
                        code: 'FR',
                        regionCode: 'EUR',
                        region: 'Europe',
                        type: 'jurisdiction',
                        latitude: 46.2276,
                        longitude: 2.2137,
                        timeZone: 'Europe/Paris'
                    }
                ]
            }
        }
    })
    @UseGuards(OAuthGuard)
    @Widget('jurisdiction-search')
    async searchJurisdictions(input: any, ctx: ExecutionContext) {
        ctx.logger.info('Searching jurisdictions', {
            user: ctx.auth?.subject,
            query: input.query
        });

        const places = await this.visaProviderService.searchJurisdictions(input.query);

        return {
            query: input.query,
            results: places.slice(0, 10).map((place: any) => ({
                id: place.id,
                name: place.name,
                code: place.code,
                regionCode: place.region_code,
                region: place.region,
                type: place.type,
                latitude: place.latitude,
                longitude: place.longitude,
                timeZone: place.time_zone
            }))
        };
    }
}
