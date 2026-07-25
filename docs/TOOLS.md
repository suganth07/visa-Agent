# Visa Agent MCP Tool Architecture

## 1. Purpose

An MCP Tool is a governed operation that an AI client, Client Portal, or Operations Portal can invoke through the NitroStack MCP Server. A tool reads or changes a bounded piece of Visa Agent domain state through an explicit contract. It is the action boundary of the platform, not a general-purpose interface to internal systems.

Tools exist to give users and AI clients a safe, discoverable way to move through the visa case workflow: create and review cases, provide information, retrieve attributed policy evidence, handle documents, coordinate work, request and record approvals, assign brokers after approval, and track permitted notifications and audit history.

Tools differ from Resources. A Resource is a read-oriented, stable representation of information such as a case timeline, policy evidence, document extraction result, or task detail. A Tool performs an operation or a parameterized lookup and can have side effects. Resources do not change state; Tools must declare whether they can.

Every Tool must be small, deterministic within its stated inputs and source-freshness context, auditable, and aware of its side effects. A Tool owns request validation, authorization enforcement, delegation to a domain service, and response shaping. Business rules, persistence behavior, provider integration, approval verification, and workflow coordination belong in Services. Tools never contain an alternate path around those Services.

The catalog in this document is the planned MCP surface for the ten core modules defined in `MODULES.md`. External submission remains a future capability and is deliberately not an active Tool in the current hackathon scope.

## 2. Tool Design Principles

| Principle | Required Design Rule |
| --- | --- |
| Single responsibility | A Tool performs one primary business operation. Audit records, events, and task creation are consequential system effects, not additional primary operations. |
| Explicit inputs | Inputs use named, business-readable fields. A Tool does not infer a target case, action, consent, or approval from conversational context. |
| Structured outputs | Responses contain business identifiers, current status, approval state when relevant, next allowable action, and correlation ID for consequential operations. |
| Idempotency | Any mutation or retryable external action accepts an idempotency reference and returns the original outcome when the same authorized request is repeated. |
| Human approval | Broker assignment, document acceptance, and final submission require an active human approval. A Tool returns `approval_required` when that condition is not met. |
| Tenant isolation | Every Tool validates tenant membership and record access before reading or changing data. Tenant context is never supplied solely by an untrusted caller field. |
| OAuth protection | User-facing Tools require OAuth 2.1 authentication. The server validates token audience, identity, tenant claims, role, and scopes before calling a Service. |
| Scope validation | Each Tool requires the narrowest applicable scope. Role and delegated-authority checks supplement scopes for privileged operations. |
| Correlation IDs | Every consequential operation has a correlation ID propagated through Services, audit records, events, and downstream notification handoffs. |
| Audit logging | Sensitive reads and all mutations create append-only audit records with actor, tenant, action, entity references, outcome, correlation ID, and timestamp. |
| Error handling | Tools return stable, actionable business errors. They never disclose stack traces, secrets, token material, raw document contents, or provider implementation details. |
| Boundary protection | Tools never expose database internals, collection names, query behavior, provider payloads, integration credentials, or transport diagnostics. Services normalize those details first. |
| Side-effect awareness | A Tool description and response state whether it changes domain state, initiates an external call, emits an event, or only reads information. |

For retrieval operations, determinism means that the same authorized request against the same tenant, case context, and knowledge snapshot produces the same normalized result. Policy Tools must also disclose source freshness and uncertainty because source content can legitimately change over time.

## 3. Tool Categories

| Category | Purpose | Visa Agent Use |
| --- | --- | --- |
| Read Tools | Retrieve authorized case, client, task, approval, audit, or operational information. | `case_get`, `approval_get_status`, `audit_get_case_history`. |
| Write Tools | Create or update one permitted domain record. | `case_start`, `client_update_preferences`, `task_complete`. |
| Approval Tools | Create, inspect, or decide governed approval requests. | `approval_request`, `approval_get_status`, `approval_decide`. |
| Search Tools | Find normalized, tenant-safe or policy-safe results. | `policy_search`, `broker_get_eligible`. |
| Workflow Tools | Prepare or advance one bounded workflow step while respecting ownership and approval state. | `operations_request_information`, `document_request_review`, `broker_prepare_assignment`. |
| Utility Tools | Provide controlled, operationally useful functions with no domain decision. | `observability_get_health`, `notification_get_status`. |
| Analysis Tools | Return attributed, normalized findings that support a human decision but do not make it. | `policy_get_sources`, `document_get_extraction`, `operations_review_case`. |
| Notification Tools | Read notification status, maintain consent-linked preferences, or retry a permitted delivery. | `notification_update_preference`, `notification_retry`. |

A Tool may have only one primary category. Where an operation could span categories, the catalog separates it into distinct Tools so authorization, audit behavior, and approval requirements remain clear.

## 4. Tool Catalog

All Tools below require OAuth 2.1 unless explicitly described as an internal service-to-service integration, which is not an MCP Tool. Every listed output is normalized by the owning Service. Every listed error is a stable business error category, not a provider response.

### 4.1 Visa Case Module

#### Tool Name

`case_start`

**Purpose**

Creates a new visa case in the `Draft` or `Intake in Progress` lifecycle state and records the initial applicant and destination context.

**Who Can Use It**

Client user initiating an authorized case, or an Operations user creating a case on a client's behalf.

**Required Scope**

`case:write`.

**Inputs**

Applicant or client reference, nationality, residence, destination, purpose, intended timing, permitted participant details, consent reference, and an idempotency reference.

**Outputs**

Case ID, current lifecycle status, client-safe next step, required information summary, correlation ID, and allowed next actions.

**Side Effects**

Creates the Visa Case record, creates an audit record, and makes a Case Intake task eligible for creation.

**Approval Required**

No. Case creation does not authorize later broker assignment, document acceptance, or final submission.

**Possible Errors**

Unauthenticated, tenant access denied, consent missing, required intake information missing, invalid lifecycle initialization, duplicate idempotency reference, or unavailable case service.

**Events Emitted**

`case.created`.

**Widgets Triggered**

Case Summary.

**Future Enhancements**

Dependent applications, jurisdiction-specific intake templates, controlled case transfer, and draft-import support.

#### Tool Name

`case_get`

**Purpose**

Retrieves a tenant-safe, role-appropriate view of one visa case without changing case state.

**Who Can Use It**

Authorized Client user, Operations user, assigned Broker, Approver, or Administrator within the same tenant and permitted case relationship.

**Required Scope**

`case:read`.

**Inputs**

Case ID and requested view context, such as client-safe or operations-safe presentation.

**Outputs**

Case identifier, permitted status summary, milestones, outstanding actions, approval visibility appropriate to the role, and correlation ID.

**Side Effects**

Creates an audit record when the response includes sensitive case information. It does not alter case state.

**Approval Required**

No.

**Possible Errors**

Unauthenticated, tenant access denied, case relationship not permitted, case not found, or restricted data request.

**Events Emitted**

None. Sensitive-read audit recording is not a domain-state event.

**Widgets Triggered**

Case Summary and Case Timeline.

**Future Enhancements**

Role-specific summaries, delegated client access, and configurable case-read projections.

#### Tool Name

`case_update`

**Purpose**

Updates one permitted Visa Case field group or requests one allowed lifecycle transition through the Case Service.

**Who Can Use It**

Authorized Client user for permitted intake updates, or Operations user for authorized operational updates and transitions.

**Required Scope**

`case:write`; controlled transitions additionally require the applicable operations role and approval-state check.

**Inputs**

Case ID, explicit update category, permitted changed values, expected current state or revision reference, reason where required, and idempotency reference.

**Outputs**

Case ID, updated status or permitted field summary, approval status if applicable, next allowable actions, and correlation ID.

**Side Effects**

Updates the Visa Case record, records an audit event, and may make downstream task creation or notification intent eligible after commit.

**Approval Required**

Only for a lifecycle transition that is approval-gated. The Tool must otherwise return `approval_required` and leave the case unchanged.

**Possible Errors**

Unauthenticated, tenant access denied, insufficient scope, invalid transition, stale expected state, prohibited field update, missing approval, duplicate idempotency reference, or case not found.

**Events Emitted**

`case.status_changed` when the lifecycle state changes.

**Widgets Triggered**

Case Summary and Case Timeline.

**Future Enhancements**

Jurisdiction-specific transition policy, case templates, and controlled change-reason catalogs.

### 4.2 Client Module

#### Tool Name

`client_get_case_view`

**Purpose**

Returns the client-safe view of a case, including next actions, document requests, permitted policy guidance, and communication status.

**Who Can Use It**

The authorized Client user or a delegated representative with an approved case relationship.

**Required Scope**

`case:read`.

**Inputs**

Case ID and optional presentation locale.

**Outputs**

Client-safe case status, required actions, document-request statuses, permitted milestones, communication preferences, and correlation ID.

**Side Effects**

Creates a sensitive-read audit record where required. It does not change client or case state.

**Approval Required**

No.

**Possible Errors**

Unauthenticated, tenant access denied, client-case relationship not permitted, case not found, or delegated access expired.

**Events Emitted**

None.

**Widgets Triggered**

Client Case Summary and Client Action Checklist.

**Future Enhancements**

Multilingual presentation, dependent-specific views, and accessibility preference support.

#### Tool Name

`client_update_preferences`

**Purpose**

Updates a client's consent-linked communication preferences without changing operational case state.

**Who Can Use It**

The authenticated Client user, or an authorized Operations user acting under documented client authorization.

**Required Scope**

`case:write`.

**Inputs**

Client reference derived from the authenticated context, requested email or WhatsApp preferences, language preference where supported, consent confirmation or withdrawal, effective date, and idempotency reference.

**Outputs**

Updated preference summary, consent status, effective date, permitted channels, and correlation ID.

**Side Effects**

Updates the client preference record and creates an audit record. Future notification delivery uses the new preference only after the update is committed.

**Approval Required**

No. Explicit client intent is required.

**Possible Errors**

Unauthenticated, tenant access denied, client identity mismatch, invalid channel preference, consent evidence missing, stale preference revision, or duplicate idempotency reference.

**Events Emitted**

`client.preferences_updated`.

**Widgets Triggered**

Notification Preferences.

**Future Enhancements**

Channel-specific quiet hours, delegated consent management, and localized preference explanations.

#### Tool Name

`client_respond_to_request`

**Purpose**

Records a client's response to a permitted information request linked to a visa case.

**Who Can Use It**

The authorized Client user or delegated representative with a valid relationship to the case.

**Required Scope**

`case:write`.

**Inputs**

Case ID, information-request ID, explicit response content or linked document reference, response confirmation, and idempotency reference.

**Outputs**

Response receipt ID, request status, next client action, operations review status, and correlation ID.

**Side Effects**

Records the client response, creates an audit record, and makes an operations review task eligible for creation.

**Approval Required**

No.

**Possible Errors**

Unauthenticated, tenant access denied, client-case relationship not permitted, request not open, linked document not permitted, response content invalid, or duplicate idempotency reference.

**Events Emitted**

`client.response_received`.

**Widgets Triggered**

Client Action Checklist and Case Summary.

**Future Enhancements**

Structured response questionnaires, multilingual assistance, and response completeness guidance.

### 4.3 Operations Module

#### Tool Name

`operations_get_queue`

**Purpose**

Retrieves an Operations user's authorized work queue with case priority, ownership, overdue status, blocked state, and permitted filters.

**Who Can Use It**

Operations user or Administrator within the authorized tenant.

**Required Scope**

`case:read`.

**Inputs**

Queue type, allowed filters, pagination or time window, and optional ownership context.

**Outputs**

Queue items, priority and due-date indicators, blocked reasons, permitted summary fields, filter summary, and correlation ID.

**Side Effects**

Creates an audit record for sensitive operational queue access. It does not alter case, task, or approval state.

**Approval Required**

No.

**Possible Errors**

Unauthenticated, operations role missing, tenant access denied, invalid filter, or queue service unavailable.

**Events Emitted**

None.

**Widgets Triggered**

Operations Queue.

**Future Enhancements**

Workload balancing, team capacity views, saved filters, and quality-assurance sampling.

#### Tool Name

`operations_review_case`

**Purpose**

Produces a normalized operations review of a case's intake completeness, documents, tasks, policy freshness, and approval blockers without making a final decision.

**Who Can Use It**

Authorized Operations user, Approver, or Administrator.

**Required Scope**

`case:read`, plus `document:read` when document review details are requested.

**Inputs**

Case ID, requested review dimensions, and optional review reason.

**Outputs**

Case review summary, missing-information signals, task status, policy freshness indicators, approval blockers, permitted document findings, and correlation ID.

**Side Effects**

Creates a sensitive-read audit record. It does not change case, document, task, or approval state.

**Approval Required**

No.

**Possible Errors**

Unauthenticated, tenant access denied, operations role missing, case not found, document access denied, or policy evidence unavailable.

**Events Emitted**

None.

**Widgets Triggered**

Case Review Workspace.

**Future Enhancements**

Quality-review checklists, risk indicators, and jurisdiction-specific operational guidance.

#### Tool Name

`operations_request_information`

**Purpose**

Creates one controlled request for additional information or evidence from a case participant.

**Who Can Use It**

Authorized Operations user.

**Required Scope**

`case:write`; `document:write` when the request is for a document.

**Inputs**

Case ID, request type, recipient, requested information or evidence description, due date, permitted communication channel, reason, and idempotency reference.

**Outputs**

Information-request ID, request status, due date, recipient summary, notification eligibility, and correlation ID.

**Side Effects**

Creates the information request, records an audit entry, creates a follow-up task, and makes an approved notification intent eligible.

**Approval Required**

No. Recipient consent and permitted channel checks remain mandatory before delivery.

**Possible Errors**

Unauthenticated, operations role missing, tenant access denied, invalid recipient relationship, request content invalid, document scope missing, communication consent absent, or duplicate idempotency reference.

**Events Emitted**

`case.information_requested`.

**Widgets Triggered**

Case Review Workspace and Client Action Checklist.

**Future Enhancements**

Request templates, due-date escalation policy, localization, and evidence-type guidance.

### 4.4 Documents Module

#### Tool Name

`document_upload`

**Purpose**

Receives one document for an authorized case, records secure metadata and storage reference, and initiates the controlled document-intake workflow.

**Who Can Use It**

Authorized Client user, Operations user, or assigned Broker only where tenant policy permits broker-provided evidence.

**Required Scope**

`document:write`.

**Inputs**

Case ID, document-request ID when applicable, file name, declared media type, secure document content or upload reference, document type, issuing context where known, and idempotency reference.

**Outputs**

Document ID, intake status, storage acceptance status, OCR initiation status where eligible, next review step, and correlation ID.

**Side Effects**

Creates document metadata and secure storage reference, records an audit entry, and initiates OCR only after document-intake checks succeed.

**Approval Required**

No for upload. Upload does not accept the document as evidence.

**Possible Errors**

Unauthenticated, tenant access denied, document access denied, prohibited media type, size or integrity limit exceeded, malware or security scan failure, request not open, storage unavailable, or duplicate idempotency reference.

**Events Emitted**

`document.uploaded`.

**Widgets Triggered**

Document Readiness.

**Future Enhancements**

Document-type suggestions, duplicate detection, secure resumable uploads, and jurisdiction-specific evidence guidance.

#### Tool Name

`document_get_extraction`

**Purpose**

Returns the normalized OCR extraction result and review status for an authorized document without exposing the raw document binary.

**Who Can Use It**

Authorized Client user for client-safe outcomes, Operations user, Approver, or permitted Broker for minimum-necessary evidence details.

**Required Scope**

`document:read`.

**Inputs**

Case ID, document ID, and requested permitted view.

**Outputs**

Document identifier, extraction status, normalized extracted fields permitted to the caller, confidence indicators, provenance, review state, acceptance status, and correlation ID.

**Side Effects**

Creates a sensitive-read audit record. It does not change extraction, review, or acceptance state.

**Approval Required**

No.

**Possible Errors**

Unauthenticated, tenant access denied, document not found, document access denied, extraction unavailable, extraction still pending, or restricted-field access denied.

**Events Emitted**

None.

**Widgets Triggered**

Extraction Review and Document Readiness.

**Future Enhancements**

Human-verified field comparison, multi-document consistency flags, and document-specific redaction views.

#### Tool Name

`document_request_review`

**Purpose**

Creates one review request for an uploaded document, its OCR extraction, or a validation finding.

**Who Can Use It**

Authorized Operations user or a workflow-authorized Client user requesting clarification on their own document.

**Required Scope**

`document:write`.

**Inputs**

Case ID, document ID, review type, reason, requested reviewer role, priority, due date where permitted, and idempotency reference.

**Outputs**

Review-request ID, document review status, associated task status, next allowable action, and correlation ID.

**Side Effects**

Creates a review request, records an audit entry, and creates or updates a Document Review task. It does not accept a document.

**Approval Required**

No. A later authorized approval decision is required for document acceptance.

**Possible Errors**

Unauthenticated, tenant access denied, document not found, review already open, invalid review reason, insufficient scope, or duplicate idempotency reference.

**Events Emitted**

`document.review_requested`.

**Widgets Triggered**

Extraction Review and Document Readiness.

**Future Enhancements**

Review service-level agreements, reviewer routing, and configurable evidence-validation rules.

### 4.5 Policy Knowledge Module

#### Tool Name

`policy_search`

**Purpose**

Retrieves attributed, freshness-aware visa policy evidence relevant to an explicit jurisdiction and applicant context. It supports guidance and does not make a legal determination.

**Who Can Use It**

Authorized Client user for permitted guidance, Operations user, Approver, Policy Reviewer, or Administrator.

**Required Scope**

`case:read` for case-contextual retrieval. The caller must also have access to the referenced case when one is supplied.

**Inputs**

Destination, nationality, residence, purpose, timing or effective-date context, optional case ID, and requested policy topic.

**Outputs**

Normalized policy summary, attributed sources, effective-date context, freshness state, confidence limitations, missing-context prompts, and correlation ID.

**Side Effects**

Creates an audit record for case-contextual or sensitive policy retrieval. It does not update policy knowledge or case state.

**Approval Required**

No.

**Possible Errors**

Unauthenticated, tenant access denied, referenced case access denied, insufficient jurisdiction context, no approved source found, stale or conflicting source condition, or knowledge service unavailable.

**Events Emitted**

None.

**Widgets Triggered**

Policy Evidence Panel.

**Future Enhancements**

Policy comparison, jurisdiction-change alerts, source-quality scores, and approved-source coverage indicators.

#### Tool Name

`policy_get_sources`

**Purpose**

Returns provenance and freshness detail for policy evidence so an authorized user can evaluate its reliability and review state.

**Who Can Use It**

Authorized Operations user, Policy Reviewer, Approver, Administrator, or Client user only for sources permitted in client-safe policy guidance.

**Required Scope**

`case:read`; Policy Reviewers also require `policy:manage` for restricted review metadata.

**Inputs**

Policy evidence reference or explicit jurisdiction and topic, optional case ID, and requested source-detail level.

**Outputs**

Source references, publication and retrieval dates where available, review state, freshness status, jurisdiction tags, and correlation ID.

**Side Effects**

Creates an audit record when the source detail is protected. It does not alter policy knowledge.

**Approval Required**

No.

**Possible Errors**

Unauthenticated, tenant access denied, policy evidence not found, source detail not permitted, restricted review metadata denied, or knowledge service unavailable.

**Events Emitted**

None.

**Widgets Triggered**

Policy Evidence Panel and Policy Freshness Dashboard.

**Future Enhancements**

Source comparison, change history, and reviewer annotations.

#### Tool Name

`policy_request_review`

**Purpose**

Creates one policy-source review request for a stale, conflicting, new, or materially changed source.

**Who Can Use It**

Policy Reviewer or Administrator; authorized Operations users may request review where tenant policy allows.

**Required Scope**

`policy:manage`.

**Inputs**

Source or jurisdiction reference, review reason, observed change summary, priority, evidence references, and idempotency reference.

**Outputs**

Policy-review request ID, review status, related task status, current source freshness state, and correlation ID.

**Side Effects**

Creates the review request, records an audit entry, and creates a Policy Source Review task. It does not publish or index policy content.

**Approval Required**

No. Publication and indexing follow the separate policy-review governance process.

**Possible Errors**

Unauthenticated, policy-reviewer role missing, tenant access denied, source not found, review already open, invalid review reason, or duplicate idempotency reference.

**Events Emitted**

None when the review request is created. A later reviewed source-state change may emit `policy.source_updated` through the Policy Knowledge Module.

**Widgets Triggered**

Policy Freshness Dashboard.

**Future Enhancements**

Automated change detection, source-diff preview, reviewer assignment, and jurisdiction coverage reporting.

### 4.6 Broker Module

#### Tool Name

`broker_get_eligible`

**Purpose**

Finds brokers eligible for a case jurisdiction and permitted assignment context without exposing unnecessary broker or case information.

**Who Can Use It**

Authorized Operations user, Approver, or Administrator.

**Required Scope**

`case:read`.

**Inputs**

Case ID, jurisdiction, required capabilities, and permitted assignment criteria.

**Outputs**

Eligible broker summaries, eligibility rationale, availability or capacity signal where authorized, excluded-candidate reason categories, and correlation ID.

**Side Effects**

Creates an audit record for sensitive broker and case-context access. It does not create an assignment.

**Approval Required**

No.

**Possible Errors**

Unauthenticated, tenant access denied, operations role missing, case not found, jurisdiction missing, no eligible broker, or broker service unavailable.

**Events Emitted**

None.

**Widgets Triggered**

Broker Assignment Preview.

**Future Enhancements**

Capacity-aware ranking, broker service-quality indicators, and jurisdiction-specific eligibility rules.

#### Tool Name

`broker_prepare_assignment`

**Purpose**

Creates a minimum-necessary broker assignment proposal and the associated approval-ready handoff preview. It does not assign the broker.

**Who Can Use It**

Authorized Operations user.

**Required Scope**

`broker:assign` and `case:read`.

**Inputs**

Case ID, selected broker ID, permitted handoff scope, assignment rationale, required response timing, and idempotency reference.

**Outputs**

Assignment proposal ID, minimum-necessary handoff summary, approval status of `approval_required`, required approver role, and correlation ID.

**Side Effects**

Creates an assignment proposal, creates an audit record, and creates or updates the Broker Assignment Review task. It does not expose the handoff or create a broker assignment.

**Approval Required**

No to prepare the proposal. Human approval is required before assignment execution.

**Possible Errors**

Unauthenticated, tenant access denied, insufficient scope, broker ineligible, handoff scope too broad, case not ready, proposal already active, or duplicate idempotency reference.

**Events Emitted**

`broker.assignment_requested`.

**Widgets Triggered**

Broker Assignment Preview and Approval Queue.

**Future Enhancements**

Handoff templates, broker response deadlines, capacity checks, and secure broker-portal invitation.

#### Tool Name

`broker_assign`

**Purpose**

Creates an approved broker assignment and releases only the minimum-necessary handoff information to the selected broker.

**Who Can Use It**

Authorized Operations user or an authorized service workflow acting on behalf of an Operations user, subject to tenant policy.

**Required Scope**

`broker:assign`.

**Inputs**

Assignment proposal ID, case ID, active approval reference, expected proposal state, controlled handoff confirmation, and idempotency reference.

**Outputs**

Broker assignment ID, assignment status, handoff status, broker-safe next step, approval reference, and correlation ID.

**Side Effects**

Creates the broker assignment, records an audit entry, publishes the approved handoff, and makes an approved notification intent eligible.

**Approval Required**

Yes. An active, unexpired broker-assignment approval is mandatory.

**Possible Errors**

Unauthenticated, tenant access denied, insufficient scope, active approval missing, approval expired or superseded, proposal not ready, broker no longer eligible, stale expected state, handoff restriction failure, or duplicate idempotency reference.

**Events Emitted**

`broker.assigned`.

**Widgets Triggered**

Broker Handoff Status and Case Timeline.

**Future Enhancements**

Assignment reassignment, broker acceptance tracking, and controlled performance feedback.

### 4.7 Task Module

#### Tool Name

`task_create`

**Purpose**

Creates one actionable task linked to an authorized case or approved operational context.

**Who Can Use It**

Authorized Operations user, Approver, or Administrator.

**Required Scope**

`case:write`.

**Inputs**

Case ID, task type, title, owner or assignment group, priority, due date, dependency references, completion-evidence expectation, and idempotency reference.

**Outputs**

Task ID, task status, owner summary, due date, dependency state, and correlation ID.

**Side Effects**

Creates the Task record and an audit entry. It does not advance the Visa Case.

**Approval Required**

No, unless a tenant-specific task type is used exclusively by an approval workflow. Creating the task does not grant approval.

**Possible Errors**

Unauthenticated, tenant access denied, insufficient scope, invalid task owner, due date invalid, dependency not permitted, case not found, or duplicate idempotency reference.

**Events Emitted**

`task.created`.

**Widgets Triggered**

Task Worklist and Task Detail.

**Future Enhancements**

Task templates, service-level agreement policy, workload balancing, and calendar-aware due dates.

#### Tool Name

`task_assign`

**Purpose**

Assigns one existing task to an authorized owner or assignment group without changing the underlying case decision.

**Who Can Use It**

Authorized Operations user, task owner with delegation rights, or Administrator.

**Required Scope**

`case:write`.

**Inputs**

Task ID, new owner or assignment group, assignment rationale where required, expected task state, and idempotency reference.

**Outputs**

Task ID, assigned owner summary, task status, due date, escalation state, and correlation ID.

**Side Effects**

Updates task ownership, creates an audit entry, and makes an assignment notification intent eligible.

**Approval Required**

No.

**Possible Errors**

Unauthenticated, tenant access denied, operations role missing, task not found, owner ineligible, task closed, stale expected state, or duplicate idempotency reference.

**Events Emitted**

None. Assignment notifications, when eligible, are downstream effects and do not create a new task lifecycle event.

**Widgets Triggered**

Task Worklist and Task Detail.

**Future Enhancements**

Delegated assignment, capacity-aware routing, and escalation ownership rules.

#### Tool Name

`task_complete`

**Purpose**

Records completion evidence for one task and closes the task when its completion requirements are satisfied.

**Who Can Use It**

Assigned task owner, authorized Operations user, Approver for approval tasks, or Administrator.

**Required Scope**

`case:write`.

**Inputs**

Task ID, completion evidence reference or completion summary, expected task state, completion confirmation, and idempotency reference.

**Outputs**

Task ID, completion status, completion timestamp, outstanding dependency status, and correlation ID.

**Side Effects**

Updates the Task record and creates an audit entry. It does not advance a Visa Case, accept a document, assign a broker, or submit an application.

**Approval Required**

No. Completing a task cannot substitute for a required domain approval.

**Possible Errors**

Unauthenticated, tenant access denied, task ownership not permitted, task not found, completion evidence missing, task already closed, stale expected state, or duplicate idempotency reference.

**Events Emitted**

`task.completed`.

**Widgets Triggered**

Task Detail and Task Worklist.

**Future Enhancements**

Evidence quality checks, reopening workflow, and automated overdue-task resolution review.

### 4.8 Approval Module

#### Tool Name

`approval_request`

**Purpose**

Creates one approval request for an approval-gated action, including broker assignment, document acceptance, or final submission when that future capability is enabled.

**Who Can Use It**

Authorized Operations user, workflow owner, or Administrator. The requester cannot use this Tool to self-authorize the action.

**Required Scope**

The scope appropriate to the subject action: `broker:assign`, `document:approve`, or `submission:prepare` for a final-submission readiness request.

**Inputs**

Subject type and ID, requested action, case ID, evidence references, required approver authority, decision due date, rationale, and idempotency reference.

**Outputs**

Approval ID, pending status, required approver role, expiry or decision due date, subject reference, and correlation ID.

**Side Effects**

Creates the approval request, creates an audit record, and creates or updates an Approval Review task. It does not perform the requested action.

**Approval Required**

No to request approval. The requested action remains blocked until an authorized human decision is active.

**Possible Errors**

Unauthenticated, tenant access denied, requester lacks subject scope, subject not ready, evidence incomplete, duplicate active approval, invalid approver authority, or duplicate idempotency reference.

**Events Emitted**

`approval.requested`.

**Widgets Triggered**

Approval Queue and Approval Decision View.

**Future Enhancements**

Multi-party decisions, delegation chains, conditional approvals, expiration reminders, and approval policy templates.

#### Tool Name

`approval_get_status`

**Purpose**

Retrieves the status and permitted decision context for one approval request or approval-gated subject.

**Who Can Use It**

Authorized requester, subject owner, permitted Operations user, designated Approver, or Administrator.

**Required Scope**

The read scope associated with the subject, plus the delegated approver role when restricted decision detail is requested.

**Inputs**

Approval ID or subject reference, case ID where applicable, and requested permitted view.

**Outputs**

Approval status, approver authority required, expiry state, permitted evidence summary, decision history appropriate to the caller, and correlation ID.

**Side Effects**

Creates a sensitive-read audit record. It does not change approval state.

**Approval Required**

No.

**Possible Errors**

Unauthenticated, tenant access denied, approval not found, subject access denied, decision detail restricted, or approval service unavailable.

**Events Emitted**

None.

**Widgets Triggered**

Approval Queue and Approval Decision View.

**Future Enhancements**

Approval timeline views, delegated-authority explanation, and expiration risk indicators.

#### Tool Name

`approval_decide`

**Purpose**

Records an authorized human approve or reject decision for one active approval request.

**Who Can Use It**

Only a human Approver with the delegated authority for the request, or an Administrator where tenant policy explicitly permits it.

**Required Scope**

`document:approve` for document acceptance, `submission:approve` for final submission, or `broker:assign` for broker assignment approval according to tenant policy.

**Inputs**

Approval ID, explicit human decision, decision rationale, expected approval state, any permitted decision conditions, and idempotency reference.

**Outputs**

Approval ID, final decision status, effective or rejected action summary, decision timestamp, subject reference, and correlation ID.

**Side Effects**

Creates an immutable decision record, creates an audit record, updates the approval state, and makes the owning module eligible to perform its separately guarded action.

**Approval Required**

This Tool is the human approval action. It requires an active request and does not permit autonomous or inferred decisions.

**Possible Errors**

Unauthenticated, tenant access denied, approver role missing, scope missing, delegated authority invalid, approval expired, decision already recorded, stale expected state, subject no longer eligible, or duplicate idempotency reference.

**Events Emitted**

`approval.decided`; subject-specific subscribers may subsequently emit `document.acceptance_approved`, `broker.assignment_approved`, or `submission.approved` after validating the decision.

**Widgets Triggered**

Approval Decision View, Approval Queue, and the subject's status widget.

**Future Enhancements**

Multiple approvers, conditional decision workflows, escalation policy, and digitally signed decision evidence.

### 4.9 Notification Module

#### Tool Name

`notification_get_status`

**Purpose**

Retrieves the authorized delivery status of a notification or case communication history without changing delivery behavior.

**Who Can Use It**

Authorized Client user for their own communications, Operations user, Administrator, or permitted Broker for their assigned handoff communications.

**Required Scope**

`case:read`.

**Inputs**

Case ID, notification ID where known, requested time window, and permitted channel filter.

**Outputs**

Notification status, allowed recipient summary, channel, delivery attempt timeline, permitted failure category, and correlation ID.

**Side Effects**

Creates an audit record when the communication history is sensitive. It does not retry or send a notification.

**Approval Required**

No.

**Possible Errors**

Unauthenticated, tenant access denied, communication access denied, notification not found, restricted recipient detail, or notification service unavailable.

**Events Emitted**

None.

**Widgets Triggered**

Communication History.

**Future Enhancements**

Channel preference explanations, delivery analytics, and client-safe delivery troubleshooting.

#### Tool Name

`notification_update_preference`

**Purpose**

Updates a consent-linked notification preference through the Client Service contract.

**Who Can Use It**

Authenticated Client user, or an authorized Operations user acting under documented client authorization.

**Required Scope**

`case:write`.

**Inputs**

Client context, requested channel preference, consent confirmation or withdrawal, effective date, reason when acting by proxy, and idempotency reference.

**Outputs**

Updated preference summary, permitted delivery channels, consent status, effective date, and correlation ID.

**Side Effects**

Updates client communication preferences through the Client Service and creates an audit record. It does not send a notification.

**Approval Required**

No. Explicit client intent or documented proxy authority is required.

**Possible Errors**

Unauthenticated, tenant access denied, client identity mismatch, proxy authority missing, invalid channel, consent record invalid, stale preference revision, or duplicate idempotency reference.

**Events Emitted**

`client.preferences_updated`.

**Widgets Triggered**

Notification Preferences.

**Future Enhancements**

Quiet hours, preference version history, channel-specific consent, and localization.

#### Tool Name

`notification_retry`

**Purpose**

Requests one controlled retry of a previously failed or pending eligible notification delivery through the Notification Service and n8n adapter.

**Who Can Use It**

Authorized Operations user or Administrator. Client users cannot retry internal or operational notifications.

**Required Scope**

`case:write`.

**Inputs**

Notification ID, case ID, retry reason, expected notification status, explicit retry confirmation, and idempotency reference.

**Outputs**

Notification ID, retry acceptance status, permitted recipient and channel summary, current delivery state, and correlation ID.

**Side Effects**

Creates a new delivery attempt through n8n only after validating recipient consent, channel eligibility, template policy, and retry limits. Records an audit entry.

**Approval Required**

No separate human approval. The retry requires explicit operator intent and must not change case or approval state.

**Possible Errors**

Unauthenticated, tenant access denied, operations role missing, notification not retryable, retry limit reached, consent withdrawn, channel unavailable, n8n unavailable, stale notification status, or duplicate idempotency reference.

**Events Emitted**

`notification.requested`; delivery outcomes emit `notification.delivered` or `notification.failed`.

**Widgets Triggered**

Communication History and Operations Queue.

**Future Enhancements**

Approved retry policies, alternate-channel fallback, localized templates, and delivery scheduling.

### 4.10 Audit & Observability Module

#### Tool Name

`audit_get_case_history`

**Purpose**

Returns an immutable, role-appropriate audit history for one case without exposing raw sensitive payloads or internal diagnostics.

**Who Can Use It**

Authorized Operations user, Approver, Administrator, or other role explicitly granted audit access for the case.

**Required Scope**

`audit:read`, plus tenant and permitted case access.

**Inputs**

Case ID, permitted time window, action-category filter, and pagination context.

**Outputs**

Audit event summaries with timestamp, actor category, action, entity reference, outcome, correlation ID, and redaction markers.

**Side Effects**

Creates a sensitive-read audit record for access to the audit history. It does not alter the returned case or prior audit records.

**Approval Required**

No.

**Possible Errors**

Unauthenticated, tenant access denied, `audit:read` missing, case access denied, audit history unavailable, invalid filter, or retention-window restriction.

**Events Emitted**

None. The access is recorded without producing a recursive audit event.

**Widgets Triggered**

Audit Timeline.

**Future Enhancements**

Compliance exports, signed audit views, case-event comparison, and role-specific redaction policies.

#### Tool Name

`observability_get_health`

**Purpose**

Returns normalized platform and dependency health for the NitroStack service without exposing credentials, raw provider responses, or infrastructure internals.

**Who Can Use It**

Authorized Operations user or Administrator.

**Required Scope**

`audit:read` and authorized operations or administrator role.

**Inputs**

Requested component scope, permitted environment context, and optional freshness threshold.

**Outputs**

Normalized health status for the platform and approved dependencies, last-check time, degradation category, and correlation ID.

**Side Effects**

Creates an operational access audit record. It does not repair, restart, or reconfigure any dependency.

**Approval Required**

No.

**Possible Errors**

Unauthenticated, tenant access denied, operations role missing, health access restricted, health data stale, or health provider unavailable.

**Events Emitted**

None. Dependency state changes are emitted by the health monitoring process, not by this read Tool.

**Widgets Triggered**

Dependency Health Dashboard.

**Future Enhancements**

Service-level objective views, dependency drill-down, incident correlation, and tenant-safe health segmentation.

#### Tool Name

`observability_get_metrics`

**Purpose**

Returns authorized, aggregated operational metrics for workload, tool use, errors, delivery outcomes, OCR confidence distribution, and policy freshness.

**Who Can Use It**

Authorized Operations user or Administrator with metrics access under tenant policy.

**Required Scope**

`audit:read` and authorized operations or administrator role.

**Inputs**

Metric category, permitted time window, tenant-safe aggregation level, and approved filters.

**Outputs**

Aggregated metric values, time window, data freshness, allowed dimensions, interpretation limits, and correlation ID.

**Side Effects**

Creates an operational access audit record. It does not change metrics, case data, or service configuration.

**Approval Required**

No.

**Possible Errors**

Unauthenticated, tenant access denied, metrics access restricted, invalid aggregation request, insufficient data, retention-window restriction, or metrics service unavailable.

**Events Emitted**

None.

**Widgets Triggered**

Dependency Health Dashboard.

**Future Enhancements**

Service-level objective reporting, anomaly detection, scheduled operational reports, and governance dashboards.

## 5. Tool Naming Convention

All Tool names use lowercase `snake_case` and begin with an action verb. Names use Visa Agent business terminology rather than technical implementation details.

| Rule | Guidance | Examples |
| --- | --- | --- |
| `snake_case` | Use lowercase words separated by underscores. | `case_start`, `policy_search`, `approval_decide`. |
| Verb first | Start with the user's intended operation. | `document_upload`, `task_complete`, `notification_retry`. |
| Business terminology | Name the business subject, not the database, provider, or user-interface control. | `broker_assign`, not an adapter or storage name. |
| Avoid abbreviations | Use complete, familiar business words unless an established domain term is clearer. | `document_get_extraction`, not a shortened internal term. |
| One action | A name describes one primary operation. | `approval_request` is distinct from `approval_decide`. |
| Stable names | Do not encode implementation version, provider name, or presentation route in a Tool name. | `policy_get_sources`, not a provider-specific name. |

Tool names must not expose database internals, provider names, credentials, or transport mechanisms. A Tool name changes only through an explicit compatibility plan because AI clients and widgets may depend on it.

## 6. Tool Lifecycle

Every Tool follows one governed lifecycle. The Tool boundary is thin; the owning Service performs the business operation and remains the only component that can change its domain state.

**Request**

The MCP client or a visible, user-triggered widget action invokes a named Tool with explicit business inputs and an idempotency reference for mutations.

**Validation**

The Tool validates required inputs, data classification, and preconditions. It rejects malformed or ambiguous requests before calling a Service.

**Authorization**

OAuth 2.1 validation confirms identity, audience, tenant, role, scope, and case relationship. Approval-gated actions also validate active approval state at the domain write boundary.

**Business Service**

The Tool calls the owning or published Service contract. The Service enforces lifecycle, tenant, idempotency, persistence, integration, and provider-normalization rules.

**Audit**

The Audit Service records sensitive reads and all mutations with actor, tenant, action, entity references, result, correlation ID, and timestamp.

**Events**

After a committed source-of-truth change, the Service publishes a minimal, versioned Nitro Event. Subscribers may create tasks, update read models, collect metrics, or request permitted notifications. Events never authorize an action.

**Widget**

When the Tool has a mapped widget, the normalized response updates the relevant client or operations widget. Widgets display state; they do not own business rules or silently mutate data.

**Response**

The Tool returns a structured, role-appropriate result with identifiers, status, approval state where relevant, allowed next actions, and correlation ID. Errors use stable business categories.

### Lifecycle Diagram

MCP Client or visible Widget Action

↓

Tool Request and Input Validation

↓

OAuth 2.1, Tenant, Role, Scope, and Approval-State Validation

↓

Owning Domain Service

↓

MongoDB Commit or Normalized Read

↓

Audit Record

↓

Post-Commit Nitro Event

↓

Task, Notification, Metric, or Read-Model Subscriber

↓

Widget Update and Structured Tool Response

## 7. Cross Tool Rules

- Tools never call other Tools. A Tool calls an owning or published Service contract.
- Services may publish Nitro Events only after the source-of-truth operation has committed.
- Events never authorize an action, replace a synchronous state check, or bypass an approval gate.
- No Tool performs multiple primary business operations. Related audit, event, task, and notification effects must be secondary, explicit, and post-commit where applicable.
- Every mutation requires explicit user intent and idempotency handling.
- Every read enforces tenant isolation and least-privilege field selection.
- Every sensitive read and all mutations are auditable.
- Widgets may request a Tool call only from a visible user interaction; widget state never authorizes a Tool.
- Tools return normalized business information. Database internals, raw OCR payloads, raw provider responses, secrets, and diagnostic traces are never returned.
- External integration behavior remains behind Services and adapters. Tools do not address n8n, Firecrawl, OCR, Qdrant, MongoDB, or document storage directly.
- A Tool that encounters missing approval returns `approval_required` with the permitted next action; it must not simulate success or queue an unauthorized external action.
- A task may be completed only through its own Tool and never advances a case or approval state by implication.

## 8. High-Risk Tools

| Tool Group | Risk | Required Controls |
| --- | --- | --- |
| `case_start`, `case_get`, `case_update`, and client case Tools | Sensitive applicant and case data; lifecycle changes. | OAuth 2.1, tenant and relationship checks, least-privilege outputs, correlation IDs, audit logging, and idempotency for writes. |
| `document_upload`, `document_get_extraction`, `document_request_review` | Document access, personal information, secure storage, and OCR integration. | Document scope checks, media and security validation, raw-content exclusion from logs and events, role-based redaction, audit logging, and human approval before acceptance. |
| `policy_search`, `policy_get_sources`, `policy_request_review` | Potentially stale or conflicting policy information and Firecrawl/Qdrant dependencies. | Attribution, freshness and uncertainty signals, source review governance, rate limiting for expensive retrieval, and no legal determinations. |
| `broker_prepare_assignment`, `broker_assign` | Minimum-necessary personal data handoff and external broker coordination. | Tenant access, handoff minimization, eligibility validation, audit trail, active approval verification, and explicit operator intent. |
| `approval_request`, `approval_decide` | Controls decisions for document acceptance, broker assignment, and final submission. | Delegated human authority, narrow scopes, immutable decision history, expiry and supersession checks, correlation IDs, and no autonomous decisions. |
| `notification_get_status`, `notification_update_preference`, `notification_retry` | Communication history, consent, n8n handoff, email, and WhatsApp delivery. | Consent and channel checks, recipient minimization, delivery-status auditing, retry limits, explicit operator intent, and no case-state mutation from delivery results. |
| `audit_get_case_history`, `observability_get_health`, `observability_get_metrics` | Sensitive audit data and operational intelligence. | `audit:read`, role checks, redaction, tenant segmentation, aggregate-only metrics where needed, and no infrastructure secrets or raw provider diagnostics. |
| Future submission Tools | External filing, legal, privacy, and irreversible workflow consequences. | Readiness validation, explicit user confirmation, active final human approval, `submission:prepare`, `submission:approve`, and `submission:execute` scopes, external-side-effect audit, and recovery controls. |

Document acceptance has no autonomous acceptance Tool. It becomes effective only when `approval_decide` records a valid document-acceptance decision and the Documents Module validates that approval before updating its own state. Likewise, broker assignment is effective only when `broker_assign` validates an active broker-assignment approval. Final submission is unavailable until the future submissions capability meets all governance requirements.

## 9. Future Tools

The following Tool families may be introduced after the core case, document, policy, task, approval, notification, and audit foundations are proven. They are intentionally excluded from the current hackathon scope because they introduce new financial, legal, privacy, operational, or model-governance obligations.

| Future Tool Family | Potential Tools | Reason Deferred |
| --- | --- | --- |
| Submission | `submission_prepare`, `submission_request_approval`, `submission_execute` | Requires mature jurisdiction-specific integration, readiness validation, legal review, active human approval, recovery workflow, and external-side-effect controls. |
| Payment | Payment-intent and reconciliation operations. | Introduces financial controls, security, disputes, and compliance obligations outside the core case workflow. |
| Analytics | Tenant-governed operational and outcome analysis operations. | Requires a mature privacy model, approved aggregation rules, and governance beyond operational observability. |
| AI Recommendations | Controlled recommendation and prioritization operations. | Requires evidence standards, model governance, explanation requirements, bias review, and a clear rule that recommendations cannot make decisions. |
| Billing | Commercial account, entitlement, invoice, and usage operations. | Does not advance the current visa workflow and adds financial-record responsibilities. |
| Administration | Tenant provisioning, role delegation, and organization-wide configuration operations. | Requires a mature multi-tenant administration model and tightly governed controls. |
| Identity Federation | Enterprise identity-provider configuration operations. | OAuth 2.1 provides the current foundation; federation should follow validated tenant needs. |
| Compliance Export | Regulated audit and reporting export operations. | Depends on settled audit schemas, retention policy, authorized recipients, and reporting requirements. |

Any future Tool must follow the design principles, lifecycle, naming rules, and cross-tool rules in this document. It must also preserve the architectural constants of Visa Agent: MongoDB is operational truth, policy evidence is attributed and freshness-aware, external side effects are auditable, and human authority is mandatory for broker assignment, document acceptance, and final submission.
