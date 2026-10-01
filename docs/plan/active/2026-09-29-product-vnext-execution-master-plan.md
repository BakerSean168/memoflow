---
tags:
  - plan
  - product-vnext
  - goal
  - task
  - schedule
  - routine
  - knowledge
  - notification
  - settings
  - ai
  - ui
  - shell
  - governance
status: active
created: 2026-09-29T13:00:00+08:00
updated: 2026-09-30T08:26:17Z
description: MemoFlow Product vNext 全量执行拆分方案，将 Goal、Task 与剩余模块审查结果转成可独立实施/审查的 tickets
---

# MemoFlow Product vNext — Execution Master Plan

## 1. 目的

本计划把 2026-09-29 前已经冻结的产品讨论、Goal/Task 深度审查、剩余模块完整审查、Native Surface Orchestration 与 Quick Surface 决策，统一拆成可实施、可并行、可验收的工程 tickets。

它不重新做产品发现，而是回答：

1. 先改什么，为什么；
2. 哪些 ticket 可以并行；
3. 哪些 contract 必须先扩展/迁移；
4. 哪些旧 UI/route/runtime 只能在 parity 后删除；
5. 每个 ticket 用什么测试和证据关闭。

父级战略计划：

- [Product vNext Convergence](./2026-09-29-product-vnext-convergence.md)

决策/审查真值：

- [Goal vNext Workspace & Create UI](../../product/goal-vnext-workspace-and-create-ui.md)
- [Task vNext Plan/Occurrence Workspace](../../product/task-vnext-plan-occurrence-workspace.md)
- [Task second-pass deep audit](../../analysis/2026-09-29-task-vnext-second-pass-deep-audit.md)
- [Remaining Modules Full Surface / UI Audit](../../analysis/2026-09-29-product-vnext-remaining-modules-full-surface-audit.md)
- [Native Surface Orchestration + Quick Surface](../../product/native-surface-orchestration-and-quick-surfaces.md)
- [ADR-112](../../architecture/adr/ADR-112-owner-native-surface-orchestration-and-quick-surface-reuse.md)
- [ADR-113](../../architecture/adr/ADR-113-retire-product-governance-runtime-keep-engineering-governance.md)

---

# 2. North Star

最终产品结构：

```text
Primitive Layer
      ↓
Owner Native Surface
      ↓
Host Surface
```

业务对象：

```text
Goal       Full Workspace + Quick/Inspect/Record surfaces
Task       Full Workspace + Task Quick Surface
Schedule   Calendar Workspace + Dialog hosts
Routine    Configuration Workspace + Quick Surface
Knowledge  Document Workspace
Settings   Settings Scene
AI         Surface Orchestrator + Conversation
```

AI 不维护第二套 Goal/Task/Knowledge 产品 UI。

跨模块快速入口不复制 owner mutation semantics。

---

# 3. Protected contracts

所有 tickets 默认保护以下 contract；若 ticket 需要迁移，必须在该 ticket 内显式写 migration/compatibility。

## Goal

- Goal/KR/Record/Review owner truth；
- KR calculation methods: Sum/Average/Max/Min/Last；
- public Goal/KR/Review deep links 在 retirement window 内可解析；
- Knowledge/Task context 只读 projection，不转移 ownership；
- optimistic/version semantics。

## Task

- TaskPlan / TaskOccurrence 分离；
- Overdue 是派生事实，不自动 Missed/Failed；
- Completed/Missed/Skipped 是显式 occurrence facts；
- TaskPlan route `/tasks/:id` 保留；
- Goal/KR record 仍由 Goal owner 写入；
- durable Task→Goal outbox；
- old `completionPolicy` 在 versioned migration 前继续 round-trip。

## Schedule

- CalendarEntry 属于 Schedule；
- Task/Goal/Routine 是 owner projection；
- drag/resize 走 owner command router；
- Scheduler/Temporal Engine 不泄露成 UI owner。

## Routine

- Profile/Membership/TemporaryOverride ownership；
- Product Time/WallClock semantics；
- host capability gating；
- 不恢复 legacy Reminder CRUD。

## Knowledge

- stable document identity；
- Web projection-only；
- Desktop local-vault / external-editor boundary；
- 不内建 Markdown full editor。

## Notification

- Fact/Inbox/Workflow/Delivery/Interaction 分离；
- read != business completion；
- typed owner actions；
- SSE cursor/reconnect。

## Settings/Auth/Account

- Settings capability ownership 不集中化；
- Auth identity 与 Account profile 分离；
- `/account -> /settings?tab=account` canonical；
- host/device-specific capability behavior 保留。

## AI/Shell

- Mastra draft/restart/retry/approval semantics；
- BusinessPanel dirty/busy/leave guard；
- shell geometry/min widths/focus mode；
- AI 只通过 owner semantic surface/action/ports 改业务状态。

---

# 4. 总依赖图

```text
Phase 0 Baseline
   ├──────────────┬────────────────┐
   ↓              ↓                ↓
Goal core      Task lifecycle   UI visual harness
   ↓              ↓
Goal Record       Task Home/Quick
   └──────┬───────┘
          ↓
Goal/Task Measurement Vertical Slice
          ↓
Task Quick Surface + Action Coordinator
          ↓
Schedule Dialog + Owner Quick Surface
          ↓
Owner Native Edit Session
          ↓
AI Goal Native Slice
          ↓
AI Task / Knowledge Native Slice
          ↓
Retire AI-owned editors / evaluate workflow surface

Parallel after reference grammar is proven:
Routine / Knowledge / Notification / Settings

Parallel gated track:
Governance retirement decision

Final:
Shared grammar cleanup + screenshot matrix + accessibility/perf closure
```

---

# 5. Phase 0 — Baseline / Characterization

## PVC-BASE-001 — Validation ledger and clean baseline

**Goal:** 每个后续 batch 都有统一、可重复的验证入口。

**Scope:** repository validation commands + current branch baseline。

**Implementation:**

1. 记录 branch/main ancestry、clean status、当前 Product vNext branch-only commits。
2. 建立 `docs/plan/active/...` 内验证矩阵，不新增 runtime code。
3. 确认 `goal/task/schedule/notification/ai/setting/account` Nx targets。
4. 记录 focused Vitest、package test/typecheck、app-vue typecheck/test、web build、相关 E2E 命令。
5. 对超时的 full governance-check 拆成可独立执行的 governance checks，记录实际结果。

**Tests / commands:**

- `git diff --check`
- `pnpm nx run app-vue:typecheck`
- targeted docs/governance checks

**Acceptance:** 后续 ticket 不再临时猜验证命令；branch clean，main 无 behind。

**Execution (2026-09-30): Implemented / validated.** The command ledger is verified at the recorded HEAD: eight focused suites (125 tests), Goal/Task contracts (167 tests), all eight typechecks, web build, integration/browser discovery, docs and full governance checks passed. Broad package/Vue test attempts were interrupted and replaced by verified focused commands; database integration and browser scenario execution remain explicitly deferred pending disposable database ownership. This is baseline/ledger acceptance, not full product acceptance. No runtime/product code was modified.

**Validation ledger (2026-09-30; PVC-BASE-001 only):** Run from repository root with Node 24.21.0 / pnpm 11.20.0. Use `NX_DAEMON=false` on this worktree; append `--skipNxCache` for fresh test evidence. Focused paths are relative to the target package, not repository root. Bound Vitest workers with `--maxWorkers=2` when sharing this host. The recorded validation baseline was branch `product/vnext-base-001` at HEAD `6e2bac28df74992a785d5ddab33c259d96b3593d`; merge-base and local/live remote `main` are `d3a32135709cc650aee712bf7fb13e02a17ea08d` (behind 0 / ahead 37). Entry `git status --porcelain=v1` was empty. Completion must leave only this plan and the linked archive evidence report modified/untracked; generated/cache/build output must remain ignored, with no runtime/config/lockfile edits. No commit/push is part of this ticket.

| Owner        | Focused unit command (`pnpm nx run …`)                                                            | Package gates                                 | Database integration target                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| goal         | `goal:test -- src/shared/goal-record-preview.spec.ts --maxWorkers=2`                              | `goal:test`, `goal:typecheck`                 | `goal:test:integration`                                                                                  |
| task         | `task:test -- src/server/domain/aggregates/__tests__/TaskOccurrence.test.ts --maxWorkers=2`       | `task:test`, `task:typecheck`                 | `task:test:integration`                                                                                  |
| schedule     | `schedule:test -- src/server/domain/aggregates/__tests__/calendar-entry.spec.ts --maxWorkers=2`   | `schedule:test`, `schedule:typecheck`         | `schedule:test:integration`                                                                              |
| notification | `notification:test -- src/server/domain/aggregates/__tests__/notification.spec.ts --maxWorkers=2` | `notification:test`, `notification:typecheck` | `notification:test:integration`                                                                          |
| ai           | `ai:test -- src/server/domain/aggregates/__tests__/ai-conversation.spec.ts --maxWorkers=2`        | `ai:test`, `ai:typecheck`                     | No dedicated target; owner/workflow tests under `ai:test`, browser AI lane below                         |
| setting      | `setting:test -- src/server/preferences/user-preference-service.spec.ts --maxWorkers=2`           | `setting:test`, `setting:typecheck`           | No dedicated target; Prisma/PowerSync adapter tests under `setting:test`, browser persistence lane below |
| account      | `account:test -- src/server/domain/aggregates/__tests__/Account.test.ts --maxWorkers=2`           | `account:test`, `account:typecheck`           | `account:test:integration`                                                                               |
| app-vue      | `app-vue:test -- src/modules/goal/components/dialogs/GoalDialog.spec.ts --maxWorkers=2`           | `app-vue:test`, `app-vue:typecheck`           | No dedicated target; browser lanes below                                                                 |

Repeatable package batch: `pnpm nx run-many -t test --projects=goal,task,schedule,notification,ai,setting,account --parallel=1 -- --maxWorkers=2`; typecheck batch: `pnpm nx run-many -t typecheck --projects=goal,task,schedule,notification,ai,setting,account,app-vue --parallel=2`. Nx typecheck inherits `^build`; app-vue explicitly builds dependencies. Do not replace these with a bare compiler before dependency declarations exist. Package `test` excludes `*.integration.{test,spec}.*`; package green does not imply database integration green. Run dependency-building batches sequentially in one worktree: overlapping `--skipNxCache` builds can remove declarations while another compiler reads them.

| Validation lane                   | Concrete entry point / lower-level split                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared Goal/Task contracts        | `pnpm nx run contracts:test -- src/modules/goal src/modules/task --maxWorkers=2`                                                                                                                                                                                                                                                                                                                                |
| Full Vue tests / owner slice      | `pnpm nx run app-vue:test -- --maxWorkers=2`; narrow using `-- src/modules/goal src/modules/task src/modules/schedule src/modules/notification src/modules/ai src/modules/setting src/modules/account --maxWorkers=2`                                                                                                                                                                                           |
| Web build                         | `pnpm nx run web:build` (inferred Nx/Vite target; dependency builds included)                                                                                                                                                                                                                                                                                                                                   |
| Database integration              | `pnpm nx run-many -t test:integration --projects=goal,task,schedule,notification,account --parallel=1`; narrow per owner using `pnpm nx run <owner>:test:integration -- <package-relative-file>`                                                                                                                                                                                                                |
| Safe integration discovery        | `pnpm --dir packages/<owner> exec vitest list --config vitest.integration.config.ts --filesOnly` for the five owners above; discovery does not execute global setup                                                                                                                                                                                                                                             |
| Browser preflight / discovery     | `pnpm runtime:preflight:e2e`; `TEST_INVENTORY_LIST=1 pnpm nx run web:e2e -- --list`; `pnpm nx run web:e2e:audit -- --list --reporter=list`                                                                                                                                                                                                                                                                      |
| Core browser owner flows          | After safe DB verification and preflight: `pnpm nx run web:e2e -- e2e/goal/goal-crud.spec.ts e2e/task/task-plan-crud.spec.ts e2e/task/task-completion-loop.spec.ts e2e/schedule/schedule-calendar.spec.ts e2e/notification/notification-inbox-loop.spec.ts e2e/ai/goal-workflow.spec.ts e2e/user-settings/persistence.spec.ts`                                                                                  |
| Account / secondary browser flows | `pnpm nx run web:e2e:audit -- e2e/account/account-profile.spec.ts e2e/account/account-management.spec.ts e2e/goal/goal-keyresult.spec.ts e2e/setting/setting-appearance.spec.ts`; account specs are in audit, not core                                                                                                                                                                                          |
| Specialist browser lanes          | `pnpm nx run web:e2e:ai-workspace`; `pnpm nx run web:e2e:sync`; `pnpm nx run web:e2e:shell`; `pnpm nx run web:e2e:local-docker` (own configurations/runtime prerequisites; never silently reuse unrelated running services)                                                                                                                                                                                     |
| Documentation/governance          | `pnpm nx run memoflow:docs-check`; `pnpm nx run memoflow:governance-check`                                                                                                                                                                                                                                                                                                                                      |
| Governance timeout split          | Run dependencies individually: `memoflow:test:governance`, `governance-tools:test`, `test-system-v2:test`, `test-system-v2:test:governance`, `test-system-v2:ruleset` via `pnpm nx run`. Then run each `node ./tools/...mjs` command in `project.json` → `targets.governance-check.options.command` individually in its declared order. Record every exit; a partial subset never means full governance passed. |
| Diff / clean baseline             | `git diff --check`; `git status --porcelain=v1`; `git diff --name-only`; `git ls-files --others --exclude-standard`; `git merge-base --is-ancestor origin/main HEAD`; `git rev-list --left-right --count origin/main...HEAD`; `git ls-remote origin refs/heads/main`                                                                                                                                            |

**Database safety:** Integration global setup and the browser API helper call `ensureTestDatabase`, which enables extensions and runs Prisma `db push --accept-data-loss`; tests can `TRUNCATE … CASCADE`. Default is the test lane on `127.0.0.1:5433`, database `memoflow_test`, but process `TEST_DATABASE_URL` / `TEST_DB_*` can override it. Verify the effective destination is disposable and exclusively owned before any full integration/E2E run. Do not redirect to host-dev/prod-like/staging/prod, set `CI=true` to evade setup, force reset, or suppress a destructive-operation refusal. Open-port preflight is not database ownership proof. This ticket records discovery separately from execution.

**Evidence:** [PVC-BASE-001 baseline report](../archive/2026-09-30-pvc-base-001-validation-ledger.md) records all 37 inherited batch commits, actual commands/exits/counts, and deferred database/browser acceptance. Only this ticket's execution status is changed by this batch.

**Dependencies:** none.

---

## PVC-BASE-002 — Interaction characterization pack

**Completed (2026-09-30):** Characterization pack complete with no production changes. All six bullets audited; mounted Goal KR/Review router tests, Schedule CalendarEntry click/read-only tests, and durable Task workflow retry added; existing Task quick route/lifecycle and AI restart/approval coverage reused. [Exact tests, current behavior, harness boundaries, and passing validation evidence](../archive/2026-09-30-pvc-base-002-interaction-characterization.md).

**Goal:** 在删除 route/组件/旧 action 前先锁住当前可用行为。

**Scope:** Goal KR/Review deep link、Task lifecycle/quick route、Schedule inspect、AI workflow persistence。

**Implementation:**

1. 为 Goal KR deep link 增加 refresh/not-found/close characterization。
2. 为 Goal Review create/detail deep link 增加 characterization。
3. 为 `/tasks?dialog=quick-task` 增加当前失败/目标行为测试。
4. 为 Task End Plan/Archive 当前语义增加防回归 characterization。
5. 为 Schedule CalendarEntry click/read-only 当前路径增加 characterization。
6. 为 AI goal/task workflow restart/retry/approval 增加/确认现有 test coverage。

**Acceptance:** 所有计划退休/迁移的入口都有现状测试或明确 failing test。

**Dependencies:** none.

---

## PVC-BASE-003 — Visual regression harness foundation

**Goal:** 把视觉收敛从人工截图变成确定性 fixture。

**Scope:** Playwright screenshot harness / fixture seed only。

**Implementation:**

1. 选定 deterministic fixture strategy。
2. 固定 viewport / theme / locale / business-panel width。
3. 先建立 Goal create/detail、Task Today/Plan、Schedule Calendar 三类 baseline。
4. 其余模块在迁移完成后逐步加入。
5. baseline 不与 debug/thesis screenshots 混用。

**Acceptance:** 至少 3 个核心 surface 可重复生成与比较 screenshot。

**Dependencies:** none.

---

# 6. Phase 1A — Goal reference implementation closure

Goal 是后续 property/direct-manipulation/measurement/review grammar 的第一个真实 reference owner。

## PVC-GOAL-1101 — Remove Reminder from Goal Create

**Goal:** 创建 Goal 时不显示 Reminder；创建后仍可配置。

**Files:**

- `GoalDialog.vue`
- `GoalDialog.spec.ts`

**Implementation:**

1. 定位 create/edit mode property row。
2. create mode 移除 Reminder chip/render path。
3. 保留 edit/detail reminder flow。
4. 确认 create payload 无 reminder 仍合法。
5. 更新 tests/i18n snapshot/visual fixture。

**Acceptance:** 新建 Goal 看不到 Reminder；既有 Goal 可正常添加/编辑 Reminder。

**Execution (2026-09-30): Implemented; independently reviewed.** Create mode no longer mounts `GoalReminderChip` and always omits `reminderConfig` from its request, including when stale reminder state exists. Opening/switching to create resets the draft independently of a retained edit Goal prop; switching mode also recreates the KR draft editor to clear its local unsaved form. Edit reminder selectors, payloads and planning validation remain supported; reminder domain/API/persistence support is unchanged.

**Validation:** focused `GoalDialog.spec.ts` PASS (25 tests), including create omission/schema validity, stale draft isolation, edit reminder changes/validation and complete reopen/mode-switch reset with an unsaved KR form. Browser visual acceptance was not run. Full command results and review repairs: [archived implementation report](../archive/2026-09-30-pvc-goal-1101-remove-create-reminder.md).

**Dependencies:** BASE-001.

---

## PVC-GOAL-1102 — KR trajectory primary surface

**Goal:** Goal Detail 直接解释 KR baseline/current/target/trend，不依赖深层页面。

**Files:**

- `GoalDetailView.vue`
- `GoalKeyResultTrajectoryPlot.vue`
- current KR row/card components

**Implementation:**

1. 在 Goal Detail KR section 接入 trajectory-first summary。
2. 同屏展示 Initial/Current/Target/unit/method/weight/timeframe。
3. 多 KR 情况保持 compact density。
4. linked Task context 降为 secondary metadata。
5. 保留 current route behavior，暂不删除 KeyResultDetailView。

**Tests:** Goal detail focused specs + visual baseline。

**Acceptance:** 不打开新页即可理解一个 KR 的状态与方向。

**Execution (2026-09-30): Implemented / validated.** Goal Detail now uses the Goal-owned `GoalKeyResultTrajectoryPlot` read-only presentation to show labeled Initial/Current/Target values with the actual KR unit, GOAL-1104 calculation vocabulary, weight and effective target timeframe (KR override, then Goal target). Compact plots keep the existing geometry; long unit labels can expand the layout without overlapping the chart. Current opens the existing quick check-in dialog, while KR title links and `KeyResultDetailView` remain available for GOAL-1301. Linked Task context follows as secondary metadata. Existing overflow actions remain; no GOAL-1103 direct editing or new calculation authority was introduced.

**Validation:** focused app-vue suite 6 files / 114 tests PASS; `app-vue:typecheck` PASS; changed-file ESLint PASS; `git diff --check` PASS; `memoflow:governance-check` PASS. Isolated owner-plot Chromium checks at 800px/360px verify density, long-unit layout and native Enter/Space activation; this does not claim an authenticated E2E or committed golden screenshot baseline. See [implementation report](../archive/2026-09-30-pvc-goal-1102-trajectory.md).

**Dependencies:** GOAL-1104 presentation map 可并行开发，合并前需接入。

---

## PVC-GOAL-1103 — KR direct manipulation

**Execution (2026-09-30): Implemented / validated / independently reviewed.** Goal Detail now provides Goal-owned inline title/description edits and direct method/weight/timeframe controls using the existing calculation vocabulary, Select/Popover primitives and GoalTimeframePicker. Metadata patches use the canonical updateKeyResult command with aggregate expectedVersion; a shared busy gate serializes writes and canonical mutation receipts provide the next displayed value/version. Failed edits reset to canonical values and expose existing error feedback. Current still opens the Goal Record composer; measurement values remain read-only. Normal KR Edit overflow is removed after parity checks; create/delete/bound-task/detail routes remain. No GOAL-1301, Review or Task domain changes.

**Validation:** PASS — 8 focused/regression spec files / 143 tests, app-vue:typecheck, changed-file ESLint, git diff --check, memoflow:governance-check; isolated Chromium production-CSS keyboard/layout checks at 800px and 360px (not authenticated E2E). Evidence: [GOAL-1103 implementation report](../archive/2026-09-30-pvc-goal-1103-direct-manipulation.md).

**Goal:** 常用 KR 修改不需要 Edit 按钮。

**Implementation:**

1. title/description inline edit。
2. method/weight/timeframe 使用 popover/menu/picker。
3. current affordance 指向 Record composer。
4. 删除普通 `Edit` action 前先验证功能 parity。
5. mutation failure 保留 rollback/error feedback。

**Acceptance:** 常规 KR 修改均在 Goal Detail/Inspect 原地完成。

**Dependencies:** GOAL-1102, GOAL-1104.

---

## PVC-GOAL-1104 — Single KR calculation presentation map

**Goal:** 所有 Goal/Task/AI UI 使用同一个用户语言 mapping。

**Mapping:** 累计 / 平均值 / 最高值 / 最低值 / 最新值。

**Implementation:**

1. 建立 Goal-owned presentation utility/contract。
2. 接 create/edit/detail/inspect/record composer。
3. unit/record-prompt 一并集中。
4. tests 覆盖五种 method。

**Acceptance:** feature UI 不再各自 hardcode `Sum/Average/Max/Min/Last` copy。

**Execution (2026-09-29): Implemented / validated.** 已建立 Goal-owned `key-result-calculation-presentation` authority，冻结五种方法顺序与用户语言：`Sum -> 累计/Cumulative`、`Average -> 平均值/Average`、`Max -> 最高值/Maximum`、`Min -> 最低值/Minimum`、`Last -> 最新值/Latest`；同时预先集中 Record input semantic：Sum=`delta` / 本次变化，其他四种=`sample` / 本次记录值。utility 只负责 presentation，不承担 aggregation math，unit 继续来自 KR 自身。Goal KR card/draft editor、KeyResult detail 与 AI Goal draft 已复用同一 authority；Task 当前尚未投影 method/unit，本 ticket 不越权扩展，仍由 TASK-3301A 处理。

**Validation:** focused app-vue suite 7 files / 52 tests PASS；`app-vue:typecheck` PASS；changed-file ESLint PASS；Prettier PASS；`git diff --check` PASS；`memoflow:governance-check` PASS。详见 [implementation report](../../analysis/2026-09-29-pvc-goal-1104-implementation.md)。

**Dependencies:** BASE-001.

---

## PVC-GOAL-1201 — Measurement-aware Goal Record Composer

**Goal:** GoalRecord UI 正确表达 delta/sample，而不是默认正增量。

**Current defects covered:** Sum-biased Plus icon、positive-only、+1/+2/+5/+10 对所有 method 生效、duplicate RecordCard presentation。

**Files:**

- `GoalRecordDialog.vue`
- `GoalRecordDialog.spec.ts`
- `GoalRecordCard.vue` x2
- `useGoalRecords.ts`
- Goal Record contracts/use cases as required

**Implementation:**

1. 明确 Sum=delta、Average/Max/Min/Last=sample。
2. 允许 signed finite value；移除 global positive-only UI assumption。
3. 依据 method 切换 label/icon/help/quick values。
4. 合并重复 GoalRecordCard presentation。
5. 处理 `recordedAt` client/schema drift：要么显式 contract，要么删除 phantom field。
6. 保存后刷新 KR current/trajectory。

**Acceptance:** 五种 calculation method 都有正确输入语义；0/负值按 domain semantics 处理，不被通用 positive rule 错杀。

**Execution (2026-09-29): Implemented / validated.** `GoalRecordDialog` 现在直接消费 GOAL-1104 的 Goal-owned calculation presentation contract：Sum 作为 signed delta（本次变化），Average/Max/Min/Last 作为 sample（本次记录值）；所有方法允许 finite 的 0/负值，不再存在通用 `> 0`、`min=0.1` 或 10000 上限假设。Sum 提供对称 signed quick deltas，sample methods 不显示 delta quick chips；KR unit 原样呈现。手工 Record create helper 已删除 phantom `recordedAt`，由现有 GoalMutationReceipt 立即刷新 canonical KR currentValue，无额外 refetch。重复的两个 `GoalRecordCard` 已收敛为单一 neutral implementation，兼容 export name 保留。GoalRecord domain create 与 update 均显式 finite-number invariant；shared Zod contract 的 NaN/Infinity 拒绝行为已 characterization。

**Validation:** app-vue focused 4 files / 81 tests PASS；Goal domain/progress 3 files / 24 tests PASS；Goal use-case 3 files / 17 tests PASS；`app-vue:typecheck` PASS；`goal:typecheck` PASS；changed-file ESLint 0 errors（3 个既有 test `no-explicit-any` warnings）；Prettier PASS；`git diff --check` PASS；`memoflow:governance-check` PASS。详见 [archived implementation plan](../archive/2026-09-29-pvc-goal-1201-composer.md)。

**Dependencies:** GOAL-1104.

---

## PVC-GOAL-1202 — Record live preview + quick check-in

**Goal:** 输入 Record 时实时看到 Current → After → Target。

**Implementation:**

1. 建 Goal-owned preview calculation seam，复用 canonical progress calculator。
2. 新建 Record Preview visual surface，不直接复用 KR editor trajectory contract。
3. 输入变化实时更新 After/progress。
4. Max/Min sample 不改变 current 时给明确 copy。
5. KR surface current point/value 打开 compact composer。
6. 键盘 submit/cancel + failure 不丢输入。

**Execution plan (2026-09-30, contract frozen):**

- Add dedicated schema-owned `GoalRecordPreviewContext` to the existing KR-scoped record list response: visible measurement, trackingBaseValue and all-record aggregation snapshot. Keep normal KR DTOs unchanged.
- Extract the pure calculator to Goal shared code, re-export from Goal client; preview calls that exact arithmetic authority.
- Load context once when the dialog opens; use all identity-scoped records sorted by createdAt then id before visible pagination. Share snapshot arithmetic between server and live preview; show unavailable copy without context.
- Add compact Current → After → Target preview, unchanged sample copy, keyboard behavior, and Goal Detail quick check-in through existing dialog.
- Verify contract/transport, five aggregation methods and seed regression, dialog lifecycle, Detail entry, focused tests, typechecks, changed-file ESLint and governance. No GOAL-1203/TASK-3301 work.

**Execution (2026-09-30): Implemented / validated.** Normal `KeyResultClientDTO` / `KeyResultProgressDTO` remain unchanged. KR-scoped GoalRecord reads expose optional/nullable `previewContext` with visible measurement, `trackingBaseValue` and an all-record aggregation snapshot; Goal-wide record reads do not expose it. Owned Goal/KR validation and identity filtering precede visible pagination; `Last` ordering is deterministic by `createdAt` then id. The dialog reads preview context once per open and calls the shared Goal arithmetic authority for each candidate. Goal Detail opens the existing dialog from the KR current-value affordance and refreshes after successful save. Review repair removed duplicate native-button keyboard handlers, restored the Goal-wide client return surface, and removed abandoned aggregate-query churn.

| Validation                                                                                                                                                                                                                               | Result                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm nx run contracts:test -- src/modules/goal`                                                                                                                                                                                         | PASS: 11 files, 89 tests                                           |
| `pnpm nx run goal:test -- src/shared src/server/domain src/server/application/use-cases/queries/__tests__ src/infrastructure-client/adapters/goal-record-preview-context.spec.ts`                                                        | PASS: 24 files, 190 tests                                          |
| `pnpm nx run app-vue:test -- src/modules/goal/components/GoalRecordPreview.spec.ts src/modules/goal/components/dialogs/GoalRecordDialog.spec.ts src/modules/goal/views/GoalDetailView.spec.ts src/modules/goal/stores/goalStore.spec.ts` | PASS: 4 files, 85 tests                                            |
| `pnpm nx run goal:typecheck`                                                                                                                                                                                                             | PASS                                                               |
| `pnpm nx run app-vue:typecheck`                                                                                                                                                                                                          | PASS, including dependency builds                                  |
| Changed-file `pnpm exec eslint`                                                                                                                                                                                                          | PASS: 0 errors; 4 `no-explicit-any` warnings in query test helpers |
| `pnpm nx run memoflow:governance-check`                                                                                                                                                                                                  | PASS                                                               |
| `git diff --check`                                                                                                                                                                                                                       | PASS                                                               |

Exact changed/new files:

```text
docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md
packages/app-vue/src/locales/en-US/goal.ts
packages/app-vue/src/locales/zh-CN/goal.ts
packages/app-vue/src/modules/goal/components/GoalRecordPreview.spec.ts
packages/app-vue/src/modules/goal/components/GoalRecordPreview.vue
packages/app-vue/src/modules/goal/components/dialogs/GoalRecordDialog.spec.ts
packages/app-vue/src/modules/goal/components/dialogs/GoalRecordDialog.vue
packages/app-vue/src/modules/goal/composables/useGoal.ts
packages/app-vue/src/modules/goal/composables/useGoalRecords.ts
packages/app-vue/src/modules/goal/stores/goal-store.ts
packages/app-vue/src/modules/goal/stores/goalStore.spec.ts
packages/app-vue/src/modules/goal/views/GoalDetailView.spec.ts
packages/app-vue/src/modules/goal/views/GoalDetailView.vue
packages/contracts/src/modules/goal/api/goal-record-preview-context.spec.ts
packages/contracts/src/modules/goal/api/response-schemas.ts
packages/goal/src/application-client/goal-client-service.ts
packages/goal/src/client/index.ts
packages/goal/src/infrastructure-client/adapters/goal-record-preview-context.spec.ts
packages/goal/src/server/application/use-cases/queries/__tests__/list-goal-records.test.ts
packages/goal/src/server/application/use-cases/queries/list-goal-records.use-case.ts
packages/goal/src/server/domain/services/key-result-progress-calculator.ts
packages/goal/src/shared/goal-record-preview.spec.ts
packages/goal/src/shared/goal-record-preview.ts
packages/goal/src/shared/key-result-progress-calculator.ts
```

**Acceptance:** 用户提交前能理解新 Record 对 KR 的影响。

**Dependencies:** GOAL-1201.

---

## PVC-GOAL-1203 — GoalRecord source/provenance/correction contract

**Goal:** 区分 source correlation 与 measurement authorship，为 TaskUserMeasurement 做准备。

**Implementation:**

1. 扩展/迁移 GoalRecord read/client projection，使 source/provenance 可见。
2. 保留 source correlation 用于幂等/revert。
3. 区分 Manual / TaskAutomatic / TaskUserMeasurement（最终 enum/name 在实施时冻结）。
4. TaskAutomatic 保持 immutable system fact。
5. TaskUserMeasurement 提供 Goal-owned value/note correction command，不修改 Task completion state。
6. characterization 覆盖 existing Task source records。

**Acceptance:** 自动 Task record 不能手工改；用户在 Task 完成时输入的 measurement 可以纠正且仍保持 occurrence correlation。

**Completed (2026-09-30):** Goal-owned `GoalRecordAuthorship` wire values are frozen as `Manual / TaskAutomatic / TaskUserMeasurement`; existing sourceType/sourceId remain correlation only. GoalRecord creation/loading validates the complete invariant matrix. Manual records support normal correction/delete; TaskAutomatic rejects both; TaskUserMeasurement permits value/note correction while retaining occurrence source/authorship and rejects normal delete. Source-correlated removal remains generic. The Task handler explicitly creates TaskAutomatic; no TaskUserMeasurement completion/event/outbox flow was added.

The sole client DTO, server projection, Goal client entity/service, Prisma and PowerSync mappings preserve authorship, nullable `{ type, id }` source and recordedAt. GoalRecordCard uses recordedAt and shipped en-US/zh-CN provenance copy without source IDs. PostgreSQL migration/backfill/CHECK, local schema, generated Prisma client, runtime bootstrap and migrator ordering are implemented. Source-neutral portability exports no Task provenance and restores Manual. GOAL-1201/1202 composer/preview and full-history mutation receipts remain covered.

**Green evidence:**

| Exact validation                                                                                                             | Result                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm nx run contracts:test -- goal-record`                                                                                  | 2 files, 7 tests passed                                                                                                                                                            |
| `pnpm nx run goal:test -- goal-record task-goal-progress remove-task-goal-contribution goal-portability goal-record-preview` | Post-rebase: 15 files, 168 tests passed                                                                                                                                            |
| `pnpm nx run database:test -- goal-record`                                                                                   | 2 files, 7 tests passed                                                                                                                                                            |
| `pnpm nx run powersync-schema:test`                                                                                          | 1 file, 12 tests passed                                                                                                                                                            |
| `pnpm nx run app-vue:test -- GoalRecordCard GoalRecordDialog GoalRecordPreview useGoalRecords`                               | 4 files, 88 tests passed                                                                                                                                                           |
| `pnpm nx run migrator:test`                                                                                                  | 1 file, 3 tests passed                                                                                                                                                             |
| `pnpm nx run goal:typecheck`; `pnpm nx run app-vue:typecheck`                                                                | Passed                                                                                                                                                                             |
| `pnpm nx run powersync-schema:typecheck`; `pnpm nx run migrator:typecheck`                                                   | Passed                                                                                                                                                                             |
| `pnpm nx run database:prisma-generate`                                                                                       | Generated/normalized Prisma artifacts through repository tooling                                                                                                                   |
| `pnpm exec prisma validate --config ./prisma/prisma.config.ts` (packages/database)                                           | Schema valid                                                                                                                                                                       |
| `pnpm nx run database:runtime-scripts:build`                                                                                 | Passed, authorship bootstrap emitted                                                                                                                                               |
| PostgreSQL temporary-table fixture `packages/database/src/schema/goal-record-authorship.test.sql` on MemoFlow-test-db        | Legacy null source → Manual; occurrence/plan → TaskAutomatic; default verified; 4 valid combinations accepted, 76 invalid combinations rejected; rerun retains TaskUserMeasurement |
| Changed-file `pnpm exec eslint`                                                                                              | Exit 0, no errors; existing test `any` warnings and ignored JSON warning                                                                                                           |
| `git diff --check`                                                                                                           | Passed                                                                                                                                                                             |
| `pnpm test:inventory`; `pnpm nx run memoflow:governance-check`                                                               | Inventory regenerated; governance passed                                                                                                                                           |

**Files / execution evidence:** [PVC-GOAL-1203 implementation](../archive/2026-09-30-pvc-goal-1203-implementation.md) lists exact changed files and local result logs. Initial governance failure was stale generated inventory (including pre-existing omitted tests); repository regeneration resolved it. After rebasing onto the integrated TASK-3301A baseline, Prisma artifacts were regenerated from the combined Goal/Task schema and the full focused validation/typecheck/governance set passed again. **Blockers:** none.

**Dependencies:** GOAL-1201.

---

## PVC-GOAL-1301 — KR Inspect Dialog + route compatibility

**Goal:** 常规 KR inspect 不再进入 standalone page。

**Implementation:**

1. Goal Detail 增加 KR Inspect Dialog state。
2. 显示 larger trajectory/full record history/Task context/method explanation/source context。
3. `/goals/:goalId/key-results/:krId` 映射到 Goal Detail + inspect。
4. refresh/not-found/close behavior 与 BASE-002 characterization 对齐。
5. parity 后删除 `KeyResultDetailView` normal render path。

**Acceptance:** normal click 无新页面；旧 deep link 仍能打开同一 KR。

**Execution (2026-09-30): Implemented / validated / independently reviewed.** Goal Detail owns one route-driven KR Inspect dialog. Both `/goals/:id` and legacy `/goals/:goalId/key-results/:keyResultId` render the same workspace; the legacy URL opens Inspect after the workspace read. Close preserves query/hash and returns to `goal-detail`; back/forward follows route params without a duplicate owner fetch. Inspect reuses the enlarged readonly trajectory, extends the GOAL-1104 vocabulary for method explanation, displays core KR metadata, and reads KR-scoped records and linked Task context through canonical bounded pages with loaded totals/Load more. Provenance retains GOAL-1203 authorship labels and readable source-kind context without raw IDs. Current delegates to GoalRecordDialog; metadata commands remain on Goal Detail. Missing Goal/KR now show explicit deterministic feedback, deliberately replacing BASE-002 blank bodies. The standalone KeyResultDetailView and spec were retired after reference search. Evidence: App-Vue 10 files / 175 tests PASS (final Inspect rerun 18/18); Goal record owner regressions 4 files / 33 tests PASS; typecheck, changed-file ESLint, diff and governance PASS; isolated production-CSS Chromium 1000px/360px route/keyboard checks PASS, not authenticated E2E. See [implementation report](../archive/2026-09-30-pvc-goal-1301-inspect.md).

**Dependencies:** GOAL-1102, GOAL-1201, BASE-002.

---

## PVC-GOAL-1401 — Review window resolver

**Goal:** 默认 Review 覆盖 `previous.windowEndAt -> now`；首次 7 天。

**Implementation:**

1. owner service/use-case 增加 authoritative default window resolver。
2. 保留旧 `windowDays` compatibility。
3. 支持 last review / 7d / 30d / custom。
4. 防止 reviewedAt/windowEndAt 造成 gap。
5. domain/application tests 覆盖 consecutive reviews。

**Acceptance:** 连续默认 Review window 无 gap/overlap drift。

**Dependencies:** BASE-001.

**Execution (2026-09-30): Implemented / validated / independently reviewed.** One Goal-owned `ReviewWindowResolver` now serves context and creation. Default starts at the latest authoritative child review's `systemContext.windowEndAt` (lexical review ID tie-break), with first-review fallback to seven Product Time calendar days. Explicit legacy `windowDays` retains precedence; additive typed since-last-review / 7d / 30d / custom selection is aligned across HTTP, IPC and clients. Custom bounds are preserved and validated. Consecutive review, reviewedAt mismatch, DST, contract and production transport parity evidence: Goal 7 files / 94 tests, contracts 1 file / 19 tests, existing UI compatibility 1 file / 8 tests PASS; Goal/contracts/app-vue/app-react typechecks, changed-file ESLint, diff and governance PASS. No UI, facts aggregation, persistence schema or AI changes. Database integration was not run because the existing harness uses `db push --accept-data-loss`; safeguards remain intact. Exact files, commands and limits: [GOAL-1401 implementation report](../archive/2026-09-30-pvc-goal-1401-implementation.md).

---

## PVC-GOAL-1402 — Review facts + deterministic diagnosis

**Goal:** Review 在 AI 关闭时也有价值。

**Implementation:**

1. 汇总 overall/KR start/end/delta/trend。
2. 汇总 manual Record/Task contribution count。
3. 生成 explainable deterministic signals。
4. 明确 signal evidence，不伪装因果推断。
5. API/read model + UI snapshot section tests。

**Acceptance:** AI unavailable 时仍能完成 evidence-based Review。

**Dependencies:** GOAL-1401, GOAL-1201.

**Execution (2026-09-30): Implemented / validated / independently reviewed.** One pure Goal-owned analyzer attaches typed observed-fact signals after authoritative context calculation: overall movement, normalized KR movement toward targets, and measurement activity with explicit evidence. Preview and AddReview share the builder; saved JSON snapshots preserve signals across Prisma/PowerSync reads, client decoding and source-neutral portability. Old snapshots default to empty signals without historical re-analysis. Both Review routes render shared localized Facts / Signals, including zero activity, without AI dependencies or UI measurement arithmetic. After rebasing onto the accepted GOAL-1301 Inspect baseline, integrated acceptance passed: Goal 10 files / 117 tests, commands/queries 4 / 22, contracts 3 / 26, and App-Vue Review + deep-link + KR Inspect + shared surface 4 / 44, for 209 focused behavioral checks. Sequential Goal/contracts/app-vue typechecks, changed-file ESLint (zero errors; existing test warnings), `git diff --check`, and governance PASS. The rebase explicitly preserved GOAL-1301 route/Inspect retirement and removed the obsolete standalone `KeyResultDetailView` dependency from Review tests. Database integration was not run because its harness uses `db push --accept-data-loss`; the real repository serialization and both storage mappers were exercised without DB mutation. Exact files, commands, compatibility and caveats: [GOAL-1402 implementation report](../archive/2026-09-30-pvc-goal-1402-implementation.md).

---

## PVC-GOAL-1403 — Review Dialog + deep-link retirement

**Goal:** 创建/查看 Review 不离开 Goal workspace。

**Implementation:**

1. Goal Detail 增加 create/read-only Review Dialog。
2. create route 映射到 Goal Detail + create dialog。
3. review detail route 映射到 read-only dialog。
4. unsaved-change/save/cancel guard。
5. parity 后退休 standalone Review views。

**Acceptance:** normal Review path 不导航离开 Goal；旧链接可解析。

**Dependencies:** GOAL-1401, GOAL-1402, BASE-002.

**Execution (2026-09-30): Implemented / validated / independently reviewed.** Review create/detail deep links now resolve to the existing `GoalDetailView` owner and open Goal-owned `ProductDialogShell` dialogs, so normal create/read flows stay inside the Goal workspace while preserving direct refresh, query/hash and browser history semantics. Creation uses the canonical Goal review command and the GOAL-1401 authoritative default window resolver instead of forcing legacy `windowDays: 7`; saved reviews refresh the canonical workspace and transition to read-only detail without a discard prompt. Dirty/busy protection covers cancel/Escape/outside dismiss, browser back/forward, Goal/KR/Review overlay changes and exits to other modules/settings, while shell preflight and route guards share one navigation-scoped approval to avoid duplicate confirmation. Complete review lookup falls back from bounded `recentReviews` to canonical history, stale owner/detail responses are ignored, and legacy snapshots without signals remain readable. The standalone `GoalReviewCreationView` / `GoalReviewDetailView` surfaces were retired after parity migration. Independent uncached core verification passed 4 App-Vue files / 76 tests; the delegated focused suite passed 11 files / 223 tests, App-Vue typecheck, changed-file ESLint, Goal review owner regressions, inventory/governance, and isolated Chromium at 1000px/en-US plus 360px/zh-CN. One full shared-surface run still contains an unrelated pre-existing Task capsule assertion; Goal-specific boundary coverage passes and Task production code was untouched. Exact diff, tests and browser evidence: [GOAL-1403 implementation report](../archive/2026-09-30-pvc-goal-1403-implementation.md).

---

## PVC-GOAL-1601 — Goal reference acceptance

**Goal:** 冻结 Goal 为首个产品 reference owner。

**Matrix:** empty/create/KR five methods/Record/Inspect/Review/narrow/light-dark/zh-en/error/AI unavailable。

**Commands:**

- focused Goal Vitest
- `pnpm nx run goal:test`
- `pnpm nx run app-vue:typecheck`
- `pnpm nx run app-vue:test`
- Goal E2E subset
- screenshot baseline

**Acceptance:** Goal loop `Goal -> KR -> Record -> trajectory -> Review` 完整，且无 standalone KR/Review normal page dependency。

**Dependencies:** all Goal tickets above.

**Execution (2026-09-30): Accepted / reference frozen.** Goal reference acceptance is complete: the Goal → KR → Record → trajectory → first/subsequent Review loop is covered by real application-flow tests with persistence doubles and an isolated production-component browser harness with deterministic service ports, without AI. Fresh evidence includes Goal 100 files / 718 tests, focused Goal 7 / 79, App-Vue Goal/Product Date/surface-leave 31 / 315, App-Vue typecheck, and 11/11 browser baseline plus 11/11 comparison tests with 52 PNG artifacts. The full App-Vue run was not green (1,327/1,332 passed before correcting the stale Goal assertion); four unrelated shell geometry/Task capsule baseline failures remain documented. Real-backend Goal E2E discovered 9 tests but was not executed because its database bootstrap can run `prisma db push --accept-data-loss`; this acceptance explicitly retains that limitation and does not claim live-backend E2E coverage. Production references to retired standalone KR/Review views are zero; GOAL-1601 changes no production code. Final inventory/lint/governance evidence, required-state matrix and visual inspection: [GOAL-1601 reference acceptance report](../archive/2026-09-30-pvc-goal-1601-reference-acceptance.md).

---

# 7. Phase 1B — Task lifecycle correctness

这部分优先于 Task UI polish，因为当前 End Plan 是 P0 语义错误。

## PVC-TASK-3002A — End Plan UI uses Abandon, not Archive

**Goal:** 用户点击“结束计划”得到真实业务结束。

**Files:**

- `TaskDetailView.vue`
- `TaskPlanRow.vue`
- `useTaskPlanMutations.ts`
- i18n/specs

**Implementation:**

1. 删除 `End plan -> archivePlanSafe` 映射。
2. 接入 existing `abandonPlan` client/application port。
3. 删除 optimistic `archive -> Closed` 假状态。
4. Active/Paused normal actions 中隐藏 Archive。
5. Delete 继续只表达误创建。

**Acceptance:** UI 不再把 Archive 表达成 End；server response 与 optimistic state 一致。

**Execution (2026-09-30): Implemented / validated.** Historical implementation is commit `703d62306ed` (`feat(task): converge lifecycle and outcome semantics`): End Plan routes to the canonical Abandon mutation, Active/Paused normal UX no longer treats Archive as End, and abandon remains server-confirmed instead of optimistic fake-Closed state. Current-batch revalidation: app-vue lifecycle/presentation suite 3 files / 23 tests PASS; Task lifecycle suite 6 files / 63 tests PASS; Task settlement PostgreSQL integration 1 file / 5 tests PASS; current Task/app-vue typechecks and governance PASS.

**Dependencies:** BASE-002.

---

## PVC-TASK-3002B — Abandon operational closure

**Goal:** 结束计划后没有未来执行残留。

**Scope:** Task domain/application/reminder/schedule projection。

**Implementation:**

1. 对照 Pause use case，定义 Abandon future-occurrence reconciliation。
2. 删除/撤销已 materialize 的未来 incomplete occurrences。
3. 确保 recurring materializer 不再选择 Closed/Abandoned plan。
4. Reminder fire 在 Closed/Abandoned fail closed。
5. 发布/投影 plan-abandoned lifecycle signal。
6. Schedule 清除该 Plan 的未来 projection。
7. 历史 occurrence 保留。

**Tests:** Task integration + Schedule projection integration。

**Acceptance:** End Plan 后未来 occurrence/reminder/Schedule event 全部消失，历史仍在。

**Execution (2026-09-30): Implemented / validated.** Commit `703d62306ed` closes Abandon operational semantics across the use case, future occurrence ownership, reminder fail-closed behavior, lifecycle event and Schedule projection source while retaining history. Current-batch revalidation includes `abandon-task-plan`, reminder-fire, occurrence-ownership, schedule-projection and Task plan settlement integration; 6 Task unit files / 63 tests plus PostgreSQL settlement 1 file / 5 tests PASS.

**Dependencies:** TASK-3002A 可并行开发，合并前一起验收。

---

## PVC-TASK-3002C — Canonical TaskPlan outcome evaluator

**Goal:** 删除用户可配置 completion-policy 的产品影响，但保持 compatibility migration。

**Implementation:**

1. characterization 旧 AllowCorrection/StrictNoBackfill persistence/portable input。
2. 新 canonical evaluator：unresolved->Open；resolved+Missed->Failed；resolved+no Missed->Succeeded；infinite->Open until Abandon。
3. Skipped 从 required scope 排除。
4. correction 后重新 evaluate，允许 Failed->Succeeded。
5. UI 不再暴露 policy。
6. 过渡期继续 round-trip旧字段。
7. versioned removal 单独延后，不在本 ticket destructive delete。

**Acceptance:** Overdue 不失败；有限计划显式 Missed 后在 scope resolved 时失败；纠正后可成功。

**Execution (2026-09-30): Implemented / validated.** Commit `703d62306ed` installs the canonical TaskPlan outcome evaluator and reevaluation transaction semantics while retaining compatibility fields only for migration/round-trip. Current-batch revalidation covers evaluator behavior, outcome correction transaction and settlement: Task focused suite PASS, including 19 evaluator tests and PostgreSQL settlement fixtures.

**Dependencies:** ADR-057.

---

## PVC-TASK-3002D — Outcome presentation

**Goal:** 前端显示 Succeeded / Failed / Abandoned，而不是只看 lifecycle status。

**Implementation:**

1. 扩展 `TaskPlanViewModel` 映射 outcome。
2. 定义 lifecycle/outcome/archive presentation utility。
3. Plans row/detail 显示正确 product state。
4. 不再把 archivedAt 当 outcome。
5. tests 覆盖 Closed+Succeeded/Failed/Abandoned。

**Acceptance:** 用户能区分成功、未达成、主动结束。

**Execution (2026-09-30): Implemented / validated.** Commit `703d62306ed` maps lifecycle/outcome/archive through the canonical presentation utility and exposes Succeeded / Failed / Abandoned in Plan row/detail without treating `archivedAt` as outcome. Current-batch app-vue revalidation (`TaskPlanRow`, `useTaskPlanMutations`, `task-plan-presentation`) is 3 files / 23 tests PASS.

**Dependencies:** TASK-3002C.

---

# 8. Phase 2 — Task Home / Query / Quick foundation

## PVC-TASK-3003A — Task Home converges to Today | Plans

**Goal:** 删除 Upcoming，消除跨 surface filter 泄漏。

**Implementation:**

1. 删除 Upcoming top-level surface/render path。
2. Today 包含 today + unresolved overdue grouping。
3. occurrence filter 只作用 Today。
4. Plans 使用独立 lifecycle/outcome filter state。
5. future browsing CTA/open route 指向 Schedule。
6. tests 覆盖切换 surface 后 filter 不互相污染。

**Acceptance:** Task Home 只有 Today/Plans；不存在隐藏 filter 控制另一个 surface。

**Dependencies:** TASK-3002D.

---

## PVC-TASK-3003B — Bound Task queries and canonical Goal/KR scope

**Execution (2026-09-29): Implemented / validated.** The second repair applies Plan-state/label filters before server paging/counting via optional `status` / `outcome` / `archiveState` / `labelIdsAll`. Today disables the generic Plan page query and uses a bounded Product Time date-range query plus the optional unresolved overdue-open read, fetching only required missing/stale Plan details through canonical detail keys. Goal/KR scope is canonical server scope with readable names/titles. Shared task Zod schemas remain canonical for HTTP/IPC.

**Validation:** Final repair: task 11 files / 162 tests; app-vue 5 files / 50 tests; `task:typecheck`, direct app-vue `vue-tsc` (exit 0), and the final full Nx `app-vue:typecheck` rerun all passed. Changed-file ESLint: 0 errors / 7 `no-explicit-any` test warnings; `memoflow:governance-check` and `git diff --check` passed. An earlier Nx attempt hit transient `ui-vue-shadcn:build` `ENOTEMPTY`, but the clean rerun completed successfully. See [implementation report](../../analysis/2026-09-29-pvc-task-3003b-implementation.md). No TASK-3004/3401, Goal measurement, Schedule dialog, AI or Governance product implementation was started in 3003B.

**Goal:** Today/Plans 不再加载不必要全量历史或假分页。

**Implementation:**

1. Today 改用 bounded date/range occurrence query。
2. 移除/修正 phantom page/limit semantics。
3. Plans list server/query contract 增加真实 bounded behavior或明确 cursor；不要继续伪分页。
4. KR scoped filter 使用 server keyResultId path。
5. Goal/KR toolbar scope 解析 name/title，不显示 raw IDs。
6. query keys 纳入 canonical Goal/KR scope identity。

**Acceptance:** 大历史数据下 Today 不拉全历史；KR filter 服务端收窄；UI 无 raw IDs。

**Dependencies:** TASK-3003A.

---

## PVC-TASK-3004 — Restore Quick Task

**Execution (2026-09-29): Implemented / validated.** `/tasks?dialog=quick-task` now opens the Task-owned `QuickTaskDialog` on direct load and later route changes. Quick create remains title-only and persists a normal one-time Product-Today / AllDay TaskPlan through the existing `createPlanSafe(..., 'quick')` path. `TaskCapsulePreview` keeps its inline host for now but shares the canonical Task-owned request builder. Full `TaskPlanDialog` and create-and-bind behavior remain unchanged.

**Validation:** focused app-vue regression suite 8 files / 66 tests passed; focused runtime spec 20 tests passed after a lint-only stub repair; full `app-vue:typecheck`, changed-file ESLint and `git diff --check` passed. See [implementation report](../../analysis/2026-09-29-pvc-task-3004-implementation.md). No TASK-3401, occurrence inspect, Goal measurement, Schedule dialog or AI workflow refactor was started in this ticket.

**Goal:** AI/Today Overview/Capsule 的快速创建入口真正可用。

**Implementation:**

1. 统一 quick-create entry contract。
2. `/tasks?dialog=quick-task` 恢复或迁移到 canonical surface state。
3. title + today/all-day default + create。
4. create 后可进入 Plan workspace 配复杂属性。
5. 删除重复 dead integration，但保留一个 canonical QuickTask surface。

**Acceptance:** 所有 quick-create 入口都能真正创建 TaskPlan，不打开完整复杂表单。

**Dependencies:** BASE-002.

---

## PVC-TASK-3401 — Task Quick Surface + canonical action coordinator

**Execution (2026-09-29): Implemented / validated.** Task now owns one occurrence action coordinator for Complete / Uncomplete / Missed / Skip / Checklist, with an explicit future completion-time measurement hook for TASK-3301. Task Home/Detail route their full rows through that coordinator; Task Capsule and DailyTodoWidget reuse `TaskQuickSurface` built from `TaskOccurrenceQuickRow` + `TaskOccurrenceCompactList`. Review repairs restored Missed/Skipped -> Completed correction parity, canonical checklist behavior, and truthful per-occurrence busy presentation. Browser E2E selectors were migrated to shared semantic occurrence/progress contracts. Schedule integration remains deferred to SCHED-4202.

**Validation:** final focused app-vue suite 9 files / 64 tests; selector-migration focused suite 3 files / 19 tests; `app-vue:typecheck --skipNxCache`, changed-file ESLint, and `git diff --check` passed. Playwright discovery/compile found all 4 affected browser tests. Actual `task/task-completion-loop.spec.ts` passed 1/1 (31.3s test; 1.2m total), covering the shared DailyTodo row selector and Task -> Goal EachCompletion closed loop. Local Docker Phase A/B were discovery/compile checked but not executed against a freshly built current-worktree container. See [implementation report](../../analysis/2026-09-29-pvc-task-3401-implementation.md).

**Goal:** Capsule/Home/Schedule 不再各自维护 Task execution UI/action。

**Implementation:**

1. 从 `TaskOccurrenceCompactRow`/Capsule/DailyTodoWidget 提炼 `TaskOccurrenceQuickRow` 语义。
2. 提炼 `TaskOccurrenceCompactList`。
3. 提炼 `TaskQuickSurface`，summary/quick-create/view-all 由 host option 控制。
4. 建 `TaskOccurrenceActionCoordinator`。
5. Task Home 先接 coordinator。
6. Task Capsule 接 Quick Surface。
7. DailyTodoWidget 替换为 Quick Surface host 或退休。
8. Schedule integration 留给 SCHED-4202。

**Acceptance:** Task Home/Capsule/Home 对相同 occurrence 的 Complete/Skip/Missed/Checklist 语义一致。

**Dependencies:** TASK-3003A, TASK-3004；completion-time measurement branch 可先留 hook。

---

## PVC-TASK-3201 — Occurrence Inspect Dialog

**Goal:** 需要更多信息时使用 compact Inspect，不新增 detail route。

**Implementation:**

1. 建 TaskOccurrence Inspect Dialog。
2. 包含 status/time/checklist snapshot/result/note/Goal-KR context。
3. View Plan 显式进入 `/tasks/:planId`。
4. action 复用 TaskOccurrenceActionCoordinator。
5. narrow container 允许 Sheet fallback，但不成为默认 desktop path。

**Acceptance:** Today row 点击可深入查看但不新增 TaskOccurrenceDetailView。

**Execution (2026-09-29): Implemented / validated.** Today 的 full occurrence row body 现在打开本地 `TaskOccurrenceInspectDialog`；`View Plan` 才显式进入 `/tasks/:planId`。Inspect 展示 status / schedule snapshot / actual start / checklist snapshot / result / note / Goal-KR context，并复用 TASK-3401 的 canonical action coordinator 执行 Complete / Uncomplete / Missed / Skip / Checklist。未新增 occurrence route，也未引入第二套 mutation path。selected occurrence 会跟随 store correction；即使 bounded Today refresh 后该 occurrence 离开列表，coordinator 返回的最新 DTO 仍维持 Inspect 的正确状态；identity change 会清空 selection。

**Validation:** focused Vue tests 5 files / 52 tests PASS；`app-vue:typecheck` PASS；changed-file ESLint PASS；`memoflow:governance-check` PASS；`git diff --check` PASS；Playwright discovery 找到含 Today -> Inspect -> View Plan 的 1 个 Chromium case。实际 browser E2E 尝试两次，但均在到达 Task assertions 前被 auth/workspace bootstrap 阻塞（一次等待 sign-up response 超时；一次注册后停留 startup splash 等待 `app-shell`），因此作为 infrastructure/startup validation caveat，不视为 3201 product-code failure。详见 [archived implementation plan](../archive/2026-09-29-task-3201-occurrence-inspect.md)。

**Dependencies:** TASK-3401.

---

# 9. Phase 3 — Goal/Task measurement vertical slice

这是 Goal 与 Task 的关键 cross-owner vertical slice。

## PVC-TASK-3301A — Task Goal/KR binding read projection + three modes

**Goal:** Task 能正确知道 KR method/unit，并提供三种更新模式。

**Modes:** 仅关联 / 自动记录固定值 / 完成时记录。

**Implementation:**

1. 扩展 `KeyResultBindingOption` projection：method/unit/current/target/必要 preview context。
2. Sum 支持 fixed automatic delta；允许 signed finite delta。
3. Average/Max/Min/Last 禁止 blind fixed auto contribution。
4. Prompt mode 对五种 method 可用。
5. optional suggestedValue 只作为 UI suggestion，不是事实值。
6. 迁移 TaskPlan form/KR binding UI。

**Acceptance:** 不再允许持久化“non-Sum fixed automatic contribution 后续才失败”的配置。

**Execution (2026-09-30): Implemented / validated.** Task Goal/KR binding 已收敛到 canonical `progressRule`：`Fixed`（EachCompletion/PlanCompletion + signed finite non-zero delta）与 `Prompt`（EachCompletion + optional finite suggestedValue）；`null` 即 LinkOnly。旧 `contribution` 仅保留为 backward-compatible Fixed mirror，legacy input/rows 自动归一化，冲突配置拒绝。Prisma/PowerSync 显式持久 `goal_progress_mode` / `goal_suggested_value`，`goal_record_value` 仅承载 Fixed fact，DB invariant 升级并保留 legacy decode。Task 通过 bounded Goal measurement read port 读取 KR method/unit/current/target；Fixed 仅允许 Sum，Prompt 对五种 method 可用，Prompt 不进入 automatic Goal outbox。Task form 已提供“仅关联 / 自动记录固定值 / 完成时记录”，non-Sum Fixed 会确定性转 Prompt；Goal-only 强制 LinkOnly。Task presentation 复用 Goal module public vocabulary surface，不维护第二套 method 文案。

**Validation:** contracts 11 files / 61 tests PASS；Task focused 18 files / 271 tests PASS；app-vue focused 7 files / 39 tests PASS；最终 presentation-boundary repair 3 files / 28 tests PASS；`task:typecheck`、`app-vue:typecheck`、API/Desktop typecheck、Prisma generate/validate、database/PowerSync/governance checks 均 PASS；post-rebase 再次运行 contracts 61、Task 271、app-vue 39、Task/App typecheck 与 `memoflow:governance-check` 全部 PASS；`git diff --check` PASS。PostgreSQL migration 仍只是 unapplied artifact，没有改动 live DB。详见 [archived implementation report](../archive/2026-09-30-pvc-task-3301a.md)。

**Dependencies:** GOAL-1104, GOAL-1201.

---

## PVC-TASK-3301B — Complete command carries optional measurement intent

**Goal:** Task completion 与 Goal measurement intent 同一 durable path，不前端双写。

**Implementation:**

1. 扩展 CompleteTaskOccurrence command/DTO，接受 optional user measurement intent。
2. Task transaction 同时持久 completion fact + outbox intent。
3. outbox schema 区分 FixedAutomatic / PromptedUserMeasurement provenance。
4. dispatcher 保持 at-least-once。
5. Goal consumer 幂等创建 GoalRecord。
6. Goal 按 canonical method 聚合 currentValue。
7. Goal unavailable 时 UI 提供“仅完成任务”路径，不阻塞 Task completion。

**Acceptance:** 不存在 `createGoalRecord()` + `completeTask()` 双写窗口；重试不重复 Record。

**Dependencies:** TASK-3301A, GOAL-1203.

**Implementation evidence (2026-09-30):** Command → completion event → same-transaction V2 outbox now carries optional Prompt measurement. Explicit recording mode maps to Goal-owned TaskUserMeasurement; Fixed/legacy V2 remains TaskAutomatic. No measurement completes Task only; suggestions never become facts. Focused contracts/Task/Goal tests, both typechecks, lint and governance pass. Prisma transaction characterization passes; database integration setup is blocked by Prisma's protected `db push --accept-data-loss` action. Exact scope, commands and validation limits: [TASK-3301B execution report](../archive/2026-09-30-pvc-task-3301b.md).

---

## PVC-TASK-3301C — Measurement dialog + correction/revert

**Goal:** Complete 时可输入真实值，并能后续纠正。

**Implementation:**

1. Task ActionCoordinator 检测 Prompt mode。
2. 打开 Goal-owned Record Composer/preview surface。
3. 根据 method 显示 delta/sample language。
4. suggestedValue 预填但可修改。
5. Submit 走 TASK-3301B。
6. Uncomplete revert source-correlated GoalRecord。
7. Re-complete 创建 replacement record。
8. TaskUserMeasurement correction 只改 Goal measurement，不伪造 Task completion state。

**Acceptance:** 五种 KR method 都能从 Task completion 正确记录；撤销/纠正/重试行为可解释且幂等。

**Execution (2026-09-30): Implemented / validated.** Task owns a single Prompt completion session and command; all canonical Task hosts reuse the public Goal composer and one Task dialog. Complete-only remains available on Goal read failure. Goal-owned Manual/TaskUserMeasurement correction preserves provenance and Task state; TaskAutomatic remains read-only. Existing uncomplete/outbox revert is characterized with replacement/retry. Focused app-vue 14 files / 184 tests, Task 3 files / 39 tests, Goal 5 files / 51 tests, affected typechecks, changed-file ESLint, inventory and governance PASS. PostgreSQL/E2E validation limits and exact files are in the [implementation report](../archive/2026-09-30-pvc-task-3301c.md).

**Integrated acceptance (2026-09-30): PASS on batch `9e769415b50`.** From the GOAL-1201 baseline through TASK-3301C, 57 / 58 changed spec files were actually executed and 745 tests passed across app-vue, Goal, Task, contracts, database, PowerSync schema and migrator; Goal PostgreSQL event-listener integration also passed. The sole unexecuted changed spec is the protected Task Prisma transaction harness whose bootstrap can require `db push --accept-data-loss`; Browser E2E for the new Prompt/correction/revert loop remains assigned to TASK-3901. Full evidence: [integrated acceptance report](../archive/2026-09-30-goal-task-measurement-vertical-slice-acceptance.md).

**Dependencies:** GOAL-1202, GOAL-1203, TASK-3301B, TASK-3401.

---

## PVC-TASK-3101 — Task create/detail visual grammar convergence

**Goal:** correctness/owner path稳定后，再对齐 Goal proven grammar。

**Implementation:**

1. Task Plan create property chips 与 Goal proven pattern 对齐。
2. Detail metadata rows/property affordances 对齐。
3. 删除 value + tiny Pencil 的重复编辑模式，property 本身可编辑时直接点击 property。
4. owner navigation 与 edit affordance 分开。
5. 不创建 UniversalEntityDetail。

**Acceptance:** Task 看起来属于同一产品，但 Plan/Occurrence 语义仍独立。

**Dependencies:** GOAL-1601, TASK-3002D, TASK-3401.

**Execution (2026-09-30): Implemented / validated.** Task create and core detail metadata already use the proven shared primitives and remain unchanged. Optional detail labels/reminders now edit through their value chips; Goal owner navigation has an explicit outward-arrow control and remains separate from a named binding-edit chip. Empty rows remain discoverable through More; keyboard dismissal/focus, archived/busy triggers, Task-specific Plan/Occurrence semantics and measurement coordination are preserved. Focused App-Vue 3 files / 19 tests, typecheck, changed-file ESLint, inventory, diff and governance passed; isolated production-component Chromium acceptance passed 11/11 baseline and 11/11 comparison tests across 360/1280px, light/dark and en-US/zh-CN with 80 captures. Service doubles and a sentinel owner destination are explicitly not live-backend E2E. ChatGPT Web independently reviewed the production diff, reminder/label capability preservation, representative wide/narrow light/dark screenshots, focused 19/19 runtime tests, lint, inventory and typecheck evidence; acceptance is complete. See [visual grammar implementation report](../archive/2026-09-30-pvc-task-3101-visual-grammar.md).

---

## PVC-TASK-3901 — Task acceptance matrix

**Matrix:** Today/overdue/Plans/outcomes/Quick Task/Inspect/Checklist/Goal-KR three modes/large history/narrow/light-dark/zh-en/error。

**Commands:** focused Task specs, `pnpm nx run task:test`, `task:test:integration`, `app-vue:typecheck`, task E2E subset, screenshots。

**Acceptance:** T2-01~15 均关闭或有明确 deferred reason。

**Execution (2026-10-01): Accepted / frozen.** Final reference audit closes T2-01~15. The only new production repair is T2-14 copy: Task Detail now truthfully presents the bounded `recentOccurrences` projection as `Recent activity / 最近执行` and explicitly states that it is not full history. Acceptance adds bilingual component coverage, a five-item bounded-query characterization against a much larger all-time count, and browser assertions/captures for the recent-activity section. Final reviewer-focused App-Vue acceptance passed 13 files / 128 tests; full `task:test` passed 83 files / 755 tests; `app-vue:typecheck`, changed-file ESLint, 1,287-file test inventory, `git diff --check` and `memoflow:governance-check` passed. The isolated production-component Chromium harness regenerated and then cleanly compared 11/11 tests across 360/1280px, light/dark and en-US/zh-CN. One earlier duplicated browser launch contended on the isolated harness port; the clean rerun was fully green. Protected Task DB integration remains intentionally unrun because bootstrap can require destructive `prisma db push --accept-data-loss`; no guard was bypassed and no live-backend E2E claim is made. See [TASK-3901 reference acceptance](../archive/2026-09-30-pvc-task-3901-reference-acceptance.md).

**Dependencies:** all Task tickets above.

---

# 10. Phase 4 — Schedule convergence

## PVC-SCHED-4101 — Single projection presentation authority

**Execution (2026-10-01): Accepted / frozen after delegated repair and independent review.** Audit of `9c5a95140ed4` against `98b5e9e9118` found remaining source-to-color duplication in PlannerCalendar CSS and source/tone rules missing FullCalendar's portalled Month overflow events. Calendar color/foreground now come from the same typed presentation map as source copy/classes/dots/badges; Schedule event selectors reach overflow while conflict overrides remain separate from owner identity. No owner actions or Product Time semantics changed. The isolated harness now compares screenshots, asserts actual owner color tokens and passes its locale to PlannerCalendar; inventory adds only its missing registration. Fresh full Schedule Vitest passed 18 files / 63 tests; focused rerun passed 5 files / 23 tests; app-vue:typecheck, changed-file ESLint/Prettier, 1,288-file inventory, diff and governance passed. Chromium baseline regeneration and strict comparison each passed 2/2 scenarios (en-US/light/1280 and zh-CN/dark/360), with 12 comparisons/captures, 0 browser errors and 0 document overflow. Narrow Week/Month/dialog density remains a separate follow-up; fixture-based evidence is not live-backend E2E. ChatGPT Web independently reviewed the repair diff, source/tone separation, representative wide/narrow screenshots, inventory and diff hygiene; SCHED-4101 acceptance is complete. SCHED-4201/4202 remain separate follow-up work. Evidence: [SCHED-4101 presentation authority validation](../archive/2026-10-01-pvc-sched-4101-presentation-authority-validation.md).

**Goal:** Task/Goal/Routine/CalendarEntry 的 dot/badge/source copy 不再多处重复。

**Implementation:**

1. inventory existing source tone/label mapping。
2. 定义 Schedule-owned projection presentation utility。
3. Calendar cell/event/day dialog 复用。
4. 不把 owner business action 放进 presentation utility。

**Acceptance:** 相同 owner projection 在 Day/Week/Month/Dialog 呈现一致。

---

## PVC-SCHED-4201 — PlannerDayDialog / PlannerEventDialog + CalendarEntry CRUD

**Goal:** 默认 desktop inspect 从右侧 Sheet 改为 Dialog，并补齐 Schedule-owned edit/delete。

**Implementation:**

1. 建 PlannerDayDialog。
2. 建 PlannerEventDialog。
3. CalendarEntry event inspect 增加 Edit/Delete。
4. Edit 复用现有 `CreateScheduleDialog` edit mode。
5. Delete 走 Schedule owner command + confirm。
6. narrow host 可按 container fallback Sheet。
7. DayDetailSheet/EventDetailSheet parity 后退休。

**Acceptance:** CalendarEntry 在 Calendar 内可完整 inspect/edit/delete；desktop 无 right-on-right Sheet 默认层级。

**Dependencies:** SCHED-4101.

**Execution (2026-10-01): Accepted / frozen after delegated implementation and independent review.** Completed the existing `product/vnext-sched-4201` WIP from `86e7e3a80842`: wide PlannerDayDialog/PlannerEventDialog use ProductDialogShell; narrow panels use `usePanelWidth()` Sheet fallback with shared bodies/footers. CalendarEntry edit reuses CreateScheduleDialog owner-fact seeding and versioned Update; Delete uses destructive confirmation and a versioned Schedule owner command. Missing/stale inspect and confirmation/edit races have deterministic feedback; successful writes retain success plus a warning on Planner refresh rejection. Browser evidence caught and fixed inspect-overlay obstruction of delete confirmation; cancellation/rejection restores inspect. Legacy detail sheets/export are retired after migrating SCHED-4101 presentation and shared surface consumers. Goal/Routine inspect remain read-only and Task behavior stays at the 4201 baseline; SCHED-4202/4301 are untouched. Validation and exact file/browser limits: [SCHED-4201 dialog CRUD evidence](../archive/2026-10-01-pvc-sched-4201-dialog-crud.md). ChatGPT Web independently reviewed the adaptive-shell implementation, stale/version owner semantics, locale diff hygiene, production-service-double browser boundary and representative wide Dialog/narrow Sheet screenshots. A final strict Chromium rerun after review repair passed 6/6; one immediately preceding cold Vite build exceeded the harness's 60s webServer startup timeout before tests began, and the warm rerun passed completely. No live-backend E2E claim is made; SCHED-4201 acceptance is complete.

---

## PVC-SCHED-4202 — Compose Task Quick Surface in Schedule

**Goal:** Schedule Task action 不再直接 complete occurrence。

**Implementation:**

1. Day/Event Dialog 内使用 TaskOccurrenceQuickRow/Quick Surface。
2. Complete/Skip/Missed/Checklist 走 Task ActionCoordinator。
3. Prompt measurement 能在 Schedule host 正常打开。
4. View Plan 跳 TaskPlan workspace。
5. 删除 `TaskEventActionPanel` 重复 action logic 后再退休组件。

**Acceptance:** 从 Schedule 完成 Task 与 Task Home 行为完全一致。

**Execution (2026-10-01): Accepted / frozen after delegated implementation and independent review.** Task-owned `TaskOccurrenceQuickSurface` reads the selected occurrence through an identity-scoped detail query and resolves its plan through the existing plan detail cache, then composes canonical Quick Surface/coordinator/Prompt measurement. PlannerEventDialog embeds owner content through its shared adaptive Dialog/Sheet body slot; both task click sources now open Event inspect and View Plan navigates to `task-detail`. Canonical Task mutations patch detail/range/store projections; Schedule's direct complete handler, Day complete affordance and TaskEventActionPanel are retired. Goal/Routine/CalendarEntry behavior and SCHED-4301 remain unchanged. Full Schedule plus focused Task validation passed 28 files / 146 tests; final host/query follow-up passed 2 / 7. App-vue typecheck, changed-file ESLint/Prettier, 1,291-file inventory, diff and governance passed. Isolated Chromium baseline and strict comparison each passed 10/10 with 18 screenshot comparisons/captures, including all canonical Task actions, Prompt measurement and View Plan navigation in wide Dialog/narrow Sheet. Final checks, exact files, browser evidence and limitations: [SCHED-4202 implementation evidence](../archive/2026-10-01-pvc-sched-4202-task-quick-surface.md). Browser evidence uses service doubles and a sentinel plan destination, not live-backend E2E. ChatGPT Web independently reviewed owner boundaries, occurrence-detail cache convergence, canonical action routing, wide/narrow visual evidence and browser command traces; the final reviewer matrix passed 7 files / 58 tests with Router R0004 warnings eliminated, and strict Chromium comparison passed 10/10 in 45.7s. SCHED-4202 acceptance is complete.

**Dependencies:** TASK-3401, TASK-3301C, SCHED-4201.

---

## PVC-SCHED-4301 — Drag/drop/create collision regression hardening

**Goal:** 锁住此前拖动偶发冲突/重复错误相关路径。

**Implementation:**

1. characterization drag/resize success/rollback。
2. owner-command idempotency/duplicate conflict cases。
3. empty-cell create path。
4. failure toast/rollback 保留原 Calendar state。
5. Schedule E2E 覆盖 Task projection revert 与 CalendarEntry drag。

**Acceptance:** drag/create 不出现 silent duplicate/partial UI state。

**Dependencies:** SCHED-4201.

**Execution (2026-10-01): Accepted / frozen after delegated implementation and independent review.** Exception rollback and callback replay are hardened at the existing FullCalendar/owner boundaries; fresh gestures keep their exact projected CAS revision. Structured Schedule version conflicts now trigger forced canonical reads after revert, while target-date/generic conflicts do not retry a write. Failed forced marker reads retain prior Calendar state and report refresh warnings. Empty-cell selection keeps one create session across repeated select/click callbacks; busy/closed submission guards preserve one owner create and committed success with refresh warning. Delegated validation passed focused App-Vue 7 files / 97 tests, full Schedule 18 / 134, app-vue typecheck, changed-file ESLint/Prettier, 1,292-file inventory, governance/diff checks, and isolated Chromium baseline + strict comparison 15/15 each with 24 comparisons/captures. ChatGPT Web independently reviewed owner/CAS/cache/create-session boundaries, reran the 7-file / 97-test matrix uncached, then reran the complete isolated Chromium strict matrix with snapshot updates disabled: 15/15 passed in 1.4m, preserving all SCHED-4101/4201/4202 scenarios plus the new collision regressions. Representative Task rollback, Schedule success/stale rollback, selected-range create and committed-card captures were visually inspected. Live backend E2E remains intentionally unrun because its bootstrap can invoke `prisma db push --accept-data-loss`; no guard was bypassed. Root causes, exact files, commands, browser artifacts and limitations: [SCHED-4301 implementation report](../archive/2026-10-01-pvc-sched-4301-collision-regression.md).

---

# 11. Phase 5 — Remaining owner UI convergence

这些模块可以在 Goal/Task reference grammar稳定后并行，但不能互相等待无关业务。

## PVC-ROUTINE-5101 — Product Time controls + timezone selector

**Goal:** Routine 不再要求用户直接使用 native date/time/free-text IANA input。

**Implementation:**

1. date/time 改 Product Date/Time components。
2. 默认 Product Time timezone。
3. override 使用 searchable timezone selector。
4. domain 仍持久 IANA timezone。
5. native number input 统一 standard Input/stepper grammar。

**Acceptance:** 用户无需手输 `Asia/Shanghai`；WallClock semantics 不变。

**Execution (2026-10-01): Accepted / frozen after independent review.** Routine WallClock retains exact Ymd + Hm + IANA semantics through day-only ProductDatePicker, shared ProductTimePicker and searchable ProductTimeZoneSelector; Product zone/today defaults and persisted overrides round-trip without Instant conversion. All four numeric controls use the existing NumberField family with minima 1/1/0/1; its missing UI-package public export is added. Review repairs restore invalid time parts from the committed model on blur without emission and base invalid arrow steps on committed parts; Routine explicitly supplies localized hour/minute and timezone default/search/empty labels, verified in zh-CN. Shared controls plus all Routine tests passed 8 files / 54 tests, including 12 runtime editor cases. After rebasing onto accepted batch `bb90af8f52a4`, ChatGPT Web independently reviewed the control/WallClock boundaries and reran the same 8-file / 54-test matrix uncached; `app-vue:typecheck --skip-nx-cache` completed through `vue-tsc`, and changed-file ESLint/Prettier, 1,295-file inventory, governance and diff checks passed. Browser harness not added; no browser/live-backend acceptance is claimed. ROUTINE-5102/5103 remain unchanged. Exact files, red-first evidence, fallback scope and validation: [ROUTINE-5101 Product Time controls](../archive/2026-10-01-pvc-routine-5101-product-time-controls.md).

---

## PVC-ROUTINE-5102 — Routine toolbar/profile hierarchy

**Goal:** 降低 h-11 toolbar 持久管理噪声。

**Implementation:**

1. 左侧保留 system/status view。
2. 右侧保留 current Profile scope/gate + Add Routine。
3. Profile CRUD/runtime low-frequency actions 收进 Profile menu。
4. unsupported host capability 继续明确 disabled/hidden semantics。

**Acceptance:** toolbar 更紧凑且 Profile 一等语义仍清晰。

**Execution (2026-10-01): Accepted / frozen after independent review.** Routine keeps the existing status filter on the left and now groups the current Profile scope with its durable enabled gate into one compact right-side control; Add Routine remains a separate primary action. Profile runtime/edit/delete/create stay in the Profile menu. Unsupported local-runtime hosts no longer silently lose the runtime action: it remains visible, disabled, and carries the existing Desktop-required hint. Global/Profile gates and runtime actions still route to the same `updatePreferences`, `updateProfile`, and `setProfileActive` owner commands. Full Routine App-Vue regression passed 5 files / 26 tests after final reviewer repair; the selected scope label is now compact (`Work` / `All`) and Add Routine collapses to plus-only below the existing panel breakpoint. `app-vue:typecheck --skip-nx-cache` completed through `vue-tsc`; changed-file ESLint/Prettier, 1,295-file inventory, governance and diff checks passed. The existing authenticated Routine browser lane was intentionally not run because its API bootstrap can execute `prisma db push --accept-data-loss`; no browser/live-backend claim is made. Exact hierarchy, test evidence and limitation: [ROUTINE-5102 toolbar/profile hierarchy](../archive/2026-10-01-pvc-routine-5102-toolbar-profile-hierarchy.md).

---

## PVC-ROUTINE-5103 — Routine editor semantic decomposition

**Goal:** 仅按稳定 trigger/ownership boundary 拆大组件。

**Candidates:** WallClockTriggerEditor / ElapsedTriggerEditor / ActiveUsageTriggerEditor / ProfileScopeControl。

**Acceptance:** editor 更易维护，但不引入 UniversalRoutineField schema renderer。

**Execution (2026-10-01): Accepted / frozen after semantic-boundary review.** `RoutineEditorDialog` now composes `WallClockTriggerEditor`, `ElapsedTriggerEditor`, `ActiveUsageTriggerEditor`, and `ProfileScopeControl`, while reset/validation, `buildTrigger()`, timing-owner decisions and the final save payload remain parent-owned. The extracted components contain presentation/local editing behavior only; no `RoutineTriggerDto` construction, owner commands, `UniversalRoutineField`, or field-schema renderer was introduced. Mounted regression passed 2 files / 16 focused tests and the full Routine suite passed 5 files / 27 tests; `app-vue:typecheck --skip-nx-cache`, changed-file ESLint/Prettier, the 1,295-file inventory, governance and diff checks passed. No browser/live-backend claim is made. Exact boundaries and evidence: [ROUTINE-5103 editor decomposition](../archive/2026-10-01-pvc-routine-5103-editor-decomposition.md).

**Dependencies:** ROUTINE-5101.

---

## PVC-KNOW-6101 — Shared document presentation primitives

**Goal:** Web/Desktop 对相同 document semantics 使用同一 presentation grammar。

**Implementation:**

1. DocumentWorkspaceToolbar。
2. CatalogSearch/CatalogRow/selected state。
3. Workspace Loading/Error/Empty。
4. source/status presentation。
5. native connection select 改 standard selector。

**Out of scope:** 合并 Web/Desktop capability ownership。

**Acceptance:** 相同文档/目录交互外观一致，Web 仍 projection-only。

**Execution (2026-10-01): Implemented / validated.** Added shared document-workspace presentation primitives for toolbar, catalog search/row selection, loading/error/empty state, and source/status presentation; the Web Knowledge catalog is the proving surface and now uses the standard Select instead of a native connection selector. Repository APIs, Web projection-only semantics, and Desktop local-vault ownership remain unchanged. Focused Knowledge 3 files / 21 tests and App-Vue typecheck PASS; inventory is 1290 files. See [implementation report](../archive/2026-10-01-pvc-know-6101-document-presentation-primitives.md).

---

## PVC-KNOW-6102 — Web/Desktop workspace composition migration

**Goal:** 两种 host 使用共享 presentation primitives，但保留各自 capability。

**Implementation:**

1. Web KnowledgeProjectionWorkspaceView 迁移。
2. Desktop LocalVaultWorkspaceView 迁移。
3. Desktop-only vault/Obsidian actions 保留。
4. Web-only source/projection semantics 保留。
5. narrow Catalog/Context Sheet 行为回归。

**Acceptance:** 视觉一致，ownership/capability 不混淆。

**Dependencies:** KNOW-6101.

**Execution (2026-10-01): Implemented / validated.** Web `KnowledgeProjectionWorkspaceView` and Desktop `LocalVaultWorkspaceView` now share the document toolbar/source/search/row/state presentation grammar without merging host capabilities. Web narrow Catalog/Context Sheet behavior is regression-tested; Desktop Vault/Obsidian operations remain host-only and Web remains GitHub projection-only. Focused Knowledge/UI 5 files / 27 tests PASS; App-Vue typecheck, targeted lint, inventory 1291, governance, and diff gates PASS. See [implementation report](../archive/2026-10-01-pvc-know-6102-web-desktop-workspace-composition.md).

---

## PVC-NOTIF-7101 — Notification collection + semantic tone convergence

**Goal:** Inbox 加入 canonical Collection family。

**Implementation:**

1. toolbar/system-view grammar 对齐。
2. row density/empty/loading/error 对齐。
3. raw purple/cyan/amber category mapping 迁 semantic tone。
4. typed owner action 保持。
5. read/unread/archive semantics 不改。

**Acceptance:** Notification 属于同一产品语言，无 owner behavior regression。

**Execution (2026-10-01): Implemented / validated.** Notification Inbox now uses the shared collection segmented-filter and empty-state grammar, sparse cardless rows, and a shared semantic tone vocabulary while preserving stable filter DOM identity, read/unread/archive semantics, typed owner actions, and destination behavior. Full App-Vue Notification regression 15 files / 76 tests PASS; shared filter/Routine regression 2 files / 10 tests PASS; App-Vue typecheck, targeted lint, inventory 1291, governance, and diff gates PASS. Browser panel-layout/filter behavior and the inbox read-count closed loop also passed; a transient auth self-registration timeout on one aggregate run passed on isolated rerun. See [implementation report](../archive/2026-10-01-pvc-notif-7101-notification-collection-semantic-tone.md).

---

## PVC-NOTIF-7102 — Browser notification destination parity

**Goal:** Web OS notification click 与 in-app/Desktop 一致。

**Implementation:**

1. browser presenter 使用 canonical destination resolver。
2. 有 typed destination 则打开 owner target。
3. 无 destination 才 fallback `/notifications`。
4. tests 覆盖 Task/Goal/unknown destination。

**Acceptance:** 三种 host click destination 一致。

---

## PVC-SET-7201 — Settings section/property primitives

**Goal:** 解决 Card ocean，不改变 Settings scene IA。

**Components:** SettingsSection / SettingsPropertyRow / SettingsStatusBlock / SettingsObjectCard / SettingsDangerZone / SettingsDialogShell。

**Implementation:**

1. 先在 General/Appearance/Account 证明 grammar。
2. shared primitive 只接 presentation props，不接 owner API。
3. standard Select/Dialog/status tokens。
4. narrow settings navigation 保留。

**Acceptance:** 简单 preference 不再默认包一层 heavy Card。

---

## PVC-SET-7202 — Settings owner-section migration

**Scope:** Notification, Data, AI, Knowledge sections。

**Implementation:**

1. 迁 Notification/Data property rows。
2. 迁 AI provider connection object cards/onboarding dialog。
3. 迁 Knowledge connection/object cards/disconnect dialog。
4. raw native select/status palette 清理。
5. large files 仅按 workflow boundary 拆分。

**Acceptance:** Settings scene 一致，但各 capability owner API 不集中化。

**Dependencies:** SET-7201.

---

# 12. Phase 6 — Shared UI grammar / Shell host convergence

## PVC-UI-2101 — Legal surface/header variants

**Goal:** 正式定义 collection/entity/calendar/document/settings/diagnostic header families。

**Implementation:**

1. 从 Goal/Task/Schedule/Knowledge/Settings 已验证样式提取 contract。
2. 统一 gutter/border/control height/responsive collapse。
3. 不强制一个 literal height。
4. 迁最少两个真实 surface 后再标 stable。

---

## PVC-UI-2102 — Entity property/metadata grammar

**Goal:** Goal/Task 已验证的 metadata/property 视觉复用。

**Candidates:** ProductEntityIdentity / ProductMetadataRow / ProductMetadataChip / ProductMoreProperties。

**Rule:** 只抽 presentation，domain decisions 留 owner。

---

## PVC-UI-2103 — Overlay/state recipes

**Goal:** Dialog/Popover/Sheet + loading/error/empty 行为收敛。

**Implementation:**

1. compact property popover recipe。
2. inspect dialog recipe。
3. workspace/config dialog recipe。
4. narrow Sheet recipe。
5. Collection/Workspace/Dialog state families。

---

## PVC-UI-2104 — Semantic elevation/status/source tones

**Goal:** feature-local raw palette/elevation 减少。

**Scope:** AI shadows、Notification tones、Schedule source tone、Settings status、Routine legacy colors。

**Acceptance:** semantic token vocabulary 覆盖核心 surface；不做无意义 mass replace。

---

## PVC-SHELL-8201 — Capsule host shell

**Goal:** 六类 Capsule 共享外壳，不共享业务 row。

**Components:** CapsulePreviewShell/Header/Footer/State。

**Implementation:**

1. 先迁 Task + Goal capsule。
2. 再迁 Routine/Notification/Schedule/Knowledge。
3. 保留各 owner Quick Surface/item semantics。
4. stale-window/focus/pinned behavior 不改。

**Acceptance:** capsule chrome 一致，无 universal business row。

---

# 13. Phase 7 — Owner Native Edit Session + AI Surface Orchestration

## PVC-AI-8001 — Owner Native Edit Session contract

**Goal:** AI 与用户共享真正的 owner form/session，而不是 AI-only editor。

**First implementation:** Goal create/edit session。

**Contract capabilities:** openCreate/openExisting/patch/addChild/removeChild/focus/requestSubmit/requestCancel/readDraftState。

**Implementation:**

1. 定义 typed surface/session interface，不能暴露 arbitrary component state。
2. GoalDialog/Goal editor state 接 adapter。
3. 复用 owner validation/dirty/submit/cancel。
4. BusinessPanel 可以打开/定位 native owner surface。
5. 加测试：manual edit 与 AI patch 操作同一 draft state。

**Acceptance:** AI 不需要 DOM selector，也不绕过 Goal validation 即可驱动 native Goal form。

**Dependencies:** GOAL-1601, UI overlay primitives 可后置。

---

## PVC-AI-8101 — Goal native AI workflow vertical slice

**Goal:** 一个完整 `goal.create` workflow 不再使用 AI-only Goal editor。

**Implementation:**

1. Mastra 继续生成 internal proposal/draftRef。
2. Surface Orchestrator 投影 proposal 到 Goal native edit session。
3. user/AI 都可继续 patch same session。
4. approve/submit 走 Goal owner command。
5. restart/retry/recovery 行为与旧 workflow parity。
6. diagnostics 保留 internal IDs，但 normal UI 不显示。

**Acceptance:** AI Goal create 从聊天到右侧 native Goal form 到 canonical Goal 创建端到端通过。

**Dependencies:** AI-8001.

---

## PVC-AI-8111 — Task native AI workflow

**Goal:** `task.create` 迁到 native Task create/edit surface。

**Implementation:**

1. TaskPlan form 提供 edit-session adapter。
2. AI proposal 投影到 native Task form。
3. Goal/KR three-mode rule 使用当前 Task product language。
4. Quick Task 与 full create 不混淆。
5. restart/retry parity。

**Acceptance:** 不再需要 AITaskDraftEditor 承担正常 Task create editing。

**Dependencies:** TASK-3901, AI-8001.

---

## PVC-AI-8112 — Knowledge native AI capture workflow

**Goal:** knowledge.capture 使用 native Knowledge owner surface/context，而不是 AI 专属编辑面。

**Implementation:**

1. 定义 Knowledge capture/native review session。
2. stable document/source identity 保持。
3. Web projection-only boundary 不因 AI 绕过。
4. user approval/retry parity。

**Acceptance:** AI Knowledge capture 与人工 Knowledge surface 使用同一 product language/owner contract。

**Dependencies:** KNOW-6102, AI-8001.

---

## PVC-AI-8121 — Retire AI-owned product editors

**Goal:** parity 后删除第二套 Goal/Task/Knowledge product UI。

**Retirement candidates:** AIGoalDraftEditor, AITaskDraftEditor, duplicated workflow review form sections。

**Implementation:**

1. grep runtime references。
2. 删除 normal render path。
3. 保留 internal draft/revision/receipt diagnostics。
4. 更新 unit/E2E。
5. 删除 dead i18n/components/tests only after parity。

**Acceptance:** normal AI workflow 没有 AI-only business form。

**Dependencies:** AI-8101, AI-8111, AI-8112.

---

## PVC-AI-8131 — Evaluate BusinessPanel workflow-surface retirement

**Goal:** 只有 native parity 后才决定是否删除 `workflow` surface。

**Gate:** clarification/recovery、dirty/busy/attention、restart/retry、diagnostics 都有 replacement。

**Outcome:** either retire with migration, or document exact remaining reason to keep。

**Dependencies:** AI-8121.

---

## PVC-AI-8201 — Composer host/elevation cleanup

**Goal:** AIChatView 只保留一个逻辑 composer mount path；语义 elevation token 取代 bespoke rgba shadow。

**Out of scope:** 改写 composer product behavior。

**Dependencies:** 可与 AI native slices 并行，但建议在结构稳定后合并。

---

# 14. Parallel gated track — Product Governance retirement

ADR-113 尚未最终确认，因此只做非破坏性准备，不能直接删除。

## PVC-GOV-7901 — Governance retirement inventory

**Goal:** 完整枚举 Product Governance runtime blast radius。

**Inventory:** contracts/package/app-vue/database/PowerSync/API/IPC/DI/router/build/docker/tests/rule bundle/AGENT docs。

**Acceptance:** 每个 reference 标记 `retire / keep engineering / shared / migrate first`。

---

## PVC-GOV-7902 — Decouple Engineering Governance inputs

**Goal:** `tools/governance` 和 CI 不再依赖 Product Governance runtime/DB/export。

**Implementation:**

1. 识别 pinned bundle 实际使用规则。
2. repository-native engineering-rules source。
3. adapters/checks 改读新 source。
4. CI parity 比较旧/new result。
5. 更新 AGENT policy proposal：真实 vertical slice first。

**Acceptance:** Engineering Governance 可独立于 Product Governance package/database 运行。

**Dependencies:** GOV-7901.

---

## PVC-GOV-7903 — Destructive Product Governance retirement

**Gate:** 只有 ADR-113 最终采纳后执行。

**Scope:** 删除 Product Governance contracts/package/UI/DB/transport/routes/composition/reference-only tests，保留 engineering governance。

**Verification:** full typecheck/test/build/governance checks + repo grep zero runtime refs。

**Dependencies:** ADR-113 accepted, GOV-7902.

---

# 15. Phase 8 — Visual / interaction / accessibility closure

## PVC-UI-9001 — Full screenshot matrix

**Matrix:**

- Collection: Goal/Task/Routine/Notification
- Entity: Goal/TaskPlan
- Specialized: Schedule Day/Week/Month, Knowledge wide/narrow, Settings, AI native workflow
- Overlays: Goal Record/KR/Review, Task Inspect/measurement, Schedule Day/Event, Routine Editor
- Shell: normal split/narrow/focus/capsules
- light/dark + representative zh-CN/en-US

**Acceptance:** deterministic screenshot diffs run in review/CI path。

---

## PVC-UI-9002 — Keyboard/focus/a11y/container closure

**Checks:**

- keyboard submit/cancel;
- focus return from Dialog/Popover;
- reduced motion;
- min target size;
- narrow 520-ish business panel;
- no nested scroll-owner regression;
- aria labels/roles for icon-only responsive actions。

---

## PVC-UI-9003 — Performance/query closure

**Checks:**

- Task Today bounded query；
- capsule stale-window reuse；
- no duplicate hover requests；
- Knowledge lazy catalog；
- Schedule owner cache；
- AI native session no duplicate owner fetch loop。

---

## PVC-UI-9004 — Dead surface/component cleanup

**Only after parity:** retire standalone KR/Review pages, DailyTodo duplicate logic, Schedule old detail sheets/action panel, AI-owned editors, duplicate GoalRecord cards, dead legacy settings/dialog recipes。

**Acceptance:** grep/route/component inventory 无 dead public render path；无 unrelated mass refactor。

---

# 16. Traceability — known findings to tickets

## Goal

| Problem                              | Ticket    |
| ------------------------------------ | --------- |
| Create Reminder 增加心智             | GOAL-1101 |
| KR progress row 信息不足             | GOAL-1102 |
| KR 仍依赖 Edit action                | GOAL-1103 |
| 五种 method copy 漂移                | GOAL-1104 |
| Record Sum-biased / positive-only    | GOAL-1201 |
| 缺 live before/after preview         | GOAL-1202 |
| source/provenance 不可区分           | GOAL-1203 |
| standalone KR detail                 | GOAL-1301 |
| Review 固定 7d / window drift        | GOAL-1401 |
| Review blank/manual-first facts 缺失 | GOAL-1402 |
| standalone Review pages              | GOAL-1403 |

## Task

| Finding                                  | Ticket                          |
| ---------------------------------------- | ------------------------------- |
| T2-01 Quick Task disconnected            | TASK-3004                       |
| T2-02 hidden filter controls Plans       | TASK-3003A                      |
| T2-03 End plan = Archive                 | TASK-3002A/B                    |
| T2-04 outcome missing                    | TASK-3002D                      |
| T2-05 completion policy residue          | TASK-3002C                      |
| T2-06 invalid non-Sum fixed contribution | TASK-3301A                      |
| T2-07 full occurrence history            | TASK-3003B                      |
| T2-08 phantom page/limit                 | TASK-3003B                      |
| T2-09 KR filter/raw IDs                  | TASK-3003B                      |
| T2-10 DailyTodo legacy surface           | TASK-3401                       |
| T2-11 detail grammar drift               | TASK-3101                       |
| T2-13 Archive normal UX                  | TASK-3002A/D                    |
| T2-14 recent history copy                | TASK-3101                       |
| T2-15 fixed-delta-only KR recording      | GOAL-1201/1203 + TASK-3301A/B/C |

## Remaining modules

| Finding                                             | Ticket                                       |
| --------------------------------------------------- | -------------------------------------------- |
| RUI-01 cross-module Task action bypass              | TASK-3401 + SCHED-4202                       |
| RUI-02 Schedule CRUD inspect gap                    | SCHED-4201                                   |
| RUI-03 Governance reference-runtime cost            | GOV-7901/7902/7903                           |
| RUI-04 AI duplicate product editors                 | AI-8001/8101/8111/8112/8121                  |
| RUI-05 no visual regression matrix                  | BASE-003 + UI-9001                           |
| RUI-06 ad-hoc toolbar variants                      | UI-2101                                      |
| RUI-07 Routine native time controls                 | ROUTINE-5101                                 |
| RUI-08 Knowledge Web/Desktop presentation drift     | KNOW-6101/6102                               |
| RUI-09 browser notification destination             | NOTIF-7102                                   |
| RUI-10 Settings card/raw-dialog/native-select drift | SET-7201/7202                                |
| RUI-11 capsule repeated shell                       | SHELL-8201                                   |
| RUI-12 AI composer duplication/elevation            | AI-8201                                      |
| RUI-13 source tone duplication                      | UI-2104 + NOTIF-7101 + SCHED-4101            |
| RUI-14 loading/error/empty drift                    | UI-2103                                      |
| RUI-15 large files semantic decomposition           | owner-specific tickets only                  |
| RUI-16 alternate Account surfaces                   | SET-7202 / cleanup                           |
| RUI-17 Auth redirect visual fallback                | UI-9004 P3                                   |
| RUI-18 SSE Monitor older diagnostic UI              | deferred to diagnostic polish unless touched |

---

# 17. Parallelization map

## Can run after Phase 0

Parallel lane A:

- GOAL-1101/1104/1401

Parallel lane B:

- TASK-3002A/B/C

Parallel lane C:

- BASE-003 visual harness

Parallel lane D:

- GOV-7901 inventory

## After Goal measurement contract begins stabilizing

- GOAL-1201/1202/1203
- TASK-3301A preparation

## After Task lifecycle stabilizes

- TASK-3003A/B
- TASK-3004
- TASK-3401

## After Task Quick Surface

- TASK-3201
- SCHED-4202
- SHELL-8201 Task capsule migration

## After Goal reference + Task reference grammar

Can run in parallel:

- ROUTINE-5101/5102
- KNOW-6101
- NOTIF-7101/7102
- SET-7201
- UI-2101/2103/2104

## AI migration

Strict order:

```text
AI-8001
 -> AI-8101 Goal
 -> AI-8111 Task + AI-8112 Knowledge (parallel after contract proven)
 -> AI-8121
 -> AI-8131
```

---

# 18. Verification matrix

## Focused component/domain

Use the smallest changed specs first, for example:

```text
pnpm exec vitest run packages/app-vue/src/modules/goal/...spec.ts
pnpm exec vitest run packages/app-vue/src/modules/task/...spec.ts
pnpm exec vitest run packages/app-vue/src/modules/schedule/...spec.ts
```

## Package gates

```text
pnpm nx run goal:test
pnpm nx run goal:test:integration
pnpm nx run task:test
pnpm nx run task:test:integration
pnpm nx run schedule:test
pnpm nx run schedule:test:integration
pnpm nx run notification:test
pnpm nx run ai:test
pnpm nx run setting:test
pnpm nx run account:test
```

按 ticket 只运行受影响 package，不每次全仓。

## UI gates

```text
pnpm nx run app-vue:typecheck
pnpm nx run app-vue:test
pnpm nx run web:build
```

## E2E subsets

Representative existing specs:

- `goal/goal-crud.spec.ts`
- `goal/goal-keyresult.spec.ts`
- `task/task-plan-crud.spec.ts`
- `task/task-completion-loop.spec.ts`
- `schedule/schedule-calendar.spec.ts`
- `schedule/schedule-crud.spec.ts`
- `schedule/planner-task-revert.spec.ts`
- `routine/routine-configuration.spec.ts`
- `notification/notification-center.spec.ts`
- `account/account-profile.spec.ts`
- `ai/goal-workflow.spec.ts`
- `shell/shell-geometry.spec.ts`

## Final batch gates

- focused tests green；
- affected package test/typecheck green；
- app-vue typecheck/test green；
- web build green；
- selected E2E green；
- visual baseline reviewed；
- `git diff --check`；
- no console errors；
- docs/current-system map updated。

---

# 19. Batch review protocol

每一批实现完不直接进入下一大批；先做五层 review：

1. contract correctness；
2. vertical completeness；
3. behavioral completeness；
4. engineering quality / duplication / ownership；
5. plan integrity / test evidence / diff hygiene。

Finding 分级：P0/P1/P2/P3。

P0/P1 未关闭时，不在其上继续抽共享 UI abstraction。

---

# 20. 推荐第一批实施边界

如果现在开始实施，第一批不要同时开所有模块。

推荐 Batch 1：

```text
BASE-001/002
TASK-3002A
TASK-3002B
TASK-3002C
TASK-3002D
```

目标：先把 Task 的 P0 lifecycle truth 彻底修正。

可并行的小批：

```text
GOAL-1101
GOAL-1104
GOAL-1401
```

Batch 1 关闭后再进入：

```text
Goal Record foundation
Task Home/Quick foundation
```

这样不会在错误的 lifecycle/measurement contract 上继续堆 UI。
