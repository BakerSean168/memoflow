---
tags:
  - plan
  - active
  - goal
  - task
  - labels
  - product
  - refactor
description: Goal/Task vNext 从过度项目管理模型收敛到个人 Direction/Measurement + Action/Execution 的完整重构实施计划
created: 2026-08-25T14:28:00+08:00
updated: 2026-08-25T19:18:00+08:00
status: superseded
---

# Goal / Task vNext — Personal Outcome & Execution Refactor

> **Archived 2026-08-29:** detailed Goal/Task business design is retained here for reference. The completed orchestration record is archived at `./2026-08-25-core-vnext-orchestration.md`; this child plan is historical reference only and is not an active execution truth.

> **Orchestration notice (2026-08-25):** 本文件保留 Goal/Task 的业务细节与验收场景；实际实施顺序、并行 lane、shared Contract/Schema Train 与跨模块依赖以 `2026-08-25-core-vnext-orchestration.md` 为唯一真值。不要再按本文 Phase 1→12 独立顺序执行。
>
> Old-phase mapping: Phase 0 -> `CORE-0001~0005`; Phase 1 -> `LABEL-1101`; Phase 2 -> `GOAL-2101`; Phase 3 -> `GOAL-2102`; Phase 4 -> `GOAL-2103`; Phase 5 -> `TASK-2201~2204`; Phase 6 -> `TASK-2205` + `SETTLE-3401`; Phase 7/8 -> W5 Goal/Task UI tickets; Phase 9/10 -> W6 Mobile/AI; Phase 11/12 -> `CLEAN-*` + `HARD-*`. Scheduling projector/handler work follows W3 tickets, not this child-plan phase order.

## Outcome

一次性把当前 Goal / Task 从“功能资产很多但用户心智割裂”的状态，收敛为个人 MemoFlow 的两个稳定模块：

```text
Goal = Direction + Measurement
Task = Action + Execution
```

最终用户无需理解 Folder / Category / Focus / Comparison / TaskTemplate / Dependency / DAG / Critical Path 等工程或项目管理概念，即可完成：

```text
定义目标
-> 定义可量化 KR
-> 创建普通/重复任务
-> 可选关联 Goal/KR
-> 可选按每次完成或整个计划完成结算贡献
-> 自动/手动形成 GoalRecord
-> 查看真实 KR / Goal progress
-> 复盘
```

本计划以以下 ADR 为决策真值：

- `ADR-053-goal-task-personal-product-boundary.md`
- `ADR-054-shared-labels-and-system-views.md`
- `ADR-055-key-result-measurement-progress-v2.md`
- `ADR-056-task-plan-goal-link-contribution-settlement.md`
- `ADR-057-task-occurrence-outcome-and-plan-lifecycle.md`
- `ADR-058-oss-first-standard-capability-reuse.md`

产品目标见：`docs/product/goal-task-vnext.md`。  
开源研究见：`docs/analysis/2026-08-25-goal-task-vnext-open-source-study.md`。  
复用策略见：`docs/analysis/2026-08-25-goal-task-oss-reuse-feasibility.md` 与 ADR-058。

## 0. Guardrails

### 0.1 不保留长期兼容双轨

项目当前仍处活跃开发期。实施前再次确认生产数据状态：

- 若无有价值生产数据：直接 schema reset / seed refresh；
- 不保留 GoalFolder / TaskFolder / category / valueType / dependency 等旧字段双读双写；
- 不维护 v1/v2 两套 UI；
- 一批切换后删除旧 endpoint / mapper / tests / stories。

### 0.2 保留可靠基础设施

本轮不推翻：

- Goal optimistic concurrency；
- GoalWriteTransactionRunner；
- TaskWriteTransactionRunner；
- Task -> Goal durable outbox；
- GoalRecord source correlation；
- completion/uncomplete reliable rollback；
- Prisma/PowerSync adapter parity；
- ADR-037 product-time；
- ADR-049 outcome/failure contracts。

### 0.3 Recurrence date math 非重构目标

UI/模型命名会收敛，但 recurrence date calculation 只在必要的 bug / completion scope 修复时修改。DST、月末、闰年等已有逻辑必须由 characterization tests 保护。

### 0.4 OSS-first / Build-Borrow-Integrate Gate

本轮执行 ADR-058：

- MemoFlow 自己拥有 Goal/KR/Task/Contribution/Plan outcome 等业务语义；
- 标准算法/协议默认先找成熟 library，而不是直接自研；
- 完整开源 App 主要借鉴业务语义、UI 信息架构、状态机、API/plugin seam、测试矩阵和 failure/upgrade 工程细节；
- 只有稳定 API/plugin seam 且明确愿意把对应能力交给外部 source of truth 时，才评估 service/plugin integration；
- Vikunja / Leantime（AGPL）、Tasks.org / Loop（GPL）不复制 copyleft source；
- Super Productivity 等 permissive source 若实际复用，逐 package/file 记录 license notice、framework coupling 和适配理由；
- 第三方 DTO 不进入 `@memoflow/contracts`，统一通过 port/adapter 隔离。

每个标准能力 ticket 在 production code 前必须给出：

```text
Build / Borrow / Integrate decision
maintainer activity
license
API stability
adapter boundary
contract tests
fallback/removal cost
```

## 1. Phase 0 — Baseline / Inventory / Characterization

**目标：** 在删除大量 surface 前固定真实消费者和高风险行为。

- [ ] Inventory GoalFolder / TaskFolder 的 API、IPC、PowerSync、AI、mobile consumers；
- [ ] Inventory Goal category / parentGoal / importance / priority / color / Focus / Compare consumers；
- [ ] Inventory Task parent / dependency / DAG / CriticalPath / dynamic priority consumers；
- [ ] Inventory `KeyResultValueType` 全仓 consumer；
- [ ] Inventory Review type/rating/title consumer；
- [ ] Inventory Goal search 是否有非 UI external/AI consumer；
- [ ] Characterize current Task recurrence generation；
- [ ] Characterize EachCompletion current outbox apply/revert；
- [ ] Characterize current AllInstancesCompleted finite-scope behavior；
- [ ] Inventory `TaskInstanceStatus.Expired`、`TaskExpirationService`、check-expired API/Schedule consumers；
- [ ] Characterize current `Skipped` 的用户入口、reason、统计与 recurrence 影响；
- [ ] Characterize past-due instance 是否仍可补录完成；
- [ ] Characterize PowerSync parity；
- [ ] 建立毕业/二课 scenario fixture；
- [ ] 建立跑步 EachCompletion scenario fixture；
- [ ] 建立下降型 KR / Last measurement fixture。
- [ ] 建立 occurrence `Pending + Overdue -> Completed/Missed` fixture；
- [ ] 建立 strict 15/15 `Missed -> Plan Failed -> no settlement` fixture；
- [ ] Spike A：评估 current recurrence engine vs `ical.js` / `@breejs/later` adapter；
- [ ] Spike B：盘点 Super Productivity MIT `packages/*` 是否有真正 framework-independent 可复用零件；
- [ ] 对所有拟引入第三方依赖记录 license、maintenance、API stability、adapter boundary。
- [ ] 建立本计划的 Build / Borrow / Integrate decision ledger；每个标准能力在实施前明确选择和理由；
- [ ] OSS 研究至少记录 business semantics、state machine、schema/API、test matrix、failure/retry/migration engineering，而不只记录 UI；
- [ ] 对被选择的 library 建 MemoFlow-owned contract tests，禁止 third-party DTO 泄漏到 contracts；

**Gate：** 所有待删除字段都有 consumer list；所有可靠 contribution/recurrence 行为有测试保护；所有拟重写的标准能力都有明确 Build / Borrow / Integrate 决策证据。

## 2. Phase 1 — Shared Label Foundation

**目标：** 先建立新的唯一分类体系，再删除旧 Folder/Category/Tag。

### Domain / Contracts

- [ ] 增加 identity-scoped `Label` contract；
- [ ] 定义 normalized name uniqueness；
- [ ] 增加 Label list/search/create/update/delete ports；
- [ ] Goal/Task read model 增加 `labels[]`；
- [ ] Goal/Task mutation 改为 `labelIds[]`；
- [ ] Query 增加 `labelIdsAll[]` 明确 AND 语义。

### Database

- [ ] 新增 `Label`；
- [ ] 新增 `GoalLabel`；
- [ ] 新增 `TaskLabel`；
- [ ] `(identityId, normalizedName)` unique；
- [ ] assignment 带 identity ownership constraint/index。

### Adapters

- [ ] Prisma label registry；
- [ ] PowerSync label registry / projection；
- [ ] batch label projection，避免 N+1；
- [ ] AND filter adapter tests。

### UI primitives

- [ ] 共用 `LabelPicker`；
- [ ] 支持 search existing；
- [ ] 支持 inline create；
- [ ] 支持 multi-select；
- [ ] 共用 `LabelFilterPopover`；
- [ ] narrow panel label summary。

**Gate：** Goal 与 Task 可以共享 `#工作`；多选 `#工作 + #AI` 是 AND。

## 3. Phase 2 — Goal Domain Simplification

**目标：** 删除 Goal 中与个人 outcome 无关的组织/项目管理能力。

### 删除 schema / contracts

- [ ] GoalFolder model / DTO / routes / use cases / repositories / PowerSync adapter；
- [ ] `Goal.category`；
- [ ] `Goal.tags` string array；
- [ ] `Goal.folderId`；
- [ ] `Goal.parentGoalId` / childGoals；
- [ ] `rollupPolicy`；
- [ ] `importance`；
- [ ] dynamic `priority`；
- [ ] Goal custom `color`；
- [ ] FocusMode / FocusSession domain / routes / UI；
- [ ] MultiGoalComparison query / view / components；
- [ ] Goal search main product surface；无其他 consumer 则删除 endpoint；
- [ ] old system folder views。

### Goal status

- [ ] `GoalStatus = Active | Completed | Abandoned`；
- [ ] `archivedAt` 作为显示归档属性，而不是 business status；
- [ ] 审查 complete/archive/activate commands 并收敛命名；
- [ ] system view query：Active / Completed / All。

### Date naming

- [ ] UI `目标日期` -> `截止日期`；
- [ ] contract/domain 评估 `targetDate` -> `dueDate`；
- [ ] 若 rename，HTTP/IPC/AI/DB 一次性同切片完成，不保留别名双轨。

**Gate：** Goal aggregate 不再承担 folder/category/hierarchy/focus/comparison/priority。

## 4. Phase 3 — KR Measurement V2

**目标：** 删除重复值类型，建立唯一可解释的进度语义。

### Contracts / DB

- [ ] 删除 `KeyResultValueType`；
- [ ] 删除 `valueType` column；
- [ ] `initialValue` -> `startingValue`（语义迁移，不机械 rename）；
- [ ] 增加 `progressBaselineValue?`；
- [ ] 保留 `currentValue/targetValue/unit/aggregationMethod`；
- [ ] weight default 从 1 -> 3；
- [ ] review snapshot 同步新 measurement fields。

### Canonical calculator

- [ ] 实现唯一 `calculateKeyResultProgress()`；
- [ ] default natural-zero progress；
- [ ] explicit baseline directional progress；
- [ ] clamp 0-100；
- [ ] completion directional correctness；
- [ ] `Goal.calculateProgress()` 只消费 canonical KR progress；
- [ ] 删除 Entity/VO/UI 重复 formula。

### Aggregation

- [ ] Sum = startingValue + sum(records)；
- [ ] Average/Max/Min/Last = sample aggregation；
- [ ] no records fallback startingValue；
- [ ] record edit/delete 后 deterministically recalc。

### Goal completion

- [ ] overall progress 与 completion 分离；
- [ ] Goal complete 默认要求所有 KR completed；
- [ ] read model 增加 `completedKeyResults / totalKeyResults`；
- [ ] UI 不用 overallProgress==100 作为唯一业务语义。

**Gate scenarios：**

- [ ] 二课 40/50 -> 80%；
- [ ] 学分 154/160 -> 96.25%；
- [ ] 75kg -> 70kg，当前 73kg -> 40%；
- [ ] Sum 40 + Task Plan +1 -> 41；
- [ ] weighted progress 与 all-KR completion 正确分离。

## 5. Phase 4 — Review Simplification

**目标：** 把 Review 从复杂分类表单变成附属反思 + snapshot。

- [ ] 删除 ReviewType；
- [ ] 删除 rating；
- [ ] 删除 user-authored title；
- [ ] 收敛为 reflection / challenges / adjustments（最终命名以 contract review 为准）；
- [ ] reviewedAt；
- [ ] authoritative KR + overall progress snapshot；
- [ ] Create Review query 同时返回 review context（时间窗口进度、KR delta、record/task contribution summary）；
- [ ] Review create 从独立 route 改 Goal detail dialog/drawer；
- [ ] Review detail simple-average bug 修复；
- [ ] 多 KR 不同单位不再画同一绝对值 Y 轴 timeline；改为 normalized progress 或分 KR mini trend。

**Gate：** Review 先展示系统事实，再让用户反思；不再是空白作文页。

## 6. Phase 5 — Task Domain Simplification

**目标：** 删除个人产品不需要的项目排程能力，同时保留 recurrence / instances。

### 删除

- [ ] TaskFolder domain / contracts / DB / adapters；
- [ ] Task parentTaskId / child hierarchy；
- [ ] TaskDependency model / routes / use cases / contracts；
- [ ] 4 DependencyType；
- [ ] blockingReason / dependencyStatus / isBlocked；
- [ ] DAG read model；
- [ ] CriticalPath query/panel；
- [ ] Graph view；
- [ ] relation filters；
- [ ] dynamic priority score calculator / persisted score；
- [ ] Importance + priority 双体系。

### 保留/收敛

- [ ] one-time / recurring；
- [ ] occurrence status 收敛为 `Pending | InProgress | Completed | Missed | Skipped`；
- [ ] 删除 persisted `Expired`；`Overdue` 改 read-model derived flag；
- [ ] 增加 mark-missed / outcome correction；
- [ ] `Skipped` 明确为 waiver/not-applicable，不再承担“漏做”语义；
- [ ] 删除/重构 `TaskExpirationService` 与 `check-expired` mutation；
- [ ] Task Plan lifecycle/outcome：`Active|Paused|Closed` + `Open|Succeeded|Failed|Abandoned`；
- [ ] archive/delete 与 plan outcome 分离；
- [ ] TaskTemplate/definition + TaskInstance internal separation；
- [ ] recurrence generation policy；
- [ ] reminders；
- [ ] checklist；
- [ ] shared Labels；
- [ ] 一个简单用户 Priority；
- [ ] execution stats 仅保留可行动项。

### Time UI adapter

- [ ] UI 移除 TimeType radio；
- [ ] date/time inputs 推导 AllDay / TimePoint / TimeRange；
- [ ] internal TaskTimeType 保留，避免破坏 schedule semantics。

**Gate：** Task domain 不再含 DAG/CPM/folder/hierarchy/dynamic score。

## 7. Phase 6 — Task Goal Link / Contribution V2

**目标：** 允许“有关联但不贡献”，并保留/产品化整计划结算。

### Contracts

- [ ] `TaskGoalBinding` -> semantic `TaskGoalLink`；
- [ ] `contribution` optional；
- [ ] trigger `EachCompletion | PlanCompletion`；
- [ ] contribution value；
- [ ] validation：PlanCompletion only finite plan；
- [ ] validation：v1 automatic contribution only Sum KR。

### Task application/domain

- [ ] binding/link ownership validation；
- [ ] finite plan completion evaluator；
- [ ] current `areAllInstancesCompleted()` 收敛为 ADR-057 plan completion policy/evaluator；
- [ ] `PlanCompletion` eligibility 改由 `TaskPlan outcome -> Succeeded` 驱动；
- [ ] `Missed/Skipped/outcome correction` 后重新 evaluate plan + settlement；
- [ ] link-only task completion 不产生 Goal outbox；
- [ ] EachCompletion 产生 instance-source settlement；
- [ ] PlanCompletion 产生 plan/template-source settlement。

### Durable contract

- [ ] 评估直接切 `TaskGoalProgressOutboxEventV2`；
- [ ] event 显式携带 contribution source type/id；
- [ ] Goal consumer 不再从 trigger 推断 source；
- [ ] replay idempotency；
- [ ] uncomplete re-evaluate / revert；
- [ ] Prisma/PowerSync parity。

### Acceptance

- [ ] 普通报名 Task link 二课 KR，完成不加分；
- [ ] 15 日计划第 1-14 次不加分；
- [ ] 15/15 -> +1；
- [ ] past unresolved occurrence 只显示 Overdue，不自动 Missed/Failed；
- [ ] strict 15/15 任一 required occurrence -> Missed 且不可补签 -> Plan Failed，不结算；
- [ ] waived occurrence -> Skipped，不与 Missed 混淆；
- [ ] 用户主动退出 -> Plan Abandoned，历史保留，不结算；
- [ ] outcome correction 能重新 evaluate，且 settlement 仍幂等；
- [ ] uncomplete -> -1/revert；
- [ ] duplicate delivery 不重复 +1；
- [ ] infinite daily plan 不能 PlanCompletion；
- [ ] Last/Average KR 可 link，但自动 contribution disabled。

## 8. Phase 7 — Goal Vue UI Rebuild

**目标：** 按 `docs/product/goal-task-vnext.md` 重新拼装，而不是在旧页面上继续隐藏控件。

### Goal list

- [ ] system status dropdown；
- [ ] multi-label AND filter；
- [ ] create button；
- [ ] progress-row layout；
- [ ] overall progress；
- [ ] KR completed count；
- [ ] due date；
- [ ] label chips；
- [ ] 删除 search/focus/folder/compare action。

### Goal editor

- [ ] 单页结构；
- [ ] title/description/start/due/labels；
- [ ] KR list；
- [ ] 统一 `+ 添加关键结果`；
- [ ] 删除首个 KR special form；
- [ ] KR compact editor；
- [ ] advanced aggregation/baseline/weight collapse；
- [ ] weight default 3；
- [ ] 无 value type / impact buttons。

### Goal detail

- [ ] progress + completed requirements；
- [ ] KR rows；
- [ ] linked Task summary + deep-link；
- [ ] canonical activity timeline；
- [ ] review section；
- [ ] progress explain popover；
- [ ] 删除 fake avatar/category/old metadata。

### Goal record

- [ ] Sum 文案“本次增加”；
- [ ] sample 文案“本次记录值”；
- [ ] unit-aware UI。

## 9. Phase 8 — Task Vue UI Rebuild

### Task home

- [ ] 默认 Today instance list；
- [ ] Upcoming；
- [ ] All；
- [ ] Completed；
- [ ] Label AND filter；
- [ ] Goal/KR context filter chip；
- [ ] 一个 `+ 新建任务`；
- [ ] Task search 只在 All/command surface 保留需要的位置，不与 Goal 的删除决定混淆。

### Task editor

- [ ] title；
- [ ] date/time；
- [ ] recurrence progressive disclosure；
- [ ] label picker；
- [ ] optional Goal/KR link；
- [ ] optional auto contribution；
- [ ] EachCompletion / PlanCompletion natural language；
- [ ] finite plan validation；
- [ ] advanced description/reminder/priority/checklist；
- [ ] 删除 dependency manager / parent / graph fields。

### Task detail

- [ ] instance-first detail；
- [ ] repeat position `5 / 15`；
- [ ] Goal link metadata；
- [ ] contribution summary；
- [ ] complete/skip/uncomplete；
- [ ] `查看重复设置` deep-link。

### Repeating task management

- [ ] 二级 list；
- [ ] next occurrence；
- [ ] completed count / finite total；
- [ ] pause/resume/end/edit recurrence。

## 10. Phase 9 — Mobile / React Parity

- [ ] mobile Goal list/editor/detail 同一 product contract；
- [ ] mobile Task home instance-first；
- [ ] shared labels；
- [ ] recurrence editor；
- [ ] Goal link/contribution；
- [ ] 不在 mobile 保留已删除 Folder/Dependency/ValueType 旧 UI；
- [ ] transport parity tests。

## 11. Phase 10 — AI Workflow Alignment

ADR-052 的 orchestration 保留，但 draft schema 必须更新。

- [ ] GoalPlanDraft 删除 category/importance/color/folder/parent；
- [ ] GoalPlanDraft 使用 labels；
- [ ] KR draft 使用 Measurement V2；
- [ ] Task draft 不输出 dependency/DAG/folder；
- [ ] Task Goal link 与 contribution 分离；
- [ ] AI 默认 weight=3，不让模型滥用权重微调；
- [ ] AI 只在明确可量化 Sum 场景提议 auto contribution；
- [ ] PlanCompletion 只有 finite recurrence 才能提议；
- [ ] review/HITL UI 与新 product editor 一致；
- [ ] 更新 ADR-052 示例/字段或增加 amendment note。

## 12. Phase 11 — Dead Surface Deletion / Governance

- [ ] 删除 orphan components：GoalFolderDialog / MultiGoalComparison / Focus / ProgressBreakdown standalone；
- [ ] 删除 TaskDependencyGraph / DAG / CriticalPath / DependencyManager；
- [ ] 删除旧 translations；
- [ ] 删除旧 stories/spec fixtures；
- [ ] 删除旧 route entries；
- [ ] 删除旧 API/IPC contracts；
- [ ] 删除旧 Prisma/PowerSync mapping fields；
- [ ] 更新 product module docs；
- [ ] 更新 module indexes；
- [ ] 更新 OpenAPI surface；
- [ ] 更新 docs references；
- [ ] `rg` residual audit 必须证明没有 legacy dual path。

## 13. Phase 12 — Acceptance Journeys

### Journey A — 普通个人 Goal

```text
Goal: 跑步 100km
KR: 0/100km Sum
Task: 每周三次跑步 5km
EachCompletion +5km
```

- [ ] 完成一次 -> KR +5；
- [ ] undo -> contribution revert；
- [ ] Goal activity 显示 Task source。

### Journey B — 毕业 / 二课

```text
Goal: 顺利完成大学毕业要求
KR: 论文 0/1
KR: 学分 154/160
KR: 二课分 40/50
```

- [ ] 初始学分显示 96.25%；
- [ ] 初始二课显示 80%；
- [ ] 抢名额 Task link-only，完成不加分；
- [ ] 植物打卡 15 次 PlanCompletion +1；
- [ ] 14/15 时 KR 仍 40；
- [ ] 昨天未处理的 occurrence = Pending + Overdue，可补录完成；
- [ ] 确认漏做 -> Missed；strict no-backfill 时 plan Failed 且 KR 仍 40；
- [ ] 官方豁免 -> Skipped，不记 Missed；
- [ ] 主动退出 -> Abandoned，历史保留；
- [ ] 15/15 时 KR 41；
- [ ] uncomplete 任意一次 -> revert；
- [ ] Goal overall progress 不等于 Goal completed；
- [ ] 所有 KR 达成才允许 Completed。

### Journey C — Measurement-only KR

```text
Goal: 改善身体状态
KR: 75kg -> 70kg
Last measurement
progressBaseline=75
```

- [ ] 73kg -> 40%；
- [ ] Task“每周称重”可 link；
- [ ] 完成称重 Task 不自动猜 measurement；
- [ ] 手工记录 73kg 更新 KR。

### Journey D — Labels

- [ ] Goal `#工作 #AI`；
- [ ] Task `#工作 #AI` 共享 registry；
- [ ] Goal filter 两个 labels 使用 AND；
- [ ] Today/Active 不产生 Label row。

### Journey E — Review

- [ ] 添加 Review 前显示窗口内 progress delta / records / contribution summary；
- [ ] Review 无 type/rating/title；
- [ ] snapshot 与 canonical weighted progress 一致。

## 14. Test Gates

每个 phase 的 targeted tests 通过后才进入下一 destructive phase；最终至少：

```text
pnpm nx run contracts:typecheck
pnpm nx run goal:test
pnpm nx run task:test
pnpm nx run app-vue:test
pnpm nx run app-react:test   # 若 target 存在，按 workspace 真值替换
pnpm nx run api:test         # 按 workspace 真值
pnpm governance-check
```

另需：

- Prisma integration tests；
- PowerSync parity tests；
- Web E2E Goal/Task journeys；
- Desktop transport parity；
- local-Docker product journey；
- production-like schema boot。

实际 command 在 Phase 0 以 `nx show projects/targets` 真值校准，不照抄不存在的 target。

## 15. Definition of Done

只有同时满足以下条件才可归档：

- [ ] ADR-053~058 implemented；
- [ ] Goal/Task UI 与产品文档一致；
- [ ] Folder/Category/Focus/Compare/Dependency/DAG/CriticalPath/ValueType legacy surface 全删除；
- [ ] Shared Label 是唯一用户分类体系；
- [ ] Goal 40/50 进度语义正确；
- [ ] Goal progress/completion 分离；
- [ ] Task 首页 instance-first；
- [ ] GoalLink 与 Contribution 解耦；
- [ ] occurrence Unknown/Missed/Skipped/Overdue 语义与 ADR-057 一致；
- [ ] Task Plan Succeeded/Failed/Abandoned 与 archive/delete 不混淆；
- [ ] EachCompletion / PlanCompletion 全链路可靠、幂等、可撤销；
- [ ] 毕业/二课、跑步、减重三类 acceptance journey 通过；
- [ ] Web/Desktop/Mobile/AI contracts 无旧字段漂移；
- [ ] local Docker / MagicDNS 产品复审通过；
- [ ] full validation / required CI green；
- [ ] 最终产品审查确认没有为了旧代码继续暴露技术概念。

## 16. 实施顺序原则

推荐顺序：

```text
Characterize
-> Labels foundation
-> Goal delete/simplify
-> KR V2
-> Review
-> Task delete/simplify
-> Contribution V2
-> Goal UI
-> Task UI
-> Mobile
-> AI
-> Residual deletion
-> Full acceptance
```

不建议先重画全部 UI 再改 domain，因为旧 contracts 会迫使新 UI 继续携带无效字段；也不建议先一次性删 Task/Goal 所有 schema 而没有 characterization tests，因为 contribution/recurrence 是当前真实有价值的复杂资产。
