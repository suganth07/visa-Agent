# Visa Agent Task Architecture

## 1. Purpose

Nitro Tasks are asynchronous background work units used by Visa Agent to perform secondary or long-running processing after an authorized business action has occurred. They are part of the platform's orchestration architecture, but they are not the source of truth for case state, document acceptance, broker assignment, approval decisions, notification policy, or policy knowledge.

In Visa Agent, Tasks handle work that should not block a user-facing MCP tool, portal action, or widget refresh. They process OCR, create follow-up work, prepare review packages, refresh policy indexes, check overdue work, send consent-aware notifications, and update operational projections through owning services.

Tasks are different from Events. A Nitro Event is an immutable signal that a committed business action already happened. A Task is an executable background unit that reacts to a trigger, performs bounded work through a service, records its result, and may emit a new event after successful completion. Events announce facts. Tasks do work.

Tasks are different from Tools. A Tool is a governed MCP operation invoked by an AI client, portal, or visible widget action. It validates input, enforces authorization, and delegates to services. A Task runs asynchronously after a trigger and must never be invoked as a substitute for explicit user intent, authorization, or approval.

Tasks are different from Services. A Service owns business rules, validation, provider integration boundaries, persistence behavior, and state transitions for its module. A Task coordinates when a service operation should happen in the background. Tasks do not own business logic.

Tasks are asynchronous because Visa Agent workflows depend on work that can be slow, failure-prone, externally dependent, or operationally delayed. OCR, policy refresh, notification delivery, approval expiry checks, broker follow-up, and dependency health review should not hold open a user request.

Tasks handle long-running work by allowing each unit to be retried, timed out, observed, canceled, recovered, and audited independently. This keeps MCP tools responsive while preserving accountability for downstream effects.

Tasks improve scalability by decoupling user-facing operations from background throughput. Workers can be scaled by workload category, high-cost integrations can be rate limited, and failures can be isolated without weakening the authority of MongoDB, the owning services, or mandatory human approval gates.

## 2. Task Design Principles

| Principle | Visa Agent Requirement |
| --- | --- |
| Idempotent | A Task must produce the same durable result when replayed for the same trigger and business key. Duplicate delivery must not create duplicate review work, duplicate notifications, duplicate assignments, or duplicate audit records. |
| Retry-safe | A Task can be retried after transient failure without corrupting state or bypassing an approval gate. External side effects require a stable attempt reference and provider-level duplicate protection through the owning service. |
| Observable | Every Task records start, completion, retry, cancellation, timeout, and failure telemetry with task name, tenant, trigger event, entity reference, worker identity, error category, and correlation ID. |
| Auditable | Consequential Tasks create or link to append-only audit records. Audit entries exclude secrets, raw document content, raw OCR payloads, raw provider responses, and unnecessary personal data. |
| Timeout aware | A Task has a bounded execution expectation. Long waits are split into separate attempts or follow-up Tasks so a worker cannot hold resources indefinitely. |
| Cancelable | A Task can stop before performing an unsafe side effect when the case, document, approval, broker assignment, consent, or tenant policy has changed. Cancellation is recorded as a business-safe outcome. |
| Recoverable | Failed Tasks leave enough state for operators or retry policies to recover without re-reading unsafe payloads or inferring hidden decisions. |
| Tenant aware | Every Task carries tenant context and revalidates tenant ownership before reading or writing through a service. |
| Correlation IDs | The originating correlation ID follows the Task through service calls, audit records, emitted events, notification handoffs, and widget refresh projections. |
| Small responsibility | A Task performs one bounded responsibility. Complex workflows are composed by events and services, not by a monolithic background job. |
| No business ownership | A Task never owns domain authority. It asks the owning service to validate and apply a change. |

## 3. Task Categories

| Category | Purpose | Representative Tasks |
| --- | --- | --- |
| Case Tasks | Maintain case intake follow-up, milestone review, and lifecycle projection work after committed case events. | `case_intake`, `case_milestone_review` |
| Document Tasks | Route document review, evidence correction, validation follow-up, and accepted-evidence propagation. | `document_review`, `document_validation`, `evidence_correction_request` |
| OCR Tasks | Process uploaded documents through OCR and route provisional extraction output to review. | `document_ocr_processing` |
| Policy Tasks | Review policy source changes, refresh retrieval indexes, and surface freshness risks. | `policy_source_review`, `policy_index_refresh`, `policy_refresh_review` |
| Approval Tasks | Create human review work, monitor expiry, and close approval-related follow-up after decisions. | `approval_review`, `expiring_approval_follow_up`, `approval_expiration` |
| Broker Tasks | Prepare assignment review work, monitor approved handoff status, and follow up on broker responses. | `broker_assignment_review`, `broker_response_follow_up` |
| Notification Tasks | Deliver consent-aware notifications, retry eligible failures, and follow up on consent gaps. | `notification_delivery`, `delivery_failure_follow_up`, `consent_refresh` |
| Audit Tasks | Update audit read models, support incident review, and surface dependency health changes. | `audit_projection_update`, `incident_review`, `dependency_health_follow_up` |
| Maintenance Tasks | Perform bounded cleanup, overdue checks, expiry checks, and projection refreshes without creating new business authority. | `overdue_task_escalation`, `task_dependency_refresh`, `stale_projection_cleanup` |

## 4. Task Catalog

The catalog below defines background Tasks for every module in `docs/MODULES.md`. Names are architecture-level contracts. They are not implementation code, queue definitions, schemas, or decorators.

### 4.1 Visa Case Module

#### Task Name

`case_intake`

| Field | Definition |
| --- | --- |
| Purpose | Initialize background follow-up for a newly created visa case and make intake progress visible to client-safe and operations-safe views. |
| Owner Module | Visa Case Module |
| Trigger Event | `case.created` |
| Input Data | Case ID, tenant ID, initial lifecycle status, applicant or client reference, destination, purpose, actor category, correlation ID. |
| Business Service Used | Case Service, Task Service contract, Policy Service contract, Audit Service. |
| Expected Result | Intake follow-up work is created or confirmed once, initial case timeline and summary projections are eligible for refresh, and missing intake facts can be surfaced through authorized views. |
| Retry Strategy | Retry transient service or projection failures with bounded backoff. Deduplicate by case ID and source event ID. |
| Timeout Strategy | Use a short operational timeout for case and task service calls; defer slow policy retrieval to policy Tasks when needed. |
| Failure Handling | Mark intake background processing as delayed, keep the case authoritative in MongoDB, and surface the correlation ID to operations. |
| Audit Requirements | Link to the case creation audit record and record any task creation outcome without exposing broad applicant details. |
| Related Widgets | Case Summary, Case Timeline, Client Case Summary, Client Action Checklist, Operations Queue. |
| Related Tools | `case_start`, `case_get`, `operations_get_queue`, `task_create`. |
| Future Enhancements | Jurisdiction-specific intake templates, dependent-aware intake planning, and service-level objective start markers. |

#### Task Name

`case_milestone_review`

| Field | Definition |
| --- | --- |
| Purpose | Evaluate whether a case lifecycle change or review signal requires operational follow-up, blocked-state visibility, or a new approval request package. |
| Owner Module | Visa Case Module |
| Trigger Event | `case.status_changed`, `operations.case_reviewed`, `document.acceptance_approved`, `broker.assigned`, `approval.decided` |
| Input Data | Case ID, tenant ID, previous and current status where applicable, related entity reference, transition reason category, correlation ID. |
| Business Service Used | Case Service, Task Service contract, Approval Service contract, Document Service contract, Audit Service. |
| Expected Result | Milestone readiness is reflected in case projections; missing prerequisites become follow-up tasks; approval-gated states remain blocked until the Approval Service confirms active authority. |
| Retry Strategy | Retry transient read-model and task creation failures with idempotency by case ID, milestone, and triggering event. |
| Timeout Strategy | Bound aggregation calls; on timeout, record partial review and create an exception triage Task instead of advancing state. |
| Failure Handling | Preserve current case state, record delayed milestone evaluation, and route persistent failures to `exception_triage`. |
| Audit Requirements | Record that milestone review occurred and link to the originating state transition or approval audit record. |
| Related Widgets | Case Timeline, Case Review Workspace, Operations Queue, Approval Queue. |
| Related Tools | `case_get`, `case_update`, `operations_review_case`, `approval_get_status`, `task_create`. |
| Future Enhancements | Tenant-specific milestone policies and jurisdiction-specific lifecycle variants. |

#### Task Name

`case_projection_refresh`

| Field | Definition |
| --- | --- |
| Purpose | Refresh case-linked read models after committed case, document, approval, broker, task, notification, or policy events. |
| Owner Module | Visa Case Module |
| Trigger Event | `case.created`, `case.status_changed`, `case.information_requested`, `document.acceptance_approved`, `broker.assigned`, `task.completed`, `approval.decided`, `notification.failed` |
| Input Data | Case ID, tenant ID, changed entity reference, event timestamp, correlation ID. |
| Business Service Used | Case Service, published read services from related modules, Audit Service. |
| Expected Result | Case Summary and Case Timeline resources reflect the latest authorized state while preserving role-specific redaction. |
| Retry Strategy | Retry projection refresh with event ID deduplication and current-state re-read from owning services. |
| Timeout Strategy | Use bounded aggregation time; mark projections stale if a dependency does not respond. |
| Failure Handling | Keep prior projections visible with stale indicators and create operational follow-up when refresh repeatedly fails. |
| Audit Requirements | Operational refresh telemetry is recorded; sensitive reads are audited when protected details are retrieved. |
| Related Widgets | Case Summary, Case Timeline, Client Case Summary, Operations Queue. |
| Related Tools | `case_get`, `client_get_case_view`, `operations_review_case`. |
| Future Enhancements | Snapshot comparison and event-watermark based freshness indicators. |

### 4.2 Client Module

#### Task Name

`client_information_request`

| Field | Definition |
| --- | --- |
| Purpose | Make a newly created information or evidence request visible to the client and coordinate follow-up work without exposing internal notes. |
| Owner Module | Client Module |
| Trigger Event | `case.information_requested` |
| Input Data | Information-request ID, case ID, tenant ID, recipient category, request type, due date, notification eligibility, correlation ID. |
| Business Service Used | Client Service, Case Service contract, Task Service contract, Notification Service contract, Audit Service. |
| Expected Result | Client-safe action state is updated, a client-visible task or checklist item exists where appropriate, and notification intent can be evaluated by the Notification Module. |
| Retry Strategy | Deduplicate by information-request ID and source event ID; retry transient client projection or task creation failures. |
| Timeout Strategy | Bound client and task service calls; notification delivery is delegated to notification Tasks. |
| Failure Handling | Keep the request authoritative in its owning record, mark client projection stale, and route repeated failures to operations exception review. |
| Audit Requirements | Link to the request audit record and avoid recording full request text when it may contain PII. |
| Related Widgets | Client Action Checklist, Client Case Summary, Communication History. |
| Related Tools | `client_get_case_view`, `client_respond_to_request`, `operations_request_information`, `notification_get_status`. |
| Future Enhancements | Localized request presentation and request templates by destination and evidence type. |

#### Task Name

`client_response_review_routing`

| Field | Definition |
| --- | --- |
| Purpose | Route a recorded client response to operations review and refresh client-safe status after submission. |
| Owner Module | Client Module |
| Trigger Event | `client.response_received` |
| Input Data | Response receipt ID, case ID, tenant ID, information-request ID, linked document reference where applicable, actor category, correlation ID. |
| Business Service Used | Client Service, Operations Service contract, Task Service contract, Document Service contract, Audit Service. |
| Expected Result | Operations receives review work, the client checklist reflects that the response was received, and linked document review is triggered only through the Documents Module. |
| Retry Strategy | Retry routing and projection updates with deduplication by response receipt ID and request ID. |
| Timeout Strategy | Bound service calls; if document context is slow, create operations review work with a partial-data marker. |
| Failure Handling | Record routing failure, keep client response committed, and surface the issue in Operations Queue. |
| Audit Requirements | Link to the response audit record and avoid copying free-form response content into task logs. |
| Related Widgets | Client Action Checklist, Operations Queue, Case Review Workspace, Document Readiness. |
| Related Tools | `client_respond_to_request`, `operations_review_case`, `task_create`, `document_get_extraction`. |
| Future Enhancements | Structured questionnaire completeness scoring and delegated representative routing. |

#### Task Name

`consent_follow_up`

| Field | Definition |
| --- | --- |
| Purpose | Detect missing, withdrawn, stale, or channel-limited consent that blocks client communication or notification delivery. |
| Owner Module | Client Module |
| Trigger Event | `client.preferences_updated`, `case.created`, `notification.failed`, scheduled consent review |
| Input Data | Client reference, tenant ID, case ID when applicable, consent status, permitted channel summary, failure category when applicable, correlation ID. |
| Business Service Used | Client Service, Notification Service contract, Task Service contract, Audit Service. |
| Expected Result | Consent-dependent work is either cleared, blocked with a visible reason, or routed to an authorized user for follow-up. |
| Retry Strategy | Retry transient preference reads and task creation; deduplicate by client ID, case ID, consent revision, and source event. |
| Timeout Strategy | Use short service timeouts; never wait on channel providers inside this Task. |
| Failure Handling | Mark communication eligibility unknown and route persistent failures to `delivery_failure_follow_up` or `exception_triage`. |
| Audit Requirements | Record consent follow-up outcomes without exposing full contact details or provider identifiers. |
| Related Widgets | Notification Preferences, Communication History, Client Case Summary. |
| Related Tools | `client_update_preferences`, `notification_update_preference`, `notification_get_status`. |
| Future Enhancements | Consent renewal reminders, quiet hours, and channel-specific consent evidence. |

### 4.3 Operations Module

#### Task Name

`operations_review`

| Field | Definition |
| --- | --- |
| Purpose | Create or refresh operations review work after a case, client response, document, policy, approval, or broker signal requires human attention. |
| Owner Module | Operations Module |
| Trigger Event | `client.response_received`, `document.review_requested`, `document.ocr_completed`, `policy.source_updated`, `approval.requested`, `broker.assignment_requested` |
| Input Data | Case ID, tenant ID, related entity type and identifier, review reason, priority where available, due date where applicable, correlation ID. |
| Business Service Used | Operations Service, Case Service contract, Document Service contract, Policy Service contract, Task Service contract, Audit Service. |
| Expected Result | Case Review Workspace and Operations Queue identify the review item, owner, blockers, and next permitted action. |
| Retry Strategy | Retry transient aggregation and task creation failures; deduplicate by case ID, review reason, related entity, and source event. |
| Timeout Strategy | Bound cross-module aggregation; produce a partial review marker when a dependency is unavailable. |
| Failure Handling | Keep owning module state unchanged, mark queue projection degraded, and escalate repeated failures to `incident_review` if dependency-related. |
| Audit Requirements | Audit formal review creation and sensitive review reads; do not copy internal notes into event payloads. |
| Related Widgets | Operations Queue, Case Review Workspace, Task Worklist, Approval Queue. |
| Related Tools | `operations_get_queue`, `operations_review_case`, `task_create`, `approval_get_status`. |
| Future Enhancements | Jurisdiction-specific review templates and quality-assurance sampling. |

#### Task Name

`exception_triage`

| Field | Definition |
| --- | --- |
| Purpose | Route operational exceptions such as stale policy, OCR ambiguity, delayed tasks, missing approvals, broker delays, or dependency degradation. |
| Owner Module | Operations Module |
| Trigger Event | `task.overdue`, `notification.failed`, `dependency.health_changed`, `policy.source_updated`, repeated task failure |
| Input Data | Tenant ID, case ID when applicable, exception category, related entity reference, severity, failure count, correlation ID. |
| Business Service Used | Operations Service, Task Service contract, Notification Service contract, Audit Service, Observability service. |
| Expected Result | A clear operations queue item exists with severity, owner recommendation, blocked reason, and safe next action. |
| Retry Strategy | Retry queue update and task creation with deduplication by exception category and entity reference. |
| Timeout Strategy | Keep triage bounded; defer expensive diagnostics to `incident_review`. |
| Failure Handling | Record degraded triage state and emit operational telemetry without changing case or approval state. |
| Audit Requirements | Audit exception classification when it affects protected case work or operational escalation. |
| Related Widgets | Operations Queue, Dependency Health Dashboard, Audit Timeline, Case Review Workspace. |
| Related Tools | `operations_get_queue`, `task_assign`, `task_create`, `observability_get_health`, `audit_get_case_history`. |
| Future Enhancements | Exception clustering and tenant-specific service-level thresholds. |

#### Task Name

`operations_queue_refresh`

| Field | Definition |
| --- | --- |
| Purpose | Refresh operations queue projections from committed domain events without making business decisions. |
| Owner Module | Operations Module |
| Trigger Event | `case.created`, `case.status_changed`, `case.information_requested`, `document.review_requested`, `task.created`, `task.overdue`, `approval.requested`, `approval.decided`, `broker.assigned`, `notification.failed`, `dependency.health_changed` |
| Input Data | Tenant ID, case ID when applicable, event name, entity reference, status category, correlation ID. |
| Business Service Used | Operations Service, published read services, Audit Service. |
| Expected Result | Operations Queue reflects current work, blockers, stale sections, and authorized summary fields. |
| Retry Strategy | Retry projection refresh with event ID deduplication and current-state reads. |
| Timeout Strategy | Bound queue rebuild work by tenant and page segment; mark partial projection when dependencies time out. |
| Failure Handling | Preserve last known queue snapshot with stale markers and route repeated failures to `incident_review`. |
| Audit Requirements | Operational projection refresh is logged; sensitive queue reads are audited when later accessed. |
| Related Widgets | Operations Queue, Policy Freshness Dashboard, Approval Queue. |
| Related Tools | `operations_get_queue`, `operations_review_case`, `observability_get_metrics`. |
| Future Enhancements | Saved queue views, workload balancing, and capacity-aware projections. |

### 4.4 Documents Module

#### Task Name

`document_ocr_processing`

| Field | Definition |
| --- | --- |
| Purpose | Process an uploaded document through the OCR boundary and persist provisional extraction output for review. |
| Owner Module | Documents Module |
| Trigger Event | `document.uploaded` |
| Input Data | Document ID, case ID, tenant ID, document-request ID where applicable, declared document type, secure storage reference category, correlation ID. |
| Business Service Used | Document Service, OCR Service, Document Storage Service, Audit Service. |
| Expected Result | OCR attempt is recorded; provisional extraction status is persisted; `document.ocr_completed` is emitted when extraction is normalized and stored. |
| Retry Strategy | Retry transient OCR and storage failures with bounded backoff and provider attempt deduplication. Do not retry unsafe files that failed security validation. |
| Timeout Strategy | Use OCR-specific timeout limits. Long provider waits produce a retryable pending state or failure classification rather than blocking the worker indefinitely. |
| Failure Handling | Record OCR failure category, keep upload metadata intact, create document review or exception work where appropriate, and never mark evidence accepted. |
| Audit Requirements | Record OCR attempt and result metadata without raw OCR text, extracted sensitive fields, document binary content, or provider payloads. |
| Related Widgets | Document Readiness, Extraction Review, Operations Queue, Dependency Health Dashboard. |
| Related Tools | `document_upload`, `document_get_extraction`, `document_request_review`. |
| Future Enhancements | Multi-pass OCR, document-type classifiers, confidence metrics, and duplicate detection. |

#### Task Name

`document_review`

| Field | Definition |
| --- | --- |
| Purpose | Create or update human document review work after OCR completion, validation findings, or explicit review request. |
| Owner Module | Documents Module |
| Trigger Event | `document.ocr_completed`, `document.review_requested`, `client.response_received` when linked to a document |
| Input Data | Document ID, case ID, tenant ID, extraction-result reference where available, review type, priority, due date, correlation ID. |
| Business Service Used | Document Service, Task Service contract, Approval Service contract, Audit Service. |
| Expected Result | Review work is visible to authorized reviewers, provisional values remain clearly marked, and acceptance stays blocked until an authorized approval decision exists. |
| Retry Strategy | Retry task creation and review-state updates with deduplication by document ID, review-request ID, and extraction-result reference. |
| Timeout Strategy | Bound document and task service calls; defer large validation comparisons to `document_validation`. |
| Failure Handling | Keep document in review-pending or review-delayed state and surface the delay in Operations Queue. |
| Audit Requirements | Audit review routing and sensitive extraction access; exclude raw document content and full OCR payloads. |
| Related Widgets | Document Readiness, Extraction Review, Approval Decision View, Operations Queue. |
| Related Tools | `document_get_extraction`, `document_request_review`, `approval_request`, `task_create`. |
| Future Enhancements | Reviewer routing, review service-level agreements, and field-level source comparison. |

#### Task Name

`document_validation`

| Field | Definition |
| --- | --- |
| Purpose | Evaluate document metadata, extraction status, confidence, expiry signals, and requirement fit for reviewer attention. |
| Owner Module | Documents Module |
| Trigger Event | `document.ocr_completed`, `document.review_requested`, policy requirement refresh |
| Input Data | Document ID, case ID, tenant ID, document type, extraction-result reference, requirement reference, correlation ID. |
| Business Service Used | Document Service, Policy Service contract when requirement context is needed, Audit Service. |
| Expected Result | Validation findings are recorded as provisional review inputs and any correction or approval-readiness work is made eligible. |
| Retry Strategy | Retry transient reads with deduplication by document ID, extraction revision, and requirement reference. |
| Timeout Strategy | Bound policy and document reads; mark validation partial if policy evidence is unavailable or stale. |
| Failure Handling | Record validation unavailable or partial; route ambiguous cases to `document_review` rather than accepting evidence. |
| Audit Requirements | Audit access to sensitive extraction and validation findings; avoid storing full extracted values in logs. |
| Related Widgets | Extraction Review, Document Readiness, Case Review Workspace. |
| Related Tools | `document_get_extraction`, `policy_search`, `document_request_review`. |
| Future Enhancements | Configurable evidence rules, multi-document consistency checks, and expiry monitoring. |

#### Task Name

`evidence_correction_request`

| Field | Definition |
| --- | --- |
| Purpose | Coordinate follow-up when a document is missing, ambiguous, rejected, expired, or requires client correction. |
| Owner Module | Documents Module |
| Trigger Event | `document.review_requested`, `approval.decided` when a document acceptance request is rejected, `document.ocr_completed` with low confidence |
| Input Data | Case ID, document ID where applicable, tenant ID, correction reason category, requested evidence type, recipient category, correlation ID. |
| Business Service Used | Document Service, Operations Service contract, Client Service contract, Task Service contract, Notification Service contract, Audit Service. |
| Expected Result | A correction request or follow-up task is created through the appropriate owner; client-safe surfaces show only permitted correction guidance. |
| Retry Strategy | Retry task and request creation with deduplication by document ID, correction reason, and request reference. |
| Timeout Strategy | Use short timeouts for request creation; notification delivery is delegated to notification Tasks. |
| Failure Handling | Mark correction routing delayed and surface an operations exception without changing document acceptance status. |
| Audit Requirements | Link to document review or approval audit records and exclude raw document values from correction task logs. |
| Related Widgets | Client Action Checklist, Document Readiness, Extraction Review, Communication History. |
| Related Tools | `operations_request_information`, `document_request_review`, `task_create`, `notification_get_status`. |
| Future Enhancements | Evidence templates, localized correction guidance, and duplicate evidence detection. |

### 4.5 Policy Knowledge Module

#### Task Name

`policy_source_review`

| Field | Definition |
| --- | --- |
| Purpose | Route newly changed or refreshed policy source material to authorized policy review before it influences production guidance. |
| Owner Module | Policy Knowledge Module |
| Trigger Event | `policy.source_updated` or approved ingestion completion signal |
| Input Data | Source ID, source version reference, tenant or jurisdiction scope, destination, freshness metadata, review status, correlation ID. |
| Business Service Used | Policy Service, Policy Ingestion Service, Task Service contract, Audit Service. |
| Expected Result | Policy reviewer work exists when needed, unreviewed content remains restricted, and freshness state is visible to operations. |
| Retry Strategy | Retry task creation and metadata refresh with deduplication by source ID and source version. |
| Timeout Strategy | Bound source metadata reads; do not crawl or index inside this Task when review is incomplete. |
| Failure Handling | Mark source review routing delayed and keep policy evidence in stale or unreviewed state as appropriate. |
| Audit Requirements | Audit review routing and source-state changes without copying broad source content into logs. |
| Related Widgets | Policy Freshness Dashboard, Policy Evidence Panel, Operations Queue. |
| Related Tools | `policy_get_sources`, `policy_request_review`, `operations_get_queue`. |
| Future Enhancements | Source-quality scoring, reviewer work queues, and policy change comparison. |

#### Task Name

`policy_index_refresh`

| Field | Definition |
| --- | --- |
| Purpose | Refresh Qdrant-backed retrieval indexes only for reviewed and approved policy content. |
| Owner Module | Policy Knowledge Module |
| Trigger Event | `policy.source_updated` after review approval |
| Input Data | Source ID or source set reference, jurisdiction, destination, reviewed source version, policy review state, correlation ID. |
| Business Service Used | Policy Ingestion Service, Policy Service, Qdrant Service, Audit Service. |
| Expected Result | Reviewed policy content is indexed; index version metadata is recorded; `policy.index_refreshed` is emitted after successful refresh. |
| Retry Strategy | Retry transient Qdrant or ingestion failures with index version deduplication. Do not index unreviewed content. |
| Timeout Strategy | Use indexing timeouts by jurisdiction or source set; split large refreshes into bounded segments. |
| Failure Handling | Preserve prior index version, mark freshness degraded, and route persistent failures to operations and observability. |
| Audit Requirements | Record index refresh attempt, source version, result category, and correlation ID without exposing provider diagnostics. |
| Related Widgets | Policy Freshness Dashboard, Policy Evidence Panel, Dependency Health Dashboard. |
| Related Tools | `policy_search`, `policy_get_sources`, `policy_request_review`, `observability_get_health`. |
| Future Enhancements | Incremental index refresh, source diffing, and jurisdiction coverage metrics. |

#### Task Name

`policy_refresh_review`

| Field | Definition |
| --- | --- |
| Purpose | Detect stale, conflicting, missing, or recently changed policy evidence and create review work for operations or policy reviewers. |
| Owner Module | Policy Knowledge Module |
| Trigger Event | `policy.index_refreshed`, `dependency.health_changed`, scheduled freshness evaluation |
| Input Data | Destination, tenant or jurisdiction scope, source freshness state, index version, affected case references where authorized, correlation ID. |
| Business Service Used | Policy Service, Operations Service contract, Task Service contract, Audit Service. |
| Expected Result | Freshness warnings are visible in policy and operations widgets, and review Tasks exist for stale or conflicting sources. |
| Retry Strategy | Retry freshness evaluation with deduplication by destination, source version, and evaluation window. |
| Timeout Strategy | Bound evaluation by destination and source set; defer broad impact analysis to future analytics capabilities. |
| Failure Handling | Mark policy freshness unknown or stale and prevent unreviewed certainty from being presented. |
| Audit Requirements | Record freshness review outcome and any affected operational routing without copying policy excerpts into audit logs. |
| Related Widgets | Policy Freshness Dashboard, Policy Evidence Panel, Operations Queue, Case Review Workspace. |
| Related Tools | `policy_get_sources`, `policy_request_review`, `operations_review_case`. |
| Future Enhancements | Source quality scoring, affected-case governance, and reviewed policy diffing. |

### 4.6 Broker Module

#### Task Name

`broker_assignment_review`

| Field | Definition |
| --- | --- |
| Purpose | Route a prepared broker assignment proposal to approval and operations review without activating the assignment. |
| Owner Module | Broker Module |
| Trigger Event | `broker.assignment_requested` |
| Input Data | Proposal ID, case ID, tenant ID, broker ID where selected, requested action, eligibility summary, handoff preview reference, correlation ID. |
| Business Service Used | Broker Service, Approval Service contract, Task Service contract, Audit Service. |
| Expected Result | Approval review work exists; assignment remains inactive; broker handoff is blocked until the Broker Module validates an active approval. |
| Retry Strategy | Retry approval-task routing with deduplication by proposal ID and source event ID. |
| Timeout Strategy | Bound broker and approval service calls; do not contact broker channels from this Task. |
| Failure Handling | Keep proposal pending review and surface routing delay in Broker Assignment Preview and Operations Queue. |
| Audit Requirements | Link to broker proposal audit record and avoid exposing unnecessary applicant or handoff data. |
| Related Widgets | Broker Assignment Preview, Approval Queue, Case Review Workspace. |
| Related Tools | `broker_prepare_assignment`, `approval_request`, `approval_get_status`, `broker_get_eligible`. |
| Future Enhancements | Broker capacity checks, eligibility scoring, and delegated approval routing. |

#### Task Name

`broker_assignment_activation`

| Field | Definition |
| --- | --- |
| Purpose | Apply an approved broker assignment proposal only after the Broker Service revalidates approval, eligibility, and handoff minimization. |
| Owner Module | Broker Module |
| Trigger Event | `broker.assignment_approved` or explicit approved `broker_assign` action |
| Input Data | Proposal ID, approval ID, case ID, tenant ID, broker ID, approval state reference, correlation ID. |
| Business Service Used | Broker Service, Approval Service contract, Case Service contract, Audit Service, Notification Service contract. |
| Expected Result | Broker assignment is created once, `broker.assigned` is emitted, and handoff delivery becomes eligible through Notification Module policy. |
| Retry Strategy | Retry only before external handoff. Deduplicate by proposal ID, approval ID, and assignment idempotency reference. |
| Timeout Strategy | Bound approval and broker validation. Handoff delivery is not performed inside this activation if notification policy requires separate delivery processing. |
| Failure Handling | Keep proposal approved-but-not-assigned or blocked with reason; route persistent failures to operations review. |
| Audit Requirements | Record approval verification, assignment result, and handoff eligibility without embedding full handoff packet content. |
| Related Widgets | Broker Assignment Preview, Broker Handoff Status, Case Timeline. |
| Related Tools | `broker_assign`, `approval_get_status`, `notification_get_status`. |
| Future Enhancements | Secure broker portal handoff and jurisdiction-specific broker eligibility rules. |

#### Task Name

`broker_response_follow_up`

| Field | Definition |
| --- | --- |
| Purpose | Monitor assigned broker response status and create follow-up work when responses are missing, delayed, or failed to deliver. |
| Owner Module | Broker Module |
| Trigger Event | `broker.assigned`, `notification.failed`, scheduled broker response check |
| Input Data | Broker assignment ID, case ID, tenant ID, broker ID, handoff notification reference, due date or response threshold, correlation ID. |
| Business Service Used | Broker Service, Task Service contract, Notification Service contract, Audit Service. |
| Expected Result | Broker response state is visible, overdue follow-up work exists where needed, and no case state changes occur solely from broker silence. |
| Retry Strategy | Retry status reads and task creation with deduplication by assignment ID and response threshold. |
| Timeout Strategy | Bound broker status and notification status reads; defer external retries to notification Tasks. |
| Failure Handling | Mark broker response status unknown or delayed and surface the issue to operations. |
| Audit Requirements | Audit follow-up creation and external handoff status reads while preserving minimum-necessary data rules. |
| Related Widgets | Broker Handoff Status, Task Worklist, Communication History, Operations Queue. |
| Related Tools | `broker_get_eligible`, `notification_get_status`, `task_create`, `notification_retry`. |
| Future Enhancements | Broker portal responses, service quality metrics, and broker capacity dashboard. |

### 4.7 Task Module

#### Task Name

`task_assignment`

| Field | Definition |
| --- | --- |
| Purpose | Assign or rebalance user-visible work items created by tools, services, or event subscribers. |
| Owner Module | Task Module |
| Trigger Event | `task.created`, `operations.case_reviewed`, `document.review_requested`, `approval.requested`, `broker.assignment_requested` |
| Input Data | Task ID, tenant ID, case ID where applicable, task type, priority, due date, candidate owner or role, correlation ID. |
| Business Service Used | Task Service, Operations Service contract, Audit Service. |
| Expected Result | The work item has an authorized owner, visible due date, dependency status, and queue placement. |
| Retry Strategy | Retry assignment with deduplication by task ID and assignment revision. |
| Timeout Strategy | Bound owner lookup and queue update; leave task unassigned with escalation marker when owner resolution times out. |
| Failure Handling | Mark assignment pending and surface in Operations Queue for manual assignment. |
| Audit Requirements | Record assignment changes and actor or system identity responsible for assignment. |
| Related Widgets | Task Worklist, Task Detail, Operations Queue. |
| Related Tools | `task_create`, `task_assign`, `operations_get_queue`. |
| Future Enhancements | Workload balancing, calendar-aware due dates, and capacity-aware assignment. |

#### Task Name

`overdue_task_escalation`

| Field | Definition |
| --- | --- |
| Purpose | Detect open work items that crossed due thresholds and update escalation state without advancing case state. |
| Owner Module | Task Module |
| Trigger Event | Scheduled overdue evaluation or delayed task timer |
| Input Data | Task ID, tenant ID, case ID where applicable, due date, current task status, escalation threshold, correlation ID. |
| Business Service Used | Task Service, Notification Service contract, Operations Service contract, Audit Service. |
| Expected Result | Overdue state is committed once, `task.overdue` is emitted, and operations or notification follow-up becomes eligible. |
| Retry Strategy | Retry escalation with deduplication by task ID and escalation threshold. |
| Timeout Strategy | Process overdue checks in bounded batches by tenant and due window. |
| Failure Handling | Record missed escalation window, continue future scheduled evaluations, and surface repeated failures to observability. |
| Audit Requirements | Audit escalation state changes and any external follow-up eligibility. |
| Related Widgets | Task Worklist, Task Detail, Operations Queue, Dependency Health Dashboard. |
| Related Tools | `task_assign`, `task_complete`, `notification_get_status`, `observability_get_metrics`. |
| Future Enhancements | Tenant-specific service-level rules and escalation chains. |

#### Task Name

`task_dependency_refresh`

| Field | Definition |
| --- | --- |
| Purpose | Recalculate task dependency and blocked-state signals after linked case, document, approval, policy, broker, or notification events. |
| Owner Module | Task Module |
| Trigger Event | `case.status_changed`, `document.acceptance_approved`, `approval.decided`, `broker.assigned`, `notification.failed`, `policy.index_refreshed` |
| Input Data | Task ID or case ID, tenant ID, related entity reference, event name, dependency category, correlation ID. |
| Business Service Used | Task Service, published owner services for current-state reads, Audit Service. |
| Expected Result | Task Worklist and Task Detail show current blocked, unblocked, dependent, or ready status. |
| Retry Strategy | Retry dependency refresh with deduplication by task ID, dependency key, and event ID. |
| Timeout Strategy | Bound dependency reads; mark dependency status unknown when a module is unavailable. |
| Failure Handling | Preserve current task state and route repeated dependency failures to operations exception triage. |
| Audit Requirements | Record dependency-state changes that affect ownership, escalation, or completion readiness. |
| Related Widgets | Task Worklist, Task Detail, Case Review Workspace. |
| Related Tools | `task_complete`, `task_assign`, `operations_review_case`. |
| Future Enhancements | Dependency visualization and automated task suggestions as advisory-only outputs. |

### 4.8 Approval Module

#### Task Name

`approval_review`

| Field | Definition |
| --- | --- |
| Purpose | Create human review work for a new approval request and ensure approval queues reflect required authority, expiry, and evidence references. |
| Owner Module | Approval Module |
| Trigger Event | `approval.requested`, `broker.assignment_requested`, document acceptance review request |
| Input Data | Approval ID, case ID, tenant ID, subject type, subject ID, requested action, required authority, expiry, correlation ID. |
| Business Service Used | Approval Service, Task Service contract, Notification Service contract, Audit Service. |
| Expected Result | Approval Queue contains the request, assigned approvers can review it, and no downstream action is authorized until `approval.decided` and owner validation occur. |
| Retry Strategy | Retry queue and task creation with deduplication by approval ID and source event ID. |
| Timeout Strategy | Bound approval and task service calls; notification work is delegated to notification Tasks. |
| Failure Handling | Keep approval request authoritative and mark routing delayed for operations. |
| Audit Requirements | Link to approval request audit record and avoid embedding sensitive evidence contents. |
| Related Widgets | Approval Queue, Approval Decision View, Broker Assignment Preview, Document Readiness. |
| Related Tools | `approval_request`, `approval_get_status`, `approval_decide`, `task_create`. |
| Future Enhancements | Multi-party approvals, conditional approvals, and delegated authority routing. |

#### Task Name

`expiring_approval_follow_up`

| Field | Definition |
| --- | --- |
| Purpose | Warn operations or approvers when an active approval request is nearing expiry. |
| Owner Module | Approval Module |
| Trigger Event | Scheduled approval expiry evaluation or delayed approval timer |
| Input Data | Approval ID, case ID, tenant ID, subject type, expiry timestamp, required authority, current approval state, correlation ID. |
| Business Service Used | Approval Service, Task Service contract, Notification Service contract, Audit Service. |
| Expected Result | Expiry risk is visible in approval and operations views, and follow-up work exists where tenant policy permits. |
| Retry Strategy | Retry follow-up creation with deduplication by approval ID and expiry threshold. |
| Timeout Strategy | Process expiring approvals in bounded tenant-scoped batches. |
| Failure Handling | Preserve approval state and continue next scheduled evaluation; escalate persistent failures through operations. |
| Audit Requirements | Record expiry follow-up creation and notification eligibility without exposing private rationale. |
| Related Widgets | Approval Queue, Approval Decision View, Operations Queue. |
| Related Tools | `approval_get_status`, `task_create`, `notification_get_status`. |
| Future Enhancements | Delegation reminders and tenant-configurable expiry policies. |

#### Task Name

`approval_expiration`

| Field | Definition |
| --- | --- |
| Purpose | Mark approval requests expired when their validity window closes and prevent expired approvals from authorizing downstream action. |
| Owner Module | Approval Module |
| Trigger Event | Scheduled approval expiry evaluation |
| Input Data | Approval ID, tenant ID, case ID, expiry timestamp, current approval state, subject reference, correlation ID. |
| Business Service Used | Approval Service, Task Service contract, Audit Service. |
| Expected Result | Approval state is expired once, related tasks and widgets show the blocked state, and downstream owner services reject the expired approval. |
| Retry Strategy | Retry expiration update with deduplication by approval ID and expiry timestamp. |
| Timeout Strategy | Use bounded expiration batches and avoid broad tenant scans in a single worker unit. |
| Failure Handling | Leave approval in prior state only if service validation fails; alert operations for repeated expiration processing failures. |
| Audit Requirements | Audit expiration state change and affected subject reference without private deliberation details. |
| Related Widgets | Approval Queue, Approval Decision View, Case Review Workspace, Broker Assignment Preview. |
| Related Tools | `approval_get_status`, `operations_review_case`, `task_create`. |
| Future Enhancements | Supersession workflows and approval-policy version tracking. |

### 4.9 Notification Module

#### Task Name

`notification_delivery`

| Field | Definition |
| --- | --- |
| Purpose | Deliver an approved, consent-aware notification intent through n8n and record normalized delivery state. |
| Owner Module | Notification Module |
| Trigger Event | `notification.requested`, approved notification intent from `case.information_requested`, `task.overdue`, `approval.requested`, or `broker.assigned` |
| Input Data | Notification ID, tenant ID, case ID where applicable, recipient category, channel, template reference, delivery attempt number, correlation ID. |
| Business Service Used | Notification Service, Client Service contract, n8n Adapter, Audit Service. |
| Expected Result | Notification handoff is attempted once per delivery attempt; delivery status is recorded; `notification.delivered` or `notification.failed` is emitted when a terminal result is known. |
| Retry Strategy | Retry transient n8n or channel failures with bounded backoff, retry limits, and attempt deduplication. Recheck consent before retrying. |
| Timeout Strategy | Bound n8n handoff and provider callback waits. Long-running delivery confirmation is handled by later status events. |
| Failure Handling | Record normalized failure category, preserve case and approval state, and create follow-up work only through Notification or Task services. |
| Audit Requirements | Audit notification intent, external handoff, and delivery result without full recipient details, message body, raw provider payload, or credentials. |
| Related Widgets | Communication History, Notification Preferences, Operations Queue. |
| Related Tools | `notification_get_status`, `notification_retry`, `notification_update_preference`. |
| Future Enhancements | Scheduled delivery, localization, alternate-channel fallback, and additional channels. |

#### Task Name

`delivery_failure_follow_up`

| Field | Definition |
| --- | --- |
| Purpose | Create safe operational follow-up for failed or terminal notification attempts. |
| Owner Module | Notification Module |
| Trigger Event | `notification.failed` |
| Input Data | Notification ID, delivery attempt ID, case ID where applicable, tenant ID, channel, failure category, retry eligibility, correlation ID. |
| Business Service Used | Notification Service, Task Service contract, Client Service contract, Audit Service. |
| Expected Result | Retry eligibility, consent status, and follow-up action are visible without changing case, task, approval, broker, or document state. |
| Retry Strategy | Retry follow-up creation with deduplication by notification ID and delivery attempt ID. Do not retry delivery directly from this Task unless explicit retry policy permits it. |
| Timeout Strategy | Bound status and consent reads; defer provider diagnostics to observability. |
| Failure Handling | Mark follow-up routing delayed and surface repeated failures in Operations Queue and Dependency Health Dashboard. |
| Audit Requirements | Link to delivery failure audit records and exclude raw provider errors or full contact details. |
| Related Widgets | Communication History, Operations Queue, Notification Preferences, Dependency Health Dashboard. |
| Related Tools | `notification_get_status`, `notification_retry`, `task_create`, `observability_get_health`. |
| Future Enhancements | Alternate-channel evaluation and template quality analytics. |

#### Task Name

`consent_refresh`

| Field | Definition |
| --- | --- |
| Purpose | Refresh notification eligibility after client preference changes or before a delivery retry. |
| Owner Module | Notification Module |
| Trigger Event | `client.preferences_updated`, `notification.failed`, scheduled consent eligibility review |
| Input Data | Client reference, tenant ID, case ID where applicable, consent status, channel summary, notification ID when applicable, correlation ID. |
| Business Service Used | Notification Service, Client Service contract, Audit Service. |
| Expected Result | Notification eligibility read models reflect current consent and channel rules; blocked notifications remain unsent. |
| Retry Strategy | Retry transient client preference reads with deduplication by client ID and preference revision. |
| Timeout Strategy | Use short service timeouts and never call external delivery providers from this Task. |
| Failure Handling | Mark notification eligibility unknown and prevent delivery until eligibility can be rechecked. |
| Audit Requirements | Record eligibility refresh outcomes when they affect notification delivery or retry decisions. |
| Related Widgets | Notification Preferences, Communication History, Client Case Summary. |
| Related Tools | `notification_get_status`, `notification_update_preference`, `client_update_preferences`. |
| Future Enhancements | Channel-specific consent windows and tenant-governed preference history. |

### 4.10 Audit and Observability Module

#### Task Name

`audit_projection_update`

| Field | Definition |
| --- | --- |
| Purpose | Update authorized audit timeline and metrics projections after an append-only audit record is created. |
| Owner Module | Audit and Observability Module |
| Trigger Event | `audit.recorded` |
| Input Data | Audit record ID, tenant ID, action category, entity reference category, outcome category, actor category, timestamp, correlation ID. |
| Business Service Used | Audit Service, Metrics Service, Case Service contract where case-scoped projection is needed. |
| Expected Result | Audit Timeline and operational metrics can show the new audit fact according to authorization and redaction rules. |
| Retry Strategy | Retry projection update with deduplication by audit record ID and event ID. |
| Timeout Strategy | Bound projection updates and process large audit windows in pages. |
| Failure Handling | Preserve append-only audit record as authority and mark projection delayed for operations. |
| Audit Requirements | Avoid recursive audit loops; projection work logs only redacted audit summaries. |
| Related Widgets | Audit Timeline, Dependency Health Dashboard, Operations Queue. |
| Related Tools | `audit_get_case_history`, `observability_get_metrics`. |
| Future Enhancements | Signed audit records, retention-aware views, and compliance export preparation. |

#### Task Name

`dependency_health_follow_up`

| Field | Definition |
| --- | --- |
| Purpose | React to dependency health changes and create operational follow-up for degraded MongoDB, Qdrant, Firecrawl, OCR, document storage, n8n, or notification channels. |
| Owner Module | Audit and Observability Module |
| Trigger Event | `dependency.health_changed` |
| Input Data | Dependency identifier, tenant or platform scope where applicable, previous health category, new health category, degradation category, observed timestamp, correlation ID. |
| Business Service Used | Observability service, Task Service contract, Notification Service contract where operational alerts are permitted, Audit Service. |
| Expected Result | Dependency Health Dashboard reflects the latest state, affected operations can see degraded-mode signals, and follow-up work exists for persistent degradation. |
| Retry Strategy | Retry dashboard and task updates with deduplication by dependency, health state, and observation window. |
| Timeout Strategy | Keep health follow-up bounded and avoid live dependency diagnostics inside the Task. |
| Failure Handling | Continue normal health sampling and route repeated projection failures to incident review. |
| Audit Requirements | Record health follow-up outcome without credentials, stack traces, raw provider responses, or infrastructure internals. |
| Related Widgets | Dependency Health Dashboard, Operations Queue, Policy Freshness Dashboard, Communication History. |
| Related Tools | `observability_get_health`, `observability_get_metrics`, `task_create`, `notification_get_status`. |
| Future Enhancements | Service-level objective alerts, tenant-safe degradation summaries, and runbook references. |

#### Task Name

`incident_review`

| Field | Definition |
| --- | --- |
| Purpose | Create or refresh incident-oriented review work when repeated failures, dead-lettered Tasks, or dependency degradation affect Visa Agent workflows. |
| Owner Module | Audit and Observability Module |
| Trigger Event | Repeated task failure, dead-letter routing, `dependency.health_changed`, sustained notification or OCR failure |
| Input Data | Incident category, tenant or platform scope, affected module, affected entity references where authorized, failure count, first and latest correlation IDs. |
| Business Service Used | Audit Service, Metrics Service, Operations Service contract, Task Service contract. |
| Expected Result | Authorized operations users can inspect the incident, affected workflows, retry history, and safe recovery options. |
| Retry Strategy | Retry incident projection with deduplication by incident category, affected scope, and observation window. |
| Timeout Strategy | Bound incident aggregation by time window and tenant; do not perform broad compliance export. |
| Failure Handling | Record incident review failure and keep lower-level telemetry available for authorized reads. |
| Audit Requirements | Audit incident review access and creation; redact sensitive payloads, secrets, provider diagnostics, and unrelated tenant data. |
| Related Widgets | Dependency Health Dashboard, Audit Timeline, Operations Queue. |
| Related Tools | `observability_get_health`, `observability_get_metrics`, `audit_get_case_history`, `operations_get_queue`. |
| Future Enhancements | Incident evidence packages, anomaly detection, and service-level reporting. |

#### Task Name

`stale_projection_cleanup`

| Field | Definition |
| --- | --- |
| Purpose | Identify stale or superseded read-model projections and refresh or retire them without changing authoritative domain records. |
| Owner Module | Audit and Observability Module |
| Trigger Event | Scheduled maintenance evaluation, repeated projection failure, dependency recovery event |
| Input Data | Projection family, tenant scope, last refresh watermark, related module, staleness threshold, correlation ID. |
| Business Service Used | Observability service, owning module read services, Audit Service. |
| Expected Result | Stale projections are refreshed where possible, marked degraded when not, or retired under documented retention and visibility rules. |
| Retry Strategy | Retry by projection family and watermark with bounded backoff. Do not rebuild broad projections indefinitely. |
| Timeout Strategy | Process projections in bounded tenant-scoped batches. |
| Failure Handling | Preserve authoritative records and surface stale projection status in observability rather than hiding uncertainty. |
| Audit Requirements | Record cleanup outcomes for protected projections and avoid broad data export behavior. |
| Related Widgets | Dependency Health Dashboard, Operations Queue, Audit Timeline, Policy Freshness Dashboard. |
| Related Tools | `observability_get_health`, `observability_get_metrics`, `audit_get_case_history`. |
| Future Enhancements | Retention automation and projection watermark dashboards. |

## 5. Task Lifecycle

```text
Event
  |
  v
Task Queue
  |
  v
Worker
  |
  v
Business Service
  |
  v
Database
  |
  v
Audit
  |
  v
Completion
  |
  v
Optional Event
```

**Event**

A Task is usually triggered by a committed Nitro Event such as `case.created`, `document.uploaded`, `approval.requested`, `task.overdue`, or `notification.failed`. The event is a signal that the source-of-truth state already exists. The Task must treat the event payload as a hint and re-read authoritative state through owning services before consequential work.

**Task Queue**

The Task Queue holds pending background work with tenant, entity, trigger, retry, timeout, idempotency, and correlation metadata. Queue presence does not imply the work is authorized to mutate state; authorization and state checks still occur through services.

**Worker**

A Worker executes one bounded Task. It loads the Task context, checks cancellation and retry state, starts telemetry, and delegates all business decisions to the appropriate service.

**Business Service**

The owning service validates tenant, state, approval, consent, document eligibility, broker eligibility, or policy review status as required. This is where business authority lives. A Task that cannot pass service validation stops safely.

**Database**

When a Task creates or changes state, the owning service persists the authoritative record in MongoDB or records policy index metadata for retrieval workflows. If persistence fails, the Task does not emit a completion event.

**Audit**

Consequential Task outcomes are audited with actor or service identity, tenant, action, entity references, result, correlation ID, and timestamp. Sensitive payloads are redacted.

**Completion**

The Task records completed, canceled, skipped, failed, timed out, or dead-lettered status. Completion means background work finished; it does not imply case advancement unless the owning service committed a valid state transition.

**Optional Event**

After successful completion, the owning service may emit a new event such as `document.ocr_completed`, `task.overdue`, `notification.delivered`, `notification.failed`, `policy.index_refreshed`, or a subject-specific approval event. Events are emitted only after the authoritative change and audit record exist.

## 6. Scheduling Rules

**Immediate Tasks**

Immediate Tasks are scheduled directly after a committed event when follow-up work should begin quickly. Examples include `case_intake` after `case.created`, `document_ocr_processing` after `document.uploaded`, and `approval_review` after `approval.requested`.

**Delayed Tasks**

Delayed Tasks wait until a meaningful time boundary or dependency condition. Examples include broker response checks, approval expiry warnings, and delayed notification retry attempts.

**Recurring Tasks**

Recurring Tasks evaluate ongoing conditions on a bounded schedule. Examples include policy freshness review, dependency health follow-up, overdue task escalation, consent eligibility checks, and stale projection cleanup.

**Maintenance Tasks**

Maintenance Tasks keep projections, freshness markers, metrics, and operational signals healthy. They do not own domain records, perform compliance exports, retrain models, bill customers, reconcile payments, or make business decisions.

**Retry Tasks**

Retry Tasks represent another attempt for the same business work after a transient failure. They must preserve the same idempotency key, correlation ID, tenant context, and side-effect boundaries.

**Cleanup Tasks**

Cleanup Tasks retire stale projections, close superseded background attempts, and mark expired transient processing state. They must not delete authoritative case, document, approval, task, broker, notification, or audit records unless a future retention policy explicitly governs that behavior.

**Expiration Tasks**

Expiration Tasks apply time-bound state through owning services. Approval expiration and overdue task escalation are the primary examples. They must be idempotent by entity and threshold.

## 7. Failure Handling

**Retries**

Tasks retry only when the failure is transient or recoverable. Retried execution must use the same business idempotency reference and must re-read current state before acting.

**Dead Letter Queue**

A persistent failure may be moved conceptually to a dead-letter state after bounded retry attempts. Dead-lettering preserves task context, failure category, tenant, entity reference, retry history, and correlation ID for operations review. It must not discard the authoritative business record.

**Backoff**

Backoff prevents dependency storms and repeated external side effects. Expensive integrations such as OCR, Firecrawl-derived ingestion, Qdrant indexing, n8n handoff, and notification channels require bounded retry spacing and clear terminal states.

**Logging**

Logs include task name, event ID, entity reference, tenant, attempt, worker, result, error category, and correlation ID. Logs exclude secrets, raw document content, raw OCR text, provider payloads, access tokens, and broad PII.

**Alerting**

Alerting is used for repeated failures, high-risk dead-lettered Tasks, dependency degradation, policy freshness risk, OCR backlog, notification delivery failures, and approval expiration processing failures. Alerts are operational signals, not business decisions.

**Recovery**

Recovery uses owning services and guarded tools. Operators may retry a Task, refresh a projection, create a follow-up task, or re-request approval, but they cannot mutate another module's records directly.

**Manual Retry**

Manual retry is allowed only for Tasks whose side effects are idempotent and whose owning service can revalidate current state. Manual retry must record actor or operator identity where applicable.

**Cancellation**

A Task must cancel safely when the source entity is no longer eligible, an approval expired, consent was withdrawn, a case moved to a disallowed state, a document was superseded, or tenant policy changed.

**Timeout**

Timeouts produce a recorded outcome and retry decision. A timed-out OCR, indexing, notification, or projection Task must not be treated as successful or silently ignored.

## 8. Cross Task Rules

- Tasks never call other Tasks directly.
- Tasks never bypass Services.
- Tasks never modify another module's owned state directly.
- Tasks may emit Events only after successful service-validated completion.
- Tasks must be idempotent.
- Tasks must be retry-safe.
- Tasks must record audit information for consequential outcomes.
- Tasks must preserve tenant isolation and correlation IDs.
- Tasks must not make approval decisions, infer consent, accept documents, assign brokers, execute submissions, or advance cases by implication.
- Tasks must treat event payloads as minimal context and re-read authoritative state through owning services before consequential work.
- Tasks must not send notifications without Notification Module consent, channel, recipient, and template checks.
- Tasks must not index unreviewed policy material for production guidance.
- Tasks must not treat OCR output as verified evidence.
- Tasks must not expose raw provider diagnostics, raw document content, credentials, secrets, or unnecessary personal data.

## 9. High-Risk Tasks

### OCR Processing

`document_ocr_processing` is high risk because it handles sensitive documents and external provider behavior. Safeguards include secure storage references, no raw document content in events or logs, OCR-specific timeouts, retry limits, malware and file validation before processing, provisional extraction labeling, and mandatory human review before evidence acceptance.

### Policy Crawling and Indexing

Policy source and index Tasks are high risk because stale, unreviewed, or conflicting policy information can mislead users. Safeguards include approved source lists, policy reviewer authority, review-before-indexing, source provenance, freshness labels, stale-source warnings, index version tracking, and no legal determinations.

### Broker Assignment Preparation

Broker assignment Tasks are high risk because they prepare external handoff of sensitive case data. Safeguards include minimum-necessary handoff, broker eligibility checks, explicit operator intent, active human approval before assignment, no broker notification from proposal events, and full audit linkage.

### Notification Delivery

Notification Tasks are high risk because they involve recipient identity, consent, external channels, and n8n. Safeguards include consent rechecks, channel eligibility, template policy, retry limits, idempotent delivery attempts, normalized provider errors, and a strict rule that delivery outcomes never advance case or approval state.

### Approval Expiration

Approval expiration Tasks are high risk because expired approvals must not authorize downstream actions. Safeguards include idempotent expiry processing, short evaluation windows, active-state revalidation, clear widgets for expired and superseded states, and downstream owner revalidation before any gated mutation.

### Document Validation

Document validation Tasks are high risk because validation findings can influence review decisions. Safeguards include provisional labels, confidence and ambiguity markers, policy freshness checks when requirements are involved, no autonomous acceptance, and audit records for sensitive extraction reads.

## 10. Future Tasks

The following Task families are intentionally excluded from the hackathon scope. They may be introduced only after their owning modules, governance model, authorization requirements, retention policy, and operational controls are documented.

| Future Task Family | Reason Excluded |
| --- | --- |
| Analytics Aggregation | Requires tenant-governed aggregation, privacy controls, and clear separation from business truth. |
| ML Model Training | Requires model governance, consent, de-identification, retention policy, and human decision boundaries. |
| Billing Jobs | Introduces commercial account and invoice record requirements outside the core visa workflow. |
| Payment Reconciliation | Adds financial security, dispute, compliance, and reconciliation obligations. |
| Compliance Reporting | Depends on settled audit contracts, retention policy, approved recipients, and export governance. |
| Large-scale Data Export | Requires strict authorization, tenant isolation, data minimization, audit evidence, and privacy review. |
| External Submission Execution | Requires a mature Submissions Module, readiness snapshot, explicit final human approval, legal review, external-side-effect audit, and recovery controls. |
| Administration Automation | Requires mature tenant configuration, delegated role policy, and administrative audit controls. |

Future Tasks must preserve the same constants as current Visa Agent architecture: MongoDB remains operational truth, Qdrant supports retrieval but does not decide case state, Events announce committed changes, Services own business rules, Tools express explicit user intent, Widgets visualize state, and humans retain authority over broker assignment, document acceptance, and final submission.
