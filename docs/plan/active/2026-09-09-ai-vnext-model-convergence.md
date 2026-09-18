---
tags:
  - plan
  - active
  - ai
  - mastra
  - provider
  - workflow
  - context
  - knowledge
  - refactor
description: AI vNext Model Convergence — Conversation/Mastra 状态所有权、Provider Secret/Model Capability、Context/Knowledge、Workflow Draft/Apply、ExecutionRecord 单轨收敛实施计划
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-18T00:00:00+08:00
---

# AI vNext Model Convergence

> **System-wide execution-order notice (2026-09-09):** 本文继续作为模块内部 ticket/验收细节真值；跨模块执行顺序、共享 schema 单写者与 destructive cutover gate 由 [`2026-09-09-system-wide-vnext-model-convergence-implementation.md`](./2026-09-09-system-wide-vnext-model-convergence-implementation.md) 统一协调。
>
> **ADR-111 zero-legacy-data override:** 本文中所有仅用于保存当前旧数据/旧备份/旧客户端的 migration、backfill、compatibility reader/adapter、dual-read/write、redirect window、before/after old-data parity 要求均已被 ADR-111 supersede。领域目标与行为验收继续有效；实施时直接切 current consumers、删除旧 surface、reset/reseed persistence。

## ADR-111 execution rewrite

- `AI-9602` characterizes Mastra/runtime authority only; legacy `AiMessage` transcript rows do not need preservation/import;
- provider configuration/secret target contracts are rebuilt directly; no DB secret migration is required;
- `AI-9607` switches Knowledge index/citations to stable `KnowledgeDocumentId` without repairing old indexed rows or path-derived relations;
- `AI-9610` deletes obsolete quota/generation/message persistence directly after current-code consumer removal;
- no old usage-history aggregation parity or V2 portability migration is required.

Runtime recovery/HITL/idempotency/security tests remain protected because they are behavioral invariants, not legacy-data compatibility.

**状态：ACTIVE / AI-9602 accepted locally; AI-9603 implemented locally, review pending**
**实施分支：** `chatgpt/ai-9603-conversation-shell`；本轮已完成 conversation shell/runtime boundary cutover，等待 ChatGPT Web review/acceptance
**当前源码 truth：** `packages/ai` + `packages/contracts/ai` + Mastra runtime + Prisma/PowerSync + Vue AI workspace 现状
**目标 ADR：** ADR-096～099
**继续有效：** ADR-050、051、052、070
**跨模块依赖：** ADR-067～095

## 1. Objective

在不重写 Mastra runtime 的前提下，把 AI 从：

```text
Mastra runtime 已单轨
+
旧 Conversation aggregate shape
+
Provider config/secret/catalog 混合
+
UI workflow shadow
+
AI-owned old business DTO
+
legacy AI persistence
```

收敛为：

```text
AssistantConversationShell
+
Mastra authoritative thread/workflow
+
ProviderDefinition/Connection/SecretVault/ModelCapability
+
AIContextEnvelope
+
owner-domain aligned typed drafts/tools
+
stable KnowledgeDocumentId based AI index
+
AIExecutionRecord
```

最终不再存在：

```text
AiMessage permanent transcript truth
full WorkflowRun localStorage durable shadow
plaintext API key ordinary domain DTO
magic gpt-4o-mini fallback
AI-only Task/Routine/Notification core business language
path/resource id as Knowledge semantic identity
AiGenerationTask workflow-task ambiguity
unused AiUsageQuota / KnowledgeGenerationTask legacy models
```

## 2. Accepted design package

### ADR-096 — Conversation / Runtime state ownership

```text
AssistantConversationShell = product shell
Mastra thread/workflow = runtime truth
UI = pointer + unsaved editor overlay
```

### ADR-097 — Provider / Secret / Model capability

```text
ProviderDefinition
ProviderConnection
SecretVault
ModelCatalogSnapshot
ModelCapabilitySnapshot
ExecutionRequirement
ModelResolver
```

### ADR-098 — Context / Knowledge / owner contract

```text
AIContextAssembler -> AIContextEnvelope
UserTimeContextPort
stable KnowledgeDocumentId based index
owner-domain canonical vocabulary reuse
```

### ADR-099 — Workflow Draft / Apply / ExecutionRecord

```text
stable draftRef
canonical Goal/Task/Knowledge/Routine semantics
deterministic owner apply
AIExecutionRecord != Workflow state != Accounting ledger
```

### High-level architecture

- `docs/architecture/ai-vnext-model-convergence.md`

### Current-system evidence / reuse ledger

- `docs/analysis/2026-09-09-ai-vnext-model-convergence-current-system-map.md`
- `docs/analysis/2026-09-09-ai-vnext-model-convergence-reference-and-reuse-ledger.md`

## 3. Baseline facts / why now

当前已确认：

1. 2026-08 Mastra-native 大重构已完成并归档，Mastra 是唯一核心 Agent/Workflow runtime；
2. `AIConversation` 仍包含 `messages[] / messageCount / lastMessageAt / Closed` 等 legacy aggregate shape；
3. `AiMessage` 仍保留，但当前 authoritative transcript 已经是 Mastra thread/memory；
4. AI-9603 已将 Vue `useAIWorkflowPersistence` 收敛为 run pointer + revision-bound unsaved editor overlay；Mastra runtime 是 restore truth；
5. `AIProviderConfig` repository 解密 secret 后把 plaintext API key 放回 server DTO；
6. Provider Onboarding V2 已经有正确的 opaque one-time session / credential protection；
7. model resolver 仍存在缺省 `gpt-4o-mini` fallback，且没有 workflow capability requirement；
8. Goal workflow 当前实现仍大量消费 ADR-067/068/070 之前的 old draft fields；
9. Task workflow 仍维护 AI-only cadence/timeOfDay mini DSL；
10. Routine AI tools 仍使用 legacy FixedTime/Interval vocabulary；
11. AI Planner/Notification ports 复制了 owner module 的旧 DTO 词汇；
12. `AiKnowledgeIndexEntry` 仍围绕 resourceId/path，而 Knowledge ADR-090 已冻结 stable document identity；
13. `AiGenerationTask` 当前真实用途已经是 execution log/usage projection；
14. `AiUsageQuota`、`KnowledgeGenerationTask` 本轮未发现真实 current product consumer，是高置信度 deletion candidates；
15. `AIApplicationPort` 已同时覆盖 Provider、Conversation、Knowledge、Analytics、Eval，后续应按真实 consumer 收窄。

## 4. Protected contracts

整个实施必须保护：

1. **Mastra single runtime authority**，不得恢复 Python/LangGraph/AgentHost/TurnEngine/ProposalKernel；
2. `identityId -> Mastra resourceId`、`conversationId -> Mastra threadId` identity mapping；
3. canonical Assistant/Workflow HTTP/IPC contracts；
4. Assistant stream/cancel/history semantics；
5. Workflow start/get/list/resume/cancel 与 suspend/recovery semantics；
6. explicit HITL approval；
7. deterministic mutation idempotency；
8. Goal/Task/Routine/Knowledge write 只走 owner application/command port；
9. Scheduler lease/retry/internal invocation 不暴露给普通 AI；
10. Notification delivery/channel worker internals不暴露给普通 AI；
11. Provider credential 不进入 client/event/prompt/memory/snapshot/log；
12. Provider Onboarding V2 probe/test/commit/replace UX；
13. current per-conversation provider/model selection ability；
14. ADR-037 Product Time；
15. ADR-090 stable KnowledgeDocument identity；
16. ADR-091 Knowledge projection/index separation；
17. ADR-093 UserTimeContext owner；
18. Web/Desktop transport parity；
19. Data Portability 不静默丢 user-visible transcript/provider metadata；
20. eval/release governance；
21. 不保留永久 legacy/new 双写双读。

## 5. Non-goals

本轮不做：

- 替换 Mastra；
- 重新引入 Python/LangGraph；
- 自研 universal AgentHost；
- BYOK 前置强制 LiteLLM；
- universal ModelGateway；
- 复杂价格/延迟智能路由；
- 新建通用 vector DB abstraction；
- 把 Memory 做成业务数据库；
- 为未来 SaaS 套餐补造当前 Quota；
- 新建跨模块巨型事务；
- 让 AI 直接操作 Scheduler/Notification delivery runtime；
- 在 owner domain 已冻结后仍保留 AI-only business vocabulary。

## 6. Work items

### AI-9601 — Freeze AI model-convergence current map / architecture / ADR package

**状态：DONE（docs only）**

#### Goal

把当前真实状态、目标 ownership、迁移边界和实施顺序冻结，避免后续 Worker 把本任务误做成第二次 runtime rewrite。

#### Scope

- current-system map；
- reference/reuse ledger；
- north-star architecture；
- ADR-096～099；
- 本 active plan；
- ADR/active-plan index；
- product AI module target notice。

#### Out of scope

- production code；
- Prisma migration；
- UI behavior change；
- provider secret migration。

#### Acceptance

- [x] Mastra/runtime protected boundary 明确；
- [x] Conversation shell target 明确；
- [x] UI durable shadow retirement 明确；
- [x] Provider Definition/Connection/Secret/Capability 明确；
- [x] Context trust/time/knowledge boundary 明确；
- [x] Goal/Task/Routine/Knowledge AI target vocabulary 明确；
- [x] stable draftRef/idempotency 明确；
- [x] execution record/legacy tables target 明确；
- [x] no-runtime-rewrite non-goal 明确；
- [x] direct reuse / thin adapter / do-not-build ledger 明确。

### AI-9602 — Characterize runtime authority before legacy persistence deletion

**状态：PLANNED**

#### Goal

先用测试证明当前 Mastra thread/workflow authority、legacy transcript bootstrap 和 conversation portability，再改 aggregate/persistence，防止删除 `AiMessage` 时丢用户历史。

#### Scope

Characterization：

```text
existing conversation shell
legacy AiMessage bootstrap
Mastra authoritative history
process restart
conversation delete
workflow get/restore
portability/export path
```

Inventory：

- `packages/ai/src/server/domain/aggregates/ai-conversation.ts`
- conversation repository implementations；
- `assistant-history.service.ts`；
- Prisma/PowerSync `ai_conversations / ai_messages`；
- HTTP/IPC conversation/history/delete clients；
- Data Portability AI/conversation paths；
- all `ConversationStatus.Closed` consumers。

#### Out of scope

- actual schema deletion；
- provider work；
- workflow draft migration。

#### Tests

- legacy transcript imports once；
- restart reads Mastra without legacy message read；
- delete failure/retry does not expose orphan data；
- conversation owner isolation；
- export transcript source characterization；
- source/surface inventory for `Closed`。

#### Acceptance

可以给出确定证据：

```text
AiMessage can be retired after cutover
```

或者列出必须先迁走的真实 consumer；不得凭 grep 数量直接删表。

#### Characterization evidence ledger (2026-09-18)

This is an as-built evidence record for AI-9602. It does not change the execution order,
delete legacy persistence, add a backfill, or make a compatibility promise under ADR-111.

##### Durable authority map

| State                                                                                      | Current authority                                                                                                                             | Evidence / boundary                                                                                                                                                                                                    | Classification                                                                                                             |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Conversation identity, title, archive/delete metadata                                      | `AIConversation` / `ai_conversations`; `AIConversationPrismaRepository`, `PowerSyncAIConversationRepository`, and `DeleteConversationUseCase` | `packages/ai/src/server/domain/aggregates/ai-conversation.ts::AIConversation`; `packages/ai/src/server/application/use-cases/commands/delete-conversation.use-case.ts::DeleteConversationUseCase`                      | Authoritative product shell only; `messages[]`, `messageCount`, and `lastMessageAt` remain legacy projections.             |
| Assistant transcript                                                                       | Mastra `Memory` thread in the configured Mastra store; `conversationId` is the thread id and `identityId` is the resource id                  | `packages/ai/src/server/mastra/runtime/assistant-history.service.ts::AssistantHistoryService`; `packages/ai/src/server/mastra/runtime/storage.ts::createMastraStorage`; `MastraAIRuntime.listMessages/dispatchMessage` | Authoritative and durable. After the version marker, reads use `memory.recall`; the legacy source is not consulted.        |
| Goal/Task/Knowledge workflow state, suspension, resume cursor, result, and terminal status | Mastra `workflows` store, keyed by `runId` and filtered by `resourceId`                                                                       | `packages/ai/src/server/mastra/runtime/mastra-ai.runtime.ts::MastraAIRuntime.workflowStore`, `get`, `list`, `resume`, `cancel`                                                                                         | Authoritative and durable; in-memory `activeRuns` is only a live cancellation handle.                                      |
| Client workflow pointer/overlay                                                             | `localStorage` key `ai:conversation-workflow-map:v3`                                                                                          | `packages/app-vue/src/modules/ai/composables/useAIWorkflowPersistence.ts`; `useAIChatView.ts::restoreWorkflowState` calls `workflowRuntime.get` through `loadAuthoritativeWorkflowRun` | Derived/recoverable UI state only; runtime status/suspension/result/draft are never persisted or used as fallback.           |
| AI execution/usage observation                                                             | `ai_generation_tasks` through the execution-log adapters                                                                                      | `packages/ai/src/server/infrastructure/adapters/prisma/ai-execution-log-prisma.adapter.ts`; `ai-execution-log-powersync.adapter.ts`                                                                                    | Adjacent derived observability, not transcript or workflow authority; later `AIExecutionRecord` work owns its convergence. |

The host boundary is also characterized: authenticated HTTP routes and Electron IPC derive
`identityId` from the host context and expose history/delete plus workflow
start/get/list/resume/cancel; clients do not submit an identity override. See
`packages/ai/src/api/routes/ai-runtime.routes.ts`, `packages/ai/src/electron/index.ts`,
`packages/ai/src/client/runtime-assistant.ts`, and
`packages/ai/src/client/runtime-workflow.ts`.

##### Recovery, HITL, idempotency, and delete evidence

| Boundary                                                                                                                                                            | Executable evidence                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| One-time legacy bootstrap, stable message ids, concurrent bootstrap collapse, marker short-circuit, and owner isolation                                             | `packages/ai/src/server/mastra/runtime/assistant-history.service.spec.ts`                                                                     |
| Transcript survives a process-style LibSQL restart; restart does not reread the legacy source; a Mastra-only follow-up remains visible                              | `packages/ai/src/server/mastra/runtime/assistant-history.persistence.spec.ts`                                                                 |
| Suspended HITL workflow survives storage/runtime disposal and reopening, restores only for its owner, resumes, and duplicate approval does not reapply the mutation | `packages/ai/src/server/mastra/runtime/mastra-workflow.runtime.spec.ts` (`restores a suspended HITL run after a process-style restart...`)    |
| Lower-level goal/task restart, suspension, receipt retry, and deterministic apply behavior                                                                          | `packages/ai/src/server/mastra/workflows/goal-create.workflow.spec.ts`, `task-create.workflow.spec.ts`, and `apply-goal-plan.service.spec.ts` |
| UI reconnect/reload rereads authoritative history                                                                                                                   | `apps/web/e2e/ai/multi-engine-host.spec.ts` (`reload restores authoritative Mastra transcript instead of legacy AiMessage history`)           |
| Runtime delete is owner-scoped; a failed storage delete leaves the owner thread available for retry                                                                 | `assistant-history.service.spec.ts` owner/delete tests                                                                                        |
| Product delete ordering is Mastra thread first, shell second, so a shell failure remains recoverable and does not leave an invisible runtime orphan                 | `packages/app-vue/src/modules/ai/composables/useAIChatSession.ts` and `useAIChatSession.spec.ts`                                              |

Delete is therefore recoverable but not a distributed transaction: the shell use case soft-deletes
`ai_conversations`, while the UI first deletes the Mastra thread. A failed Mastra delete leaves
the shell visible; a failed shell delete leaves a recoverable shell that can be retried. No
runtime rewrite is needed for this characterization.

##### Legacy `AiMessage` / transcript consumer ledger

The following is the complete non-generated production surface found by the AI-9602 inventory.
No current assistant runtime producer writes `AiMessage`; the remaining writes are aggregate
repository persistence and data-portability import.

| Consumer                                        | Read/write surface                                                                                                                               | Classification and deletion implication                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ConversationTranscriptBootstrapSource`         | `findByIdForIdentity(..., { includeChildren: true })`, projects `conversation.getAllMessages()`                                                  | Derived/recoverable one-time bridge; read-only and explicitly never writes `AiMessage`. It is the temporary bootstrap blocker, not transcript authority. (`packages/ai/src/server/infrastructure/migrations/conversation-transcript-bootstrap.source.ts`)                                                                                                                                                                                                                                                                                                                                          |
| `AssistantHistoryService`                       | Invokes the source only before the persistent bootstrap marker; writes imported rows into Mastra memory, then reads Mastra                       | Derived/recoverable bridge plus authoritative Mastra reader. The marker and restart tests prove the legacy read is not permanent. (`packages/ai/src/server/mastra/runtime/assistant-history.service.ts`)                                                                                                                                                                                                                                                                                                                                                                                           |
| Prisma conversation repository                  | `save()` deletes/recreates `aiMessage` children when aggregate DTO includes messages; `find*({ includeChildren: true })` reads them              | Current shell persistence with a legacy transcript child path; derived/recoverable, not runtime authority. Must lose the child path before table deletion. (`packages/ai/src/server/infrastructure/adapters/prisma/ai-conversation-prisma.repository.ts`)                                                                                                                                                                                                                                                                                                                                          |
| PowerSync conversation repository/mapper        | Same child delete/insert/read behavior in `ai_messages`; maps rows to `Message`                                                                  | Current Desktop/offline shell persistence with a legacy transcript child path; derived/recoverable, not runtime authority. (`packages/ai/src/server/infrastructure/adapters/powersync/ai-conversation-powersync.repository.ts`, `mappers/powersync-ai-conversation.mapper.ts`)                                                                                                                                                                                                                                                                                                                     |
| Data Portability export                         | Prisma adapter includes `messages`; PowerSync adapter selects `ai_messages`; `projectAIConversations` emits portable `PortableAIMessage` records | Derived/recoverable and user-visible, but a current retirement blocker: export must be cut to Mastra history or the AI export contract must intentionally be removed before deleting rows. (`packages/data-portability/src/server/application/use-cases/export-user-data.use-case.ts`, `projections/ai.projection.ts`, `infrastructure/adapters/prisma-adapters.ts`, `infrastructure/powersync/powersync-export-dependencies.ts`)                                                                                                                                                                  |
| Data Portability import                         | `importAI` calls `createAIMessage`; Prisma and PowerSync stores insert `AiMessage` / `ai_messages`                                               | Derived/recoverable legacy write compatibility, never runtime authority. ADR-111 requires no old-data migration/backfill; this importer must be explicitly retired or replaced before physical deletion. (`packages/data-portability/src/server/application/use-cases/importers/ai.importer.ts`, `infrastructure/import-store/prisma-data-portability-import-store.ts`, `infrastructure/powersync/powersync-import-store.ts`)                                                                                                                                                                      |
| Domain and contract message model               | `AIConversation.messages`, `Message` entities, `AiMessageId`, server/client DTOs and AI response schemas                                         | Derived/recoverable active legacy model surface used by shell repositories/portability, but not by Mastra runtime authority. (`packages/ai/src/server/domain/aggregates/ai-conversation.ts`, `packages/ai/src/server/domain/entities/message.ts`, `packages/ai/src/domain-client/entities/message.ts`, `packages/contracts/src/modules/ai/entities/message-server.ts`, `packages/contracts/src/modules/ai/api/response-schemas.ts`, `packages/contracts/src/modules/data-portability/dtos/portable-ai.dto.ts`) Retire with its remaining consumers; do not preserve it as a second transcript API. |
| Database/PowerSync schema and API table mapping | Prisma `AiMessage` model, PowerSync `ai_messages` table, API sync table/name mapping                                                             | Derived/recoverable storage/sync plumbing, not a semantic authority or independent reader. Remove only in the later coordinated schema cutover. (`packages/database/prisma/schema/ai.prisma`, `packages/powersync-schema/src/index.ts`, `apps/api/src/modules/powersync/table-mapping.ts`)                                                                                                                                                                                                                                                                                                         |
| Tests, fixtures, and generated Prisma client    | Characterization/round-trip fixtures and generated `AiMessage` types/delegates                                                                   | Dead as production consumers; evidence/generated support only. Keep behavior tests that protect Mastra recovery; regenerate/delete generated artifacts only with the schema change.                                                                                                                                                                                                                                                                                                                                                                                                                |

`ConversationStatus.Closed` was also fully inventoried: it had no current runtime/application
consumer; the aggregate creates `Active` and soft-deletes to `Archived`. AI-9603 retires the
contract/server value and helper while keeping archive semantics explicit.

##### Retirement gate handed to later tickets

AI-9602 and AI-9603 prove the authority boundary but do not open the physical `AiMessage`
destructive gate. Before a later coordinated schema/portability cut removes `AiMessage`, the
later work must explicitly show that:

1. transcript export has a deliberate Mastra-authoritative source or is removed under the
   ADR-111 portability decision;
2. no importer/store creates `AiMessage` rows;
3. conversation repositories and aggregate/DTO surfaces no longer read or write message
   children;
4. the `Message` contract/domain has no remaining product consumer; and
5. Prisma, PowerSync, API sync mapping, and generated clients are cut in one coordinated
   schema change.

No migration, backfill, legacy-row preservation, runtime rewrite, permanent compatibility reader,
or `AiMessage` fallback/dual write was added for this ticket.

#### Dependencies

`AI-9601`

### AI-9603 — Converge AssistantConversationShell + remove UI durable workflow shadow

**状态：IMPLEMENTED LOCALLY / REVIEW PENDING**

#### Goal

实现 ADR-096，让 product shell 与 runtime truth 真正分离。

#### Scope

Conversation：

```text
AssistantConversationShell
  id / identityId / title / archivedAt / timestamps
```

迁移：

- `AIConversation` remains product shell metadata; aggregate `messages[]`, `messageCount`, and
  `lastMessageAt` remain legacy repository/portability consumers and are explicitly deferred;
- Vue conversation grouping no longer treats `lastMessageAt` as shell recency authority;
- AI-9602 evidence showed no `Closed` product semantic, so the contract/server status is retired;
- existing conversation ids/thread mapping and workspace deep links remain stable。

UI：

- `useAIWorkflowPersistence.ts` no longer persists full `goalWorkflowRun/taskWorkflowRun/knowledgeCaptureRun`;
- `ai:conversation-workflow-map:v3` persists only an active run pointer plus a goal clarification/draft
  editor overlay when it is actually unsaved and bound to the runtime revision;
- restore always calls `workflowRuntime.get`, verifies conversation ownership, and projects the returned
  Mastra view;
- runtime unavailable/unknown/mismatched run produces an explicit fail-closed restore; no local snapshot
  becomes workflow truth. The retired v2 key is removed and never parsed.

Persistence：

- no old-data compatibility migration or backfill is added under ADR-111;
- physical `AiMessage`/Prisma/PowerSync/generated-client deletion remains deferred until the portability
  and legacy repository consumer gate passes;
- no permanent `AiMessage` fallback or dual write is introduced。

#### Protected contracts

- conversation ids；
- history visibility；
- workflow restart/suspend restore；
- delete behavior；
- existing AI workspace deep links/selection。

#### Tests

- Mastra history/workflow recovery evidence from AI-9602；
- UI restore from runtime, suspended HITL overlay, stale local editor revision, runtime unavailable and
  unknown-run behavior；
- delete retry ordering/visibility；
- anti-resurrection lock for full WorkflowRun localStorage persistence；
- legacy Prisma/PowerSync/portability deletion remains an explicit later-ticket gate。

#### Acceptance

AI-9603 boundary result：

```text
full WorkflowRun durable localStorage snapshot
runtime-unavailable local snapshot fallback
```

The legacy `AIConversation.messages`/`AiMessage` repository and portability surfaces remain
physically present and are not claimed as deleted by AI-9603. They are derived legacy consumers
with an explicit deletion blocker recorded above.

#### Dependencies

`AI-9602`

#### AI-9603 local implementation evidence (2026-09-18)

- Authority before: Vue restored full `AIWorkflowRunView`/draft snapshots from
  `ai:conversation-workflow-map:v2`, then attempted a runtime refresh while stale local status,
  suspension, result, and draft state could already be visible. Authority after: the UI stores only
  `activeRunId` plus an optional unsaved goal editor overlay; every restore calls
  `workflowRuntime.get({ runId })` and verifies `conversationId` before projection.
- Exact durable UI state remaining: `ai:conversation-workflow-map:v3` maps a conversation id to
  `{ activeRunId, editorOverlay? }`. The overlay is limited to unsaved goal clarification answers or
  structured draft editor values and carries the runtime/draft revision. Runtime status, suspension,
  result, usage, and authoritative draft are not persisted. `ai:last-conversation-id` remains only a
  selection/deep-link pointer, not workflow truth.
- Runtime unavailable leaves the pointer for a later retry but clears all projected workflow UI;
  unknown or owner-mismatched runs clear the pointer. Neither path reads `v2` or uses a stale local
  snapshot. Successful runtime revision projection rebases/removes the overlay.
- Conversation ids, `conversationId -> threadId` mapping, workspace selection/deep links, stream
  ordering, interrupt/resume/cancel/retry behavior, and Mastra-first then shell delete ordering are
  preserved. Delete failure leaves the selected shell visible for retry.
- `ConversationStatus.Closed` is retired because the AI-9602 consumer audit found no current runtime
  or product consumer; `Active` and explicit `Archived` remain.
- Explicitly deferred blocker: `AiMessage`/`ai_messages` still has active aggregate repository,
  Prisma/PowerSync mapper, data-portability export/import, legacy DTO/domain, schema, and generated
  client consumers. AI-9603 does not delete those tables/clients, migrate/backfill old rows, or add a
  compatibility reader; a later coordinated portability/consumer cutover must remove or deliberately
  replace those consumers before physical deletion.
- Executable coverage: `useAIWorkflowPersistence.spec.ts`, `chatViewHelpers.spec.ts`,
  `useAIChatSession.spec.ts`, existing AI-9602 Mastra restart/HITL tests, and the existing goal/task/
  knowledge runtime projection tests. Local acceptance remains review-pending until the required
  repository validation matrix completes.

### AI-9604 — Establish ProviderDefinition/Connection/SecretVault domain seam

**状态：PLANNED**

#### Goal

实现 ADR-097 的 secret ownership，让 saved Provider product state 不再携带 plaintext API key。

#### Scope

Contracts/domain：

```text
AIProviderDefinition
AIProviderConnection
AIProviderCredentialRef
AIProviderSecretVault
```

迁移：

- Provider Catalog -> ProviderDefinition registry；
- `AIProviderConfig` -> Connection semantics；
- ordinary server/domain DTO remove `apiKey`；
- repository returns `credentialRef`；
- Vault resolve only in probe/test/model execution edge；
- create/replace继续走 Onboarding V2；
- delete/revoke secret semantics 明确；
- preserve default/enabled/fallback order。

#### Out of scope

- complex smart routing；
- LiteLLM；
- all model capabilities at once。

#### Tests

- no plaintext secret in repository DTO；
- secret vault owner isolation；
- credential replace/revoke；
- onboarding consume/expiry；
- serialization leak tests；
- HTTP/IPC client DTO secret absence；
- PowerSync upload queue secret policy；
- provider deletion/retry。

#### Acceptance

Production code 中普通 Provider DTO 不含 `apiKey`；plaintext secret 只在 execution edge resolve。

#### Dependencies

`AI-9601`

### AI-9605 — Add ModelCatalog/Capability/ExecutionRequirement aware resolution

**状态：PLANNED**

#### Goal

停止把“模型能被调用”视为“适合所有 AI workflow”。

#### Scope

```text
AIModelCatalogSnapshot
AIModelCapabilitySnapshot
AIExecutionRequirement
```

最小 capability：

```text
chat
streaming
structuredOutput
toolCalling
vision
```

Execution requirement wiring：

- Assistant streaming/tool mode；
- Goal planner structured output；
- Task planner structured output；
- Knowledge capture structured output。

Resolver：

- selected connection/model owner check；
- enabled/revoked check；
- manual verification policy；
- required capability check；
- remove hard-coded `gpt-4o-mini` fallback；
- stable public failure mapping。

#### Tests

- unsupported structured output model rejected for Goal planner；
- streaming unsupported model rejected for Assistant streaming；
- unknown/manual model verification path；
- disabled provider rejected；
- no model -> configuration-required；
- provider capability snapshot refresh/expiry policy；
- per-conversation selected model still honored when valid。

#### Acceptance

关键 Workflow 不再靠运行时 provider 400/parse failure 才发现模型能力不满足。

#### Dependencies

`AI-9604`

### AI-9606 — Establish AIContextAssembler + Product Time / trust / token-budget foundation

**状态：PLANNED**

#### Goal

实现 ADR-098 的统一 context seam，让所有重要 planner/assistant invocation 使用一致的 time/trust/sensitivity/budget policy。

#### Scope

```text
AIContextEnvelope
ContextSection metadata
AIContextAssembler
UserTimeContextPort adapter
selected entity refs
domain fact sections
knowledge evidence sections
memory projection sections
```

首批接入：

- `goal.create` planner；
- `task.create` planner；
- `knowledge.capture` planner；
- open Assistant tool-enabled invocation。

#### Protected contracts

- ADR-051 primitive taxonomy；
- ADR-093 UserTimeContext；
- secret-prohibited context；
- retrieval untrusted boundary。

#### Tests

- server host timezone invariant；
- same user time context across workflows；
- retrieved instruction cannot alter tool policy；
- secret-shaped fields rejected/redacted；
- token budget truncation deterministic；
- selected entity only, no accidental full-dataset load；
- memory cannot overwrite authoritative domain fact。

#### Acceptance

Goal/Task/Knowledge planner 不再各自实现互相漂移的 timezone/trust context 拼接。

#### Dependencies

`AI-9601`

### AI-9607 — Cut Knowledge index to stable document identity and remove index-status dual truth

**状态：PLANNED**

#### Goal

让 ADR-090/091 成为 AI retrieval/index 的唯一 identity/ownership 基础。

#### Scope

`AiKnowledgeIndexEntry`：

```text
resourceId/path identity
  -> KnowledgeSpaceId + KnowledgeDocumentId
```

实现：

- index repository key by stable document id；
- sourceContentHash/version projection；
- path only display/source snapshot；
- rename/move keeps same index semantic identity；
- remove AI -> Repository canonical `indexStatus` writeback；
- Workspace/read query composes document projection + index projection；
- reindex/delete operation uses stable doc id；
- citation contracts migrate to stable doc ref。

#### Tests

- rename/move retains index identity；
- delete invalidates/removes same document index；
- duplicate path cannot create semantic collision；
- repository path refresh visible in citation；
- no Repository index shadow write；
- PowerSync/Prisma/read-model parity as applicable。

#### Acceptance

AI index 的 semantic identity 不再依赖 mutable path/resource id。

#### Dependencies

`AI-9606`，Knowledge ADR-089～091 implementation seam available

### AI-9608 — Converge Goal/Task/Knowledge workflow drafts to owner-domain target contracts

**状态：PLANNED**

#### Goal

把 AI durable workflows 从旧业务 DTO 收敛到 ADR-067～075、089～091 的 canonical model。

#### Scope

Goal：

```text
GoalPlanDraftV2
Goal name/summary/status/startDate/target
KR initial/current/target/aggregation/weight/target
Knowledge create/linkExisting
```

Task：

```text
TaskDraft.schedule = TaskPlanSchedule
Goal-only / Goal+KR / contribution rules
reminder policy uses Task owner contract
```

Draft identity：

```text
stable draftRef
DraftReferenceMap
```

Apply：

```text
workflowRunId + revision + draftRef + operation
```

UI editor：

- remove legacy `motivation/feasibilityAnalysis/dueDate` Goal fields；
- remove old KR fields；
- remove AI-only Task cadence DSL；
- Goal Brief represented as Knowledge draft；
- preserve structured edit without LLM。

#### Tests

- GoalPlan V2 strict contracts；
- reorder stable draftRef；
- duplicate approve idempotent；
- partial retry only failed refs；
- Task canonical schedule round-trip；
- goal-only Task link；
- contribution requires KR；
- Knowledge linkExisting stable doc id；
- old fields anti-resurrection surface locks；
- Vue draft editor regression。

#### Acceptance

Production Goal/Task AI workflow 不再输出/消费旧 owner-domain vocabulary。

#### Dependencies

`AI-9606`，Task/Goal/Knowledge canonical contracts available

### AI-9609 — Converge Routine/Planner/Notification AI tools to owner contracts

**状态：PLANNED**

#### Goal

删除 AI 模块内部残留的 legacy Reminder/Task/Notification language，让 tools 成为真正薄 owner adapter。

#### Scope

Routine：

```text
FixedTime/Interval
 -> WallClock/Elapsed/ActiveUsage
```

并对齐：

```text
RoutineTemporaryOverride
RoutineInterventionPolicy
RoutineRuntimeContext read projection
```

Planner：

- consume canonical Planner range/occupancy/conflict projection；
- remove old template/instance/dueDate shadow fields when owner contract has replacement；
- no Scheduler runtime internals。

Notification：

- consume Notification Fact/Inbox projection；
- remove central category/template/channel semantics that ADR-084～088 retire；
- no delivery worker state。

#### Tests

- tool schema contract；
- approval requirement for high-impact Routine mutation；
- Routine trigger union strictness；
- Planner read-only architecture lock；
- Notification read-only boundary；
- no raw scheduler/notification repository import；
- old vocabulary source locks。

#### Acceptance

AI tools 只裁剪 owner canonical contracts，不再成为业务旧模型博物馆。

#### Dependencies

Routine/Planner/Notification target contracts implemented enough for adapters；可与 AI-9608 后半并行

### AI-9610 — Rename execution log to AIExecutionRecord and delete proven legacy AI models

**状态：PLANNED**

#### Goal

让 AI persistence 命名与真实 ownership 一致，并删除已被 Mastra/owner models 取代的遗留表。

#### Scope

`AiGenerationTask`：

```text
-> AIExecutionRecord
```

保留：

```text
identity/conversation/run/request/trace/provider/model
usage
estimatedCost
latency
terminal outcome
sanitized error
```

禁止：

```text
workflow snapshot
full draft
resume cursor
pending tool state
```

Legacy audit/delete：

```text
AiUsageQuota
KnowledgeGenerationTask
AiGenerationTaskId old VO
AiUsageQuotaId old VO
```

只有 consumer/portability audit 证明无必要 production semantics 才删除。

#### Tests

- execution record mapper/repository；
- conversation/run usage aggregation；
- sanitized metadata；
- no snapshot/raw prompt/secret；
- Prisma/PowerSync schema migration；
- data portability behavior；
- source locks for deleted models。

#### Acceptance

```text
AIExecutionRecord = operations projection
Mastra Workflow = execution truth
```

没有重复状态机；无 consumer 的 legacy tables 被物理删除。

#### Dependencies

`AI-9604`, `AI-9605`；legacy deletion 还依赖 `AI-9608/9609` consumer audit

### AI-9611 — Split over-broad AI application capabilities only where consumer boundaries are proven

**状态：PLANNED**

#### Goal

避免 `AIApplicationPort` 继续扩成 God facade，同时不做纯形式接口拆分。

#### Scope

按真实 consumer 拆：

```text
AIProviderManagementPort
AssistantConversationPort
AIKnowledgePort
AIEvaluationOperationsPort
```

迁移调用方：

- Settings AI section -> Provider；
- Assistant conversation list -> Conversation；
- Knowledge QA/index admin -> Knowledge；
- eval/ops UI/commands -> Evaluation/Operations。

可保留 temporary composition facade，但必须有删除点，不成为长期 second public API。

#### Tests

- DI composition；
- HTTP/IPC parity；
- Settings 不依赖 Eval methods；
- Assistant UI 不依赖 Provider secret/internal methods；
- no circular module dependency。

#### Acceptance

每个主要 consumer 只依赖实际需要的 AI capability。

#### Dependencies

`AI-9603`, `AI-9604`, `AI-9607`, `AI-9610`

### AI-9612 — Five-layer review / failure hardening / docs truth / exact-head closure

**状态：PLANNED**

#### Goal

按 Core vNext 质量标准完成 AI model convergence closure。

#### Layer 1 — Contract correctness

审：

- Conversation shell/runtime authority；
- Provider secret/capability；
- Context trust/time；
- stable document identity；
- Workflow Draft/Apply；
- ExecutionRecord；
- owner-domain tool boundaries。

#### Layer 2 — Vertical completeness

每条 vertical 检查：

```text
contracts
application/domain
Mastra runtime
Prisma/PowerSync
HTTP/IPC
Vue
Data Portability
eval/operations
```

关键 journeys：

```text
open chat
conversation restore/delete
goal.create
task.create
knowledge.capture
knowledge QA
routine tool approval
provider onboarding/replacement
```

#### Layer 3 — Behavioral completeness

重点 fixture：

- restart/reconnect；
- stale unsaved editor overlay；
- provider revoked during run；
- unsupported structured output model；
- partial workflow retry；
- document rename/move；
- context token truncation；
- retrieved prompt injection attempt；
- secret leak regression；
- deleted legacy table migration。

#### Layer 4 — Engineering quality

- no second runtime；
- no duplicate business vocabulary；
- no raw owner repositories in AI tools；
- no ambient timezone；
- no secret in DTO/event/log/snapshot；
- no giant AIApplicationPort growth；
- no permanent compatibility fallback；
- no dead AI aggregate ceremony。

#### Layer 5 — Docs/plan truth

- ADR target == implementation；
- current-system docs updated to implementation truth；
- `docs/product/modules/ai.md` target notice converted to implemented wording；
- module file index updated；
- plan ticket evidence captured；
- no P0/P1 unresolved。

#### Final gates

至少执行：

```text
contracts AI focused tests
ai typecheck/test/build
app-vue AI tests/typecheck
api AI composition tests/typecheck
desktop AI composition tests/typecheck
Prisma validate/generate
PowerSync schema parity
Data Portability AI fixtures
AI eval replay/release gates
Web AI workspace E2E
Desktop AI product journey where available
lint
build
docs:check
governance:check
required exact-head CI
```

#### Archive rule

只有：

```text
no P0/P1
required CI green on exact merge head
legacy surface locks green
provider secret leak tests green
owner-domain vocabulary locks green
docs current truth updated
merge/delivery evidence captured
```

才把本 plan 移入 archive。

## 7. Dependency graph

```text
AI-9601  Design freeze
   │
   ├──────────────┬─────────────────┐
   ▼              ▼                 ▼
AI-9602        AI-9604           AI-9606
Conversation   Provider          Context foundation
baseline       Secret seam
   │              │                 │
   ▼              ▼                 ├──────────────┐
AI-9603        AI-9605              ▼              ▼
Conversation   Model capability  AI-9607        AI-9608
+ UI state     resolver          Knowledge       Goal/Task/
                               identity         Knowledge drafts
                                                  │
                                    ┌─────────────┴─────────────┐
                                    ▼                           ▼
                                 AI-9609                     AI-9610
                                 Owner tools                  ExecutionRecord
                                    │                           │
                                    └─────────────┬─────────────┘
                                                  ▼
                                               AI-9611
                                               Capability ports
                                                  │
                                                  ▼
                                               AI-9612
                                               Review/archive
```

## 8. Safe parallelism

### Lane A — Conversation/UI state

```text
AI-9602 -> AI-9603
```

### Lane B — Provider/model

```text
AI-9604 -> AI-9605
```

### Lane C — Context/Knowledge

```text
AI-9606 -> AI-9607
```

在 owner contracts 足够稳定后：

```text
AI-9608 Goal/Task/Knowledge workflows
AI-9609 Routine/Planner/Notification tools
```

可并行。

约束：

- 不能两个 Worker 同时修改 AI core runtime contracts/storage composition；
- Provider lane 不改 Workflow business draft；
- Conversation lane 不改 Provider secret persistence；
- Context lane 不重写 Knowledge owner domain；
- AI-9610 legacy table deletion 必须等 consumer audit 完成；
- AI-9611 interface split 最后做，避免迁移中反复改 facade。

## 9. Risk ledger

| Risk                                              | Impact | Containment                                                      |
| ------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| 提前删除 AiMessage 丢 transcript                  | P0     | AI-9602 characterization + idempotent bootstrap/export fixtures  |
| UI local overlay 覆盖 newer workflow revision     | P1     | runtime revision binding + stale overlay discard/conflict UI     |
| Secret refactor把 credential 泄漏进 migration/log | P0     | leak tests + secret-only edge boundary                           |
| Model capability probe误判                        | P1     | provenance + unknown state + fail-closed on critical workflow    |
| Owner-domain contracts 尚在迁移                   | P1     | adapter on canonical target, legacy only bounded migration layer |
| Knowledge index identity cutover错绑 document     | P0/P1  | stable-id migration fixture + path rename/move corpus            |
| draftRef migration破坏 partial retry              | P1     | deterministic idempotency/recovery fixtures before deletion      |
| ExecutionRecord rename误删 usage history          | P1     | data migration + before/after aggregation parity                 |
| `AiUsageQuota` 实际有隐藏 consumer                | P1     | full consumer/transport/portability audit before delete          |
| AIApplicationPort 拆分造成 DI churn               | P2     | last-stage consumer-driven split only                            |

## 10. Current status

```text
AI-9601  DONE — docs/design package only
AI-9602  ACCEPTED LOCALLY — runtime authority characterization and AiMessage consumer ledger
AI-9603  IMPLEMENTED LOCALLY / REVIEW PENDING — shell/runtime cutover; physical AiMessage deletion deferred
AI-9604  PLANNED
AI-9605  PLANNED
AI-9606  PLANNED
AI-9607  PLANNED
AI-9608  PLANNED
AI-9609  PLANNED
AI-9610  PLANNED
AI-9611  PLANNED
AI-9612  PLANNED
```

本状态明确表示：

> **AI-9603 已开始并完成 conversation shell/runtime boundary 的本地实现；后续 provider、context、owner
> vocabulary、execution-record 与 legacy schema deletion 仍未开始。**

2026-08 的 Mastra-native runtime implementation 已经完成；本计划只针对 2026-09 新冻结的 product model alignment。

## 11. Definition of Done

最终仓库必须满足：

```text
Mastra remains sole Agent/Workflow runtime
Conversation is a thin product shell
transcript/workflow runtime state has no second durable truth
Provider connection contains credentialRef, not plaintext secret
critical workflows are gated by verified model capabilities
Context uses canonical UserTimeContext/trust/token budget
AI tools/drafts follow owner-domain current vocabulary
Knowledge index keys by stable KnowledgeDocumentId
stable draftRef survives reorder/retry
AIExecutionRecord is telemetry/operations only
no fake quota/generation-task legacy remains without a real consumer
Prisma/PowerSync/HTTP/IPC/UI/Portability/docs agree
```
