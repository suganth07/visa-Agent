# Visa Agent Prompt Architecture

## 1. Purpose

MCP Prompts define Visa Agent's reusable AI behavior layer. A prompt describes how an AI client should guide a user through a bounded workflow, which context it should retrieve, what uncertainty it must expose, and when it may ask for explicit confirmation before invoking a tool.

Prompts are not business-rule engines. They do not own case state, approval policy, document acceptance, broker assignment, submission execution, notification delivery, or tenant access. Those responsibilities remain with the owning modules, services, guards, tools, and approval gates described in `ARCHITECTURE.md` and `docs/MODULES.md`.

### Prompts, Tools, Resources, and Widgets

| Capability | Primary Role | State Change | Visa Agent Boundary |
| --- | --- | --- | --- |
| Prompts | Guide AI reasoning and conversational workflow. | Never directly. | Orchestrate safe behavior using authorized resources and tools. |
| Tools | Perform bounded, validated, authorized reads or actions. | Only when the tool contract allows it. | Enforce role, scope, tenant, approval, audit, and idempotency rules. |
| Resources | Expose stable read-oriented context. | Never. | Provide authorized snapshots, policy evidence, freshness metadata, and review context. |
| Widgets | Render structured outputs and collect visible user-triggered intent. | Never directly. | Present state and request follow-up tool calls only through authorized user actions. |

Prompts orchestrate AI behavior because visa work requires careful sequencing: collect only necessary facts, retrieve policy evidence, separate sourced information from user-provided information, identify missing data, prepare safe summaries, and request approvals when required. Prompts give the AI client a consistent operating model without granting it authority.

Prompts never replace authorization. OAuth 2.1 validation, role checks, scope checks, tenant isolation, and approval-state enforcement occur server-side before protected work. A prompt may explain that a user lacks access or that approval is required, but it cannot grant access, infer authority, or treat conversation as approval.

Prompts never contain business logic. They may describe workflow intent and safety behavior, but they must not encode transition rules, eligibility determinations, document-acceptance criteria, broker-selection authority, submission rules, notification policy, or retention policy. Those rules belong in owning services and guarded tools.

## 2. Prompt Design Principles

Visa Agent prompts follow these principles:

- Single responsibility: each prompt supports one clear user goal or operational workflow.
- Reusable: prompts are argument-driven and module-owned so they can be used from portals, MCP AI clients, and supported widgets.
- Deterministic: prompts provide stable behavior expectations, required citations, allowed outputs, and stop conditions.
- Context aware: prompts use caller role, tenant, case state, approval state, policy freshness, and document review status when available.
- Uses Resources: prompts prefer authorized resources for case summaries, timelines, policy evidence, document extraction, tasks, approvals, audit records, and communication history.
- Calls Tools only when required: prompts may suggest or invoke tools only for an allowed next action, and mutation-capable tools require explicit user confirmation.
- Never bypass approvals: prompts can prepare approval context, request approval, or explain blocked states, but they never treat preparation as approval.
- Never hallucinate policy: prompts must retrieve or cite policy evidence and identify stale, missing, conflicting, or unreviewed sources.
- Always cite retrieved information: policy guidance, OCR references, audit summaries, and operational recommendations must identify their source resource or tool result.
- Ask for missing information only when necessary: prompts avoid broad questionnaires when the next safe action can proceed with existing context.
- Protect PII: prompts minimize personal data in conversation and avoid unnecessary reproduction of raw document content.
- Respect tenant boundaries: prompts never mix cases, clients, brokers, policy review records, or audit records across tenants.

## 3. Prompt Categories

Visa Agent prompt categories describe the business intent of prompt families. A prompt may support more than one category, but it has one owner module.

| Category | Purpose |
| --- | --- |
| Client Assistance | Help clients understand case status, next actions, evidence requests, and client-safe policy context. |
| Operations Assistance | Help operations users triage cases, review exceptions, prepare requests, and understand blocked states. |
| Policy Guidance | Retrieve, summarize, and cite policy evidence without making legal determinations. |
| Document Review | Summarize uploads, OCR extraction, ambiguity, missing evidence, and review readiness. |
| Approval Assistance | Prepare approval context, explain prerequisites, and summarize decisions without deciding on behalf of approvers. |
| Broker Assistance | Prepare least-privilege broker handoff previews and assignment readiness. |
| Submission Readiness | Verify readiness signals before final human review without executing external submission. |
| Notification Assistance | Compose or review notification intent within consent, channel, and template boundaries. |
| Audit Assistance | Summarize sensitive reads, mutations, approvals, external handoffs, and incident timelines for authorized users. |

## 4. Prompt Catalog

Prompt names use `snake_case`. The catalog below defines prompt families for each current module in `docs/MODULES.md`. Placeholder tool and resource names remain planning-level MCP contracts until implemented and tested.

### 4.1 Visa Case Module

#### Prompt Name: `visa_case_intake`

| Field | Definition |
| --- | --- |
| Purpose | Guide an authorized client or operations user through starting a visa case and identifying minimum required intake facts. |
| Owner Module | Visa Case Module |
| Inputs | Applicant identity reference, tenant context, destination, nationality, residence, travel purpose, target dates, dependents, consent state, caller role. |
| Resources Used | `case://{caseId}/summary` when continuing a draft; `policy://jurisdiction/{destination}` for cited guidance; `policy://freshness/{destination}` when available. |
| Tools Used | `case_start`; `case_get`; `policy_search` when policy evidence is required. |
| Outputs | Case intake summary, missing-information list, initial evidence checklist, cited policy context, next allowable actions. |
| Who Can Invoke | Client user for their own authorized case; operations user with tenant access and `case:write`. |
| Approval Requirements | None to prepare or start intake. Later gated transitions remain subject to approval workflow. |
| Possible Failure Conditions | Missing consent, unauthorized tenant access, unsupported destination, stale policy evidence, required intake facts unavailable, case already exists in incompatible state. |
| Widgets Supported | Case Summary, Client Action Checklist, Case Timeline. |
| Future Enhancements | Jurisdiction-specific intake variants, multilingual intake guidance, dependent-aware case templates. |

#### Prompt Name: `case_status_summary`

| Field | Definition |
| --- | --- |
| Purpose | Produce a role-safe explanation of current case status, milestones, blockers, and next actions. |
| Owner Module | Visa Case Module |
| Inputs | Case reference, caller role, tenant context, requested level of detail. |
| Resources Used | `case://{caseId}/summary`; `case://{caseId}/timeline`; `case://{caseId}/tasks`; `case://{caseId}/approvals` when authorized. |
| Tools Used | `case_get`; `case_get_timeline` when a fresh read is required. |
| Outputs | Status summary, milestone view, blocker list, approval-pending indicators, safe next actions. |
| Who Can Invoke | Case participant, authorized operations user, approver with related authority. |
| Approval Requirements | No approval to read authorized status. Prompt must mark gated actions as requiring approval. |
| Possible Failure Conditions | Case not found, caller lacks case access, tenant mismatch, timeline partially unavailable, restricted internal notes not visible to caller. |
| Widgets Supported | Case Summary, Case Timeline, Operations Queue. |
| Future Enhancements | SLA-aware status summaries and jurisdiction-specific milestone language. |

#### Prompt Name: `case_milestone_review`

| Field | Definition |
| --- | --- |
| Purpose | Help operations review whether a case is ready for its next lifecycle milestone without advancing state directly. |
| Owner Module | Visa Case Module |
| Inputs | Case reference, current lifecycle state, desired milestone, open tasks, document status, approval status. |
| Resources Used | `case://{caseId}/summary`; `case://{caseId}/timeline`; `case://{caseId}/documents`; `case://{caseId}/tasks`; `case://{caseId}/approvals`. |
| Tools Used | `case_get`; `operations_review_case`; `approval_get_status`; `task_create` when confirmed by the user. |
| Outputs | Readiness assessment, unmet prerequisites, risk flags, recommended follow-up tasks, approval blockers. |
| Who Can Invoke | Operations users with tenant access and relevant case scopes. |
| Approval Requirements | Prompt cannot approve or perform gated progression. It may recommend `approval_request` when prerequisites are met. |
| Possible Failure Conditions | Incomplete document review, missing approval, stale policy evidence, open blocking task, unauthorized requested transition. |
| Widgets Supported | Case Review Workspace, Operations Queue, Approval Queue. |
| Future Enhancements | Configurable lifecycle readiness profiles by tenant and destination. |

#### Prompt Name: `submission_readiness_assistant`

| Field | Definition |
| --- | --- |
| Purpose | Prepare a final-submission readiness package by checking case facts, accepted documents, policy evidence, open tasks, consent, and approval prerequisites without executing submission. |
| Owner Module | Visa Case Module |
| Inputs | Case reference, destination, current lifecycle state, document acceptance status, policy freshness status, open tasks, consent status, approval status. |
| Resources Used | `case://{caseId}/summary`; `case://{caseId}/timeline`; `case://{caseId}/documents`; `case://{caseId}/tasks`; `case://{caseId}/approvals`; `policy://jurisdiction/{destination}`; `policy://freshness/{destination}`. |
| Tools Used | `case_get`; `case_get_timeline`; `document_get_extraction`; `approval_get_status`; `policy_search`; `task_create` when confirmed for follow-up work. |
| Outputs | Submission-readiness summary, blocker list, cited policy evidence, accepted-document status, open-task summary, final-approval readiness notes. |
| Who Can Invoke | Operations users with tenant access and relevant case, document, policy, task, and approval visibility. |
| Approval Requirements | Final submission requires explicit human approval. This prompt may prepare context for `approval_request` but must not submit, execute, or imply approval. |
| Possible Failure Conditions | Unaccepted document, stale policy evidence, missing consent, unresolved task, approval missing or expired, case not in a submission-ready lifecycle state. |
| Widgets Supported | Case Review Workspace, Approval Queue, Document Readiness, Policy Evidence Panel, Case Timeline. |
| Future Enhancements | Transfer to a future Submissions Module when external submission capability is formally introduced. |

### 4.2 Client Module

#### Prompt Name: `client_next_steps_assistant`

| Field | Definition |
| --- | --- |
| Purpose | Explain client-safe next steps without exposing internal operations notes, broker-sensitive details, or another tenant's data. |
| Owner Module | Client Module |
| Inputs | Client identity, case reference, communication preference, current action request, locale preference when available. |
| Resources Used | `case://{caseId}/client-summary`; `case://{caseId}/documents`; `client://{clientId}/preferences`. |
| Tools Used | `client_get_case_view`; `client_respond_to_request` when the client confirms a response. |
| Outputs | Client-safe next actions, due items, requested evidence summary, uncertainty notes, source references. |
| Who Can Invoke | Client user associated with the case; authorized operations user previewing client-safe output. |
| Approval Requirements | None for guidance. Any consequential case change remains tool-governed. |
| Possible Failure Conditions | Client not linked to case, consent missing, communication preferences unavailable, requested data is operations-only. |
| Widgets Supported | Client Case Summary, Client Action Checklist, Document Readiness. |
| Future Enhancements | Multilingual client responses and accessible plain-language policy summaries. |

#### Prompt Name: `client_information_response`

| Field | Definition |
| --- | --- |
| Purpose | Help a client respond to a request for information with only the necessary facts and documents. |
| Owner Module | Client Module |
| Inputs | Information request reference, client response text, related document references, case reference. |
| Resources Used | `case://{caseId}/client-summary`; `case://{caseId}/documents`; `task://{taskId}` for the request when authorized. |
| Tools Used | `client_respond_to_request`; `document_upload` if a confirmed upload is needed and available. |
| Outputs | Response summary, missing items, confirmation-ready response package, upload status references. |
| Who Can Invoke | Client user associated with the request; operations user only for review, not impersonation. |
| Approval Requirements | None for client response submission. Document acceptance remains approval-gated. |
| Possible Failure Conditions | Expired request, missing required attachment, file validation failure, unauthorized client relationship, duplicate response. |
| Widgets Supported | Client Action Checklist, Document Readiness, Communication History. |
| Future Enhancements | Guided response drafts by request type and localized evidence instructions. |

#### Prompt Name: `client_consent_preferences`

| Field | Definition |
| --- | --- |
| Purpose | Guide a client through reviewing or updating consent and communication preferences. |
| Owner Module | Client Module |
| Inputs | Client identity, current preference snapshot, requested channel change, case reference when relevant. |
| Resources Used | `client://{clientId}/preferences`; `case://{caseId}/notifications` when authorized. |
| Tools Used | `client_update_preferences`; `notification_update_preference` when confirmed. |
| Outputs | Preference summary, consent gaps, channel eligibility explanation, confirmation result. |
| Who Can Invoke | Client user; authorized operations user for read-only support. |
| Approval Requirements | Explicit client confirmation required before any preference update. |
| Possible Failure Conditions | Caller is not the client, channel unavailable, consent missing, tenant policy blocks channel, notification system unavailable. |
| Widgets Supported | Notification Preferences, Communication History. |
| Future Enhancements | Tenant-specific preference policies and consent renewal reminders. |

### 4.3 Operations Module

#### Prompt Name: `operations_case_triage`

| Field | Definition |
| --- | --- |
| Purpose | Help operations prioritize cases using status, overdue work, missing evidence, policy freshness, and approval blockers. |
| Owner Module | Operations Module |
| Inputs | Queue filters, tenant context, operations role, priority criteria, optional case reference. |
| Resources Used | `operations://queue`; `operations://case/{caseId}/review`; `case://{caseId}/tasks`; `policy://freshness/{destination}`. |
| Tools Used | `operations_get_queue`; `operations_review_case`; `task_assign` when confirmed. |
| Outputs | Triage summary, priority ordering, blocked-state reasons, suggested follow-up actions, cited freshness warnings. |
| Who Can Invoke | Operations users with tenant authorization. |
| Approval Requirements | No approval to triage. Any broker, document acceptance, or final submission action remains approval-gated. |
| Possible Failure Conditions | Unauthorized queue access, incomplete projections, stale policy data, unavailable task service, mixed-tenant filters. |
| Widgets Supported | Operations Queue, Case Review Workspace, Policy Freshness Dashboard. |
| Future Enhancements | Workload balancing, tenant-specific prioritization, QA sampling support. |

#### Prompt Name: `operations_information_request`

| Field | Definition |
| --- | --- |
| Purpose | Prepare a clear, client-safe request for missing information or evidence. |
| Owner Module | Operations Module |
| Inputs | Case reference, missing item list, evidence reason, due date guidance, channel preference. |
| Resources Used | `operations://case/{caseId}/review`; `case://{caseId}/client-summary`; `case://{caseId}/documents`; `client://{clientId}/preferences`. |
| Tools Used | `operations_request_information`; `task_create`; `notification_get_status` when delivery context is required. |
| Outputs | Information request summary, client-safe wording intent, evidence checklist, task and notification readiness indicators. |
| Who Can Invoke | Operations users with `case:write` and tenant access. |
| Approval Requirements | Explicit user confirmation required before creating a request or task. Notification delivery follows Notification Module policy. |
| Possible Failure Conditions | Requested item exposes internal notes, client lacks consented channel, missing case access, duplicate open request. |
| Widgets Supported | Case Review Workspace, Client Action Checklist, Communication History. |
| Future Enhancements | Request templates governed by document type, destination, and tenant policy. |

#### Prompt Name: `operations_exception_review`

| Field | Definition |
| --- | --- |
| Purpose | Summarize operational exceptions such as stale policy, overdue tasks, missing approvals, OCR ambiguity, or broker response delays. |
| Owner Module | Operations Module |
| Inputs | Case reference or queue filter, exception type, caller role, time window. |
| Resources Used | `operations://queue`; `operations://case/{caseId}/review`; `audit://case/{caseId}` when authorized; `policy://freshness/{destination}`. |
| Tools Used | `operations_get_queue`; `task_create`; `task_assign`; `approval_get_status`. |
| Outputs | Exception summary, severity, source evidence, recommended owner, next allowed action. |
| Who Can Invoke | Operations users; audit-capable users when audit evidence is included. |
| Approval Requirements | Prompt may recommend an approval request but cannot resolve an approval-gated exception. |
| Possible Failure Conditions | Insufficient audit scope, stale projections, missing ownership data, exception already resolved. |
| Widgets Supported | Operations Queue, Audit Timeline, Dependency Health Dashboard. |
| Future Enhancements | Automated exception clustering and service-level objective reporting. |

### 4.4 Documents Module

#### Prompt Name: `document_readiness_review`

| Field | Definition |
| --- | --- |
| Purpose | Summarize whether submitted documents appear ready for human review without accepting them. |
| Owner Module | Documents Module |
| Inputs | Case reference, document references, requirement type, OCR extraction status, reviewer role. |
| Resources Used | `document://{documentId}/extraction`; `case://{caseId}/documents`; `policy://jurisdiction/{destination}` when requirements need citation. |
| Tools Used | `document_get_extraction`; `document_request_review`; `policy_search` when policy evidence is required. |
| Outputs | Readiness checklist, extraction confidence summary, ambiguity list, missing evidence, review request package. |
| Who Can Invoke | Client for their own uploaded documents where permitted; operations document reviewer; approver for related evidence. |
| Approval Requirements | Document acceptance requires authorized human approval outside the prompt. |
| Possible Failure Conditions | OCR incomplete, document metadata invalid, extraction confidence low, raw document unavailable, policy source stale. |
| Widgets Supported | Document Readiness, Extraction Review, Approval Decision View. |
| Future Enhancements | Multi-document consistency checks and jurisdiction-specific evidence rules. |

#### Prompt Name: `document_extraction_summary`

| Field | Definition |
| --- | --- |
| Purpose | Explain OCR extraction results, confidence, missing values, and human verification needs. |
| Owner Module | Documents Module |
| Inputs | Document reference, extraction reference, requested fields, caller role. |
| Resources Used | `document://{documentId}/extraction`; `case://{caseId}/documents`. |
| Tools Used | `document_get_extraction`. |
| Outputs | Extracted field summary, confidence and provenance notes, missing or ambiguous values, verification recommendations. |
| Who Can Invoke | Authorized document reviewer; client only for client-visible document status and safe extracted fields. |
| Approval Requirements | None to summarize. Acceptance and correction decisions remain governed. |
| Possible Failure Conditions | Extraction unavailable, caller lacks document access, document belongs to another tenant, OCR provider failure. |
| Widgets Supported | Extraction Review, Document Readiness. |
| Future Enhancements | Field-level reviewer annotations and extraction comparison across document versions. |

#### Prompt Name: `document_correction_assistant`

| Field | Definition |
| --- | --- |
| Purpose | Help operations identify corrections or clarifications needed from a client based on reviewed document findings. |
| Owner Module | Documents Module |
| Inputs | Document reference, validation findings, case reference, desired correction type. |
| Resources Used | `document://{documentId}/extraction`; `case://{caseId}/documents`; `case://{caseId}/client-summary`. |
| Tools Used | `document_request_review`; `operations_request_information`; `task_create` when confirmed. |
| Outputs | Correction summary, client-safe request intent, required evidence list, reviewer notes separated from client message. |
| Who Can Invoke | Operations users and document reviewers with tenant access. |
| Approval Requirements | Document acceptance remains approval-gated; correction requests require explicit user confirmation. |
| Possible Failure Conditions | Findings are incomplete, client-safe language cannot be produced without revealing internal notes, duplicate request exists. |
| Widgets Supported | Extraction Review, Client Action Checklist, Case Review Workspace. |
| Future Enhancements | Standardized correction reason taxonomy and automated duplicate detection. |

### 4.5 Policy Knowledge Module

#### Prompt Name: `visa_eligibility_intake`

| Field | Definition |
| --- | --- |
| Purpose | Gather eligibility-relevant facts and retrieve cited policy evidence without making a legal determination or guarantee. |
| Owner Module | Policy Knowledge Module |
| Inputs | Destination, nationality, residence, purpose, dates, dependents, employer or sponsor context when relevant, case reference when available. |
| Resources Used | `policy://jurisdiction/{destination}`; `policy://freshness/{destination}`; `case://{caseId}/summary` when authorized. |
| Tools Used | `policy_search`; `case_get` when case context is required. |
| Outputs | Fact summary, cited policy evidence, missing facts, uncertainty notes, recommended operational review path. |
| Who Can Invoke | Client for client-safe guidance; operations user; policy reviewer. |
| Approval Requirements | None for policy retrieval. Prompt must not decide eligibility or replace legal review. |
| Possible Failure Conditions | Destination unsupported, policy source stale or conflicting, required facts missing, caller lacks case access. |
| Widgets Supported | Policy Evidence Panel, Policy Freshness Dashboard, Client Case Summary. |
| Future Enhancements | Jurisdiction coverage scoring and policy-change comparison. |

#### Prompt Name: `policy_evidence_summary`

| Field | Definition |
| --- | --- |
| Purpose | Summarize retrieved policy evidence with source attribution, freshness, and conflict indicators. |
| Owner Module | Policy Knowledge Module |
| Inputs | Policy query, destination, applicant context, source freshness requirements, caller role. |
| Resources Used | `policy://jurisdiction/{destination}`; `policy://freshness/{destination}`. |
| Tools Used | `policy_search`; `policy_get_sources`. |
| Outputs | Cited evidence summary, freshness status, source list, known gaps, uncertainty explanation. |
| Who Can Invoke | Authorized clients, operations users, approvers, policy reviewers. |
| Approval Requirements | None. New or materially changed policy content requires policy-review workflow before production guidance. |
| Possible Failure Conditions | No reviewed source available, source conflict, stale index, Qdrant unavailable, Firecrawl ingestion pending. |
| Widgets Supported | Policy Evidence Panel, Policy Freshness Dashboard. |
| Future Enhancements | Source-quality scoring and side-by-side policy diffs. |

#### Prompt Name: `policy_freshness_review`

| Field | Definition |
| --- | --- |
| Purpose | Help policy reviewers and operations users understand policy source freshness, ingestion status, and review needs. |
| Owner Module | Policy Knowledge Module |
| Inputs | Destination, source set, freshness threshold, review queue context. |
| Resources Used | `policy://freshness/{destination}`; `policy://jurisdiction/{destination}`. |
| Tools Used | `policy_get_sources`; `policy_request_review`. |
| Outputs | Freshness summary, stale-source warnings, review request summary, affected case or workflow notes when authorized. |
| Who Can Invoke | Policy reviewers; operations users with tenant policy visibility. |
| Approval Requirements | Policy publication follows policy-review authority. Prompt cannot publish or certify a source. |
| Possible Failure Conditions | Source metadata missing, review status unknown, ingestion incomplete, caller lacks `policy:manage` for review actions. |
| Widgets Supported | Policy Freshness Dashboard, Operations Queue. |
| Future Enhancements | Jurisdiction coverage reporting and reviewer workload dashboards. |

### 4.6 Broker Module

#### Prompt Name: `broker_handoff_preparation`

| Field | Definition |
| --- | --- |
| Purpose | Prepare a minimum-necessary broker handoff preview for human review before assignment. |
| Owner Module | Broker Module |
| Inputs | Case reference, destination, required service, candidate broker criteria, document and approval status. |
| Resources Used | `case://{caseId}/broker-assignment`; `broker://{brokerId}/profile`; `case://{caseId}/summary`; `case://{caseId}/documents`; `case://{caseId}/approvals`. |
| Tools Used | `broker_get_eligible`; `broker_prepare_assignment`; `approval_request` when confirmed. |
| Outputs | Eligible broker summary, least-privilege handoff preview, approval request readiness, missing prerequisites. |
| Who Can Invoke | Operations users with tenant access and broker assignment permissions. |
| Approval Requirements | Broker assignment requires active human approval before `broker_assign` can succeed. |
| Possible Failure Conditions | No eligible broker, approval missing or expired, required evidence unavailable, handoff would expose unnecessary PII. |
| Widgets Supported | Broker Assignment Preview, Broker Handoff Status, Approval Queue. |
| Future Enhancements | Broker capacity signals, quality metrics, and jurisdiction-specific eligibility rules. |

#### Prompt Name: `broker_assignment_review`

| Field | Definition |
| --- | --- |
| Purpose | Summarize assignment status, broker response, and follow-up work without exposing unnecessary case details. |
| Owner Module | Broker Module |
| Inputs | Assignment reference, case reference, broker response status, caller role. |
| Resources Used | `case://{caseId}/broker-assignment`; `broker://{brokerId}/profile`; `case://{caseId}/tasks`. |
| Tools Used | `broker_get_eligible`; `task_create`; `notification_get_status` when follow-up delivery context is needed. |
| Outputs | Assignment status summary, response gaps, follow-up recommendations, task or notification readiness. |
| Who Can Invoke | Authorized operations users; broker users only for explicitly assigned, minimum-necessary handoff data. |
| Approval Requirements | Existing assignment must trace to active approval. Follow-up notifications obey notification policy. |
| Possible Failure Conditions | Assignment not approved, broker lacks access, response record unavailable, case data exceeds minimum necessary handoff. |
| Widgets Supported | Broker Handoff Status, Task Worklist, Communication History. |
| Future Enhancements | Secure broker portal prompts and response quality checks. |

### 4.7 Task Module

#### Prompt Name: `task_prioritization_assistant`

| Field | Definition |
| --- | --- |
| Purpose | Help authorized users prioritize tasks by due date, dependency, escalation state, case risk, and approval blockers. |
| Owner Module | Task Module |
| Inputs | Task queue filters, case reference, owner, due date range, priority criteria. |
| Resources Used | `task://{taskId}`; `case://{caseId}/tasks`; `operations://queue`. |
| Tools Used | `task_assign`; `task_create`; `operations_get_queue` when queue context is needed. |
| Outputs | Prioritized task list, dependency notes, escalation recommendations, owner suggestions. |
| Who Can Invoke | Operations users with task visibility; authorized case participants for their own client-safe tasks. |
| Approval Requirements | None for prioritization. Tasks cannot advance approval-gated case state by themselves. |
| Possible Failure Conditions | Unauthorized task scope, stale queue projection, missing due dates, task already completed. |
| Widgets Supported | Task Worklist, Task Detail, Operations Queue. |
| Future Enhancements | Calendar-aware due dates and workload balancing. |

#### Prompt Name: `task_closure_evidence_review`

| Field | Definition |
| --- | --- |
| Purpose | Help determine whether a task has enough completion evidence to be closed, without changing case state directly. |
| Owner Module | Task Module |
| Inputs | Task reference, completion evidence, linked case or document reference, caller role. |
| Resources Used | `task://{taskId}`; `case://{caseId}/tasks`; `document://{documentId}/extraction` when linked and authorized. |
| Tools Used | `task_complete`; `document_get_extraction` when evidence context is needed. |
| Outputs | Closure-readiness summary, missing evidence, dependency warnings, confirmation prompt for allowed closure. |
| Who Can Invoke | Task owner or operations user with tenant access. |
| Approval Requirements | Task closure does not substitute for document acceptance, broker assignment approval, or final submission approval. |
| Possible Failure Conditions | Missing evidence, unresolved dependency, caller lacks ownership, linked document still provisional. |
| Widgets Supported | Task Detail, Document Readiness, Case Timeline. |
| Future Enhancements | Evidence-quality scoring and task dependency visualization. |

### 4.8 Approval Module

#### Prompt Name: `approval_readiness_assistant`

| Field | Definition |
| --- | --- |
| Purpose | Prepare a clear approval request package for broker assignment, document acceptance, or final submission readiness. |
| Owner Module | Approval Module |
| Inputs | Approval subject, case reference, evidence references, required authority, expiry guidance, rationale draft. |
| Resources Used | `approval://{approvalId}` when existing; `case://{caseId}/approvals`; `case://{caseId}/summary`; `case://{caseId}/documents`; `case://{caseId}/broker-assignment`. |
| Tools Used | `approval_request`; `approval_get_status`; domain preparation tools such as `broker_prepare_assignment` or `document_request_review` when required. |
| Outputs | Approval package summary, evidence references, missing prerequisites, approver authority requirement, blocked-state explanation. |
| Who Can Invoke | Operations users and reviewers authorized to request approvals. |
| Approval Requirements | Creating an approval request requires explicit confirmation. The prompt cannot approve, reject, or supersede a decision. |
| Possible Failure Conditions | Required evidence missing, approval already active, approver authority undefined, expired prerequisite, tenant mismatch. |
| Widgets Supported | Approval Queue, Approval Decision View, Broker Assignment Preview, Document Readiness. |
| Future Enhancements | Multi-party approval preparation and conditional approval support. |

#### Prompt Name: `approval_decision_summary`

| Field | Definition |
| --- | --- |
| Purpose | Summarize an approval request and existing decision history for an authorized approver. |
| Owner Module | Approval Module |
| Inputs | Approval reference, case reference, approver identity, decision context. |
| Resources Used | `approval://{approvalId}`; `case://{caseId}/approvals`; `audit://case/{caseId}` when authorized. |
| Tools Used | `approval_get_status`; `approval_decide` only after explicit approver decision and confirmation. |
| Outputs | Decision-ready summary, evidence list, prior decision history, expiry status, confirmation result when a decision is recorded. |
| Who Can Invoke | Authorized approver with delegated role and relevant approval scope. |
| Approval Requirements | The approver must explicitly choose approve or reject with rationale. Prompt cannot infer a decision. |
| Possible Failure Conditions | Unauthorized approver, expired approval request, duplicate decision, missing rationale, superseded request. |
| Widgets Supported | Approval Decision View, Approval Queue, Audit Timeline. |
| Future Enhancements | Delegation policy explanations and expiring approval reminders. |

### 4.9 Notification Module

#### Prompt Name: `notification_composition_assistant`

| Field | Definition |
| --- | --- |
| Purpose | Prepare notification intent that respects consent, channel eligibility, approved templates, and tenant policy. |
| Owner Module | Notification Module |
| Inputs | Recipient reference, case reference, notification purpose, channel preference, event or task context. |
| Resources Used | `case://{caseId}/notifications`; `client://{clientId}/communication-history`; `client://{clientId}/preferences`. |
| Tools Used | `notification_get_status`; `notification_update_preference`; notification dispatch tools only when implemented, approved, and confirmed. |
| Outputs | Notification intent summary, recipient eligibility status, channel constraints, template guidance, delivery-readiness notes. |
| Who Can Invoke | Operations users with case access; clients for preference-related assistance. |
| Approval Requirements | Explicit confirmation required before any notification action. Notifications only follow approved event or workflow intent. |
| Possible Failure Conditions | Consent missing, channel blocked, template unavailable, recipient unauthorized, n8n unavailable. |
| Widgets Supported | Notification Preferences, Communication History, Client Action Checklist. |
| Future Enhancements | Localization, tenant-governed template libraries, additional delivery channels. |

#### Prompt Name: `notification_delivery_followup`

| Field | Definition |
| --- | --- |
| Purpose | Explain delivery status and recommend safe follow-up for failed or pending notifications. |
| Owner Module | Notification Module |
| Inputs | Notification reference, case reference, recipient reference, delivery status, retry request. |
| Resources Used | `case://{caseId}/notifications`; `client://{clientId}/communication-history`; `task://{taskId}` when linked. |
| Tools Used | `notification_get_status`; `notification_retry`; `task_create` when confirmed. |
| Outputs | Delivery summary, failure reason, retry eligibility, alternate channel notes, follow-up task recommendation. |
| Who Can Invoke | Operations users with case access; client users only for their own communication history where permitted. |
| Approval Requirements | Retry requires explicit confirmation and must pass consent and channel checks. Delivery outcome never advances case state. |
| Possible Failure Conditions | Retry limit reached, consent revoked, provider failure, recipient no longer authorized, tenant policy blocks channel. |
| Widgets Supported | Communication History, Notification Preferences, Task Worklist. |
| Future Enhancements | Provider health-aware routing and delivery analytics. |

### 4.10 Audit & Observability Module

#### Prompt Name: `audit_case_history_summary`

| Field | Definition |
| --- | --- |
| Purpose | Summarize authorized case audit history for investigation, compliance review, or operational context. |
| Owner Module | Audit & Observability Module |
| Inputs | Case reference, time window, event types, caller role, requested detail level. |
| Resources Used | `audit://case/{caseId}`; `case://{caseId}/timeline`; `case://{caseId}/approvals`. |
| Tools Used | `audit_get_case_history`; `case_get_timeline`; `approval_get_status` when needed. |
| Outputs | Chronological audit summary, actor and correlation references, sensitive-action highlights, approval history summary. |
| Who Can Invoke | Authorized operations, compliance, audit, or administrator roles with `audit:read`. |
| Approval Requirements | None for authorized read. Prompt must not expose hidden information to users without audit scope. |
| Possible Failure Conditions | Caller lacks `audit:read`, audit records unavailable, time window too broad, records contain restricted data. |
| Widgets Supported | Audit Timeline, Case Timeline, Approval Decision View. |
| Future Enhancements | Export-ready compliance summaries and retention-aware audit filtering. |

#### Prompt Name: `operational_incident_summary`

| Field | Definition |
| --- | --- |
| Purpose | Summarize dependency health, errors, retries, and affected workflows during an operational incident. |
| Owner Module | Audit & Observability Module |
| Inputs | Incident window, dependency name, tenant or case scope when authorized, severity level. |
| Resources Used | `observability://health`; `audit://case/{caseId}` when case-scoped and authorized. |
| Tools Used | `observability_get_health`; `observability_get_metrics`; `audit_get_case_history` when needed. |
| Outputs | Incident timeline, affected capabilities, retry and failure summary, recommended operational follow-up. |
| Who Can Invoke | Authorized operations, administrator, and incident-response users. |
| Approval Requirements | None for read-only incident summary. Any recovery mutation must use the owning module's guarded tools. |
| Possible Failure Conditions | Metrics unavailable, caller lacks platform visibility, dependency status stale, tenant scope ambiguous. |
| Widgets Supported | Dependency Health Dashboard, Audit Timeline, Operations Queue. |
| Future Enhancements | Service-level objective summaries, anomaly detection, and incident evidence packages. |

## 5. Prompt Lifecycle

Prompts follow a governed reasoning and action lifecycle:

User
  ->
Prompt
  ->
Resources
  ->
AI Reasoning
  ->
Tools, if required and authorized
  ->
Response
  ->
Widgets

Lifecycle rules:

- The user initiates a bounded request through an MCP AI client, portal, or widget.
- The prompt identifies the owner module, caller role, tenant boundary, and the minimum context needed.
- The AI retrieves authorized Resources before making claims about case state, policy, documents, approvals, tasks, notifications, or audit history.
- AI reasoning separates user-provided facts, retrieved policy evidence, OCR extraction, operational status, and recommendations.
- Tools are invoked only when required for the next allowed action. Mutation-capable tools require explicit user confirmation and server-side authorization.
- The response cites retrieved information, explains uncertainty, identifies approval gates, and stops when the requested task is complete.
- Widgets render structured results and may initiate follow-up tool calls only through visible user action.

## 6. Prompt Safety Rules

### Never

- Give legal advice.
- Guarantee approval, timing, eligibility, or outcome.
- Guess missing data.
- Bypass authorization, tenant isolation, role checks, scope checks, or approval gates.
- Expose hidden information, internal notes, raw document content, secrets, access tokens, or another tenant's data.
- Modify state without Tools.
- Call restricted Tools or imply a restricted Tool succeeded.
- Treat OCR extraction as verified evidence.
- Treat policy retrieval as a legal determination.
- Treat task completion as case progression.
- Emit events or tell downstream systems to act directly.

### Always

- Explain uncertainty and identify incomplete, stale, conflicting, or unreviewed information.
- Cite sources for policy evidence, document extraction, audit history, and operational status.
- Ask clarifying questions when required for the next safe action.
- Respect approval workflow for broker assignment, document acceptance, and final submission.
- Protect sensitive information and minimize PII in conversational output.
- Keep client-facing responses separate from internal operations context.
- Use authorized Resources before summarizing protected state.
- Require explicit user confirmation before invoking mutation-capable tools.
- Stop after completing the requested workflow.

## 7. Cross Prompt Rules

Prompts have strict cross-capability boundaries:

- Prompts never call other Prompts.
- Prompts may use Resources through the client when the caller is authorized.
- Prompts may invoke Tools only when required, allowed, and confirmed where state could change.
- Prompts never modify databases directly.
- Prompts never emit Events.
- Prompts never bypass Services.
- Prompts never bypass Guards.
- Prompts never depend on widget state as authoritative data.
- Prompts never infer tenant, role, scope, consent, or approval from conversation alone.
- Prompts never expand into unrelated case workflows after the requested task is complete.

## 8. High-Risk Prompts

High-risk prompts require additional safeguards because their outputs may influence consequential decisions.

### Visa Eligibility

Eligibility prompts must retrieve policy evidence, cite sources, surface freshness status, and distinguish policy information from operational recommendations. They must not state that an applicant is legally eligible, guaranteed to qualify, or guaranteed to be approved. When facts are missing, the prompt asks only for facts required to proceed.

Additional safeguards:

- Require destination, nationality, residence, travel purpose, and timing before meaningful guidance.
- Flag stale, conflicting, unreviewed, or absent policy sources.
- Encourage operational or legal review where uncertainty exists.
- Avoid storing or repeating unnecessary personal history in conversation.

### Document Review

Document prompts operate on metadata and OCR extraction results, not raw binary content unless an authorized review tool explicitly provides viewable context. OCR output is provisional until reviewed and accepted by an authorized human.

Additional safeguards:

- Label extracted values as missing, ambiguous, extracted, or human-verified.
- Cite extraction source and confidence where available.
- Never mark a document accepted.
- Route acceptance through Approval Module workflow.
- Avoid reproducing full identity documents or sensitive values unless required and authorized.

### Approvals

Approval prompts prepare context and summarize decision history. They do not approve, reject, supersede, or infer decisions. An approver must explicitly decide with rationale through the Approval Module's guarded tool.

Additional safeguards:

- Verify approval request status, expiry, subject, evidence references, and required authority.
- Require explicit approver confirmation before decision tooling.
- Preserve immutable decision history.
- Explain blocked states without offering workarounds.

### Submission Readiness

Submission-readiness prompts verify checklist completeness, policy freshness, consent, document acceptance, broker status when relevant, open tasks, and approval prerequisites. They do not execute submission and do not imply submission will succeed.

Additional safeguards:

- Treat readiness as a review package, not a final decision.
- Require human final-submission approval before any external submission tool can be used.
- Cite the case snapshot, policy evidence, document acceptance status, and approval state.
- Surface unresolved tasks and stale policy evidence as blockers.

### Broker Assignment

Broker prompts prepare least-privilege handoff previews and assignment readiness. They must not assign a broker based on AI inference alone.

Additional safeguards:

- Confirm broker eligibility, jurisdiction coverage, and minimum-necessary data.
- Request approval before assignment.
- Validate active approval before any assignment tool.
- Mask client details not needed for broker work.

### Policy Retrieval

Policy prompts summarize retrieved knowledge but do not certify completeness, legal validity, or operational readiness by themselves.

Additional safeguards:

- Cite source URL or source reference, published date when available, retrieved date, review status, and freshness status.
- Warn when sources are stale, conflicting, missing, or unreviewed.
- Avoid using Firecrawl output directly until reviewed and indexed according to policy workflow.
- Prefer concise evidence summaries over broad policy paraphrase.

## 9. Future Prompt Families

The following prompt families are excluded from the hackathon scope. They may be added only after their owning module, governance model, data contracts, authorization requirements, and tests are defined.

| Future Prompt Family | Possible Owner | Reason Excluded Now |
| --- | --- | --- |
| Analytics Assistant | Future Analytics Module | Requires tenant-governed aggregation, privacy controls, and reporting definitions. |
| Admin Assistant | Future Administration Module | Requires mature tenant configuration, delegated role policy, and admin audit controls. |
| Billing Assistant | Future Billing Module | Introduces financial-record governance outside the core visa workflow. |
| AI Recommendations | Future Analytics or Operations capability | Requires explainability, quality controls, bias review, and strict human decision boundaries. |
| Compliance Reports | Future Reporting and Compliance Export Module | Depends on settled audit contracts, retention policy, and approved report consumers. |
| External Submission Assistant | Future Submissions Module | Requires mature submission-readiness validation, legal review, recovery controls, and final approval enforcement. |
| Policy Change Impact Assistant | Future Policy Knowledge expansion | Requires reviewed policy diffing, source quality scoring, and affected-case governance. |

Future prompts must preserve the same boundaries: Resources provide authorized context, Tools perform governed actions, Widgets present visible state, Services own business rules, Events follow committed changes, and humans retain authority over consequential decisions.
