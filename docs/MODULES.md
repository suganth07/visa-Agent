# Visa Agent Module Architecture

## 1. Purpose

Visa Agent uses feature-based modules to keep a complex, regulated workflow understandable, evolvable, and governed. Each module owns one business capability, the data and rules that define that capability, and its AI-facing contract. This prevents case management, document intelligence, policy retrieval, approvals, and notifications from becoming a single, tightly coupled application layer.

### Module Boundaries

Each module owns a cohesive business domain:

- A module owns its domain vocabulary, state transitions, validation rules, and data lifecycle.
- A module exposes only the services, MCP capabilities, events, and read models that other modules are authorized to consume.
- A module may not reach into another module's persistence model, internal state, or private provider implementation.
- MongoDB remains the operational system of record. Qdrant supports policy retrieval and never decides case state.
- Portals and widgets are presentation layers. They cannot own domain state or make hidden business decisions.

### Dependency Direction

Dependencies flow inward toward domain services and shared platform adapters:

```text
Portals and AI clients
        |
        v
MCP contracts and widgets
        |
        v
Feature module services
        |
        v
Shared services and integration adapters
        |
        v
MongoDB, Qdrant, Firecrawl, OCR, n8n, notification channels
```

The root NitroStack module is composition-only. It registers modules and platform providers but contains no case, approval, document, or workflow logic. Feature modules use dependency injection to consume explicit service contracts; they do not use the root module as a service locator.

### Ownership Rules

- The owning module is the sole authority for a domain state transition.
- A service is shared only when more than one module has a genuine, stable need for the same capability.
- Cross-module requests use a published service interface for synchronous validation and retrieval, or a Nitro Event for post-commit, asynchronous work.
- Every protected operation carries tenant ID, actor identity, and correlation ID.
- All sensitive reads and mutations are auditable. Audit records are append-only and exclude secrets and raw document content.
- Human approval is mandatory before broker assignment, document acceptance, and final submission. No module, prompt, widget, task, event, or automation can bypass these gates.

## 2. Dependency Rules

Visa Agent uses explicit dependencies to keep feature modules independently testable and safe to evolve.

| Rule | Required Practice |
| --- | --- |
| No direct module dependency | A module must not access another module's internal providers, collections, schemas, or widget state. |
| Shared logic belongs in services | Stable cross-cutting capabilities are exposed through injectable service contracts or integration adapters. |
| Communication is explicit | Use a service for synchronous, required validation or retrieval. Use a Nitro Event only after the source-of-truth change has committed. |
| Circular dependencies are prohibited | If two modules appear to need each other, extract a shared service, introduce an approval or orchestration boundary, or communicate by event. |
| Data ownership is exclusive | Only the owning module writes its records. Other modules use approved read services, commands, or events. |
| Events are secondary effects | Events support tasks, notifications, metrics, indexing, and read models. They do not replace atomic business decisions or approval checks. |
| Integration adapters are isolated | MongoDB, Qdrant, Firecrawl, OCR, n8n, and channel-specific behavior stop at their adapter boundary. |
| Authorization remains server-side | OAuth 2.1, tenant, role, scope, and approval-state checks occur before protected work. Widget visibility is never authorization. |

### Service Versus Event Decision

Use a service contract when the caller must know the result before it can continue, including case-state validation, approval-state verification, tenant-safe retrieval, and preparation of an external submission.

Use a Nitro Event when the originating transaction is complete and a subscriber can safely run independently, including task creation, notification intent, policy-index refresh, telemetry, and audit enrichment. Event subscribers must be registered providers, idempotent, observable, and safe to retry.

## 3. Module Catalog

### 3.1 Visa Case Module

**Purpose**

Own the visa case as the primary operational aggregate and authoritative lifecycle record.

**Responsibilities**

- Create and retrieve cases.
- Maintain case participants, eligibility intake, milestones, operational notes, and current lifecycle state.
- Enforce the transition policy for normal and exceptional case paths.
- Coordinate case-level transaction boundaries and expose case-safe read models.
- Require the appropriate approval state before a case can progress through approval-gated stages.

**Owned Data**

- Visa case record, tenant ownership, participants, intake facts, lifecycle status, milestones, and case-level references.
- Case transition history and case-safe summary read models.

**Injected Services**

- MongoDB Service, Audit Service, Task Service contract, Approval Service contract, Policy Service contract, and event publisher.

**Future Expansion**

- Jurisdiction-specific lifecycle variants, case templates, controlled case transfer, and service-level objectives for case progression.

**Required Authentication**

- OAuth 2.1 with tenant validation.
- `case:read` for permitted reads; `case:write` for permitted non-final changes.
- Operations role and approval-state checks for controlled transitions.

### 3.2 Client Module

**Purpose**

Provide the client-safe experience for case participation, information requests, consent, and communication preferences.

**Responsibilities**

- Present client-safe case summaries, milestones, and required next actions.
- Capture and maintain consent and communication preferences.
- Support client responses to information requests without exposing internal operational notes.
- Enforce client-to-case relationship and tenant isolation.

**Owned Data**

- Client-facing consent records, communication preferences, invitations, and client-safe presentation preferences.

**Injected Services**

- Case Service contract, Document Service contract, Notification Service contract, MongoDB Service, Audit Service, and event publisher.

**Future Expansion**

- Delegated access for family representatives, multilingual communication preferences, and client experience analytics with privacy controls.

**Required Authentication**

- OAuth 2.1 with client identity, tenant validation, and case-participant authorization.
- `case:read` for case visibility and `case:write` for permitted client updates.

### 3.3 Operations Module

**Purpose**

Provide governed operations workflows for work queues, case review, exception triage, and controlled operational actions.

**Responsibilities**

- Build operations queues and workload views.
- Support internal case review, risk triage, and request-for-information workflows.
- Surface approval worklists, overdue work, policy freshness signals, and document-review status.
- Initiate allowed case actions without taking ownership of case, document, or approval state.

**Owned Data**

- Operations-only queue preferences, triage views, saved filters, and non-authoritative operational worklist projections.

**Injected Services**

- Case Service contract, Task Service contract, Document Service contract, Policy Service contract, Approval Service contract, Audit Service, and event publisher.

**Future Expansion**

- Workload balancing, quality-assurance sampling, operational capacity planning, and controlled escalation policies.

**Required Authentication**

- OAuth 2.1 with operations role and tenant validation.
- `case:read`, `case:write`, and relevant document scopes for permitted actions.
- Approval-related actions require the delegated approver role and the relevant approval scope.

### 3.4 Documents Module

**Purpose**

Own the governed document lifecycle from request and upload through OCR extraction, review, acceptance decision, and retention metadata.

**Responsibilities**

- Create document requests and capture upload metadata.
- Maintain secure document references and evidence status.
- Initiate OCR and retain provisional extraction results, confidence, and provenance.
- Route review work and track validation findings.
- Enforce that only an authorized human approval can mark a document as accepted.

**Owned Data**

- Document metadata, secure-storage references, request status, extraction output, validation findings, review state, acceptance status, and retention metadata.

**Injected Services**

- Document Storage Service, OCR Service, MongoDB Service, Approval Service contract, Task Service contract, Audit Service, and event publisher.

**Future Expansion**

- Document-type classifiers, configurable evidence rules, duplicate detection, retention automation, and multi-document consistency checks.

**Required Authentication**

- OAuth 2.1 with tenant and case-access checks.
- `document:read` for permitted metadata and extraction reads; `document:write` for upload and review-request actions.
- `document:approve` plus authorized approver role for document-acceptance decisions.

### 3.5 Policy Knowledge Module

**Purpose**

Provide attributed, freshness-aware visa policy knowledge for case guidance without making legal determinations or controlling case state.

**Responsibilities**

- Retrieve jurisdiction-relevant policy evidence from Qdrant.
- Filter results by source quality, review status, effective-date context, and freshness.
- Maintain source provenance and surface stale, conflicting, or incomplete information.
- Coordinate Firecrawl-derived source collection, review routing, and indexing through controlled ingestion workflows.

**Owned Data**

- Policy source metadata, ingestion status, review status, jurisdiction tags, freshness signals, and indexed knowledge references.

**Injected Services**

- Qdrant Service, Firecrawl Service, MongoDB Service, Audit Service, and event publisher.

**Future Expansion**

- Source-quality scoring, policy change comparison, jurisdiction coverage reporting, and reviewer work queues.

**Required Authentication**

- OAuth 2.1 and tenant-aware policy access.
- `case:read` for case-contextual policy retrieval.
- `policy:manage` plus policy-reviewer role for source review, publication, and indexing actions.

### 3.6 Broker Module

**Purpose**

Own broker profiles, eligibility, minimum-necessary handoff preparation, and approved broker assignments.

**Responsibilities**

- Maintain broker profile and eligibility information.
- Prepare a least-privilege assignment preview and handoff package.
- Validate that an assignment has an active, authorized approval before it is created.
- Track assignment status and broker responses without exposing unnecessary case information.

**Owned Data**

- Broker profiles, jurisdiction eligibility, assignment records, handoff references, assignment status, and broker response metadata.

**Injected Services**

- Case Service contract, Approval Service contract, Document Service contract, MongoDB Service, Notification Service contract, Audit Service, and event publisher.

**Future Expansion**

- Broker capacity, service quality measures, secure broker portal access, and jurisdiction-specific eligibility rules.

**Required Authentication**

- OAuth 2.1 with tenant validation.
- `case:read` for permitted context and `broker:assign` for assignment requests or approved assignment execution.
- Broker access is limited to explicitly assigned, minimum-necessary handoff data.

### 3.7 Task Module

**Purpose**

Own actionable work items and their accountability model independently of case state.

**Responsibilities**

- Create, assign, prioritize, escalate, and close tasks with completion evidence.
- Track due dates, dependencies, ownership, escalation state, and task lifecycle.
- Derive tasks from committed case, document, approval, policy, and broker events.
- Remain idempotent when receiving retried or replayed events.

**Owned Data**

- Tasks, due dates, ownership, dependencies, status, priority, escalation details, and completion evidence.

**Injected Services**

- MongoDB Service, Case Service contract, Notification Service contract, Audit Service, and event publisher.

**Future Expansion**

- Service-level agreement rules, workload balancing, calendar-aware due dates, and automation-assisted task suggestions.

**Required Authentication**

- OAuth 2.1 with tenant and task-access validation.
- `case:read` for task visibility and `case:write` for permitted task actions.
- Operations role for queue-level assignment and escalation actions.

### 3.8 Approval Module

**Purpose**

Own approval requests and immutable decisions, acting as the authority for mandatory human gates.

**Responsibilities**

- Create approval requests with subject, required authority, evidence references, expiry, and decision context.
- Validate approver identity, role, scope, delegated authority, and request validity.
- Record approve or reject decisions with rationale and immutable history.
- Expose the active approval state required by guarded actions.
- Prevent duplicate, expired, superseded, or unauthorized decisions from authorizing a downstream action.

**Owned Data**

- Approval requests, decision records, approver identity, rationale, timestamps, expiry, supersession links, and immutable history.

**Injected Services**

- MongoDB Service, Case Service contract, Audit Service, Task Service contract, and event publisher.

**Future Expansion**

- Delegation policies, multi-party approvals, conditional approvals, expiration reminders, and approval analytics.

**Required Authentication**

- OAuth 2.1 with tenant validation and delegated approver role.
- `document:approve` for document acceptance decisions.
- `submission:approve` for final submission decisions.
- `broker:assign` for broker assignment approval according to tenant policy.

### 3.9 Notification Module

**Purpose**

Own notification intent, recipient eligibility, channel policy, delivery tracking, and n8n handoff without owning case progression.

**Responsibilities**

- Transform approved notification intents into versioned n8n payloads.
- Check recipient consent, channel eligibility, tenant policy, and approved templates.
- Route permitted email and WhatsApp notifications through n8n.
- Record delivery attempts, failures, and outcomes without changing the governing case or approval decision.

**Owned Data**

- Notification intents, template references, recipient authorization decisions, delivery attempts, channel status, and provider response metadata.

**Injected Services**

- n8n Adapter, Notification Channel Adapters, Client Service contract, MongoDB Service, Audit Service, and event publisher.

**Future Expansion**

- Additional channels, localization, notification preference center, delivery analytics, and tenant-specific template governance.

**Required Authentication**

- OAuth 2.1 for user-initiated notification actions with tenant validation and relevant `case:read` or `case:write` access.
- Narrowly scoped service identity for n8n and delivery-channel integration.
- Recipient consent and channel eligibility are required independently of caller authorization.

### 3.10 Audit & Observability Module

**Purpose**

Provide trustworthy, append-only auditability and operational visibility without becoming the owner of business decisions.

**Responsibilities**

- Record sensitive reads, all mutations, approvals, external handoffs, authorization failures, and delivery outcomes.
- Maintain correlation IDs, operational metrics, dependency telemetry, and stable error classification.
- Provide governed audit and health read models.
- Support incident investigation and release-quality observability.

**Owned Data**

- Append-only audit logs, correlation records, metrics, traces, health snapshots, and error-classification records.

**Injected Services**

- MongoDB Service, all dependency health adapters, and event publisher.

**Future Expansion**

- Service-level objectives, operational dashboards, anomaly detection, retention automation, and incident evidence exports.

**Required Authentication**

- OAuth 2.1 with tenant validation.
- `audit:read` for authorized audit access.
- Administrator or authorized operations role for platform health and operational telemetry views.

## 4. MCP Ownership

The following ownership catalog is intentionally provisional. Names are placeholders for planning only, not implemented MCP contracts. Each eventual tool, resource, prompt, widget, event, and task must satisfy the authorization, tenant, audit, idempotency, and approval requirements in `ARCHITECTURE.md`.

### 4.1 Visa Case Module

| Capability | Placeholder Ownership |
| --- | --- |
| Tools | `case_start`, `case_get`, `case_update` |
| Resources | `case://{caseId}/summary`, `case://{caseId}/timeline` |
| Prompts | `case_intake_assistant` |
| Widgets | Case Summary, Case Timeline |
| Events | `case.created`, `case.status_changed` |
| Tasks | Case Intake, Case Milestone Review |

### 4.2 Client Module

| Capability | Placeholder Ownership |
| --- | --- |
| Tools | `client_get_case_view`, `client_update_preferences`, `client_respond_to_request` |
| Resources | `case://{caseId}/client-summary`, `client://{clientId}/preferences` |
| Prompts | `client_next_steps_assistant` |
| Widgets | Client Case Summary, Client Action Checklist |
| Events | `client.preferences_updated`, `client.response_received` |
| Tasks | Client Information Request, Consent Follow-up |

### 4.3 Operations Module

| Capability | Placeholder Ownership |
| --- | --- |
| Tools | `operations_get_queue`, `operations_review_case`, `operations_request_information` |
| Resources | `operations://queue`, `operations://case/{caseId}/review` |
| Prompts | `operations_case_triage` |
| Widgets | Operations Queue, Case Review Workspace |
| Events | `operations.case_reviewed`, `case.information_requested` |
| Tasks | Operations Review, Exception Triage |

### 4.4 Documents Module

| Capability | Placeholder Ownership |
| --- | --- |
| Tools | `document_upload`, `document_get_extraction`, `document_request_review` |
| Resources | `document://{documentId}/extraction`, `case://{caseId}/documents` |
| Prompts | `document_readiness_review` |
| Widgets | Document Readiness, Extraction Review |
| Events | `document.uploaded`, `document.ocr_completed`, `document.review_requested` |
| Tasks | Document Review, Evidence Correction Request |

### 4.5 Policy Knowledge Module

| Capability | Placeholder Ownership |
| --- | --- |
| Tools | `policy_search`, `policy_get_sources`, `policy_request_review` |
| Resources | `policy://jurisdiction/{destination}`, `policy://freshness/{destination}` |
| Prompts | `visa_eligibility_intake`, `policy_evidence_summary` |
| Widgets | Policy Evidence Panel, Policy Freshness Dashboard |
| Events | `policy.source_updated`, `policy.index_refreshed` |
| Tasks | Policy Source Review, Policy Refresh Review |

### 4.6 Broker Module

| Capability | Placeholder Ownership |
| --- | --- |
| Tools | `broker_get_eligible`, `broker_prepare_assignment`, `broker_assign` |
| Resources | `broker://{brokerId}/profile`, `case://{caseId}/broker-assignment` |
| Prompts | `broker_handoff_preparation` |
| Widgets | Broker Assignment Preview, Broker Handoff Status |
| Events | `broker.assignment_requested`, `broker.assignment_approved`, `broker.assigned` |
| Tasks | Broker Assignment Review, Broker Response Follow-up |

### 4.7 Task Module

| Capability | Placeholder Ownership |
| --- | --- |
| Tools | `task_create`, `task_assign`, `task_complete` |
| Resources | `task://{taskId}`, `case://{caseId}/tasks` |
| Prompts | `task_prioritization_assistant` |
| Widgets | Task Worklist, Task Detail |
| Events | `task.created`, `task.overdue`, `task.completed` |
| Tasks | Task Assignment, Overdue Task Escalation |

### 4.8 Approval Module

| Capability | Placeholder Ownership |
| --- | --- |
| Tools | `approval_request`, `approval_get_status`, `approval_decide` |
| Resources | `approval://{approvalId}`, `case://{caseId}/approvals` |
| Prompts | `approval_readiness_assistant` |
| Widgets | Approval Queue, Approval Decision View |
| Events | `approval.requested`, `approval.decided` |
| Tasks | Approval Review, Expiring Approval Follow-up |

### 4.9 Notification Module

| Capability | Placeholder Ownership |
| --- | --- |
| Tools | `notification_get_status`, `notification_update_preference`, `notification_retry` |
| Resources | `case://{caseId}/notifications`, `client://{clientId}/communication-history` |
| Prompts | `notification_composition_assistant` |
| Widgets | Notification Preferences, Communication History |
| Events | `notification.requested`, `notification.delivered`, `notification.failed` |
| Tasks | Delivery Failure Follow-up, Consent Refresh |

### 4.10 Audit & Observability Module

| Capability | Placeholder Ownership |
| --- | --- |
| Tools | `audit_get_case_history`, `observability_get_health`, `observability_get_metrics` |
| Resources | `audit://case/{caseId}`, `observability://health` |
| Prompts | `operational_incident_summary` |
| Widgets | Audit Timeline, Dependency Health Dashboard |
| Events | `audit.recorded`, `dependency.health_changed` |
| Tasks | Incident Review, Dependency Health Follow-up |

## 5. Module Communication

Module communication follows ownership boundaries rather than user-interface flow. A module either calls a published service interface when the result is needed now or emits a Nitro Event after it commits its own state. It never writes another module's records directly.

```text
Client Module
        |
        | client-safe intake and requests through published services
        v
Visa Case Module <------> Policy Knowledge Module
        |                         |
        | committed case events   | attributed policy evidence and freshness
        v                         v
Documents Module --------> Task Module <-------- Operations Module
        |                         |
        | review and approval     | work queues and escalation
        v                         v
Approval Module -------> Broker Module
        |                         |
        | approved decisions      | approved assignment only
        v                         v
Notification Module <---- Nitro Events ----> Audit & Observability Module
        |
        v
n8n -> Email and WhatsApp
```

### Communication Rationale

| From | To | Interaction | Why |
| --- | --- | --- | --- |
| Client | Visa Case | Published Case Service contract | Client actions need tenant-safe, synchronous case validation. |
| Visa Case | Policy Knowledge | Published Policy Service contract | Case guidance requires attributed, freshness-aware evidence before it can be presented. |
| Visa Case | Task | Nitro Events and Task Service contract | A committed lifecycle transition can create work without allowing tasks to control case state. |
| Documents | Approval | Published Approval Service contract | Document acceptance must synchronously confirm an authorized human decision. |
| Documents | Task | Nitro Events | OCR completion and review requests create follow-up work after document state is committed. |
| Operations | Case, Documents, Tasks, Approvals | Published service contracts | Operations coordinates work while each owning module retains state authority. |
| Broker | Approval | Published Approval Service contract | Broker assignment cannot occur without an active decision from the approval authority. |
| Approval | Broker and Documents | Nitro Events plus guarded service checks | Approved decisions notify downstream owners; each owner validates approval before its own mutation. |
| All high-risk modules | Audit & Observability | Audit Service and Nitro Events | Auditing and metrics must be consistent without owning business rules. |
| Approved domain events | Notification | Nitro Events | Notifications are downstream side effects and never advance a case or decision. |

The mandatory gates are deliberately synchronous at the point of mutation. Broker assignment, document acceptance, and final submission each verify approval state through the Approval Service before changing their owning domain record. Events can notify others of the result, but cannot authorize it.

## 6. Shared Services

Shared services provide stable reuse across modules. They expose narrow contracts and own no portal or widget behavior.

| Service | Responsibility | Primary Users |
| --- | --- | --- |
| MongoDB Service | Connection management, persistence primitives, transactions where supported, and health reporting for the operational system of record. | All state-owning modules and Audit & Observability. |
| Qdrant Service | Retrieval and indexing primitives for policy knowledge with metadata filtering. | Policy Knowledge; read-only consumers through Policy Service. |
| OCR Service | Provider interaction, extraction normalization, confidence, provenance, timeout, retry, and error handling. | Documents. |
| Firecrawl Service | Approved-source collection, parsing, timeouts, retry, and normalized source retrieval. | Policy Knowledge. |
| Document Storage Service | Secure document reference handling, storage access, retention controls, and health reporting. | Documents. |
| Case Service | Published case retrieval and transition contract; it remains owned by the Visa Case Module. | Client, Operations, Documents, Brokers, Tasks, Approvals. |
| Policy Service | Published attributed policy retrieval and freshness contract; it remains owned by Policy Knowledge. | Visa Case, Client, Operations, Submissions when introduced. |
| Approval Service | Published approval-state verification and decision contract; it remains owned by Approval. | Visa Case, Documents, Brokers, Operations, future Submissions. |
| Task Service | Published task creation and work-item coordination contract; it remains owned by Tasks. | Visa Case, Documents, Operations, Approvals, Policy Knowledge. |
| Notification Service | Published notification-intent and delivery-status contract; it remains owned by Notifications. | Client, Tasks, Brokers, Operations. |
| n8n Adapter | Versioned handoff to n8n, delivery-result normalization, timeouts, retry, and health reporting. | Notification Module only. |
| Audit Service | Append-only audit recording for sensitive reads, mutations, approvals, external handoffs, and denials. | Every protected module. |
| Event Publisher and Subscribers | Versioned, minimal event distribution with retry-safe subscriber behavior. | Every module that publishes or reacts to committed state changes. |
| Identity and Authorization Services | OAuth 2.1 token validation, audience and tenant checks, role and scope enforcement. | Every protected MCP capability. |

The owning module remains accountable for a published domain service's behavior. A consuming module receives the service interface through NitroStack dependency injection and must not depend on the owner's internal repository, schema, or adapter details.

## 7. Module Lifecycle

### Adding a New Module

1. Define the business capability, owner, data classification, and reason it cannot belong to an existing module.
2. Identify its authoritative data and ensure no existing module already owns the same state transition.
3. Document required synchronous service contracts and post-commit events.
4. Define its tenant, role, scope, audit, idempotency, retention, and approval requirements.
5. Define provisional MCP ownership: tools, resources, prompts, widgets, events, and tasks.
6. Validate that no direct module dependency or circular dependency is introduced.
7. Register the module through root composition only after its contracts and tests are ready.

### Naming Conventions

- Modules use a business-readable singular or plural domain name consistent with Visa Agent vocabulary.
- Module, service, guard, and event artifacts follow the naming conventions in `ARCHITECTURE.md`.
- MCP tool and prompt placeholders use `snake_case`.
- Resource schemes use lowercase domain prefixes such as `case://`, `policy://`, `document://`, and `task://`.
- Event names are lowercase and dot-separated, such as `case.status_changed`.
- Widget routes use lowercase kebab-case.
- MongoDB collections use lowercase plural nouns; Qdrant collection names identify knowledge content and environment.

### Testing Expectations

Every module must demonstrate:

- Domain transition tests for states it owns, including exceptional paths.
- Authorization tests for tenant isolation, scope, role, and approval state.
- Contract tests for its tools, resources, prompts, event payloads, and widget data.
- Idempotency and retry tests for external writes and event subscribers.
- Integration-adapter tests that normalize provider failures without leaking sensitive data.
- Audit assertions for sensitive reads, mutations, approvals, and external handoffs.

Widgets also require representative data-contract tests and visual verification in NitroStudio. They must represent loading, empty, partial, stale, approval-pending, unauthorized, and failure conditions without becoming a hidden business-process layer.

### Ongoing Ownership

The module owner approves changes to its data model, lifecycle rules, public service contracts, MCP surface, event schema, and authorization model. A cross-module contract change requires compatibility review by every consuming module and an explicit migration plan. Existing files are migrated incrementally only when the new ownership boundary, tests, and documented contract are ready.

## 8. Future Modules

The following modules may be introduced when their business capability, governance model, and integration contracts are mature. They are intentionally excluded from the current hackathon scope so the team can establish the core case, document, policy, approval, and notification foundations without expanding the compliance surface prematurely.

| Future Module | Why It May Be Needed | Why It Is Excluded Now |
| --- | --- | --- |
| Analytics | Tenant-governed reporting on throughput, service quality, workload, policy freshness, and outcome trends. | Requires a defined data-governance, aggregation, and privacy model beyond core operational telemetry. |
| Billing | Commercial account management, invoices, entitlements, and contractual usage controls. | It does not advance the core visa-case workflow and introduces financial-record requirements. |
| Payments | Controlled collection and reconciliation of financial transactions where business policy permits. | It materially expands security, compliance, dispute, and financial-control obligations. |
| Administration | Tenant provisioning, delegated role administration, configuration governance, and organization-wide policy management. | Initial tenant and role configuration can remain tightly controlled until operational patterns stabilize. |
| Submissions | External filing-channel integration and jurisdiction-specific submission behavior. | The architecture requires a mature readiness model, explicit approval enforcement, legal review, and recovery controls before activation. |
| Identity Federation | Enterprise identity-provider configuration and advanced access federation. | OAuth 2.1 provides the required foundation; enterprise federation should follow validated tenant needs. |
| Reporting and Compliance Export | Scheduled audit exports and regulated reporting packages. | Depends on settled audit schemas, retention policies, and consumer requirements. |

Future modules must follow the lifecycle in Section 7 and cannot weaken the existing principles: MongoDB remains operational truth, policy evidence must be attributed and fresh, external side effects remain auditable, and humans retain authority over broker assignment, document acceptance, and final submission.

## 
| Module        | Uses                        |
| ------------- | --------------------------- |
| Visa Case     | Policy, Task, Approval      |
| Client        | Visa Case, Documents        |
| Operations    | Visa Case, Documents, Tasks |
| Documents     | Approval, Task              |
| Broker        | Approval                    |
| Notifications | n8n only                    |

## Implementation Order

1. Visa Case Module
2. Client Module
3. Documents Module
4. Policy Knowledge Module
5. Task Module
6. Approval Module
7. Broker Module
8. Notification Module
9. Audit & Observability Module