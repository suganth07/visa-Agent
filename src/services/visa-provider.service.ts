import { Injectable } from '@nitrostack/core';

/**
 * Visa Provider Service
 *
 * Placeholder integration boundary for visa case data.
 *
 * This replaces the NitroStack Flight Booking OAuth template's Duffel API
 * integration. It preserves the same dependency-injection shape and method
 * surface as the template's external-API service so the Visa and Case
 * modules keep working end-to-end, but it contains no real business logic
 * and no external API calls.
 *
 * TODO(visa-agent): Replace this stub with the real integration adapters
 * described in ARCHITECTURE.md / MODULES.md:
 * - Visa Case Module -> MongoDB-backed Case Service
 * - Policy Knowledge Module -> Qdrant + Firecrawl-backed Policy Service
 * - Documents Module -> Document Storage Service + OCR Service
 * - Broker Module -> Broker Service
 * All real implementations must enforce tenant isolation, OAuth scopes,
 * approval gates, and audit logging as defined in those documents.
 */
@Injectable()
export class VisaProviderService {
    constructor() {
        console.error('ℹ️  VisaProviderService is a placeholder. No external visa case provider is configured.');
        console.error('   TODO(visa-agent): wire up the real Case/Policy/Document services described in docs/MODULES.md.\n');
    }

    /**
     * Search for candidate visa pathways/options based on applicant and
     * destination context.
     *
     * TODO(visa-agent): replace with a call to the Policy Knowledge Module
     * (policy_search) and Visa Case Module for real, attributed results.
     */
    async searchPathways(params: {
        nationality: string;
        destination: string;
        intendedTravelDate: string;
        intendedReturnDate?: string;
        applicants: Array<{ type: 'primary' } | { type: 'dependent'; age: number } | { type: 'minor' }>;
        serviceTier?: 'standard' | 'expedited' | 'premium' | 'priority';
        maxProcessingStages?: number;
    }) {
        return {
            id: this.generateId('req'),
            pathways: [] as any[],
            applicants: params.applicants,
            note: 'TODO(visa-agent): placeholder response. No pathway provider is connected yet.'
        };
    }

    /**
     * Get a specific pathway option by ID.
     *
     * TODO(visa-agent): replace with a real Policy Service / Case Service lookup.
     */
    async getPathway(pathwayId: string): Promise<any> {
        throw new Error(`No pathway provider connected. TODO(visa-agent): implement pathway lookup for "${pathwayId}".`);
    }

    /**
     * Search for jurisdictions (destination countries / issuing authorities)
     * by name or code.
     *
     * TODO(visa-agent): replace with a jurisdiction reference lookup backed
     * by the Policy Knowledge Module.
     */
    async searchJurisdictions(query: string): Promise<any[]> {
        return [] as any[];
    }

    /**
     * Create a visa case (case intake) with the given applicants.
     *
     * TODO(visa-agent): replace with the Visa Case Module's case_start
     * contract (see docs/TOOLS.md), including consent capture, tenant
     * validation, and Case Intake task creation.
     */
    async createCase(params: {
        selectedPathway: string;
        applicants: Array<{
            title: 'mr' | 'ms' | 'mrs' | 'miss' | 'dr';
            given_name: string;
            family_name: string;
            gender: 'M' | 'F';
            born_on: string;
            email: string;
            phone_number: string;
        }>;
    }) {
        throw new Error('No case provider connected. TODO(visa-agent): implement case creation (case_start).');
    }

    /**
     * Get case details by ID.
     *
     * TODO(visa-agent): replace with the Visa Case Module's case_get contract.
     */
    async getCase(caseId: string) {
        throw new Error(`No case provider connected. TODO(visa-agent): implement case lookup for "${caseId}".`);
    }

    /**
     * Get available appointment slots for a given pathway.
     *
     * TODO(visa-agent): replace with a real appointment-scheduling
     * integration once that capability is scoped.
     */
    async getAppointmentSlots(pathwayId: string) {
        return [] as any[];
    }

    /**
     * Withdraw (cancel) a visa case.
     *
     * TODO(visa-agent): replace with a governed case-withdrawal transition
     * enforced by the Visa Case Module's transition policy.
     */
    async withdrawCase(caseId: string) {
        throw new Error(`No case provider connected. TODO(visa-agent): implement case withdrawal for "${caseId}".`);
    }

    /**
     * Get the list of known issuing authorities (e.g. consulates, visa
     * processing authorities).
     *
     * TODO(visa-agent): replace with a real jurisdiction/authority reference
     * dataset.
     */
    async getAuthorities() {
        return [] as any[];
    }

    private generateId(prefix: string): string {
        return `${prefix}_` + Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    }
}
