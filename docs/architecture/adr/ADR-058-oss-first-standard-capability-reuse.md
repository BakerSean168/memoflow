---
tags:
  - adr
  - open-source
  - reuse
  - dependency
  - architecture
  - goal
  - task
description: MemoFlow 对标准算法/协议优先复用成熟库，对产品业务语义保持领域所有权，并以 API/plugin seam 集成完整开源应用
created: 2026-08-25T15:44:00+08:00
updated: 2026-09-08T09:00:00+08:00
---

# ADR-058: OSS-first 标准能力复用与领域所有权边界

**状态：** 已采纳并持续执行
**日期：** 2026-08-25  
**影响范围：** Goal、Task、Schedule、UI foundation、未来所有涉及标准算法/协议/第三方依赖的实施计划  
**关联：** ADR-015、ADR-025、ADR-037、ADR-053~057

## 2026-09-08 实现状态

该 ADR 已成为持续工程政策，而非待实施 ticket。Core vNext 已实际 Borrow/采用 Emittery、rrule、FullCalendar、date/time/UI primitives，并通过 MemoFlow-owned adapter/contract 隔离第三方类型；pg-boss PoC 已完成但当前决定继续使用自有 Scheduler engine。最终依赖决策见 Core vNext reuse ledger。

## 1. 背景

MemoFlow 的 Goal / Task vNext 调研表明，成熟开源项目已经积累了大量值得复用或学习的能力：

- Vikunja：Label、filter、recurrence、system view、API；
- Super Productivity：个人 Task UX、repeat config、virtual Today、plugin/package seam；
- Tasks.org：recurrence、reminder、CalDAV/iCalendar interoperability；
- Loop Habit Tracker：occurrence `unknown / done / missed / skip` 业务语义；
- Taskwarrior / TaskChampion：task state、storage/sync library 抽取方式；
- Leantime：Goal metric 与 execution 分离、plugin architecture；
- Plane：workflow state / label / list-board projection。

这些项目证明两件事：

1. MemoFlow 没有必要重新实现已经标准化、算法复杂但并非产品差异化的底层能力；
2. 成熟 App 的最大价值通常不是“把整套源码塞进 MemoFlow”，而是提供经过多年真实使用验证的业务语义、交互模式、状态机、API contract、测试矩阵和工程边界。

因此需要建立统一的 Build / Borrow / Integrate 决策规则，避免两个极端：

```text
所有东西都自己造
vs
看到成熟开源 App 就整套引入
```

## 2. 决策

MemoFlow 采用：

> **Domain-owned, OSS-first for standard capabilities.**

即：

```text
MemoFlow 自己拥有产品业务语义与 authoritative state
+
标准算法 / 协议优先复用成熟 library
+
完整 OSS App 主要用于学习业务语义和工程化细节
+
只有存在稳定、低耦合 API/plugin seam 时才做系统级集成
```

## 3. MemoFlow 必须自己拥有的部分

凡是决定 MemoFlow 产品行为、跨模块 business truth 或用户心智的规则，都由 MemoFlow contracts/domain 明确定义，不把第三方 DTO / state machine 当作产品真值。

Goal / Task vNext 当前包括：

- Goal = Direction + Measurement；
- Task = Action + Execution；
- KR measurement / progress / completion semantics；
- Task occurrence `Pending / InProgress / Completed / Missed / Skipped`；
- `Overdue` 是派生事实；
- Task Plan lifecycle / outcome；
- GoalLink 与 GoalContribution 解耦；
- `EachCompletion / PlanCompletion` settlement；
- GoalRecord provenance；
- Task -> Goal durable delivery / rollback；
- Shared Label 在 Goal/Task 的 identity-scoped assignment 语义；
- AI review / approval / deterministic mutation boundary。

第三方 library 可以帮助计算，但不能改变这些 contract 的含义。

## 4. 标准能力默认优先 Borrow

若问题属于标准算法、标准协议、基础 UI primitive 或成熟基础设施问题，实施者在自行实现前必须先评估成熟依赖。

优先候选类型：

- RFC 5545 recurrence / RRULE / exception calculation；
- iCalendar / ICS / CalDAV interoperability；
- timezone / date parsing 中已有可靠标准实现的算法；
- schema / parser / serializer；
- virtual list / command palette / accessible popover/dialog/select；
- OpenAPI client generation；
- 通用 diff / validation / retry / backoff 等与 MemoFlow 业务无关的基础能力。

例如 recurrence 的目标边界应是：

```text
MemoFlow RecurrenceRule / TaskPlan policy
              |
              v
      RecurrenceEnginePort
              |
      +-------+--------+
      |                |
current adapter   mature OSS adapter
```

第三方库只位于 infrastructure / policy-engine seam；其对象不得泄漏进 `@memoflow/contracts`。

## 5. 完整 OSS App 默认 Borrow semantics，不 Borrow product state

对于 Vikunja、Super Productivity、Tasks.org、Loop、Leantime、Plane 这类完整应用，默认借鉴：

### 产品语义

- 用户把什么视为一个 Task / Goal / occurrence / plan；
- completed / missed / skipped / cancelled 等概念怎样区分；
- system view 与 label 如何分离；
- recurring plan 如何呈现；
- overdue、history、delete、archive 的用户心智。

### UI / interaction

- information hierarchy；
- progressive disclosure；
- empty/loading/error states；
- keyboard / accessibility；
- narrow/mobile layout；
- filter / picker / inline-create pattern。

### 工程化细节

- domain state machine；
- relation-backed schema；
- read model / projection；
- API / plugin contract；
- recurrence / sync / retry boundary；
- characterization / property / integration test matrix；
- migration / backward compatibility strategy；
- observability / failure behavior。

默认**不**直接借入：

- 对方完整 database schema；
- auth/account model；
- app-level router/store；
- Angular/Compose/Vue 整页 UI；
- 第二套 Task source of truth；
- copyleft domain implementation。

## 6. Integrate 的条件

只有同时满足以下条件，才考虑把完整 OSS 产品作为外部 service/plugin host 组合进 MemoFlow：

1. 提供稳定、文档化的 API/plugin seam；
2. 该系统可以被明确指定为某一能力的 source of truth；
3. 不会引入与 MemoFlow PowerSync/Prisma/identity/AI workflow 冲突的第二套 authoritative state；
4. integration adapter 的复杂度显著低于本地实现和长期维护成本；
5. offline / desktop / cloud 边界有明确方案；
6. license 义务可接受；
7. failure / retry / upgrade / data export 有可测试契约。

只因为“功能很多”不能成为引入完整 App 的理由。

## 7. 第三方依赖 Gate

任何进入 Goal / Task 关键路径的新依赖至少记录：

```text
problem being borrowed
maintainer / upstream activity
license
API / semver stability
runtime / framework coupling
bundle / binary / deployment impact
security history / update path
adapter boundary
fallback / removal cost
MemoFlow-owned contract tests
```

优先：

```text
permissive license
+ small focused API
+ active maintenance
+ deterministic behavior
+ no product-state ownership
```

避免：

```text
abandoned critical dependency
framework-coupled app module
opaque global singleton
第二套时间/状态/store 真值
难以替换的 vendor DTO 泄漏
```

## 8. License policy

- GPL / AGPL 应用源码默认只做行为、架构、测试与交互参考；不复制进 MemoFlow；
- 通过独立 network API / plugin 的使用方式仍需按具体部署/分发模式审查许可证义务；
- MIT / BSD / Apache / MPL 等也必须逐依赖确认实际文件/包 license；
- 直接复用源码时保留要求的 copyright / NOTICE；
- 不因为仓库根 LICENSE permissive 就假设所有子目录/文件许可相同。

本 ADR 是工程策略，不替代正式法律意见。

## 9. Goal / Task vNext 的立即应用

### 9.1 Recurrence

Phase 0 必须先完成：

```text
current recurrence engine
vs
RFC5545-capable library adapter
vs
focused recurrence library
```

以 MemoFlow fixture 比较 correctness、DST/timezone、finite occurrences、exception、维护成本。成熟库明显更优则复用，不为了保护旧代码而坚持自研。

### 9.2 Shared Labels

Label registry / GoalLabel / TaskLabel 是 MemoFlow business truth，继续自己拥有；借鉴 Vikunja 的 relation model、picker、batch projection 和 filter tests，不为了 Label 引入整个 Vikunja service。

### 9.3 Task occurrence / plan outcome

业务语义借鉴 Loop/Vikunja/Taskwarrior/Tasks.org，但状态机由 ADR-057 定义并由 MemoFlow 自己实现。

### 9.4 UI

继续以 Reka UI / shadcn-vue 这类 headless primitive 为基础，借鉴成熟 App 的页面层次与 interaction pattern；不复制整页 app UI。

### 9.5 Super Productivity

允许对其 MIT `packages/*` 做源码级 reuse spike，但只有 framework-independent、边界小、明显降低维护成本的 package/utility 才进入依赖；Angular/product-state 强耦合部分只做设计参考。

## 10. 实施工作流

每个相关 ticket 在 production code 前先回答：

```text
A. Domain-owned?
   -> 写 MemoFlow contract / tests，再实现。

B. Standard capability?
   -> 先搜索/评估 mature library；默认 Borrow。

C. Mature app has useful semantics/engineering pattern?
   -> 记录参考行为、state machine、tests、UI pattern；clean implementation。

D. Stable API/plugin seam and external source-of-truth is desirable?
   -> 做 bounded integration PoC，再决定 Integrate。
```

没有完成该 gate 的标准能力 ticket，不进入正式实现。

## 11. Consequences

正面：

- 减少标准算法重复实现和边界 bug；
- MemoFlow 把工程精力集中在自己的业务差异化；
- 借多年成熟产品的语义和测试经验，而不是只模仿视觉；
- 第三方能力被 adapter 隔离，未来可替换；
- 避免把多个完整 App 粘成多套真值系统。

代价：

- Phase 0 需要投入依赖调研/PoC；
- 引入库后需要升级、license、安全维护；
- 某些成熟库的数据模型需要 adapter translation；
- 不能用“自己写最快”跳过长期维护成本分析。

## 12. 验收标准

- Goal / Task vNext Active Plan 包含 Build / Borrow / Integrate Gate；
- recurrence 在重写前完成 library spike；
- 所有新关键第三方依赖都有维护状态、license、adapter、contract-test 记录；
- Goal/Task business contracts 不依赖第三方 DTO；
- OSS 调研不只记录 UI 截图，还记录状态机、schema/API、test/failure engineering details；
- 无第二套 Task/Goal authoritative store 被无意引入。
