# Visa Agent Event Architecture

## 1. Purpose

Nitro Events are the asynchronous domain signals emitted by Visa Agent after a business action has been validated, authorized, committed to the operational system of record, and audited. They communicate that something meaningful has already happened. They do not ask permission, make decisions, or complete a transaction on behalf of another module.

Events exist to decouple primary business workflows from secondary work. A case can be created, a document can be uploaded, an approval can be decided, or a broker can be assigned without forcing task generation, notifications, analytics, read-model refreshes, or operational dashboards to execute inside the same synchronous path.

A synchronous service call is used when the caller needs an answer before it can continue. Examples include checking tenant access, validating case state, retrieving policy evidence for a response, verifying an active approval, and committing an owned state transition. An asynchronous event is used after the source-of-truth change is complete and downstream subscribers can react independently.

This distinction is a core Visa Agent boundary:

- Services make business decisions.
- MongoDB remains the operational source of truth.
- Audit records preserve attributable evidence of sensitive reads and mutations.
- Events notify subscribers of completed business actions.
- Subscribers create secondary effects such as tasks, notification intents, read models, metrics, and widget refresh signals.

Events improve decoupling because the producer does not need to know every downstream consumer. The Documents Module can emit that OCR completed without knowing every task, notification, dashboard, or audit-enrichment workflow that might later react to the result. Consumers can evolve independently as long as they honor the published event meaning, versioning rules, tenant boundary, and idempotency requirements.

Events never become the source of truth. They are historical signals derived from committed records, not authoritative records themselves. A consumer that needs the current state of a case, document, approval, task, broker assignment, or notification must retrieve it through the owning module's service or resource model. An event can be replayed, delayed, duplicated, or superseded by later events; the owning module's persisted state remains authoritative.

Business decisions happen before events are emitted. Authorization, approval checks, validation, policy freshness review, document acceptance decisions, broker assignment decisions, and final submission decisions must all occur synchronously inside the owning service boundary. An event may announce the result of a decision, but it must never decide the result.

## 2. Event Design Principles

| Principle | Visa Agent Requirement |
| --- | --- |
| Immutable | Once emitted, an event is never changed. Corrections are represented by later events that point to the corrected business record. |
| Versioned | Every event has a stable event name and version. Version changes must be backward-compatible where possible and migration-planned when not. |
| Minimal payload | Payloads contain only the identifiers and non-sensitive state needed by subscribers. Consumers retrieve additional details through authorized services. |
| Idempotent consumers | A subscriber must safely handle duplicate delivery, replay, retries, and out-of-order arrival where ordering is not guaranteed. |
| Retry safe | Retried handling must not create duplicate tasks, duplicate notification deliveries, duplicate audit records, or duplicate external handoffs. |
| Ordered where necessary | Ordering is required only within a business aggregate where later actions depend on earlier ones, such as case lifecycle transitions or approval decisions. |
| Observable | Event publishing, subscriber handling, retries, failures, dead-letter decisions, and latency are logged and measured with correlation IDs. |
| Auditable | Sensitive and consequential events are traceable to an audit record, actor, tenant, source action, entity reference, and timestamp. |
| Tenant aware | Every protected event carries tenant context. Subscribers must enforce tenant isolation before reading or writing any downstream state. |
| Correlation IDs | The correlation ID from the originating tool or service operation follows the event through tasks, notifications, widgets, metrics, and audit views. |
| Eventual consistency | Subscribers update secondary state after the source change. Widgets and read models may briefly lag the authoritative record. |
| Never expose secrets | Events never include credentials, tokens, raw document binaries, provider payloads, broad personal profiles, or unnecessary PII. |

## 3. Event Categories

| Category | Purpose | Representative Events |
| --- | --- | --- |
| Case Events | Signal committed visa case lifecycle and case-linked information request changes. | `case.created`, `case.status_changed`, `case.information_requested` |
| Document Events | Signal document intake, OCR, review routing, and accepted-evidence outcomes. | `document.uploaded`, `document.ocr_completed`, `document.review_requested`, `document.acceptance_approved` |
| Task Events | Signal work-item creation, overdue escalation, and completion. | `task.created`, `task.overdue`, `task.completed` |
| Approval Events | Signal approval request creation and human decisions. | `approval.requested`, `approval.decided` |
| Policy Events | Signal reviewed policy-source changes and index refreshes. | `policy.source_updated`, `policy.index_refreshed` |
| Broker Events | Signal assignment proposal, assignment approval, and approved broker handoff. | `broker.assignment_requested`, `broker.assignment_approved`, `broker.assigned` |
| Notification Events | Signal notification intent and delivery outcome. | `notification.requested`, `notification.delivered`, `notification.failed` |
| Audit Events | Signal append-only audit capture for authorized downstream observability. | `audit.recorded` |
| System Events | Signal platform or dependency health changes. | `dependency.health_changed` |

## 4. Event Catalog

All events use a common envelope containing event name, event version, event ID, correlation ID, tenant ID, actor identity where applicable, entity type, entity identifier, UTC timestamp, and a minimal non-sensitive payload. The payload summaries below describe business content, not implementation definitions.

### 4.1 Visa Case Module

#### `case.created`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that a visa case has been successfully created. |
| Producer Module | Visa Case Module. |
| Consumers | Task Module, Notification Module, Audit and Observability Module, Client Module read models, Operations Module queues, Case Summary and Case Timeline widgets. |
| Trigger | Successful case creation after tenant, consent, intake, authorization, idempotency, MongoDB commit, and audit requirements are satisfied. |
| Payload Summary | Case ID, tenant ID, initial lifecycle status, applicant or client reference, destination, purpose, creation timestamp, actor category, correlation ID. |
| Business Meaning | A new operational case exists and may now enter intake, task planning, and client-safe status presentation. |
| Retry Strategy | Publishing may be retried until accepted by the event bus. Consumers retry transient failures with bounded backoff and dead-letter persistent failures. |
| Idempotency Requirements | Producers deduplicate by case creation idempotency reference. Consumers deduplicate by event ID and case ID. Task consumers must not create duplicate Case Intake tasks. |
| Audit Requirements | Must link to the case creation audit record. Payload must exclude broad applicant profile details and internal notes. |
| Future Enhancements | Dependent-case creation signals, case-template attribution, controlled case transfer events, and service-level objective start markers. |

#### `case.status_changed`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that a case lifecycle state has changed. |
| Producer Module | Visa Case Module. |
| Consumers | Task Module, Notification Module, Audit and Observability Module, Operations Module queues, Client Module read models, Case Summary and Case Timeline widgets. |
| Trigger | Successful authorized lifecycle transition after current-state validation, approval-state checks where required, MongoDB commit, and audit recording. |
| Payload Summary | Case ID, tenant ID, previous status, new status, transition reason category, timestamp, actor category, correlation ID. |
| Business Meaning | The owning case lifecycle has advanced, paused, escalated, or otherwise changed according to the Case Module transition policy. |
| Retry Strategy | Re-publish on transient bus failure. Consumers retry independently and must tolerate receiving older status changes after newer state is available. |
| Idempotency Requirements | Producer uses transition idempotency reference and expected state. Consumers deduplicate by event ID and validate current case state before creating follow-up work. |
| Audit Requirements | Must link to the case transition audit record and include the actor responsible for the transition. It must not expose operational notes or unnecessary PII. |
| Future Enhancements | Jurisdiction-specific lifecycle variants, transition policy version references, and milestone-specific analytics. |

### 4.2 Client Module

#### `client.preferences_updated`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that a client's consent-linked communication preferences were updated. |
| Producer Module | Client Module, or Notification Module when routing preference changes through the Client Service contract. |
| Consumers | Notification Module, Audit and Observability Module, Client Module read models, Notification Preferences widget, Communication History widget. |
| Trigger | Successful preference update after explicit client intent or documented proxy authority, tenant validation, commit, and audit recording. |
| Payload Summary | Client ID or client reference, tenant ID, permitted channel summary, consent status, effective timestamp, actor category, correlation ID. |
| Business Meaning | Future notification delivery must evaluate the updated consent and channel eligibility. |
| Retry Strategy | Consumers retry transient failures and refresh their local read models from the Client Service when needed. |
| Idempotency Requirements | Producer deduplicates preference updates by idempotency reference and expected preference revision. Consumers deduplicate by event ID and current preference revision. |
| Audit Requirements | Must link to a preference-change audit record. Payload must not include full contact details unless a consumer is explicitly authorized to retrieve them. |
| Future Enhancements | Quiet hours, localized communication preferences, delegated consent, preference version history, and channel-specific consent evidence. |

#### `client.response_received`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that a client response to an information request was recorded. |
| Producer Module | Client Module. |
| Consumers | Operations Module queues, Task Module, Notification Module, Audit and Observability Module, Client Action Checklist widget, Case Summary widget. |
| Trigger | Successful response submission for an open information request after tenant, case-participant, input, and idempotency validation. |
| Payload Summary | Response receipt ID, case ID, tenant ID, information-request ID, linked document reference where applicable, response timestamp, actor category, correlation ID. |
| Business Meaning | Operations can review the client's response and determine whether more evidence, document review, or case action is required. |
| Retry Strategy | Task and queue subscribers retry transient failures and rebuild from the source request and response records when possible. |
| Idempotency Requirements | Producer deduplicates by response idempotency reference. Consumers deduplicate by event ID, request ID, and response receipt ID. |
| Audit Requirements | Must link to the response audit record. Payload must not include free-form response text when it may contain PII. |
| Future Enhancements | Structured questionnaires, multilingual responses, completeness scoring, and delegated representative workflows. |

### 4.3 Operations Module

#### `operations.case_reviewed`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that an operations review outcome was formally recorded. |
| Producer Module | Operations Module. |
| Consumers | Task Module, Audit and Observability Module, Operations queues, Approval Module where a recorded review supports a later approval request, Case Review Workspace widget. |
| Trigger | A governed operations review is persisted as a business record. Read-only case review retrieval does not emit this event. |
| Payload Summary | Operations review ID, case ID, tenant ID, review dimensions, outcome category, reviewer actor category, timestamp, correlation ID. |
| Business Meaning | The case has received an operational assessment that may create follow-up tasks, surface blockers, or support a later approval request. |
| Retry Strategy | Consumers retry transient failures and may refresh review detail through the Operations Service before acting. |
| Idempotency Requirements | Producer deduplicates by review idempotency reference or expected review revision. Consumers deduplicate by event ID and review ID. |
| Audit Requirements | Must link to the operations review audit record. Payload must exclude internal review notes unless later retrieved through an authorized service. |
| Future Enhancements | Quality-assurance sampling, review scoring, jurisdiction-specific review checklists, and case-risk trend analytics. |

#### `case.information_requested`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that an authorized operations user requested additional information or evidence from a case participant. |
| Producer Module | Operations Module. |
| Consumers | Client Module, Task Module, Notification Module, Audit and Observability Module, Client Action Checklist widget, Case Review Workspace widget. |
| Trigger | Successful creation of an information or evidence request after case, tenant, recipient, channel, scope, and idempotency validation. |
| Payload Summary | Information-request ID, case ID, tenant ID, recipient category, request type, due date, notification eligibility, timestamp, correlation ID. |
| Business Meaning | The case is waiting on a participant response or evidence item, and client-safe surfaces may show a new action. |
| Retry Strategy | Notification subscribers retry delivery-intent creation only after rechecking consent and template policy. Task subscribers retry task creation with duplicate protection. |
| Idempotency Requirements | Producer deduplicates by request idempotency reference. Consumers deduplicate by event ID and information-request ID. |
| Audit Requirements | Must link to the request audit record. Payload must not contain full request body text when it may reveal unnecessary PII. |
| Future Enhancements | Request templates, localized content, due-date escalation policy, and evidence-type guidance. |

### 4.4 Documents Module

#### `document.uploaded`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that document metadata and a secure storage reference were recorded for an authorized case. |
| Producer Module | Documents Module. |
| Consumers | OCR Service workflow, Task Module, Audit and Observability Module, Document Readiness widget, Operations queues. |
| Trigger | Successful document intake after authorization, file validation, storage reference creation, security checks, MongoDB commit, and audit recording. |
| Payload Summary | Document ID, case ID, tenant ID, document-request ID where applicable, declared document type, storage-reference category, intake status, timestamp, correlation ID. |
| Business Meaning | A document is available for governed extraction and review, but it has not been accepted as evidence. |
| Retry Strategy | OCR initiation may be retried with provider timeout controls. Task and widget subscribers retry from document metadata, not from raw file content. |
| Idempotency Requirements | Producer deduplicates by upload idempotency reference and secure document reference. Consumers deduplicate by event ID and document ID. |
| Audit Requirements | Must link to the upload audit record. Event payload must never include raw document content, extracted values, malware details, or full storage credentials. |
| Future Enhancements | Duplicate detection, resumable uploads, document-type suggestions, and jurisdiction-specific evidence guidance. |

#### `document.ocr_completed`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that OCR extraction finished and a provisional extraction result was recorded. |
| Producer Module | Documents Module through its OCR integration boundary. |
| Consumers | Task Module, Operations Module queues, Audit and Observability Module, Extraction Review widget, Document Readiness widget. |
| Trigger | OCR provider result is normalized, persisted as provisional extraction output, and audited. |
| Payload Summary | Document ID, case ID, tenant ID, OCR status, confidence band, extraction-result reference, timestamp, correlation ID. |
| Business Meaning | Reviewable extraction data exists, but it remains provisional until a human review and any required approval are complete. |
| Retry Strategy | OCR retry policy belongs to the Documents Module and OCR adapter. Consumers retry review-task creation and read-model refresh without re-running OCR. |
| Idempotency Requirements | Producer deduplicates by document ID and OCR attempt reference. Consumers deduplicate by event ID, document ID, and extraction-result reference. |
| Audit Requirements | Must link to OCR completion telemetry and document audit records. Payload must not include raw OCR text or sensitive extracted fields. |
| Future Enhancements | Multi-pass extraction, confidence distribution metrics, human-verified field comparison, and duplicate document detection. |

#### `document.review_requested`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that a document, extraction result, or validation finding requires review. |
| Producer Module | Documents Module. |
| Consumers | Task Module, Operations Module queues, Notification Module where permitted, Audit and Observability Module, Extraction Review widget. |
| Trigger | Successful creation of a document review request after document access, review reason, reviewer role, and idempotency validation. |
| Payload Summary | Review-request ID, document ID, case ID, tenant ID, review type, priority, due date where applicable, timestamp, correlation ID. |
| Business Meaning | A document needs human review before it can influence evidence readiness or acceptance. |
| Retry Strategy | Task subscribers retry review-task creation. Notification subscribers retry only after rechecking recipient eligibility and consent. |
| Idempotency Requirements | Producer deduplicates by review request idempotency reference. Consumers deduplicate by event ID and review-request ID. |
| Audit Requirements | Must link to the document review-request audit record. Payload must not include raw document content or detailed extracted PII. |
| Future Enhancements | Reviewer routing, review service-level agreements, configurable validation rules, and evidence-correction workflows. |

#### `document.acceptance_approved`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that an approved document-acceptance decision has been validated by the Documents Module and applied to document state. |
| Producer Module | Documents Module, after receiving or checking an authorized Approval Module decision. |
| Consumers | Visa Case Module, Task Module, Notification Module, Audit and Observability Module, Document Readiness widget, Case Timeline widget. |
| Trigger | An authorized human approval decision exists, the document remains eligible, and the Documents Module commits the accepted evidence state. |
| Payload Summary | Document ID, case ID, tenant ID, approval ID, acceptance status, accepted evidence category, timestamp, correlation ID. |
| Business Meaning | The document is accepted as evidence for the relevant case requirement. This is a high-risk event and must follow approval enforcement. |
| Retry Strategy | Subscribers retry secondary updates with bounded backoff. They must re-read document state before closing tasks or notifying users. |
| Idempotency Requirements | Producer deduplicates by document ID and approval ID. Consumers deduplicate by event ID, document ID, and acceptance-state revision. |
| Audit Requirements | Must link to both the approval decision audit record and the document acceptance audit record. Payload must exclude raw document data and sensitive extracted values. |
| Future Enhancements | Accepted evidence versioning, multi-document consistency checks, retention automation, and conditional acceptance handling. |

### 4.5 Policy Knowledge Module

#### `policy.source_updated`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that a reviewed policy source changed, was newly approved, or had material freshness metadata updated. |
| Producer Module | Policy Knowledge Module. |
| Consumers | Task Module, Operations Module queues, Audit and Observability Module, Policy Freshness Dashboard widget, Policy Evidence Panel widget. |
| Trigger | A reviewed source-state change is committed after ingestion, source validation, review governance, and audit recording. |
| Payload Summary | Policy source ID, jurisdiction, topic, review state, freshness status, source version reference, timestamp, correlation ID. |
| Business Meaning | Policy evidence available to cases may have changed and dependent read models or review tasks may need refresh. |
| Retry Strategy | Indexing and queue subscribers retry independently. Consumers must tolerate repeated source updates and retrieve authoritative policy metadata before acting. |
| Idempotency Requirements | Producer deduplicates by source ID and source version reference. Consumers deduplicate by event ID and source version reference. |
| Audit Requirements | Must link to the source review or ingestion audit record. Payload must not include raw scraped content when it is not needed by subscribers. |
| Future Enhancements | Source-diff summaries, quality scoring, jurisdiction coverage alerts, and policy change comparison. |

#### `policy.index_refreshed`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that policy knowledge indexing completed for a reviewed source set or jurisdiction. |
| Producer Module | Policy Knowledge Module. |
| Consumers | Operations Module queues, Audit and Observability Module, Policy Freshness Dashboard widget, Policy Evidence Panel widget. |
| Trigger | Approved policy content is indexed or refreshed in the retrieval layer and the indexing result is committed. |
| Payload Summary | Index refresh ID, jurisdiction, source set reference, indexed knowledge version, freshness status, result category, timestamp, correlation ID. |
| Business Meaning | Policy retrieval can use the refreshed indexed knowledge according to its review state and freshness constraints. |
| Retry Strategy | Failed index refreshes are handled by Policy Knowledge workflows and dependency telemetry. Consumers retry dashboard updates but must not index content themselves. |
| Idempotency Requirements | Producer deduplicates by refresh ID and indexed knowledge version. Consumers deduplicate by event ID and index version. |
| Audit Requirements | Must link to indexing telemetry and policy governance records. Payload must exclude provider diagnostics and internal retrieval details. |
| Future Enhancements | Per-topic index refresh events, stale-source alerts, reviewer annotation propagation, and coverage reporting. |

### 4.6 Broker Module

#### `broker.assignment_requested`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that a minimum-necessary broker assignment proposal was prepared and is ready for approval review. |
| Producer Module | Broker Module. |
| Consumers | Approval Module, Task Module, Notification Module where permitted, Audit and Observability Module, Broker Assignment Preview widget, Approval Queue widget. |
| Trigger | Successful creation of an assignment proposal and handoff preview after broker eligibility, handoff minimization, case readiness, and idempotency validation. |
| Payload Summary | Assignment proposal ID, case ID, tenant ID, selected broker ID or broker reference, required approver role, handoff scope summary, timestamp, correlation ID. |
| Business Meaning | A broker assignment is proposed but not active. No broker handoff may occur until approval is recorded and validated. |
| Retry Strategy | Approval and task subscribers retry creation of approval or review work with duplicate checks. Notification subscribers must not notify the broker from this event. |
| Idempotency Requirements | Producer deduplicates by assignment proposal idempotency reference. Consumers deduplicate by event ID and proposal ID. |
| Audit Requirements | Must link to proposal and handoff-preview audit records. Payload must include only minimum-necessary broker and case references. |
| Future Enhancements | Broker capacity checks, response deadlines, handoff templates, and secure broker portal invitation previews. |

#### `broker.assignment_approved`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that a broker-assignment approval decision has been validated for an assignment proposal. |
| Producer Module | Broker Module, after checking an authorized Approval Module decision. |
| Consumers | Broker Module assignment workflow, Task Module, Notification Module, Audit and Observability Module, Approval Queue widget, Broker Assignment Preview widget. |
| Trigger | An authorized human approval decision exists, the proposal remains eligible, and the Broker Module records the approved assignment proposal state. |
| Payload Summary | Assignment proposal ID, case ID, tenant ID, approval ID, selected broker reference, approval status, timestamp, correlation ID. |
| Business Meaning | The proposal has approval authority to proceed, but the actual assignment and handoff still occur through the separately guarded broker assignment action. |
| Retry Strategy | Consumers retry secondary work and re-read the proposal before acting. The broker handoff must remain controlled by the Broker Module. |
| Idempotency Requirements | Producer deduplicates by assignment proposal ID and approval ID. Consumers deduplicate by event ID and proposal state revision. |
| Audit Requirements | Must link to the approval decision audit record and broker proposal audit record. Payload must not expose broad applicant details or broker-sensitive operational notes. |
| Future Enhancements | Conditional approvals, approval expiry reminders, broker reassignment approval, and delegated authority evidence. |

#### `broker.assigned`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that an approved broker assignment was created and the controlled handoff became eligible for delivery. |
| Producer Module | Broker Module. |
| Consumers | Notification Module, Task Module, Visa Case Module read models, Audit and Observability Module, Broker Handoff Status widget, Case Timeline widget. |
| Trigger | Successful broker assignment after active approval verification, proposal-state validation, handoff restriction checks, MongoDB commit, and audit recording. |
| Payload Summary | Broker assignment ID, assignment proposal ID, case ID, tenant ID, broker reference, assignment status, handoff status, approval ID, timestamp, correlation ID. |
| Business Meaning | A broker is assigned to the case and may receive only the approved minimum-necessary handoff. |
| Retry Strategy | Notification subscribers retry handoff notification intent with consent, recipient, and template checks. Task subscribers retry broker follow-up task creation. |
| Idempotency Requirements | Producer deduplicates by assignment idempotency reference and approval ID. Consumers deduplicate by event ID and broker assignment ID. |
| Audit Requirements | Must link to assignment execution and external handoff audit records. Payload must minimize applicant, case, and broker details. |
| Future Enhancements | Broker acceptance tracking, reassignment events, secure broker portal access, and performance feedback controls. |

### 4.7 Task Module

#### `task.created`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that an actionable work item was created. |
| Producer Module | Task Module. |
| Consumers | Notification Module, Operations Module queues, Audit and Observability Module, Task Worklist widget, Task Detail widget. |
| Trigger | Successful task creation through a tool, service contract, or idempotent event subscriber after tenant, case, owner, dependency, and due-date validation. |
| Payload Summary | Task ID, case ID where applicable, tenant ID, task type, owner or assignment group, priority, due date, dependency summary, timestamp, correlation ID. |
| Business Meaning | Accountable work exists, but the task itself does not advance case, document, broker, approval, or submission state. |
| Retry Strategy | Notification and queue subscribers retry secondary updates. Producers may publish after task commit and retry event publishing if needed. |
| Idempotency Requirements | Producer deduplicates by task idempotency reference or source event reference. Consumers deduplicate by event ID and task ID. |
| Audit Requirements | Must link to task creation audit records where task creation is user-initiated or consequential. Payload must exclude completion evidence content unless authorized. |
| Future Enhancements | Task templates, service-level agreement policies, workload balancing, and calendar-aware due dates. |

#### `task.overdue`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that an open task crossed its due threshold and entered an overdue or escalation state. |
| Producer Module | Task Module. |
| Consumers | Notification Module, Operations Module queues, Audit and Observability Module, Task Worklist widget, Dependency Health Dashboard where operational metrics are shown. |
| Trigger | Scheduled or workflow-driven evaluation determines that an open task is overdue and the Task Module commits the escalation state. |
| Payload Summary | Task ID, case ID where applicable, tenant ID, task type, owner or assignment group, due date, escalation status, timestamp, correlation ID. |
| Business Meaning | Work requires operational attention. This does not change the authoritative case lifecycle by itself. |
| Retry Strategy | Subscribers retry notifications and queue refreshes with escalation duplicate protection. |
| Idempotency Requirements | Producer deduplicates by task ID and escalation threshold. Consumers deduplicate by event ID, task ID, and escalation revision. |
| Audit Requirements | Must create or link to task escalation audit evidence where tenant policy requires it. Payload must avoid unnecessary case detail. |
| Future Enhancements | Calendar-aware service levels, escalation routing, capacity-aware reassignment, and overdue resolution analytics. |

#### `task.completed`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that a task was closed with required completion evidence. |
| Producer Module | Task Module. |
| Consumers | Operations Module queues, Audit and Observability Module, Notification Module where permitted, Task Detail widget, Task Worklist widget. |
| Trigger | Successful task completion after owner authorization, completion evidence validation, expected-state checks, commit, and audit recording. |
| Payload Summary | Task ID, case ID where applicable, tenant ID, task type, completion status, completion timestamp, actor category, correlation ID. |
| Business Meaning | Work accountability changed. The event never implies that a case advanced, a document was accepted, a broker was assigned, or an approval was granted. |
| Retry Strategy | Queue and notification subscribers retry secondary effects. Consumers refresh authoritative task state before closing dependent read-model entries. |
| Idempotency Requirements | Producer deduplicates by task completion idempotency reference. Consumers deduplicate by event ID and task completion revision. |
| Audit Requirements | Must link to task completion audit records. Payload should reference evidence, not include detailed evidence content. |
| Future Enhancements | Reopening workflow, evidence quality review, automatic dependency release signals, and completion analytics. |

### 4.8 Approval Module

#### `approval.requested`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that an approval request was created for an approval-gated action. |
| Producer Module | Approval Module. |
| Consumers | Task Module, Notification Module, Audit and Observability Module, Approval Queue widget, Approval Decision View widget, subject-owning module read models. |
| Trigger | Successful approval request creation after subject readiness, requester authorization, evidence reference, duplicate active approval, and idempotency validation. |
| Payload Summary | Approval ID, subject type, subject ID, case ID, tenant ID, requested action, required approver authority, expiry or due date, timestamp, correlation ID. |
| Business Meaning | A human decision is required before the requested action can proceed. The event does not approve the action. |
| Retry Strategy | Task and notification subscribers retry approval-review work and alerts with duplicate protection. |
| Idempotency Requirements | Producer deduplicates by approval request idempotency reference and subject action. Consumers deduplicate by event ID and approval ID. |
| Audit Requirements | Must link to approval request audit records. Payload must reference evidence rather than embedding sensitive evidence details. |
| Future Enhancements | Multi-party approval requests, delegated authority chains, conditional approvals, expiration reminders, and approval policy templates. |

#### `approval.decided`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that an authorized human approver recorded an approve or reject decision. |
| Producer Module | Approval Module. |
| Consumers | Documents Module, Broker Module, future Submissions Module, Task Module, Notification Module, Audit and Observability Module, Approval Queue widget, subject status widgets. |
| Trigger | Successful decision recording after approver authority, scope, tenant, request validity, expiry, expected-state, and idempotency validation. |
| Payload Summary | Approval ID, subject type, subject ID, case ID, tenant ID, decision result, decision timestamp, approver actor category, correlation ID. |
| Business Meaning | The approval authority has made an immutable decision. Subject-owning modules must still validate the decision before changing their own records. |
| Retry Strategy | Subject-owning consumers retry validation and state application. Notification subscribers retry permitted alerts after checking recipient policy. |
| Idempotency Requirements | Producer deduplicates by approval decision idempotency reference and approval state. Consumers deduplicate by event ID and approval ID and must verify current subject state. |
| Audit Requirements | Must link to immutable decision history and decision rationale. Payload must not include full rationale text if it contains sensitive details. |
| Future Enhancements | Digitally signed decisions, conditional decisions, supersession flows, delegated authority evidence, and approval analytics. |

### 4.9 Notification Module

#### `notification.requested`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that a notification delivery attempt or retry was requested after recipient and channel policy checks. |
| Producer Module | Notification Module. |
| Consumers | n8n workflow integration, Audit and Observability Module, Communication History widget, Operations Queue widget. |
| Trigger | Successful creation of a notification intent or retry attempt after consent, channel eligibility, template policy, retry-limit, and tenant validation. |
| Payload Summary | Notification ID, case ID where applicable, tenant ID, recipient category, channel, template reference, delivery attempt number, timestamp, correlation ID. |
| Business Meaning | A permitted notification is ready for n8n handoff. This event does not change case, approval, task, document, or broker state. |
| Retry Strategy | n8n handoff retries are bounded, observable, and idempotent. Persistent failures emit or lead to `notification.failed` according to delivery policy. |
| Idempotency Requirements | Producer deduplicates by notification ID and delivery attempt reference. Consumers deduplicate by event ID, notification ID, and attempt number. |
| Audit Requirements | Must link to notification-intent and external-handoff audit records. Payload must avoid full recipient contact details and message body content. |
| Future Enhancements | Alternate-channel fallback, scheduled delivery, localization, and tenant-specific template governance. |

#### `notification.delivered`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that a notification provider or n8n workflow reported successful delivery or accepted delivery according to channel semantics. |
| Producer Module | Notification Module after normalizing n8n or channel-provider results. |
| Consumers | Audit and Observability Module, Communication History widget, Operations queues, metrics subscribers. |
| Trigger | Delivery result is received, normalized, committed, and audited. |
| Payload Summary | Notification ID, delivery attempt ID, case ID where applicable, tenant ID, channel, delivery status category, provider-result category, timestamp, correlation ID. |
| Business Meaning | Communication delivery state changed. Delivery success never advances case state or substitutes for user acknowledgement. |
| Retry Strategy | Downstream consumers retry read-model and metrics updates. Delivery itself is not retried from this event. |
| Idempotency Requirements | Producer deduplicates by provider delivery result reference. Consumers deduplicate by event ID and delivery attempt ID. |
| Audit Requirements | Must link to delivery outcome audit records. Payload must exclude raw provider responses and recipient contact details. |
| Future Enhancements | Read receipts where permitted, delivery analytics, channel-specific evidence, and client-safe troubleshooting. |

#### `notification.failed`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that a notification delivery attempt failed or reached a terminal retry state. |
| Producer Module | Notification Module after normalizing n8n or channel-provider failures. |
| Consumers | Task Module, Operations Module queues, Audit and Observability Module, Communication History widget, metrics subscribers. |
| Trigger | Delivery failure or terminal retry outcome is committed and audited. |
| Payload Summary | Notification ID, delivery attempt ID, case ID where applicable, tenant ID, channel, failure category, retry eligibility, timestamp, correlation ID. |
| Business Meaning | A communication requires attention, retry, alternate-channel evaluation, or consent review, but no case decision changes. |
| Retry Strategy | Retry handling must be explicitly requested or policy-driven through the Notification Service. Subscribers must not retry delivery directly from this event. |
| Idempotency Requirements | Producer deduplicates by provider failure reference and attempt number. Consumers deduplicate by event ID and delivery attempt ID. |
| Audit Requirements | Must link to failure outcome and retry-policy audit records. Payload must exclude provider diagnostics, stack traces, and full recipient details. |
| Future Enhancements | Alternate-channel fallback, failure worklists, template quality analytics, and tenant-specific delivery policies. |

### 4.10 Audit and Observability Module

#### `audit.recorded`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that an append-only audit record was captured for a sensitive read, mutation, approval, external handoff, authorization denial, or operational event. |
| Producer Module | Audit and Observability Module. |
| Consumers | Metrics subscribers, audit timeline read models, incident review workflows, authorized observability dashboards. |
| Trigger | Audit Service successfully writes an audit record that is eligible for secondary observability processing. Recursive audit-history reads must not emit this event. |
| Payload Summary | Audit record ID, tenant ID, action category, entity reference category, outcome category, actor category where applicable, timestamp, correlation ID. |
| Business Meaning | An auditable fact exists for investigation, compliance support, or operational telemetry. It does not own business state. |
| Retry Strategy | Observability subscribers retry metrics and read-model processing. Persistent failures must not block the original audited business action after commit. |
| Idempotency Requirements | Producer deduplicates by audit record ID. Consumers deduplicate by event ID and audit record ID. |
| Audit Requirements | The audit record is the authoritative evidence. Event payload must contain only a redacted summary and must not create recursive audit loops. |
| Future Enhancements | Signed audit records, compliance export markers, incident evidence packages, and retention automation. |

#### `dependency.health_changed`

| Field | Definition |
| --- | --- |
| Purpose | Indicates that a platform dependency or integration changed health state. |
| Producer Module | Audit and Observability Module. |
| Consumers | Operations queues, Dependency Health Dashboard widget, metrics subscribers, incident review workflows, Notification Module where operational alerts are permitted. |
| Trigger | Health monitoring observes and commits a material change for MongoDB, Qdrant, Firecrawl, OCR, document storage, n8n, or notification channels. |
| Payload Summary | Dependency identifier, tenant or platform scope where applicable, previous health category, new health category, degradation category, observed timestamp, correlation ID. |
| Business Meaning | Operators may need to investigate degraded platform behavior or understand why downstream workflows are delayed. |
| Retry Strategy | Dashboard and alert subscribers retry independently. Health checks continue on their normal schedule and may emit later recovery events. |
| Idempotency Requirements | Producer deduplicates by dependency, health state, and observation window. Consumers deduplicate by event ID and health observation reference. |
| Audit Requirements | Must avoid credentials, raw provider responses, stack traces, infrastructure internals, and sensitive tenant data. |
| Future Enhancements | Service-level objective events, incident lifecycle events, tenant-safe degradation summaries, and automated runbook references. |

## 5. Event Lifecycle

```text
Tool
  |
  v
Business Service
  |
  v
Database Commit
  |
  v
Audit
  |
  v
Publish Event
  |
  v
Subscribers
  |
  +--> Tasks
  +--> Notifications
  +--> Widgets Refresh
  +--> Analytics
```

**Tool**

An MCP tool or visible widget action receives explicit user intent and validates input shape, tenant context, role, scope, and case relationship. Read-only tools may audit sensitive access but do not emit domain-state events.

**Business Service**

The owning service applies the business rule. This is where case transitions, document intake, approval request creation, approval decisions, broker assignment, task state changes, notification intent, and policy review state are validated. If an action requires human approval, the service verifies approval before committing the action.

**Database Commit**

The source-of-truth change is committed to MongoDB or, for policy indexing, the owning policy metadata is committed and the retrieval index version is recorded. If commit fails, no domain event is emitted.

**Audit**

The Audit Service records sensitive reads and all mutations with actor, tenant, action, entity reference, outcome, correlation ID, and timestamp. Audit is append-only and excludes secrets, raw documents, and broad provider payloads.

**Publish Event**

The producer publishes a minimal event after the state change and audit record exist. The event announces the completed business action and includes enough identity, tenant, correlation, entity, and status context for subscribers to decide whether they need to react.

**Subscribers**

Subscribers run independently and must use owning services for any follow-up read or write. They create or update tasks, notification intents, read models, operational metrics, and widget refresh projections. Subscriber failure does not invalidate the original committed state.

**Tasks**

Task subscribers create, assign, escalate, or close work only through the Task Module. Task state does not advance a case, accept a document, approve an action, or assign a broker by implication.

**Notifications**

Notification subscribers create notification intents only after checking tenant policy, consent, channel eligibility, recipient authorization, and template policy. n8n delivery outcomes update notification delivery state, not case state.

**Widgets Refresh**

Widgets display state from authorized tool responses and read models. Event-driven refresh can make widgets current, but widgets never own business rules or hidden mutations.

**Analytics**

Analytics and metrics consume redacted, aggregate-safe event summaries. They support observability and operational improvement, not case decisions.

## 6. Subscriber Rules

Subscribers must obey module ownership and NitroStack dependency boundaries:

- Never modify another module's data directly.
- Use the owning module's published service contract for every read or write.
- Be retry-safe and tolerate duplicate delivery.
- Be idempotent by event ID and by the relevant business entity reference.
- Log failures with event ID, correlation ID, tenant ID, subscriber name, error category, and retry outcome.
- Never emit infinite event loops.
- Never bypass authorization, tenant isolation, approval gates, or data minimization rules.
- Treat event payloads as hints and retrieve authoritative state from the owning service before consequential work.
- Preserve correlation IDs across tasks, notifications, read-model updates, metrics, and audit-enrichment workflows.
- Stop processing or dead-letter when repeated failure could create duplicate external side effects.

## 7. Cross Event Rules

Events in Visa Agent follow these system-wide rules:

- Events never authorize actions.
- Events never replace approvals.
- Events never replace transactions.
- Events never expose PII unnecessarily.
- Events never become API contracts for clients, portals, widgets, or external systems.
- Events only represent completed business actions.
- Events never include raw document binaries, raw OCR text, credentials, access tokens, secret configuration, stack traces, or raw provider responses.
- Events may update read models, but a read model is not the source of truth.
- Events may create tasks, but tasks do not control case state.
- Events may request notifications, but notification delivery does not change approval or case decisions.
- Events may trigger metrics, but metrics do not define business truth.
- Events must remain compatible with tenant isolation, least-privilege access, auditability, and eventual consistency.

## 8. High-Risk Events

### Document Acceptance

`document.acceptance_approved` is high risk because it indicates that evidence has been accepted for a case. Safeguards include mandatory human approval, delegated authority checks, document eligibility verification at the Documents Module, immutable approval decision history, audit linkage to both approval and document state, minimal payload, and subscriber revalidation before any case-readiness update.

### Broker Assignment

`broker.assignment_requested`, `broker.assignment_approved`, and `broker.assigned` are high risk because broker workflows involve minimum-necessary handoff data and external coordination. Safeguards include broker eligibility validation, handoff minimization, approval before assignment, explicit operator intent, no broker notification from the request event, controlled notification intent after assignment, and audit records for proposal, approval, assignment, and handoff.

### Approval Decision

`approval.decided` is high risk because it controls document acceptance, broker assignment, and future final submission gates. Safeguards include human-only decision authority, role and scope checks, delegated authority validation, expiry and supersession checks, immutable decision records, rationale capture, idempotency, and subject-owner revalidation before downstream state changes.

### Case Submission

Submission events are future-scope and must remain disabled until the Submissions Module is approved. Safeguards must include readiness validation, explicit final human approval, active approval verification at execution time, stable readiness snapshot references, external-side-effect audit, recovery controls, and jurisdiction-specific legal and operational review.

### Notification Delivery

`notification.requested`, `notification.delivered`, and `notification.failed` are high risk because they involve recipient identity, consent, channels, and external systems. Safeguards include consent checks, recipient authorization, channel eligibility, template governance, retry limits, n8n adapter isolation, delivery outcome auditing, and a strict rule that delivery outcomes never mutate case or approval state.

### Policy Refresh

`policy.source_updated` and `policy.index_refreshed` are high risk because stale or unreviewed policy evidence can mislead users. Safeguards include approved source lists, review state, freshness indicators, source provenance, no legal determinations, policy reviewer authority, index version tracking, and visible stale or conflicting source warnings.

## 9. Future Events

The following event families are excluded from the current hackathon scope. They may be introduced only after their owning module, source-of-truth records, approval model, retention policy, authorization model, and operational controls are documented and reviewed.

| Future Event Family | Candidate Events | Reason Deferred |
| --- | --- | --- |
| Submissions | `submission.readiness_completed`, `submission.approved`, `submission.executed` | External filing is legally and operationally consequential. It requires a mature Submissions Module, readiness snapshot, explicit approval, execution adapter, recovery workflow, and legal review. |
| Payments | Payment intent created, payment authorized, payment failed, payment reconciled. | Financial workflows add security, compliance, dispute, and reconciliation obligations outside the core case workflow. |
| Billing | Invoice generated, entitlement changed, billing account updated. | Commercial account state does not advance the visa workflow and requires a separate financial-record architecture. |
| Analytics | Case throughput snapshot generated, service-level objective breached, workload aggregate refreshed. | Analytics requires privacy-safe aggregation, tenant governance, and clear separation from operational truth. |
| ML Training | Training candidate collected, training data approved, training export generated. | Model-governance, privacy review, consent, de-identification, and data-retention policy must exist first. |
| Compliance Reporting | Compliance report requested, compliance export approved, compliance package delivered. | Regulated reporting depends on settled audit contracts, retention rules, authorized recipients, and export controls. |
| Administration | Tenant configured, role delegated, policy configuration changed. | Administration requires a mature tenant governance and delegated-authority model before becoming event-driven. |
| Identity Federation | Identity provider connected, federation policy changed, access mapping refreshed. | OAuth 2.1 is the current foundation; enterprise federation should follow validated tenant needs and separate security review. |

Future events must preserve Visa Agent's architectural constants: MongoDB remains operational truth, Qdrant supports retrieval but does not decide case state, policy evidence is attributed and freshness-aware, external side effects are auditable, and humans retain authority over broker assignment, document acceptance, and final submission.
