import { Module } from '@nitrostack/core';
import { VisaPathwayTools } from './visa.tools.js';
import { CaseTools } from './case.tools.js';
import { VisaPrompts } from './visa.prompts.js';
import { VisaResources } from './visa.resources.js';
import { VisaProviderService } from '../../services/visa-provider.service.js';

// TODO(visa-agent): This single module is a terminology migration of the
// NitroStack Flight Booking OAuth template's flights module. The target
// architecture in docs/MODULES.md splits this into dedicated Visa Case,
// Client, Operations, Documents, Policy Knowledge, Broker, Task, Approval,
// Notification, and Audit & Observability modules. Per docs/ARCHITECTURE.md
// §18, that split should happen incrementally, module by module, each with
// its own tests and documented contract — not as a broad rename.
@Module({
    name: 'visa',
    description: 'Visa case pathway search and case intake, migrated from the NitroStack Flight Booking OAuth template',
    controllers: [VisaPathwayTools, CaseTools, VisaPrompts, VisaResources],
    providers: [VisaProviderService]
})
export class VisaModule { }
