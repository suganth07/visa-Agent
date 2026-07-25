import { ResourceDecorator as Resource, ExecutionContext, z, Injectable } from '@nitrostack/core';
import { VisaProviderService } from '../../services/visa-provider.service.js';

// TODO(visa-agent): These are placeholder reference resources carried over
// from the NitroStack Flight Booking OAuth template migration. The real
// Visa Agent resource catalog (case://, policy://, document://, task://,
// approval://, etc.) is defined in docs/RESOURCES.md and must enforce
// tenant isolation, least-privilege field selection, and freshness
// attribution before it can replace these.

// Note: Using explicit deps for ESM compatibility
@Injectable({ deps: [VisaProviderService] })
export class VisaResources {
    constructor(private visaProviderService: VisaProviderService) { }

    @Resource({
        uri: 'visa://search-history',
        name: 'Visa Pathway Search History',
        description: 'Access to recent visa pathway searches and their results',
        mimeType: 'application/json'
    })
    async getSearchHistory(ctx: ExecutionContext) {
        // TODO(visa-agent): in a real implementation, this would fetch from
        // MongoDB via the Visa Case Module's Case Service.
        return {
            searches: [],
            message: 'Search history will be stored here after performing searches'
        };
    }

    @Resource({
        uri: 'visa://popular-pathways',
        name: 'Popular Visa Pathways',
        description: 'Information about popular visa pathways and typical processing fees',
        mimeType: 'application/json'
    })
    async getPopularPathways(ctx: ExecutionContext) {
        return {
            pathways: [
                {
                    route: 'US → FR',
                    description: 'United States to France (Schengen short-stay)',
                    averageDuration: '2-3 weeks',
                    typicalFee: '$80-120',
                    authorities: ['French Consular Services']
                },
                {
                    route: 'GB → US',
                    description: 'United Kingdom to United States (visitor visa)',
                    averageDuration: '3-5 weeks',
                    typicalFee: '$160-200',
                    authorities: ['U.S. Department of State']
                },
                {
                    route: 'US → JP',
                    description: 'United States to Japan (short-term stay)',
                    averageDuration: '1-2 weeks',
                    typicalFee: '$0-30',
                    authorities: ['Japanese Consular Services']
                },
                {
                    route: 'IN → AE',
                    description: 'India to United Arab Emirates (tourist visa)',
                    averageDuration: '3-4 days',
                    typicalFee: '$90-150',
                    authorities: ['UAE Federal Authority for Identity and Citizenship']
                }
            ],
            note: 'Fees are approximate and vary by jurisdiction, service tier, and season. TODO(visa-agent): source from the Policy Knowledge Module instead of static data.'
        };
    }

    @Resource({
        uri: 'visa://case-guide',
        name: 'Visa Case Guide',
        description: 'Comprehensive guide on how to search for visa pathways and start a case',
        mimeType: 'text/markdown'
    })
    async getCaseGuide(ctx: ExecutionContext) {
        return `# Visa Case Guide

## How to Search for Visa Pathways

### 1. Prepare Your Information
- **Nationality & Destination**: Use country codes (e.g., US, FR)
  - Use \`search_jurisdictions\` tool if you don't know the code
- **Dates**: Provide dates in YYYY-MM-DD format
- **Applicants**: Specify number of primary applicants, dependents, and minors
- **Service Tier**: Choose from standard, premium, expedited, or priority

### 2. Use the Search Tool
\`\`\`
search_visa_pathways({
  nationality: "US",
  destination: "FR",
  intendedTravelDate: "2024-03-15",
  intendedReturnDate: "2024-03-22",
  primaryApplicants: 2,
  serviceTier: "standard"
})
\`\`\`

### 3. Review Results
- Compare fees, authorities, and processing times
- Check number of handoffs and total duration
- Review required documents and case conditions

### 4. Get Detailed Information
Use \`get_pathway_details\` with a pathway ID to see:
- Complete processing itinerary with all steps
- Required documents per applicant
- Withdrawal and amendment policies
- Fee requirements

## Tips for Best Results

### Flexible Dates
- Search multiple date combinations
- Weekday appointments are often more available than weekends
- Avoid major holidays and peak seasons

### Direct vs. Multi-Stage Processing
- Use \`maxProcessingStages: 0\` for direct processing only
- Multi-stage processing may take longer but offer more availability
- Consider processing time and facility location

### Service Tier Selection
- **Standard**: Most affordable, standard processing time
- **Premium**: Faster processing, priority document review
- **Expedited**: Fast-tracked processing for urgent travel
- **Priority**: Fastest available option with dedicated case handling

### Timing
- Start 2-3 months in advance for straightforward pathways
- Start 3-6 months in advance for complex pathways
- Last-minute processing exists but is riskier and less certain

## Understanding Case Conditions

### Withdrawable vs. Non-Withdrawable
- **Withdrawable**: Can withdraw and get a fee refund (usually more expensive)
- **Non-Withdrawable**: No refund if withdrawn (cheaper)

### Amendment Policies
- Some pathways allow amendments with a fee
- Others don't allow any changes
- Check \`conditions\` in pathway details

### Required Documents
- **Primary documents**: Passport, application form, photos
- **Supporting documents**: Financial evidence, itinerary, invitation letters
- Requirements vary by jurisdiction and purpose

## Case Process

### Case Initiation
- All cases are automatically initiated (no fee payment required at intake time)
- Fee is guaranteed until the case expires
- You'll receive an expiration time when the case is created

### Applicant Information Required
- Full legal name (as on passport/ID)
- Date of birth
- Gender
- Passport details for most jurisdictions

## After Case Initiation

### Confirmation
- You'll receive a case reference number
- Save confirmation email
- Document collection can begin immediately

### Manage Your Case
- Select an appointment slot
- Upload required documents
- Update applicant information

## Need Help?

Use the \`visa_pathway_assistant\` prompt for personalized assistance with:
- Finding the best pathway for your needs
- Understanding complex processing itineraries
- Comparing different options
- Making case decisions
`;
    }

    @Resource({
        uri: 'visa://authority-codes',
        name: 'Authority Codes Reference',
        description: 'Common issuing authority codes and names',
        mimeType: 'application/json'
    })
    async getAuthorityCodes(ctx: ExecutionContext) {
        try {
            const authorities = await this.visaProviderService.getAuthorities();
            return {
                authorities: authorities.slice(0, 50).map((authority: any) => ({
                    code: authority.code,
                    name: authority.name
                })),
                note: 'TODO(visa-agent): no authority provider is connected yet.'
            };
        } catch (error) {
            // Return common placeholder authorities if the lookup fails
            return {
                authorities: [
                    { code: 'US-DOS', name: 'U.S. Department of State' },
                    { code: 'FR-CS', name: 'French Consular Services' },
                    { code: 'GB-UKVI', name: 'UK Visas and Immigration' },
                    { code: 'JP-CS', name: 'Japanese Consular Services' },
                    { code: 'AE-ICA', name: 'UAE Federal Authority for Identity and Citizenship' }
                ],
                note: 'Common authorities. Use search_jurisdictions tool for a complete list.'
            };
        }
    }
}
