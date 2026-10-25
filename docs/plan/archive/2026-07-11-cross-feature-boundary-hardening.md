---
tags:
  - plan
  - archive
  - architecture
  - module-boundaries
  - governance
description: Cross-feature scope 约束已落地（ADR-033 M3）；schedule contracts 下沉另开专项
created: 2026-07-11T00:00:00+08:00
updated: 2026-07-18T07:00:00+00:00
---

> **归档说明（2026-07-18）**：阶段二/三与治理验收已完成（`scope:*` depConstraints + `scope-constraint-audit` + `memoflow:governance-check` 绿）。schedule shared-kernel 以显式白名单过渡（决策 (b)）收口；完整下沉 contracts（决策 (a)）不阻塞本计划归档，另开专项。

# Cross-Feature Boundary Hardening

## 背景

来自 2026-07-10 架构审查的 **M3**（见 [`2026-07-10-event-bus-and-governance-hardening.md`](./2026-07-10-event-bus-and-governance-hardening.md) 步骤 10）。原计划对 M3 只要求「出结论、改动另立计划」，本文件即那份被拆出的计划。

跨模块通信范式以 [ADR-033](../../architecture/adr/ADR-033-cross-module-communication-patterns.md) 为准：feature 之间默认**只能依赖 `contracts` / `utils`**，联动走**事件**（范式 A）或**宿主注入的 Port**（范式 B），而不是直接包依赖。本计划把这条原则从「个案硬编码」升级为「系统化默认拒绝」。

## 问题（诊断结论，已核对代码）

1. **layer 矩阵不区分 feature。** 所有 feature 包同为 `layer:domain`，`@nx/enforce-module-boundaries` 的 `depConstraints` 只按 `layer:*` 约束（`eslint.config.ts` 的 `moduleBoundaryDepConstraints`）。`layer:domain → layer:domain` 被允许，于是**任意 feature 可以 import 任意 feature**，矩阵层面零隔离。
2. **唯一防火墙是硬编码个案。** `eslint.config.ts` 里两条 `no-restricted-imports` 手写死了 `goal ✗↔ task`（`packages/goal/**` 禁 import `@memoflow/task`，反之亦然）。这是唯一的跨 feature 拦截，且只覆盖这一对。
3. **audit 有盲区。** `public-surface-audit.mjs` 只拦「import 别包**内部层子路径**」（deep import），**不拦「import 别包公开 API」**。所以 `reminder` 直接 `import ... from '@memoflow/goal'`（走公开面）不会被任何检查拦下。
4. **`scope:*` tag 已存在但未参与任何约束。** 每个 feature 已有唯一 scope tag（核实：20 个 feature 各一个 `scope:<feature>`），但 `depConstraints` 里没有任何 `scope:*` 条目，tag 处于「声明了但没用」状态。

## 现存跨 feature 依赖快照（2026-07-11，生产 src，排除 contracts/utils）

系统化约束前必须先摸清现状，否则会大面积误伤。当前真实的跨 feature 边只有以下几类：

| 源                     | 目标                                                      | 导入内容                                                 | 判定                                                                      |
| ---------------------- | --------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| goal / task / reminder | `@memoflow/schedule`、`@memoflow/schedule/domain-shared`  | `ScheduleTask`、`ScheduleConfig`、`ScheduleTaskMetadata` | schedule 调度 shared-kernel，需决策：提为 contracts/shared 还是显式白名单 |
| editor                 | `@memoflow/repository/api`                                | `createRepositoryPrismaModule`（Port 组装）              | 合法：走 `/api` 公开面，ADR-033 范式 B                                    |
| data-portability       | `@memoflow/{goal,task,reminder,notification,setting}/api` | `create*PrismaRepositories`（导入/导出聚合壳）           | 合法：data-portability 本就是跨模块聚合宿主，走 `/api`                    |

> 注：`ai → governance` 只是 `ai.module.ts` 的一条 `@see` docstring 引用，不是真实 import，不计入。

关键观察：**没有任何 feature 走 deep-import 违规跨界**；现存跨界要么是 schedule shared-kernel，要么是走 `/api` 公开面的合法 Port/聚合。这说明系统化约束的迁移成本可控。

## 决策：走路径 A（scope 级 depConstraint，默认拒绝）

评估过两条路径：

- **路径 A — Nx `scope:*` depConstraint**：在 `moduleBoundaryDepConstraints` 为每个 `scope:<feature>` 加一条 `onlyDependOnLibsWithTags`，把「默认允许」翻转为「默认拒绝，跨界必须显式声明」。
- **路径 B — 扩 `public-surface-audit`**：给 audit 加一档拦「feature 间任何 import，除非 allowlist」。

**选路径 A**，理由：

1. 复用 Nx graph 的**精确**依赖分析，优于 audit 的正则/AST 近似。
2. 与现有 `layer:*` 约束同机制、同配置块，不引入第二套边界规则（避免路径 B 的「两套规则漂移」）。
3. 「默认拒绝 + 显式白名单」正是 ADR-033 依赖显式化的精神，硬编码的 goal↔task 个案随之自然消失。

路径 B 仅作为补充选项保留（若将来要拦「公开 API 之外的深层符号」可再评估），本计划不采用。

## 实施步骤

### 阶段一：现状固化与 shared-kernel 决策

1. 用 `pnpm nx graph --file=graph.json` 导出完整依赖图，脚本提取所有 `scope:A → scope:B (A≠B)` 边，作为**权威现状清单**（不靠 grep 拍脑袋）。
2. 对 `goal/task/reminder → schedule` 这条 shared-kernel 边做决策（三选一，另开小讨论）：
   - (a) 把 `ScheduleTask` / `ScheduleConfig` / `ScheduleTaskMetadata` 的**契约形态**下沉到 `@memoflow/contracts/schedule`，feature 只依赖 contracts；或
   - (b) 承认 schedule 是被共享的调度内核，给它单独的 `scope:schedule-kernel` 语义并进白名单；或
   - (c) 经 `schedule-orchestration`（已是 `scope:shared`）中转，feature 不直连 schedule。
   - 倾向 (a)：最符合「feature 间只依赖 contracts」，但工作量取决于 `ScheduleTask` 是否为纯数据。

### 阶段二：scope 约束落地

3. 在 `eslint.config.ts` 的 `moduleBoundaryDepConstraints` 为每个 `scope:<feature>` 追加条目，白名单只含：`scope:shared`（contracts/utils/patterns 等基础层）+ 阶段一确认的合法跨界目标。模板：
   ```ts
   { sourceTag: 'scope:goal', onlyDependOnLibsWithTags: ['scope:shared', 'scope:goal'] }
   ```
   （`data-portability` 的白名单显式列出它聚合的 5 个 feature；`editor` 列出 `scope:repository`。）
4. 删除 `eslint.config.ts:170-190` 硬编码的 goal↔task `no-restricted-imports`——scope 约束已覆盖（goal 白名单不含 `scope:task`）。
5. 跑 `pnpm nx run-many -t lint` 全绿；任何新暴露的违规按 ADR-033 用 Port / 事件 / contracts 下沉修掉，不加白名单豁免。

### 阶段三：治理接入（防回归）

6. 评估把 scope 约束的存在性纳入 `governance-check`：新增 feature 包若没有对应 `scope:*` depConstraint 条目则 fail（防止「加了新 feature 但忘了给它上约束」的漏网）。可复用 PR-3 建立的 `governance-tools` 测试骨架。

## 完成标准

- [x] `moduleBoundaryDepConstraints` 覆盖全部 `scope:<feature>`，默认拒绝跨 feature 依赖。
- [x] 硬编码 goal↔task `no-restricted-imports` 删除，由 scope 约束等价覆盖。
- [x] `goal/task/reminder → schedule` 的 shared-kernel 边按阶段一决策收敛：**显式白名单**过渡（决策 (b)）作为本计划完成态；完整下沉 contracts（决策 (a)）另开专项。
- [x] 相关 feature lint + `memoflow:governance-check` 已绿（2026-07-18 复验 governance-check 绿）。全仓 `run-many -t typecheck` 非本计划阻塞项。
- [x] 新增 feature 缺失 scope 约束能被治理拦截（阶段三 scope-constraint-audit）。

## 非目标 / 后续

- 不改 `layer:*` 现有语义，只叠加 `scope:*` 维度。
- 阶段一的 schedule shared-kernel 决策若牵扯 `ScheduleTask` 大幅重构（3+ 包），停下来单独立计划，不在本计划内硬做。
- 路径 B（audit 拦公开 API 外的深层符号）暂不做，留作将来需要更细粒度时的选项。

## 关联

- [ADR-033: Cross-Module Communication Patterns](../../architecture/adr/ADR-033-cross-module-communication-patterns.md)
- [2026-07-10 Event Bus & Governance Hardening](./2026-07-10-event-bus-and-governance-hardening.md)（M3 来源）

## 实施进度

| 日期       | 进度                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-18 | **阶段二起步**：`eslint.config.ts` 增加 feature `scope:*` depConstraints；删除 goal↔task 硬编码 `no-restricted-imports`；schedule 暂作白名单 |

| 2026-07-18 | **阶段二完成**：feature/app `scope:*` depConstraints 覆盖；goal↔task 硬编码删除；schedule shared-kernel 暂显式白名单（决策 (b) 过渡） |
| 2026-07-18 | **阶段三完成**：`tools/governance/scope-constraint-audit.mjs` 纳入 `memoflow:governance-check`；缺失 sourceTag 即 fail；governance-tools 单测 5 绿 |
| 2026-07-18 | **验收**：feature lint（goal/task/reminder/editor/data-portability/account）+ authentication lint 绿；`memoflow:governance-check` 绿 |

| 2026-07-18 | **归档**：本计划目标（系统化 scope 默认拒绝 + 治理防回归）已达成；schedule contracts 下沉不在本计划范围 |
