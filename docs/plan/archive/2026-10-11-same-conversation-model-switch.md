---
tags: [plan, ai, chat]
description: Preserve conversations for compatible model and Mastra instance changes.
created: 2026-10-11T00:00:00Z
updated: 2026-10-11T00:00:00Z
---

# Same-conversation model switching

1. Prove same-conversation Mastra instance/model switching with failing selection and persistence tests.
2. Allow enabled, bound Mastra selections while preserving conversation identity and local next-turn selection; restore server selection when no valid local choice exists.
3. Update both persistence adapters to accept validated Mastra instance changes atomically. Validate model and reserve the conversation before changing its last accepted selection.
4. Disable incompatible runtime/connection choices in Composer, including search/favorites and alternate handlers. Keep same-native-connection model selection. Block changes while running or reviewing workflows.
5. Preserve per-turn execution source and history. Test rollback on invalid/busy requests and browser selection/disabled behavior; run nearest Nx tests, typechecks and governance.

## Guardrails

Registry owns last accepted Mastra turn selection; browser conversation selection is the pending next-turn choice. Mastra Memory owns transcript; native drivers keep their own connection/session history. No cross-runtime handoff is introduced. Owner-scoped transactions validate enabled Mastra instance and model-service binding on each accepted turn. Runtime reservation spans async model validation, setup, binding and stream; failed setup/validation and competing requests do not change last accepted selection. Existing permissions are reapplied every turn; changing instance resets supervised mode. Closed frontend disabled reasons must drive both UI and action guards. Preserve existing uncommitted Provider fixes.

## Completion and evidence

- Mastra model/service/instance choices no longer clear the conversation or draft, including previously unclaimed conversation shells. All automatic-new-conversation branches were removed from Composer and alternate model/native selection handlers.
- Server and desktop transactions revalidate enabled Mastra targets and owned model-service connections, then update the last accepted selection. Runtime reserves the owner/conversation before async preparation; failed model validation and overlapping dispatches cannot update selection. Reservation is process-local, matching the existing single runtime owner; no distributed lease or cross-runtime handoff was added.
- Composer marks incompatible runtime/connection choices with a lock, dimmed appearance and localized reason. Their selection is blocked through sidebar, search, favorites and alternate action handlers. Running/tool-approval and unfinished workflow states also block switching. Same native connection/model behavior remains supported; native instance changes remain unavailable.
- A validated browser-local pending next-turn choice survives remount and catalogue loading. Server selection remains the last accepted turn and is the fallback when no valid local choice exists; unsent choices are not synchronized to another browser/device. Failed authority reads keep sends disabled.
- Instance changes reset permissions to supervised. Each accepted turn reapplies its own tool policy. Existing execution records gained nullable agent_instance_id in Prisma/PowerSync; prior records/history remain intact. Generated Prisma artifacts were regenerated through Nx. Existing schema preparation adds the column idempotently. Host-dev received only the additive column, and the watched API was reloaded after generation; API/Web health checks succeeded.
- UI: 43 targeted tests passed; the 14 lifecycle tests were repeated after adding the permission-reset assertion and passed.
- Runtime: 61 Registry/native Mastra controller/history/context/observability/adapter tests, plus 33 native-runtime/model-resolver tests passed. Two actual native controller turns used different model adapters and instance IDs while the second received the first question and response; execution sources remained distinct.
- PostgreSQL schema preparation: 3 integration tests passed using their own temporary database, including idempotent nullable attribution on historical records.
- Browser: 4 passed, 1 opt-in external-provider test skipped. Real API, PostgreSQL, SecretVault, Chromium and local HTTPS streaming fixture ran two replies from different Mastra instances/models with the same conversationId; conversation count remained one. Pending selection survived a Settings round-trip. Earlier Provider states, narrow layout and model picker checks also passed. The isolated E2E database was removed.
- app-vue/ai/contracts typechecks, changed-file ESLint, format checks, git diff --check and governance passed. ESLint only reported its expected generated-file ignore warning; no source errors.

No commit, PR, merge or Staging/production deployment was performed. Native packaged desktop UI and commercial inference were not exercised. Existing uncommitted Provider repairs were preserved.

Browser evidence: [Composer](../../analysis/evidence/2026-10-11-same-conversation-model-switch/composer-three-controls.png), [390px picker](../../analysis/evidence/2026-10-11-same-conversation-model-switch/model-picker-390.png).
