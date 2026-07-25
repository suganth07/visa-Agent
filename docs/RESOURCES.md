# Visa Agent Resource Architecture

## 1. Purpose

MCP Resources are stable, read-oriented data surfaces exposed by the NitroStack MCP Server. In Visa Agent, Resources give AI clients, portals, and widgets governed access to case snapshots, policy evidence, document review state, approval history, task state, notification history, audit records, and operational health context.

Resources are not workflow commands. They are read models.

Tools and Resources have different responsibilities:

| Capability | Responsibility | Side Effects |
| --- | --- | --- |
| Tools | Perform one bounded operation, including permitted reads or explicit user-triggered actions. | May create or change state only when authorized, validated, audited, and approved where required. |
| Resources | Expose stable reference material, contextual snapshots, and read models for AI and widget context. | Must not modify state or trigger external side effects. |

Visa Agent uses a read-only Resource philosophy because immigration operations involve protected personal data, regulated decisions, policy-sensitive context, and mandatory human approvals. Reading context must never be interpreted as consent, approval, workflow progression, broker assignment, document acceptance, final submission, notification delivery, or any other business action.

Resources should never modify state because:

- A Resource read may be performed opportunistically by an AI client to build context.
- A read has no explicit user intent to mutate data.
- Repeated Resource reads must be safe, idempotent, and low-risk.
- Hidden side effects would weaken auditability and approval governance.
- Widgets and prompts must not be able to advance a case by fetching data.

Resources are ideal for AI context retrieval because they provide compact, authorized, attributable views of the system of record. They let an AI assistant reason over current case status, policy freshness, pending tasks, document extraction outcomes, and approval state without receiving unnecessary personal data or direct database access.

## 2. Resource Design Principles

### Read-Only

Every Resource is read-only. A Resource may retrieve, filter, aggregate, redact, and format data. It must not create records, update records, delete records, emit events, enqueue notifications, initiate OCR, refresh policy indexes, or call mutation-capable Tools.

### Immutable Views

Resources represent immutable views for the duration of a single read. The underlying data may change after the response, but the response itself must clearly identify retrieval time, source references, and freshness where relevant.

### Stable URIs

Resource URIs are long-lived contracts. URI structure must be stable enough for AI clients, widgets, tests, and documentation to depend on it. New versions should be introduced instead of silently changing semantics.

### Authorization

Every protected Resource is authorized server-side before retrieval. Authorization uses OAuth 2.1 identity, tenant validation, role checks, scope checks, case relationship checks, and module-specific rules. Widget visibility is never authorization.

### Tenant Isolation

All dynamic Resources are tenant-scoped. A caller may only read records belonging to their tenant and permitted case, client, broker, task, approval, notification, or audit boundary. Cross-tenant aggregation is prohibited unless a future administrative module defines an explicit, separately audited capability.

### Least Privilege

Resources return the minimum necessary fields for the caller's role and use case. Client-facing Resources must exclude internal operations notes, broker-sensitive details, approval deliberation details, hidden risk flags, raw OCR payloads, and unrelated family or employee records.

### Pagination

List-like Resources must support bounded result sets and deterministic ordering. Timelines, audit records, communication history, queue views, task lists, policy sources, and document lists require pagination or cursor-based continuation when they can grow over time.

### Freshness

Resources that depend on time-sensitive data must expose retrieval time and freshness status. Policy Resources must include source publication dates where available, ingestion time, review time, and stale-source warnings. Operational queues and health Resources must identify when their view was computed.

### Metadata

Every protected Resource response should include metadata appropriate to the domain: tenant-safe entity identifiers, correlation ID, retrieval timestamp, role-shaped view name, version, source references, redaction indicators, and freshness indicators.

### Versioning

Resources are versioned by semantics, not implementation details. A breaking change to field meaning, authorization behavior, redaction behavior, or included domain scope requires a new resource version or a documented compatibility window.

### Caching

Caching must be conservative and tenant-aware. Public or reviewed policy reference Resources may use bounded caching. Case, document, task, approval, notification, and audit Resources should generally use short-lived or no caching unless the response is explicitly keyed by tenant, actor authorization, resource identifier, and view version.

### Audit Requirements

Sensitive reads are auditable. Audit records must include actor, tenant, action, entity reference, result, correlation ID, and timestamp. Audit entries must exclude secrets, raw document contents, full OCR payloads, and unnecessary personal data.

## 3. Resource Categories

### Case Resources

Case Resources expose the authorized view of the case lifecycle, participants, milestones, timelines, task references, documents, approvals, notifications, and broker assignment state. They never alter case state.

### Policy Resources

Policy Resources expose curated, attributed, freshness-aware visa policy evidence from Qdrant and policy metadata owned by the Policy Knowledge Module. They do not make legal determinations.

### Document Resources

Document Resources expose document metadata, requested evidence state, OCR extraction summaries, validation findings, review status, acceptance approval state, and retention metadata. They do not expose raw binaries through general-purpose Resource reads.

### Task Resources

Task Resources expose actionable work items, due dates, ownership, status, dependencies, escalation state, and completion evidence. They do not assign, complete, or escalate tasks.

### Approval Resources

Approval Resources expose approval request state, decision status, authorized decision history, expiry, rationale summaries, and downstream gate readiness. They do not approve or reject anything.

### Notification Resources

Notification Resources expose notification intent, consent-aware communication history, delivery attempts, delivery status, failures, and retry eligibility. They do not send or retry notifications.

### Audit Resources

Audit Resources expose append-only, authorized audit records for investigation, compliance, and operational review. They do not correct, suppress, or rewrite audit history.

### System Resources

System Resources expose operational health, dependency status, telemetry summaries, and readiness information for authorized operations or administrative users. They do not restart services, change configuration, or perform remediation.

## 4. Resource Catalog

The catalog below is architecture-level and implementation independent. It expands the provisional MCP ownership catalog in `docs/MODULES.md` into governed Resource contracts.

### 4.1 Visa Case Module

#### case://{caseId}/summary

| Field | Design |
| --- | --- |
| Resource URI | `case://{caseId}/summary` |
| Purpose | Returns an authorized case summary shaped for the caller role. |
| Owner Module | Visa Case Module |
| Who Can Read | Client case participant, assigned operations user, tenant-authorized operations user, approver when linked to an approval, service identity for approved internal read models. |
| Required Scope | `case:read` |
| Data Returned | Case identifier, lifecycle status, applicant-safe summary, destination, case purpose, key milestones, missing information indicators, next allowed actions, approval-gated status, freshness metadata, and correlation ID. |
| Sensitive Fields | Applicant personal data, dependent references, internal status reasoning, risk indicators, tenant identifiers, and operations-only notes. |
| Caching Strategy | No shared cache. Optional short-lived tenant-and-actor-scoped cache for non-sensitive summaries. |
| Refresh Strategy | Retrieved from MongoDB at read time; invalidated after case state changes, document review changes, approval decisions, and task changes. |
| Possible Errors | Unauthorized, forbidden, case not found, tenant mismatch, case archived, dependency unavailable, redacted view unavailable. |
| Widgets Using It | Case Summary, Client Case Summary, Operations Case Review Workspace. |

#### case://{caseId}/timeline

| Field | Design |
| --- | --- |
| Resource URI | `case://{caseId}/timeline` |
| Purpose | Returns role-appropriate milestones, state transitions, requested actions, and decision history for a case. |
| Owner Module | Visa Case Module |
| Who Can Read | Client case participant for client-safe timeline, operations user for operational timeline, approver for approval-linked context. |
| Required Scope | `case:read` |
| Data Returned | Ordered lifecycle events, milestone labels, actor-safe attribution, timestamps, related document/task/approval references, pending blockers, and redaction metadata. |
| Sensitive Fields | Internal notes, private reviewer deliberations, broker-only details, raw audit payloads, and unrelated participant information. |
| Caching Strategy | No shared cache. Cursor pages may be cached briefly per tenant, actor, case, and role-shaped view. |
| Refresh Strategy | Read from case transition history and relevant module read models; refreshed after committed events. |
| Possible Errors | Unauthorized, forbidden, case not found, invalid pagination window, tenant mismatch, timeline unavailable. |
| Widgets Using It | Case Timeline, Client Milestone Tracker, Operations Case Review Workspace. |

### 4.2 Client Module

#### case://{caseId}/client-summary

| Field | Design |
| --- | --- |
| Resource URI | `case://{caseId}/client-summary` |
| Purpose | Returns the client-safe case view with next actions and visible progress. |
| Owner Module | Client Module |
| Who Can Read | Client case participant, authorized delegate when future delegation exists, operations user verifying client-facing presentation. |
| Required Scope | `case:read` |
| Data Returned | Client-visible case status, requested information, requested documents, visible milestones, consent state, communication preference summary, next action labels, and client-safe policy pointers. |
| Sensitive Fields | Operations notes, internal risk scores, broker handoff data, approval deliberations, hidden exception classifications, and other tenants' data. |
| Caching Strategy | Short-lived tenant, actor, case, and role-scoped cache allowed for portal performance. |
| Refresh Strategy | Refreshed after case transitions, information requests, document request changes, client responses, and preference updates. |
| Possible Errors | Unauthorized, forbidden, case not found, caller is not a participant, consent view unavailable, tenant mismatch. |
| Widgets Using It | Client Case Summary, Client Action Checklist, Document Request Checklist. |

#### client://{clientId}/preferences

| Field | Design |
| --- | --- |
| Resource URI | `client://{clientId}/preferences` |
| Purpose | Returns client consent and communication preference state. |
| Owner Module | Client Module |
| Who Can Read | The client, authorized operations user, notification service identity for delivery eligibility checks. |
| Required Scope | `case:read` for user views; service identity scope for internal notification eligibility. |
| Data Returned | Communication channels, consent status, language preference, time-zone preference, notification eligibility, preference update timestamp, and redaction metadata. |
| Sensitive Fields | Direct contact details, consent audit trail details, channel provider identifiers, and suppressed communication reasons. |
| Caching Strategy | No shared cache. Notification eligibility may use a very short tenant-and-client scoped cache. |
| Refresh Strategy | Read from Client Module records; invalidated immediately after preference or consent updates. |
| Possible Errors | Unauthorized, forbidden, client not found, tenant mismatch, preferences not configured, consent record unavailable. |
| Widgets Using It | Notification Preferences, Communication History, Client Case Summary. |

### 4.3 Operations Module

#### operations://queue

| Field | Design |
| --- | --- |
| Resource URI | `operations://queue` |
| Purpose | Returns the operations work queue for authorized users with filters applied by tenant, role, and assignment. |
| Owner Module | Operations Module |
| Who Can Read | Operations users, operations managers, approvers viewing assigned approval work, authorized administrators for operational oversight. |
| Required Scope | `case:read` |
| Data Returned | Queue items, case references, priority, ownership, due dates, blocked-state indicators, policy freshness flags, document review status, approval status, escalation indicators, and pagination metadata. |
| Sensitive Fields | Applicant PII beyond queue minimums, internal notes not needed for queue triage, broker details, raw OCR values, and full audit records. |
| Caching Strategy | Short-lived tenant, actor, filter, and role-scoped cache. No cross-tenant cache. |
| Refresh Strategy | Recomputed from case, task, document, approval, and policy read models; refreshed after committed domain events. |
| Possible Errors | Unauthorized, forbidden, invalid filters, tenant mismatch, queue projection unavailable, dependency unavailable. |
| Widgets Using It | Operations Queue, Approval Queue, Policy Freshness Dashboard. |

#### operations://case/{caseId}/review

| Field | Design |
| --- | --- |
| Resource URI | `operations://case/{caseId}/review` |
| Purpose | Returns an operations review workspace snapshot for triage and case review. |
| Owner Module | Operations Module |
| Who Can Read | Assigned operations user, tenant-authorized operations user, operations manager, approver with linked case context. |
| Required Scope | `case:read`; `document:read` when document review details are included. |
| Data Returned | Operational case summary, blockers, risk indicators, missing evidence, policy freshness, document review queue, task state, approval state, broker assignment readiness, and recommended review focus areas. |
| Sensitive Fields | Full document contents, unnecessary dependent data, sealed audit details, notification provider payloads, and secrets. |
| Caching Strategy | No shared cache. Very short actor-scoped cache may be used for expensive aggregation. |
| Refresh Strategy | Aggregates current read models from owning modules at read time; marks partial data if a dependency is unavailable. |
| Possible Errors | Unauthorized, forbidden, case not found, tenant mismatch, dependency unavailable, partial aggregation, stale projection. |
| Widgets Using It | Case Review Workspace, Document Readiness, Approval Queue, Case Timeline. |

### 4.4 Documents Module

#### document://{documentId}/extraction

| Field | Design |
| --- | --- |
| Resource URI | `document://{documentId}/extraction` |
| Purpose | Returns OCR extraction results and review status without exposing raw document binary content. |
| Owner Module | Documents Module |
| Who Can Read | Authorized operations user, document reviewer, approver linked to document acceptance, client only for client-safe review outcome when permitted. |
| Required Scope | `document:read` |
| Data Returned | Document metadata, requested evidence type, extraction fields, confidence indicators, provenance references, validation findings, review state, acceptance approval state, and retention metadata. |
| Sensitive Fields | Raw document binary, full OCR provider payload, identity document numbers unless strictly required, biometric images, access tokens, storage URLs, and malware-scan internals. |
| Caching Strategy | No shared cache. Reviewer view should be actor-scoped and short-lived if cached. |
| Refresh Strategy | Refreshed after upload, OCR completion, validation updates, review requests, and approval decisions. |
| Possible Errors | Unauthorized, forbidden, document not found, tenant mismatch, OCR pending, OCR failed, review state unavailable, redacted view unavailable. |
| Widgets Using It | Extraction Review, Document Readiness, Document Review Outcome. |

#### case://{caseId}/documents

| Field | Design |
| --- | --- |
| Resource URI | `case://{caseId}/documents` |
| Purpose | Returns the authorized document checklist and evidence status for a case. |
| Owner Module | Documents Module |
| Who Can Read | Client case participant for client-safe checklist, operations user, document reviewer, approver when reviewing document acceptance. |
| Required Scope | `document:read` for document metadata; `case:read` for case-linked visibility. |
| Data Returned | Required document types, upload status, review status, correction requests, acceptance state, expiry signals, retention class, and redaction metadata. |
| Sensitive Fields | Raw document content, full extraction values, internal reviewer notes, storage locations, malware results beyond safe status, and unrelated documents. |
| Caching Strategy | Short-lived tenant, actor, case, and role-scoped cache allowed. |
| Refresh Strategy | Refreshed after document request creation, upload, OCR completion, review action, correction request, and approval decision. |
| Possible Errors | Unauthorized, forbidden, case not found, document list unavailable, tenant mismatch, partial document projection. |
| Widgets Using It | Document Request Checklist, Document Readiness, Operations Case Review Workspace. |

### 4.5 Policy Knowledge Module

#### policy://jurisdiction/{destination}

| Field | Design |
| --- | --- |
| Resource URI | `policy://jurisdiction/{destination}` |
| Purpose | Returns curated, attributed visa policy evidence for a destination jurisdiction. |
| Owner Module | Policy Knowledge Module |
| Who Can Read | Authorized client case participant for relevant client-safe guidance, operations user, policy reviewer, approver needing policy context. |
| Required Scope | `case:read` for case-contextual reads; `policy:manage` for reviewer-only metadata. |
| Data Returned | Jurisdiction summary, eligible source excerpts as summarized evidence, source attribution, effective-date context, publication date when available, retrieval time, review time, freshness status, uncertainty warnings, and jurisdiction tags. |
| Sensitive Fields | None from case context unless case-specific tailoring is requested; reviewer-only source-quality notes and unreviewed source details are restricted. |
| Caching Strategy | Bounded cache allowed for reviewed policy evidence, keyed by destination, source version, freshness state, tenant policy, and view role. |
| Refresh Strategy | Retrieved from Qdrant and policy metadata; refreshed after approved Firecrawl ingestion, policy review, or index refresh. |
| Possible Errors | Unauthorized, forbidden, destination unsupported, no reviewed sources, stale source warning, conflicting sources, Qdrant unavailable, policy index unavailable. |
| Widgets Using It | Policy Evidence Panel, Client Preparation Guidance, Policy Freshness Dashboard. |

#### policy://freshness/{destination}

| Field | Design |
| --- | --- |
| Resource URI | `policy://freshness/{destination}` |
| Purpose | Returns policy-source freshness, ingestion, review, and index status for a destination. |
| Owner Module | Policy Knowledge Module |
| Who Can Read | Operations user, policy reviewer, authorized administrator, approver when policy freshness affects a decision. |
| Required Scope | `case:read` for operational visibility; `policy:manage` for reviewer detail. |
| Data Returned | Source list, last retrieved time, last reviewed time, review state, index version, freshness status, stale-source warnings, source coverage gaps, and reviewer-safe metadata. |
| Sensitive Fields | Internal reviewer notes, source credentials, Firecrawl provider diagnostics, and unpublished source-change details not approved for broad operations. |
| Caching Strategy | Short bounded cache by destination, tenant policy, and reviewer or operations view. |
| Refresh Strategy | Updated after Firecrawl collection, policy review, Qdrant indexing, and policy-source health checks. |
| Possible Errors | Unauthorized, forbidden, destination unsupported, source metadata unavailable, policy ingestion unavailable, stale index, dependency unavailable. |
| Widgets Using It | Policy Freshness Dashboard, Operations Queue, Case Review Workspace. |

### 4.6 Broker Module

#### broker://{brokerId}/profile

| Field | Design |
| --- | --- |
| Resource URI | `broker://{brokerId}/profile` |
| Purpose | Returns broker profile and eligibility information needed for authorized assignment evaluation. |
| Owner Module | Broker Module |
| Who Can Read | Operations user, operations manager, approver reviewing broker assignment, broker user for own minimum profile where applicable. |
| Required Scope | `case:read` for evaluation context; `broker:assign` for assignment workflow context. |
| Data Returned | Broker identifier, jurisdiction eligibility, capacity status, assignment availability, service region, approved contact channel summary, and compliance status. |
| Sensitive Fields | Broker private contact details, commercial terms, performance notes beyond viewer authority, unrelated tenant assignments, and provider credentials. |
| Caching Strategy | Tenant and role-scoped cache with bounded TTL for profile and eligibility data. |
| Refresh Strategy | Refreshed after broker profile updates, eligibility changes, assignment state changes, and compliance review updates. |
| Possible Errors | Unauthorized, forbidden, broker not found, tenant mismatch, broker inactive, eligibility unavailable, redacted view unavailable. |
| Widgets Using It | Broker Assignment Preview, Broker Handoff Status, Operations Case Review Workspace. |

#### case://{caseId}/broker-assignment

| Field | Design |
| --- | --- |
| Resource URI | `case://{caseId}/broker-assignment` |
| Purpose | Returns broker assignment readiness, approval state, and current assignment status for a case. |
| Owner Module | Broker Module |
| Who Can Read | Operations user, approver for broker assignment approval, assigned broker for minimum-necessary case handoff state, client only for client-safe status if permitted. |
| Required Scope | `case:read`; `broker:assign` when evaluating or viewing approval-gated assignment details. |
| Data Returned | Assignment readiness, candidate or assigned broker reference, approval requirement, active approval reference, handoff status, broker response status, and minimum-necessary case context. |
| Sensitive Fields | Full case file, unrelated documents, client contact details unless approved for handoff, internal broker selection notes, and rejected broker candidates. |
| Caching Strategy | No shared cache. Short actor-scoped cache allowed before assignment execution. |
| Refresh Strategy | Refreshed after approval request, approval decision, assignment creation, broker response, and handoff status changes. |
| Possible Errors | Unauthorized, forbidden, case not found, tenant mismatch, approval required, broker assignment not prepared, broker not assigned. |
| Widgets Using It | Broker Assignment Preview, Broker Handoff Status, Approval Queue. |

### 4.7 Task Module

#### task://{taskId}

| Field | Design |
| --- | --- |
| Resource URI | `task://{taskId}` |
| Purpose | Returns a task detail view with status, ownership, dependencies, and completion evidence. |
| Owner Module | Task Module |
| Who Can Read | Assigned task owner, authorized operations user, operations manager, approver when task is approval-related, client only for client-visible requests. |
| Required Scope | `case:read` |
| Data Returned | Task identifier, title, status, priority, owner, due date, related case, dependencies, escalation state, completion evidence summary, and audit-safe timestamps. |
| Sensitive Fields | Internal notes beyond role authority, hidden risk classifications, unrelated task dependencies, raw document contents, and notification provider payloads. |
| Caching Strategy | Short-lived tenant, actor, and task-scoped cache allowed. |
| Refresh Strategy | Retrieved from Task Module state; refreshed after task assignment, status changes, dependency changes, escalation, and completion. |
| Possible Errors | Unauthorized, forbidden, task not found, tenant mismatch, task archived, redacted view unavailable. |
| Widgets Using It | Task Detail, Task Worklist, Operations Queue. |

#### case://{caseId}/tasks

| Field | Design |
| --- | --- |
| Resource URI | `case://{caseId}/tasks` |
| Purpose | Returns case-linked task list and work status for authorized viewers. |
| Owner Module | Task Module |
| Who Can Read | Operations user, assigned task owner, approver for approval-linked tasks, client for client-visible information requests. |
| Required Scope | `case:read` |
| Data Returned | Task list, due dates, owners, statuses, visible dependencies, escalation state, blocked indicators, completion evidence summaries, and pagination metadata. |
| Sensitive Fields | Operations-only tasks from client view, internal notes, unrelated task references, and sealed audit evidence. |
| Caching Strategy | Short-lived tenant, actor, case, filter, and role-scoped cache. |
| Refresh Strategy | Refreshed after committed case, document, approval, broker, policy, and notification events that create or update tasks. |
| Possible Errors | Unauthorized, forbidden, case not found, tenant mismatch, invalid pagination, task projection unavailable. |
| Widgets Using It | Task Worklist, Client Action Checklist, Operations Queue, Case Review Workspace. |

### 4.8 Approval Module

#### approval://{approvalId}

| Field | Design |
| --- | --- |
| Resource URI | `approval://{approvalId}` |
| Purpose | Returns an approval request, current decision state, expiry, evidence references, and authorized decision history. |
| Owner Module | Approval Module |
| Who Can Read | Assigned approver, operations user with case access, module owner requiring approval-state verification, authorized audit reader, client only for client-safe decision status when appropriate. |
| Required Scope | `case:read`; `document:approve`, `submission:approve`, or `broker:assign` when reading privileged approval context. |
| Data Returned | Approval subject, requested action, required authority, status, expiry, evidence references, decision timestamp, decision result, rationale summary, supersession state, and immutable history references. |
| Sensitive Fields | Full deliberation notes, private approver comments, raw evidence payloads, unrelated approval history, and sealed compliance notes. |
| Caching Strategy | No shared cache. Approval state may be cached only briefly per tenant, actor, approval, and purpose. |
| Refresh Strategy | Read from Approval Module records; invalidated after approval request creation, decision, expiry, or supersession. |
| Possible Errors | Unauthorized, forbidden, approval not found, tenant mismatch, expired approval, superseded approval, redacted view unavailable. |
| Widgets Using It | Approval Queue, Approval Decision View, Broker Assignment Preview, Document Readiness. |

#### case://{caseId}/approvals

| Field | Design |
| --- | --- |
| Resource URI | `case://{caseId}/approvals` |
| Purpose | Returns approval requests and decision status associated with a case. |
| Owner Module | Approval Module |
| Who Can Read | Operations user, approver with case-linked authority, authorized audit reader, client only for limited client-safe status. |
| Required Scope | `case:read`; relevant approval scope for privileged approval details. |
| Data Returned | Approval list, subject type, gate type, status, required role, expiry, decision summary, supersession indicators, and downstream action readiness. |
| Sensitive Fields | Private rationale details, unrelated approvals, reviewer deliberation notes, sealed evidence references, and internal policy exceptions. |
| Caching Strategy | Short-lived tenant, actor, case, and role-scoped cache. |
| Refresh Strategy | Refreshed after approval request creation, decision, expiry processing, and supersession. |
| Possible Errors | Unauthorized, forbidden, case not found, tenant mismatch, invalid pagination, approval projection unavailable. |
| Widgets Using It | Approval Queue, Case Review Workspace, Case Timeline. |

### 4.9 Notification Module

#### case://{caseId}/notifications

| Field | Design |
| --- | --- |
| Resource URI | `case://{caseId}/notifications` |
| Purpose | Returns notification intents and delivery status associated with a case. |
| Owner Module | Notification Module |
| Who Can Read | Client case participant for client-visible communications, operations user, notification operations user, authorized audit reader. |
| Required Scope | `case:read` |
| Data Returned | Notification history, recipient-safe labels, channel, template name, intent status, delivery attempt summary, failure state, retry eligibility, consent result, and timestamps. |
| Sensitive Fields | Full provider payloads, message secrets, provider tokens, internal template variables, suppressed recipients, and unrelated communications. |
| Caching Strategy | Short-lived tenant, actor, case, and role-scoped cache. |
| Refresh Strategy | Refreshed after notification intent creation, n8n handoff, delivery result, failure, retry request, and preference update. |
| Possible Errors | Unauthorized, forbidden, case not found, tenant mismatch, communication history unavailable, partial delivery projection. |
| Widgets Using It | Communication History, Notification Preferences, Operations Case Review Workspace. |

#### client://{clientId}/communication-history

| Field | Design |
| --- | --- |
| Resource URI | `client://{clientId}/communication-history` |
| Purpose | Returns consent-aware communication history for a client. |
| Owner Module | Notification Module |
| Who Can Read | The client, authorized operations user, notification operations user, authorized audit reader. |
| Required Scope | `case:read` |
| Data Returned | Client-visible notifications, channel labels, delivery status, timestamps, related case references, consent state at delivery, and failure summaries where appropriate. |
| Sensitive Fields | Provider payloads, raw addresses where not needed, internal template variables, suppressed communications, and messages belonging to other clients. |
| Caching Strategy | Short-lived tenant, actor, client, and role-scoped cache. |
| Refresh Strategy | Refreshed after notification events, delivery status updates, preference changes, and consent updates. |
| Possible Errors | Unauthorized, forbidden, client not found, tenant mismatch, consent required, history unavailable. |
| Widgets Using It | Communication History, Notification Preferences, Client Case Summary. |

#### notification://{notificationId}/status

| Field | Design |
| --- | --- |
| Resource URI | `notification://{notificationId}/status` |
| Purpose | Returns delivery and retry-readiness state for one notification intent. |
| Owner Module | Notification Module |
| Who Can Read | Operations user, notification operations user, authorized audit reader, client only for client-visible notification status. |
| Required Scope | `case:read` |
| Data Returned | Intent status, channel, delivery attempts, last result, retry eligibility, consent outcome, related case reference, and provider-normalized error category. |
| Sensitive Fields | Provider credentials, raw provider payloads, full recipient address where masked view is sufficient, and internal template variables. |
| Caching Strategy | No shared cache. Very short actor-scoped cache allowed for status polling. |
| Refresh Strategy | Refreshed after n8n handoff, delivery result, retry request, failure classification, and consent changes. |
| Possible Errors | Unauthorized, forbidden, notification not found, tenant mismatch, delivery status unavailable, redacted view unavailable. |
| Widgets Using It | Communication History, Dependency Health Dashboard. |

### 4.10 Audit & Observability Module

#### audit://case/{caseId}

| Field | Design |
| --- | --- |
| Resource URI | `audit://case/{caseId}` |
| Purpose | Returns authorized append-only audit records for a case. |
| Owner Module | Audit & Observability Module |
| Who Can Read | Authorized operations user, administrator, compliance reviewer, approver for relevant decision trace, service identity for incident investigation workflows. |
| Required Scope | `audit:read` |
| Data Returned | Audit event references, actor-safe attribution, action, entity references, result, timestamps, correlation IDs, authorization failures where permitted, external handoff markers, and pagination metadata. |
| Sensitive Fields | Secrets, raw document payloads, full OCR payloads, provider tokens, private security signals, and audit records outside the reader's authority. |
| Caching Strategy | No shared cache. Cursor windows may be cached briefly for the same actor and query to reduce repeated reads. |
| Refresh Strategy | Read from append-only audit records. New entries become visible after committed sensitive reads, mutations, approvals, external handoffs, and authorization failures. |
| Possible Errors | Unauthorized, forbidden, case not found, tenant mismatch, invalid pagination, audit retention boundary reached, audit store unavailable. |
| Widgets Using It | Audit Timeline, Case Timeline, Operations Case Review Workspace. |

#### observability://health

| Field | Design |
| --- | --- |
| Resource URI | `observability://health` |
| Purpose | Returns platform and dependency health for authorized operational visibility. |
| Owner Module | Audit & Observability Module |
| Who Can Read | Operations administrator, platform administrator, authorized support user, service identity for monitoring. |
| Required Scope | `audit:read` or administrator-level operational health scope defined by tenant policy. |
| Data Returned | Server health, MongoDB status, Qdrant status, Firecrawl status, OCR status, n8n status, notification adapter status, degraded dependency indicators, last checked time, and correlation ID. |
| Sensitive Fields | Connection strings, credentials, provider tokens, stack traces, raw dependency payloads, host secrets, and exploit-relevant diagnostics. |
| Caching Strategy | Very short operational cache allowed to prevent health-check storms. |
| Refresh Strategy | Refreshed by dependency health checks and service telemetry sampling. |
| Possible Errors | Unauthorized, forbidden, health unavailable, dependency timeout, partial health, degraded mode. |
| Widgets Using It | Dependency Health Dashboard, Policy Freshness Dashboard, Operations Queue. |

#### operations://system/metrics

| Field | Design |
| --- | --- |
| Resource URI | `operations://system/metrics` |
| Purpose | Returns high-level operational metrics for queue health, dependency latency, error classification, and workflow throughput. |
| Owner Module | Audit & Observability Module |
| Who Can Read | Operations administrator, platform administrator, authorized operations manager. |
| Required Scope | `audit:read` or administrator-level operational metrics scope defined by tenant policy. |
| Data Returned | Aggregated counts, latency bands, error categories, dependency health summaries, queue volumes, stale policy counts, overdue task counts, and reporting interval metadata. |
| Sensitive Fields | Personal data, case narrative details, raw audit events, provider secrets, and individual client communications. |
| Caching Strategy | Short operational cache by tenant, role, metric interval, and view version. |
| Refresh Strategy | Refreshed from metrics service, audit summaries, and event-derived read models. |
| Possible Errors | Unauthorized, forbidden, invalid interval, metrics unavailable, partial aggregation, tenant mismatch. |
| Widgets Using It | Dependency Health Dashboard, Operations Queue, Policy Freshness Dashboard. |

## 5. URI Naming Rules

Resource URI schemes are lowercase, domain-specific, and stable. Path segments use business vocabulary, not storage or provider names. Identifiers are tenant-safe references, not database implementation details.

| Scheme | Purpose |
| --- | --- |
| `case://` | Case-owned or case-linked snapshots such as summaries, timelines, documents, approvals, tasks, notifications, and broker assignment state. |
| `policy://` | Curated policy evidence, source freshness, jurisdiction coverage, and policy review metadata. |
| `document://` | Document-specific metadata, OCR extraction summaries, validation findings, and review state. |
| `approval://` | Approval request state, decision history, expiry, and gate readiness. |
| `task://` | Task detail, ownership, dependency, escalation, and completion evidence views. |
| `audit://` | Append-only audit history and compliance investigation read models. |
| `notification://` | Notification intent, delivery status, and retry-readiness read models. |
| `operations://` | Operations queue, case review, system metrics, and work-management projections. |
| `client://` | Client preferences, consent state, and communication history. |
| `broker://` | Broker profile, eligibility, and assignment support views owned by the Broker Module. |
| `observability://` | Platform health and dependency telemetry owned by the Audit & Observability Module. |

Naming conventions:

- Use singular entity identifiers in path parameters, such as `{caseId}`, `{documentId}`, `{approvalId}`, `{taskId}`, `{clientId}`, `{brokerId}`, and `{notificationId}`.
- Use plural nouns for collections, such as `documents`, `tasks`, `approvals`, and `notifications`.
- Use domain terms from `ARCHITECTURE.md`: case, applicant, dependent, document, policy, broker, task, approval, submission, audit.
- Do not expose provider names, collection names, bucket names, index names, or internal table structure in the URI.
- Do not encode authorization decisions in URI names. Authorization is enforced by guards and domain services.
- Prefer case-linked Resources when the caller's context is a case workflow.
- Prefer entity-specific Resources when the caller needs one document, task, approval, notification, broker, or audit detail.

## 6. Resource Lifecycle

```text
Client
  |
  v
Authorization
  |
  v
Resource
  |
  v
Service
  |
  v
MongoDB / Qdrant
  |
  v
Structured Response
```

Lifecycle responsibilities:

- Client requests a Resource URI from the NitroStack MCP Server.
- Authorization validates identity, tenant, role, scope, and resource relationship.
- The Resource resolves the URI and asks the owning service for a read model.
- The service reads MongoDB, Qdrant, or approved adapters through explicit contracts.
- The Resource shapes, redacts, annotates, and returns the structured response.
- Sensitive reads are recorded by the Audit Service without leaking payload contents.

## 7. Cross Resource Rules

Resources never:

- Modify data.
- Trigger workflows.
- Call Tools.
- Emit Events.
- Create tasks.
- Send notifications.
- Start OCR.
- Refresh policy indexes.
- Approve decisions.
- Execute submissions.
- Assign brokers.

Resources may:

- Read owning module services.
- Read approved shared services.
- Read MongoDB through the owning service.
- Read Qdrant through the Policy Service.
- Aggregate data from published service contracts.
- Redact sensitive fields by caller role.
- Include freshness, provenance, pagination, and version metadata.
- Record a sensitive-read audit entry when required.

Cross-module Resources must respect ownership. A case-linked Resource may aggregate document, task, approval, notification, or broker state only through those modules' published service contracts or read models. It must not reach into another module's private persistence model.

## 8. High-Risk Resources

### Documents

Document Resources carry high privacy and fraud risk. They must expose metadata, extraction summaries, confidence, and review state without returning raw binaries or storage URLs through general Resource reads. Full document access requires a separately governed document-access path with explicit authorization, audit, retention, and malware-scan controls.

### OCR

OCR output is provisional until reviewed and accepted by an authorized human. OCR Resources must distinguish missing, ambiguous, extracted, and human-verified values. Low-confidence extraction must be visible to reviewers and must never become accepted evidence through a Resource read.

### Audit

Audit Resources are append-only and compliance-sensitive. They must support investigation without becoming a broad data export mechanism. Access requires `audit:read`, tenant validation, role authorization, pagination, and redaction of secrets, raw document contents, and provider payloads.

### PII

Resources must minimize personal data. Client views receive only client-safe data. Operations views receive only data required for assigned work. Broker views receive only approved, minimum-necessary handoff data. PII masking and redaction must be part of the Resource contract, not left to the widget.

### Policy

Policy Resources must be attributed, freshness-aware, and clear about uncertainty. They must not present unreviewed, stale, conflicting, or incomplete sources as authoritative. They must not provide legal determinations or guaranteed outcome predictions.

### Approvals

Approval Resources expose gate state and immutable decision history, but cannot record decisions. They must show expiry, supersession, and active approval state so downstream Tools can enforce mandatory gates for broker assignment, document acceptance, and final submission.

## 9. Future Resources

The following Resources are intentionally excluded from the hackathon scope and should be introduced only after their owning modules, governance model, retention policy, and authorization model are mature:

- `submission://{submissionId}/readiness-snapshot` for finalized submission readiness packages.
- `submission://{submissionId}/execution-status` for external filing-channel status after controlled submission is enabled.
- `analytics://tenant/{tenantId}/throughput` for privacy-preserving operational analytics.
- `billing://account/{accountId}/entitlements` for commercial entitlement visibility.
- `payments://case/{caseId}/status` for payment collection and reconciliation where business policy permits.
- `admin://tenant/{tenantId}/configuration` for tenant configuration and delegated administration.
- `identity://tenant/{tenantId}/federation` for enterprise identity federation status.
- `compliance://case/{caseId}/export-manifest` for governed reporting and compliance export preparation.

Future Resources must preserve the same principles: read-only behavior, tenant isolation, least privilege, explicit authorization, auditability for sensitive reads, stable URI design, and no bypass of human approval gates.
