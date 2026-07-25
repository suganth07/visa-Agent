# Visa Agent Widget Architecture

## 1. Purpose

MCP Widgets are governed presentation surfaces for Visa Agent. They render structured outputs from MCP tools and resources in the Client Portal, Operations Portal, and supported AI clients. A widget helps a user understand a case, document, task, approval, policy source, notification, or audit trail without turning the user interface into the owner of business state.

Widgets exist beside, but separate from, other MCP capabilities:

| Capability | Primary Responsibility | State Authority |
| --- | --- | --- |
| Tools | Perform bounded, authorized reads or user-confirmed actions. | Invoke domain services; do not own domain rules. |
| Resources | Expose stable, read-oriented case, policy, document, task, approval, notification, or audit snapshots. | Read models only. |
| Prompts | Provide reusable AI workflow guidance with safety and escalation boundaries. | Instruction only; cannot override guards or approvals. |
| Widgets | Visualize structured data and collect visible, user-triggered follow-up intent. | Presentation only. |

Widgets only visualize data because Visa Agent is a regulated case-management platform with mandatory tenant isolation, role-based authorization, auditability, and human approval gates. A widget may display a state, a recommendation, a freshness warning, or a pending approval. It may not decide that the state has changed.

Widgets never own business logic. Case transitions belong to the Visa Case Module. Document acceptance belongs to the Documents Module and Approval Module. Broker assignment belongs to the Broker Module and Approval Module. Policy freshness belongs to the Policy Knowledge Module. Notifications belong to the Notification Module. Audit history belongs to the Audit & Observability Module.

Widgets never modify databases directly. All persistent changes must go through authorized MCP tools, domain services, server-side guards, audit recording, and, where required, approval-state verification. Widget visibility is never an authorization mechanism.

## 2. Widget Design Principles

Visa Agent widgets follow these principles:

| Principle | Requirement |
| --- | --- |
| Reusable | A widget must be driven by a versioned data contract and reusable across portals or AI clients when the caller has the same authorization level. |
| Stateless | Persistent domain state stays in services and MongoDB. Widget state is limited to presentation choices such as active tab, filters, sorting, and expanded rows. |
| Accessible | Widgets must support keyboard navigation, readable labels, focus states, screen-reader semantics, touch targets, reduced motion, and color-independent status communication. |
| Responsive | Widgets must adapt to inline, expanded, full-screen, desktop, tablet, and mobile host constraints without hiding required decision context. |
| Secure | Widgets must not expose secrets, raw document binaries, tokens, provider payloads, broad personal profiles, or unauthorized internal notes. |
| Tenant-aware | Every resource and tool response must be scoped by tenant and caller identity before it reaches the widget. |
| Read-only by default | Widget rendering is passive unless the user performs an explicit visible action. |
| Tool-driven interactions | Mutating interactions invoke authorized tools only after clear user intent and server-side validation. |
| Resource-backed data | Displayed case, document, task, policy, approval, notification, and audit data should come from stable resources or tool outputs shaped as read models. |
| Approval-aware | Broker assignment, document acceptance, and final submission states must clearly show when approval is required, pending, rejected, expired, or active. |
| Error tolerant | Widgets must handle partial data, stale data, unauthorized access, dependency failure, and retryable errors without fabricating certainty. |
| Loading states | Every widget must indicate initial load, refresh, and action-in-progress states. |
| Empty states | Empty states must explain what is absent and what authorized next action is available, if any. |

## 3. Widget Categories

| Category | Purpose | Representative Widgets |
| --- | --- | --- |
| Dashboard Widgets | Summarize queue, health, freshness, and operational workload signals. | Operations Queue, Policy Freshness Dashboard, Dependency Health Dashboard |
| Case Widgets | Present case status, milestones, timeline, participants, and next actions. | Case Summary, Case Timeline, Client Case Summary |
| Document Widgets | Present document requests, upload status, OCR extraction, review findings, and acceptance state. | Document Readiness, Extraction Review |
| Approval Widgets | Present approval requests, evidence references, expiry, decisions, and rationale. | Approval Queue, Approval Decision View |
| Task Widgets | Present assigned work, due dates, dependencies, escalation state, and completion evidence. | Task Worklist, Task Detail |
| Broker Widgets | Present eligible broker context, assignment preview, approval status, and handoff tracking. | Broker Assignment Preview, Broker Handoff Status |
| Policy Widgets | Present attributed policy evidence, jurisdiction filters, freshness, and review state. | Policy Evidence Panel, Policy Freshness Dashboard |
| Notification Widgets | Present consent, communication preferences, delivery history, failures, and retry status. | Notification Preferences, Communication History |
| Audit Widgets | Present append-only case history, sensitive reads, mutations, approvals, denials, and dependency status. | Audit Timeline, Dependency Health Dashboard |

## 4. Widget Catalog

The catalog below follows the provisional MCP ownership defined in `docs/MODULES.md`. Names, resources, tools, and prompts are planning contracts until implemented, and every eventual contract must satisfy `ARCHITECTURE.md`.

### 4.1 Visa Case Module

#### Case Summary

| Field | Definition |
| --- | --- |
| Widget Name | Case Summary |
| Purpose | Displays the current visa case overview for an authorized user. |
| Owner Module | Visa Case Module |
| Resources Used | `case://{caseId}/summary` |
| Tools Used | `case_get`, `case_update` for authorized refresh or permitted non-final updates |
| Prompts Used | `case_intake_assistant` |
| Displayed Information | Case status, applicant and participant summary, destination, purpose, lifecycle stage, milestones, approval-gated blockers, next allowable actions, correlation context, and role-safe notes. |
| Supported Actions | Refresh summary, open timeline, continue intake, request permitted case update, invoke intake assistance. |
| Refresh Strategy | Load on open, refresh after case lifecycle events, refresh after user-triggered case actions, and show stale-state indicators when the read model is older than the current event watermark. |
| Loading State | Show case identity shell, status placeholder, milestone placeholders, and disabled actions. |
| Empty State | State that no case summary is available or that intake has not started; offer case-start or intake continuation only when authorized. |
| Error State | Show tenant-safe failure message, correlation ID, retry option, and no internal stack trace. |
| Authorization Requirements | OAuth 2.1, tenant validation, case participant or authorized operations access, and `case:read`; `case:write` for permitted updates. |
| Future Enhancements | Jurisdiction-specific case templates, service-level indicators, controlled case transfer summary, and role-specific summary variants. |

#### Case Timeline

| Field | Definition |
| --- | --- |
| Widget Name | Case Timeline |
| Purpose | Displays lifecycle milestones, requested actions, decisions, and role-safe event history for a case. |
| Owner Module | Visa Case Module |
| Resources Used | `case://{caseId}/timeline` |
| Tools Used | `case_get`, `case_update` for authorized transition-related views only |
| Prompts Used | `case_intake_assistant` |
| Displayed Information | Milestones, status changes, information requests, approval states, document review events, broker assignment markers, submission readiness markers, timestamps, actors where allowed, and current blockers. |
| Supported Actions | Refresh timeline, filter by event type, open related document/task/approval, continue intake where permitted. |
| Refresh Strategy | Refresh on open, after `case.status_changed`, `case.information_requested`, approval events, document review events, broker events, and task events. |
| Loading State | Show ordered timeline placeholders and disabled filters. |
| Empty State | State that no milestones are recorded yet and show the initial intake state where authorized. |
| Error State | Preserve any already loaded safe timeline entries, mark refresh failure, and offer retry with correlation ID. |
| Authorization Requirements | OAuth 2.1, tenant validation, `case:read`, and role-safe filtering; sensitive entries require operations authorization. |
| Future Enhancements | Timeline comparison by snapshot, lifecycle variance by jurisdiction, and exportable audit-linked milestone view. |

### 4.2 Client Module

#### Client Case Summary

| Field | Definition |
| --- | --- |
| Widget Name | Client Case Summary |
| Purpose | Presents a client-safe view of case progress, required next actions, and expected preparation steps. |
| Owner Module | Client Module |
| Resources Used | `case://{caseId}/client-summary`, `client://{clientId}/preferences` |
| Tools Used | `client_get_case_view`, `client_update_preferences` |
| Prompts Used | `client_next_steps_assistant` |
| Displayed Information | Case status, milestones, client-visible document requests, consent status, communication preferences, next actions, policy guidance summary, and approved notifications. |
| Supported Actions | Refresh, update communication preferences, open action checklist, ask for next-step assistance, respond to permitted requests. |
| Refresh Strategy | Refresh on client login, after preference changes, after information requests, after document-review outcomes, and after approved notification events. |
| Loading State | Show client-safe case shell, milestone placeholders, and preference placeholder. |
| Empty State | Explain that no active case is available or that invitation/consent is pending. |
| Error State | Show safe message, retry option, and support correlation ID without exposing internal operations notes. |
| Authorization Requirements | OAuth 2.1, tenant validation, client identity, case-participant authorization, and `case:read`; `case:write` for permitted client updates. |
| Future Enhancements | Delegated family representative views, multilingual summaries, and privacy-preserving client experience metrics. |

#### Client Action Checklist

| Field | Definition |
| --- | --- |
| Widget Name | Client Action Checklist |
| Purpose | Shows outstanding client actions such as consent, information requests, document requests, and requested corrections. |
| Owner Module | Client Module |
| Resources Used | `case://{caseId}/client-summary`, `case://{caseId}/documents`, `client://{clientId}/preferences` |
| Tools Used | `client_respond_to_request`, `document_upload`, `client_update_preferences` |
| Prompts Used | `client_next_steps_assistant` |
| Displayed Information | Action labels, due dates where available, evidence requirements, upload status, correction requests, consent state, completion state, and dependency notes. |
| Supported Actions | Refresh, upload requested document through the approved document tool, respond to information request, update preferences, request next-step explanation. |
| Refresh Strategy | Refresh after client responses, document uploads, document review outcomes, and new information-request events. |
| Loading State | Show checklist skeleton with disabled action controls. |
| Empty State | State that there are no current client actions and show the current case milestone. |
| Error State | Keep existing checklist visible when possible, mark failed sections, and provide retry. |
| Authorization Requirements | OAuth 2.1, tenant validation, client case authorization, `case:read`, `case:write` for responses, and `document:write` for uploads. |
| Future Enhancements | Localized checklist labels, family-member grouping, reminder preferences, and mobile-first upload guidance. |

### 4.3 Operations Module

#### Operations Queue

| Field | Definition |
| --- | --- |
| Widget Name | Operations Queue |
| Purpose | Provides an operations work queue with priority, ownership, blockers, and exception signals. |
| Owner Module | Operations Module |
| Resources Used | `operations://queue` |
| Tools Used | `operations_get_queue`, `operations_review_case`, `operations_request_information`, `task_assign` |
| Prompts Used | `operations_case_triage`, `task_prioritization_assistant` |
| Displayed Information | Case identifiers, lifecycle status, priority, assigned owner, overdue tasks, missing evidence, approval blockers, document review status, policy freshness warnings, and exception flags. |
| Supported Actions | Refresh queue, filter and sort, open case review workspace, assign permitted tasks, request triage assistance, request information where authorized. |
| Refresh Strategy | Refresh on queue open, polling or event-driven update for queue changes, and immediate refresh after assignment or request-for-information actions. |
| Loading State | Show queue columns and row placeholders with filters disabled. |
| Empty State | State that no cases match the current filter and offer filter reset. |
| Error State | Show partial cached queue if available, failed-refresh banner, retry, and correlation ID. |
| Authorization Requirements | OAuth 2.1, tenant validation, operations role, `case:read`; `case:write` for review and information requests; relevant document scopes when document status is displayed. |
| Future Enhancements | Workload balancing, saved queue views, quality-assurance sampling, and capacity indicators. |

#### Case Review Workspace

| Field | Definition |
| --- | --- |
| Widget Name | Case Review Workspace |
| Purpose | Provides an operations-safe workspace for reviewing case readiness, blockers, documents, policy evidence, tasks, and approval prerequisites. |
| Owner Module | Operations Module |
| Resources Used | `operations://case/{caseId}/review`, `case://{caseId}/summary`, `case://{caseId}/documents`, `case://{caseId}/tasks`, `case://{caseId}/approvals`, `policy://freshness/{destination}` |
| Tools Used | `operations_review_case`, `operations_request_information`, `task_create`, `approval_request`, `policy_search` |
| Prompts Used | `operations_case_triage`, `approval_readiness_assistant`, `policy_evidence_summary` |
| Displayed Information | Review checklist, readiness gaps, document findings, outstanding tasks, approval requirements, policy freshness, internal operations notes where authorized, and allowable next actions. |
| Supported Actions | Refresh, request information, create task, request approval, search policy evidence, invoke triage assistance, open related widgets. |
| Refresh Strategy | Refresh after case review actions, task changes, document review changes, approval decisions, and policy source updates. |
| Loading State | Show section placeholders for case, documents, tasks, approvals, and policy. |
| Empty State | State that no review package is available or no review findings exist yet. |
| Error State | Isolate failing sections, preserve loaded sections, and show correlation IDs per failed data source. |
| Authorization Requirements | OAuth 2.1, tenant validation, operations role, `case:read`, `case:write` for controlled operations actions, and relevant document or approval scopes. |
| Future Enhancements | Jurisdiction-specific review templates, automated readiness scoring as advisory only, and controlled escalation pathways. |

### 4.4 Documents Module

#### Document Readiness

| Field | Definition |
| --- | --- |
| Widget Name | Document Readiness |
| Purpose | Shows document requests, upload status, review state, corrections, and acceptance prerequisites for a case. |
| Owner Module | Documents Module |
| Resources Used | `case://{caseId}/documents`, `document://{documentId}/extraction` |
| Tools Used | `document_upload`, `document_get_extraction`, `document_request_review` |
| Prompts Used | `document_readiness_review` |
| Displayed Information | Required documents, received documents, missing evidence, OCR status, review findings, validation warnings, acceptance approval state, retention metadata where allowed, and requested corrections. |
| Supported Actions | Refresh, upload document, open extraction review, request document review, invoke readiness assistance. |
| Refresh Strategy | Refresh after upload, OCR completion, review request, approval decision, correction request, and document status events. |
| Loading State | Show document checklist placeholders and upload-disabled state until authorization is known. |
| Empty State | State that no document requests exist yet or that no documents have been uploaded. |
| Error State | Show failed document sections without exposing raw provider errors or document contents. |
| Authorization Requirements | OAuth 2.1, tenant and case validation, `document:read` for metadata and extraction visibility, `document:write` for upload or review request, and `document:approve` only for acceptance decisions through approval tools. |
| Future Enhancements | Configurable evidence rules, duplicate detection, multi-document consistency checks, and retention automation indicators. |

#### Extraction Review

| Field | Definition |
| --- | --- |
| Widget Name | Extraction Review |
| Purpose | Presents OCR extraction results as provisional evidence requiring authorized human review. |
| Owner Module | Documents Module |
| Resources Used | `document://{documentId}/extraction`, `case://{caseId}/documents` |
| Tools Used | `document_get_extraction`, `document_request_review`, `approval_request` |
| Prompts Used | `document_readiness_review`, `approval_readiness_assistant` |
| Displayed Information | Extracted fields, confidence, missing and ambiguous values, provenance, review status, validation findings, source references, acceptance approval requirement, and review rationale where allowed. |
| Supported Actions | Refresh extraction, request review, prepare acceptance approval request, open related audit or task context, invoke readiness assistance. |
| Refresh Strategy | Refresh after OCR completion, review findings, approval request creation, approval decision, and validation updates. |
| Loading State | Show extraction field placeholders and confidence placeholders. |
| Empty State | State that extraction is not available, not started, failed, or not applicable. |
| Error State | Clearly distinguish OCR provider failure, unavailable extraction, unauthorized access, and stale extraction. |
| Authorization Requirements | OAuth 2.1, tenant and case validation, `document:read`; `document:write` for review request; acceptance requires `document:approve` and delegated approver role through Approval Module. |
| Future Enhancements | Field-level comparison against original source view, confidence trend monitoring, reviewer sampling, and document-type classifier signals. |

### 4.5 Policy Knowledge Module

#### Policy Evidence Panel

| Field | Definition |
| --- | --- |
| Widget Name | Policy Evidence Panel |
| Purpose | Displays attributed, freshness-aware policy evidence relevant to a case, destination, or visa scenario. |
| Owner Module | Policy Knowledge Module |
| Resources Used | `policy://jurisdiction/{destination}`, `policy://freshness/{destination}` |
| Tools Used | `policy_search`, `policy_get_sources`, `policy_request_review` |
| Prompts Used | `visa_eligibility_intake`, `policy_evidence_summary` |
| Displayed Information | Jurisdiction, source summaries, citations, source URLs where allowed, published and retrieved dates, reviewed date, freshness state, confidence, conflicts, missing context, and warnings against unsupported legal conclusions. |
| Supported Actions | Refresh evidence, search policy, view source metadata, request policy review, invoke evidence summary or eligibility intake assistance. |
| Refresh Strategy | Cache non-sensitive policy reads with bounded freshness, refresh on destination/context change, and refresh after policy source or index events. |
| Loading State | Show evidence placeholders, source placeholders, and freshness placeholder. |
| Empty State | State that no reviewed policy evidence is available for the destination or filters. |
| Error State | Show retrieval failure, stale-source warning, or incomplete-source warning without fabricating guidance. |
| Authorization Requirements | OAuth 2.1, tenant-aware policy access, `case:read` for case-contextual retrieval, and `policy:manage` plus policy-reviewer role for review requests or publication workflow. |
| Future Enhancements | Source-quality scoring, policy change comparison, jurisdiction coverage map, and reviewer queue links. |

#### Policy Freshness Dashboard

| Field | Definition |
| --- | --- |
| Widget Name | Policy Freshness Dashboard |
| Purpose | Shows policy-source freshness, review state, indexing state, and operational policy risks. |
| Owner Module | Policy Knowledge Module |
| Resources Used | `policy://freshness/{destination}` |
| Tools Used | `policy_get_sources`, `policy_request_review` |
| Prompts Used | `policy_evidence_summary`, `operations_case_triage` |
| Displayed Information | Jurisdictions, source freshness, ingestion state, review state, last retrieved date, last reviewed date, index refresh status, stale sources, conflicting sources, and policy-review tasks. |
| Supported Actions | Refresh dashboard, filter by jurisdiction, open source evidence, request policy review, invoke freshness-risk summary. |
| Refresh Strategy | Refresh on open, after `policy.source_updated`, after `policy.index_refreshed`, and after policy review workflow changes. |
| Loading State | Show dashboard metric placeholders and jurisdiction row placeholders. |
| Empty State | State that no policy sources match the selected filters or no sources have been configured. |
| Error State | Show partial freshness data with failed-source indicators and retry option. |
| Authorization Requirements | OAuth 2.1, tenant validation, operations or policy-reviewer role, and `policy:manage` for review-management actions. |
| Future Enhancements | Freshness service-level objectives, change diffing, reviewer capacity indicators, and source-quality trends. |

### 4.6 Broker Module

#### Broker Assignment Preview

| Field | Definition |
| --- | --- |
| Widget Name | Broker Assignment Preview |
| Purpose | Displays a minimum-necessary broker assignment preview before approval and assignment execution. |
| Owner Module | Broker Module |
| Resources Used | `case://{caseId}/broker-assignment`, `broker://{brokerId}/profile`, `case://{caseId}/approvals` |
| Tools Used | `broker_get_eligible`, `broker_prepare_assignment`, `approval_request`, `broker_assign` only when active approval exists |
| Prompts Used | `broker_handoff_preparation`, `approval_readiness_assistant` |
| Displayed Information | Eligible brokers, jurisdiction fit, handoff summary, minimum-necessary case references, required approval state, approval expiry, blocked reasons, and assignment readiness. |
| Supported Actions | Refresh, view eligible brokers, prepare assignment preview, request broker-assignment approval, execute approved assignment, invoke handoff preparation assistance. |
| Refresh Strategy | Refresh after broker eligibility updates, assignment preview preparation, approval request creation, approval decision, and assignment events. |
| Loading State | Show broker list placeholders, approval-state placeholder, and disabled assignment controls. |
| Empty State | State that no eligible brokers are available or that assignment preparation is blocked. |
| Error State | Show safe failure with no excess applicant detail and no provider-specific payload. |
| Authorization Requirements | OAuth 2.1, tenant validation, `case:read`, `broker:assign`; active approval is mandatory before assignment execution. |
| Future Enhancements | Broker capacity, quality measures, jurisdiction-specific eligibility rules, and secure broker portal readiness. |

#### Broker Handoff Status

| Field | Definition |
| --- | --- |
| Widget Name | Broker Handoff Status |
| Purpose | Tracks approved broker assignment status and broker response progress. |
| Owner Module | Broker Module |
| Resources Used | `case://{caseId}/broker-assignment`, `broker://{brokerId}/profile`, `case://{caseId}/notifications` |
| Tools Used | `broker_get_eligible`, `broker_prepare_assignment`, `notification_get_status` |
| Prompts Used | `broker_handoff_preparation`, `notification_composition_assistant` |
| Displayed Information | Assigned broker, handoff status, approved handoff references, notification delivery state, broker response status, pending follow-up tasks, and audit-linked assignment timestamps. |
| Supported Actions | Refresh, open broker profile, view notification status, create follow-up task through task workflow where authorized, invoke handoff summary. |
| Refresh Strategy | Refresh after broker assignment, notification delivery updates, broker response events, and task updates. |
| Loading State | Show assignment shell and delivery placeholders. |
| Empty State | State that no broker has been assigned or that approval is still required. |
| Error State | Show assignment status if known and mark broker response or notification subsections as unavailable. |
| Authorization Requirements | OAuth 2.1, tenant validation, operations or broker-authorized access, `case:read`, and `broker:assign` for assignment-related operational actions. |
| Future Enhancements | Broker response service levels, secure broker portal links, and broker-capacity monitoring. |

### 4.7 Task Module

#### Task Worklist

| Field | Definition |
| --- | --- |
| Widget Name | Task Worklist |
| Purpose | Displays authorized tasks across cases with priority, ownership, due dates, dependencies, and escalation state. |
| Owner Module | Task Module |
| Resources Used | `case://{caseId}/tasks`, `task://{taskId}` |
| Tools Used | `task_create`, `task_assign`, `task_complete` |
| Prompts Used | `task_prioritization_assistant`, `operations_case_triage` |
| Displayed Information | Task title, case reference, owner, due date, priority, dependency, escalation status, completion evidence status, and linked entity. |
| Supported Actions | Refresh, filter and sort, assign task, complete task with evidence through the task tool, open task detail, request prioritization assistance. |
| Refresh Strategy | Refresh on open, after task events, after assignment/completion actions, and after case/document/approval events that create or unblock tasks. |
| Loading State | Show worklist row placeholders and disabled bulk controls. |
| Empty State | State that no tasks match the filter or no tasks are assigned. |
| Error State | Show cached rows where possible, failed-refresh message, retry, and correlation ID. |
| Authorization Requirements | OAuth 2.1, tenant and task-access validation, `case:read` for visibility, `case:write` for permitted task actions, and operations role for queue-level assignment or escalation. |
| Future Enhancements | Service-level agreement rules, workload balancing, calendar-aware due dates, and automation-assisted suggestions. |

#### Task Detail

| Field | Definition |
| --- | --- |
| Widget Name | Task Detail |
| Purpose | Shows a single task's context, ownership, evidence, dependencies, and permitted actions. |
| Owner Module | Task Module |
| Resources Used | `task://{taskId}`, `case://{caseId}/tasks`, `case://{caseId}/summary` |
| Tools Used | `task_assign`, `task_complete`, `task_create` for permitted linked follow-up tasks |
| Prompts Used | `task_prioritization_assistant` |
| Displayed Information | Task status, owner, due date, priority, linked case/document/approval/policy item, dependencies, escalation state, completion evidence, and audit reference. |
| Supported Actions | Refresh, assign or reassign where authorized, complete with evidence, create linked follow-up task, invoke prioritization assistance. |
| Refresh Strategy | Refresh after task mutations, linked case changes, dependency changes, and overdue events. |
| Loading State | Show task shell with action placeholders. |
| Empty State | State that the task is unavailable, deleted under retention rules, or outside authorization. |
| Error State | Show safe failure and correlation ID; do not infer completion or ownership changes. |
| Authorization Requirements | OAuth 2.1, tenant and task-access validation, `case:read`; `case:write` for task actions; operations role for assignment and escalation controls. |
| Future Enhancements | Dependency visualization, evidence quality checks, and team workload context. |

### 4.8 Approval Module

#### Approval Queue

| Field | Definition |
| --- | --- |
| Widget Name | Approval Queue |
| Purpose | Displays pending, expiring, approved, rejected, and superseded approval requests requiring delegated human authority. |
| Owner Module | Approval Module |
| Resources Used | `case://{caseId}/approvals`, `approval://{approvalId}` |
| Tools Used | `approval_get_status`, `approval_decide`, `approval_request` |
| Prompts Used | `approval_readiness_assistant`, `operations_case_triage` |
| Displayed Information | Approval subject, request type, required authority, evidence references, requester, expiry, current state, decision history, rationale, blockers, and linked case context. |
| Supported Actions | Refresh, filter by type/status/expiry, open decision view, request approval where authorized, record decision through approval tool after explicit user action. |
| Refresh Strategy | Refresh on open, after `approval.requested`, after `approval.decided`, and near approval expiry boundaries. |
| Loading State | Show queue placeholders and disabled decision controls. |
| Empty State | State that there are no approval requests matching the selected filter. |
| Error State | Show partial queue where possible, mark failed data, and never infer approval state. |
| Authorization Requirements | OAuth 2.1, tenant validation, delegated approver role for decisions, `document:approve` for document acceptance, `submission:approve` for final submission, and `broker:assign` according to tenant broker-assignment policy. |
| Future Enhancements | Delegation policies, multi-party approvals, conditional approvals, expiry reminders, and approval analytics. |

#### Approval Decision View

| Field | Definition |
| --- | --- |
| Widget Name | Approval Decision View |
| Purpose | Presents the complete decision context for a single approval request and supports an explicit human decision. |
| Owner Module | Approval Module |
| Resources Used | `approval://{approvalId}`, `case://{caseId}/approvals`, `case://{caseId}/summary`, `document://{documentId}/extraction` where applicable |
| Tools Used | `approval_get_status`, `approval_decide` |
| Prompts Used | `approval_readiness_assistant`, `document_readiness_review`, `broker_handoff_preparation` where applicable |
| Displayed Information | Approval type, required scope, current state, evidence references, stale or missing evidence warnings, expiry, prior decisions, supersession status, requester, and rationale requirements. |
| Supported Actions | Refresh, approve, reject, request clarification through permitted task or operations workflow, invoke readiness assistance. |
| Refresh Strategy | Refresh on open, before enabling decision controls, after decision attempt, after linked evidence updates, and after expiry changes. |
| Loading State | Show decision-context placeholders and disabled decision controls. |
| Empty State | State that the approval request is unavailable, expired, superseded, or outside authorization. |
| Error State | Block decision controls on uncertainty, show correlation ID, and require refresh before retrying decision. |
| Authorization Requirements | OAuth 2.1, tenant validation, delegated approver role, relevant approval scope, active request validity, and server-side approval authority validation. |
| Future Enhancements | Multi-approver routing, conditional approval language, delegated authority visualization, and decision-quality review. |

### 4.9 Notification Module

#### Notification Preferences

| Field | Definition |
| --- | --- |
| Widget Name | Notification Preferences |
| Purpose | Displays and manages client communication preferences and consent-aware notification settings. |
| Owner Module | Notification Module |
| Resources Used | `client://{clientId}/preferences`, `case://{caseId}/notifications` |
| Tools Used | `notification_get_status`, `notification_update_preference`, `client_update_preferences` |
| Prompts Used | `notification_composition_assistant`, `client_next_steps_assistant` |
| Displayed Information | Preferred channels, consent status, channel eligibility, template categories, last updated timestamp, tenant policy constraints, and delivery opt-in state. |
| Supported Actions | Refresh, update permitted preferences, view communication history, request preference explanation. |
| Refresh Strategy | Refresh on open, after preference update, after consent changes, and after notification policy changes. |
| Loading State | Show preference placeholders and disabled controls. |
| Empty State | State that no preferences are set and show permitted setup action. |
| Error State | Preserve last known preferences if available, mark update failure, and show retry with correlation ID. |
| Authorization Requirements | OAuth 2.1, tenant validation, client or authorized operations access, relevant `case:read` or `case:write`, and recipient consent independent of caller authorization. |
| Future Enhancements | Localization preferences, additional channels, tenant-specific template governance, and preference history. |

#### Communication History

| Field | Definition |
| --- | --- |
| Widget Name | Communication History |
| Purpose | Displays approved notification attempts, delivery outcomes, retries, and failures without advancing case state. |
| Owner Module | Notification Module |
| Resources Used | `case://{caseId}/notifications`, `client://{clientId}/communication-history` |
| Tools Used | `notification_get_status`, `notification_retry` |
| Prompts Used | `notification_composition_assistant`, `operational_incident_summary` for delivery incidents |
| Displayed Information | Notification intent, recipient authorization result, channel, template reference, sent timestamp, delivery status, retry state, failure category, and linked event. |
| Supported Actions | Refresh, retry failed notification where authorized and policy permits, open related case/task context, request incident summary for repeated failures. |
| Refresh Strategy | Refresh after notification delivery events, retry attempts, preference updates, and n8n callback normalization. |
| Loading State | Show history placeholders and status placeholders. |
| Empty State | State that no approved communications have been sent for the case or client. |
| Error State | Show delivery-status unavailability without implying delivery success or failure. |
| Authorization Requirements | OAuth 2.1, tenant validation, case/client authorization, relevant `case:read` or `case:write`, recipient consent, and channel eligibility. |
| Future Enhancements | Delivery analytics, localization status, template governance review, and escalation rules for repeated failures. |

### 4.10 Audit & Observability Module

#### Audit Timeline

| Field | Definition |
| --- | --- |
| Widget Name | Audit Timeline |
| Purpose | Displays append-only audit records for sensitive reads, mutations, approvals, external handoffs, authorization failures, and delivery outcomes. |
| Owner Module | Audit & Observability Module |
| Resources Used | `audit://case/{caseId}` |
| Tools Used | `audit_get_case_history` |
| Prompts Used | `operational_incident_summary` |
| Displayed Information | Audit action, entity reference, actor where authorized, tenant, result, timestamp, correlation ID, approval decision reference, external handoff marker, and denial classification. |
| Supported Actions | Refresh, filter by action/entity/result, open linked case/document/approval/task context, request incident summary where authorized. |
| Refresh Strategy | Refresh on open, after sensitive reads and mutations where visible, after approval and notification events, and during incident investigation. |
| Loading State | Show audit row placeholders and disabled filters. |
| Empty State | State that no audit records match the current filter; do not imply that no audit records exist outside authorization. |
| Error State | Show safe failure, correlation ID, and no raw logs or secrets. |
| Authorization Requirements | OAuth 2.1, tenant validation, `audit:read`, and authorized operations or administrator role. |
| Future Enhancements | Retention-aware audit export, incident evidence packages, anomaly flags, and cross-correlation views. |

#### Dependency Health Dashboard

| Field | Definition |
| --- | --- |
| Widget Name | Dependency Health Dashboard |
| Purpose | Displays governed operational health for platform dependencies and observable service conditions. |
| Owner Module | Audit & Observability Module |
| Resources Used | `observability://health` |
| Tools Used | `observability_get_health`, `observability_get_metrics` |
| Prompts Used | `operational_incident_summary` |
| Displayed Information | Dependency status for MongoDB, Qdrant, Firecrawl, OCR, document storage, n8n, notification channels, latency categories, retry/failure classifications, event delivery health, and timestamped health snapshots. |
| Supported Actions | Refresh health, filter dependencies, open incident context, request operational incident summary. |
| Refresh Strategy | Refresh on open, periodically for operations users, and after dependency health change events. |
| Loading State | Show dependency placeholders and timestamp placeholder. |
| Empty State | State that no health data is available yet or that telemetry is not configured for the selected environment. |
| Error State | Show dashboard retrieval failure without leaking provider credentials, endpoints, or stack traces. |
| Authorization Requirements | OAuth 2.1, tenant validation where applicable, authorized operations or administrator role, and `audit:read` or platform observability permission as defined by tenant policy. |
| Future Enhancements | Service-level objectives, incident runbook links, release-readiness evidence, and anomaly detection. |

## 5. Widget Lifecycle

Normal read lifecycle:

User
↓
Widget
↓
Resource
↓
Service
↓
Database or approved retrieval store
↓
Response
↓
Widget Update

User-triggered action lifecycle:

User performs a visible action
↓
Widget invokes authorized Tool
↓
Business Service validates tenant, role, scope, state, and approval requirements
↓
Service commits allowed state change
↓
Audit record is written
↓
Nitro Event is emitted after commit
↓
Widget refreshes relevant Resource or tool output

The widget may initiate the interaction, but the owning service decides whether the action is valid. Events are emitted only after committed source-of-truth changes and never authorize the change retroactively.

## 6. Widget Interaction Rules

Widgets never:

- Call databases, Qdrant, Firecrawl, OCR, document storage, n8n, or notification channels directly.
- Own case, document, task, broker, approval, notification, policy, submission, or audit state transitions.
- Bypass OAuth 2.1, tenant, role, scope, or approval-state checks.
- Emit Nitro Events directly.
- Treat hidden controls as security.
- Convert OCR output into accepted evidence.
- Convert policy evidence into legal advice or guaranteed eligibility.
- Mark broker assignment, document acceptance, or final submission as complete without active human approval.

Widgets may:

- Display resources and tool outputs shaped as read models.
- Invoke tools after visible, explicit user action.
- Invoke prompts to guide the user through allowed workflows.
- Refresh automatically after relevant events, action completion, focus changes, or bounded polling intervals.
- Maintain local presentation preferences such as sort order, filters, expanded rows, display mode, and selected tab.
- Display partial, stale, loading, empty, unauthorized, approval-pending, and error states.

## 7. High-Risk Widgets

### Approval Widgets

Approval Queue and Approval Decision View are high risk because they present consequential human decisions. Safeguards:

- Server-side delegated authority validation is mandatory before decisions.
- Decision controls remain disabled until current approval state, expiry, evidence references, and caller authority are confirmed.
- Rejections, approvals, supersessions, and expiries must be visually distinct without relying on color alone.
- Every decision must require explicit user intent and rationale where policy requires it.
- Widgets must never infer approval from a prior stale snapshot.

### Document Widgets

Document Readiness and Extraction Review are high risk because they involve personal data and provisional OCR output. Safeguards:

- Raw document binaries are never exposed through broad widget data contracts.
- OCR output is clearly labeled provisional until reviewed and accepted.
- Document acceptance requires the Approval Module and `document:approve` authority.
- Confidence, provenance, ambiguity, and missing fields must be visible.
- Errors must not leak OCR provider payloads or raw document content.

### Broker Assignment Widgets

Broker Assignment Preview and Broker Handoff Status are high risk because broker handoffs can expose sensitive case information externally. Safeguards:

- Assignment preview uses minimum-necessary case data only.
- Broker assignment execution is blocked unless active approval exists.
- Broker profile and eligibility visibility are role and tenant scoped.
- Handoff notification status must not advance case state.
- The widget must surface blocked, approval-required, and expired-approval states.

### Audit Widgets

Audit Timeline is high risk because it exposes sensitive operational history. Safeguards:

- `audit:read` and authorized operations or administrator role are required.
- Audit data is filtered by tenant and caller authority.
- Secrets, access tokens, raw documents, and broad personal profiles are excluded.
- Missing records due to authorization filtering must not be presented as proof that no record exists.
- Correlation IDs are visible for investigation without exposing internals.

### Policy Evidence Widgets

Policy Evidence Panel and Policy Freshness Dashboard are high risk because users may over-trust policy summaries. Safeguards:

- Source attribution, freshness, reviewed state, and uncertainty are always visible.
- Stale, conflicting, unreviewed, or incomplete sources must be labeled.
- Widgets must not present policy evidence as legal advice or a guaranteed outcome.
- Policy-review actions require `policy:manage` and policy-reviewer authorization.
- Jurisdiction and case-context filters must be explicit.

## 8. Widget UX Guidelines

Visa Agent widgets should feel consistent, restrained, and operationally clear. They are work surfaces, not marketing pages.

| Guideline | Requirement |
| --- | --- |
| Consistency | Use consistent naming, status vocabulary, timestamp formats, entity references, and action placement across widgets. |
| Accessibility | Support keyboard navigation, focus order, screen-reader labels, sufficient contrast, reduced-motion preferences, and large enough touch targets. |
| Performance | Prefer compact read models, bounded refresh intervals, section-level loading, and partial rendering for large queues or audit histories. |
| Responsiveness | Layouts must remain readable in inline, expanded, full-screen, mobile, tablet, and desktop contexts. |
| Minimal cognitive load | Show the current state, the blocker, and the next allowed action without requiring users to inspect unrelated modules. |
| Clear loading indicators | Distinguish initial load, refresh, and action-in-progress states. |
| Meaningful empty states | Explain what is absent, why it matters, and which authorized next action exists. |
| Readable audit history | Use chronological order, filters, correlation IDs, result labels, and stable entity references. |
| Color independence | Never rely on color alone to communicate risk, approval state, freshness, failure, or completion. |
| Secure presentation | Mask sensitive fields unless the role requires them; avoid overexposing internal notes in client-facing widgets. |
| Approval clarity | Show approval-required, approval-pending, approved, rejected, expired, and superseded states explicitly. |
| Policy clarity | Show source attribution, freshness, confidence, and uncertainty wherever policy evidence affects user decisions. |

## 9. Future Widgets

The following widgets are excluded from the hackathon scope. They may be introduced only after their owning module, governance model, data contract, authorization model, audit requirements, and visual verification approach are defined.

| Future Widget | Likely Owner | Reason Excluded Now |
| --- | --- | --- |
| Analytics Dashboard | Future Analytics Module | Requires tenant-governed aggregation, privacy controls, and reporting data contracts. |
| Billing Dashboard | Future Billing Module | Introduces financial-record requirements outside the core visa-case workflow. |
| Admin Console | Future Administration Module | Requires mature tenant provisioning, role administration, and configuration governance. |
| Compliance Dashboard | Future Reporting and Compliance Export Module | Depends on settled audit schemas, retention policy, and regulated export requirements. |
| AI Insights | Cross-module, likely Operations-governed | Requires clear boundaries so AI-generated patterns remain advisory and cannot become hidden decision logic. |
| Submission Readiness Console | Future Submissions Module | Final submission is intentionally excluded until readiness, approval enforcement, legal review, and recovery controls are mature. |
| Broker Capacity Dashboard | Broker Module future expansion | Requires broker capacity, service quality, and secure broker access models. |
| Policy Change Diff Viewer | Policy Knowledge Module future expansion | Requires reviewed source versioning and policy-change comparison workflows. |
| Incident Evidence Export | Audit & Observability future expansion | Requires export governance, retention handling, and secure evidence packaging. |

Future widgets must preserve the same boundaries: widgets visualize, tools perform authorized actions, services own business rules, MongoDB remains operational truth, Qdrant supports attributed retrieval, Nitro Events follow committed state changes, and mandatory human approval gates cannot be bypassed.
