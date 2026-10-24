---
tags:
  - plan
  - archive
  - audit
  - code-quality
  - consistency
description: 基于 2026-07-07 代码质量与一致性审查结果的分阶段修复计划
created: 2026-07-07T00:00:00+00:00
updated: 2026-07-07T16:55:00+00:00
---

# Code Quality & Consistency Repair Plan

## 目标

把 `docs/audit/code-quality-consistency-audit.md` 中记录的 2026-07-07 审查结果转化为可执行、可验证、可分批推进的修复计划。

本计划最初只定义后续修复路线；截至 2026-07-07，本文件中的 7 个 repair pass 均已执行完成并通过 targeted verification。每个修复 pass 必须满足：

- 一次只处理一个明确问题 ID。
- 先补能暴露问题的失败测试，除非该问题明确不适合测试。
- 修复范围不得扩大到无关模块。
- 不保留临时 shim、双轨实现或未接入死代码。
- 每个 pass 必须有 targeted verification 命令。
- 修复完成后回写审计报告中对应问题状态。

## 背景

审查报告位置：

- `docs/audit/code-quality-consistency-audit.md`

当前审查结论：

- Blocker：0
- High：2
- Medium：3
- Low：2

总体判断：当前仓库已经明显迁移到 server-first 结构，但 lifecycle contract、测试 alias 配置、治理脚本和文档标准没有完全同步。优先级最高的风险集中在 `schedule` runtime 启动语义和 `schedule-orchestration` 测试目标不可运行。

## 当前验证基线

| 命令                                                 | 当前结果 | 说明                                                                           |
| ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `pnpm nx run schedule:test --skipSync`               | 通过     | `schedule` 包测试可运行，21 files / 259 tests                                  |
| `pnpm nx run schedule-orchestration:test --skipSync` | 通过     | 4 files / 6 tests，跨包 alias 问题已修复                                       |
| `pnpm nx run api:test:smoke --skipSync`              | 通过     | 2 files / 58 tests，route auth 语义收敛后 smoke 通过                           |
| `pnpm nx run repository:test --skipSync`             | 通过     | 12 files / 58 tests，包含 storage config helper 测试                           |
| `pnpm nx run editor:test --skipSync`                 | 通过     | 19 files / 103 tests，覆盖 editor 相关调整                                     |
| `pnpm nx run api:typecheck --skipSync`               | 通过     | 包含 24 个依赖任务；同时暴露并确认修复 `data-portability` server seam 构建破口 |
| `pnpm nx run memoflow:governance-check --skipSync`   | 通过     | server feature shape 与治理脚本已对齐                                          |
| `pnpm nx run memoflow:docs-check --skipSync`         | 通过     | 测试文档 coverage 路径更新后通过                                               |

## 风险排序

| 优先级 | 问题 ID | 严重级别 | 核心风险                                                          | 推荐先后  |
| ------ | ------- | -------- | ----------------------------------------------------------------- | --------- |
| P0     | Q-001   | High     | `schedule` runtime 启动 Promise 被 `void` 丢弃，失败不可观察      | 第 1 个修 |
| P0     | Q-002   | High     | `schedule-orchestration` 核心测试目标不可运行                     | 第 2 个修 |
| P1     | Q-004   | Medium   | route auth 同时存在 `[auth]` 和 `{ requireAuth: false }` 两套真值 | 第 3 个修 |
| P1     | Q-003   | Medium   | ADR、治理脚本和实际 server feature 入口不一致                     | 第 4 个修 |
| P2     | Q-005   | Medium   | repository storage path 默认值和 env 配置重复维护                 | 第 5 个修 |
| P3     | Q-006   | Low      | 测试文档 coverage 路径仍是 legacy 结构                            | 第 6 个修 |
| P3     | Q-007   | Low      | Electron schedule seam 为拿 repository 临时构建完整 module        | 第 7 个修 |

## 修复边界

### 必须保持

- 不把多个问题合并到一个大重构中。
- 不修改未被当前 pass 涉及的业务语义。
- 不为了绕过测试失败而跳过测试、mock 掉核心路径或扩大 allowlist。
- 不把审计中标为 Medium/Low 的结构问题混入 High 问题修复。

### 可以调整

- 为了让失败测试准确表达问题，可以新增或修改对应模块的 targeted tests。
- 为了修复 lifecycle contract，可以同步更新直接调用该 contract 的 API/Electron seam。
- 为了修复 test target，可以调整 Vitest config 或共享 resolver，但不得改变业务实现。
- 为了修复治理标准，可以更新 ADR 或治理脚本，但必须先明确 canonical 标准。

## Repair Pass 01：Q-001 Schedule Runtime 启动语义

### 问题摘要

`packages/schedule/src/server/infrastructure/runtime/schedule.runtime.ts:createScheduleRuntimeContribution.start` 是同步 `start(): void`，内部使用 `void queue.start()` 后立即设置 `started = true`。但 `ScheduleTaskQueue.start()` 是 `Promise<void>`，并会等待 `loadActiveTasks()`。当 loader 失败时，上层 API/Electron 启动链路无法捕获失败，日志仍可能显示 runtime 已启动。

关键证据：

- `packages/schedule/src/server/infrastructure/runtime/schedule.runtime.ts:285-305`
- `packages/schedule/src/server/application/scheduler/schedule-task-queue.ts:164-183`
- `packages/schedule/src/server/application/scheduler/schedule-task-queue.ts:368-388`
- `packages/schedule/src/api/module.ts:54-69`
- `packages/schedule/src/electron/index.ts:81-88`

### 修复目标

让 schedule runtime 启动状态和队列真实状态一致。外层启动方必须能观察到 queue loader 的成功或失败。

### 推荐步骤

1. 在 `packages/schedule/src/server/infrastructure/runtime/schedule.runtime.spec.ts` 先补失败测试：
   - 构造 `taskLoader.loadActiveTasks()` reject 的 queue mock。
   - 调用 `runtime.start()`。
   - 断言外层 `start()` 能 reject，或能进入明确 degraded state。
   - 断言失败前不应把 runtime 标记成稳定 started 状态。
2. 调整 runtime contribution contract：
   - 优先方案：`start(): Promise<void>`。
   - 备选方案：保留 `start(): void`，但暴露 `ready: Promise<void>` 或 `getStatus()`；只有产品明确需要后台降级启动时使用。
3. 更新 module lifecycle：
   - `createSchedulePrismaModule` / `createSchedulePowerSyncModule` 的 `start` 必须承接 runtime contribution 的异步 contract。
   - API `register()` 中不要继续同步丢弃启动结果。
   - Electron `startScheduleRuntime()` 不应在 queue 还未 ready 时设置 `runtimeStarted = true`。
4. 明确错误处理策略：
   - 如果启动失败应阻断模块启动，则向上传递错误。
   - 如果启动失败允许降级，则必须记录 structured log，并暴露 degraded status。
5. 更新调用方测试。
6. 回写 `docs/audit/code-quality-consistency-audit.md` 中 Q-001 状态。

### 禁止做法

- 不允许继续使用 `void queue.start()`。
- 不允许只在测试里 await 内部 mock 的 `startPromise`，但生产代码仍无法观察失败。
- 不允许吞掉 loader 错误后只打印日志。

### 验证命令

```bash
pnpm nx run schedule:test --skipSync
```

必要时追加：

```bash
pnpm nx run api:test:smoke
pnpm nx run desktop:test:main
```

### 完成标准

- `runtime.start()` 或等价 ready contract 能表达启动完成/失败。
- loader reject 有测试覆盖。
- API/Electron 启动路径不再在 queue 未 ready 时宣告 started。
- `pnpm nx run schedule:test --skipSync` 通过。

## Repair Pass 02：Q-002 Schedule Orchestration Test Alias

### 问题摘要

`schedule-orchestration:test` 当前在 import 阶段失败，4 个 suite 都没有执行到测试本体。失败原因是 `schedule-orchestration` 测试导入了 `packages/schedule` 内部实现，而该实现使用 `@/server/...` 包内 alias；当前 `schedule-orchestration` Vitest config 只把 `@` 解析到自身 `src`，无法按 importer package 解析。

关键证据：

- `packages/schedule-orchestration/vitest.config.ts:5-17`
- `vitest.shared.ts:329-334`
- `vitest.workspace-helpers.ts:3-49`
- `vitest.workspace-helpers.ts:236-248`
- `packages/schedule/src/server/infrastructure/adapters/prisma/schedule-prisma.repository.ts:9-11`

### 修复目标

恢复 `schedule-orchestration:test`，确保 4 个 suite 能真实执行，而不是在导入阶段失败。

### 推荐步骤

1. 复现当前失败：

   ```bash
   pnpm nx run schedule-orchestration:test --skipSync
   ```

2. 检查当前测试导入链，确认是否必须导入 `packages/schedule` 深层实现。
3. 优先接入 importer-aware alias resolver：
   - 使用或复用 `vitest.workspace-helpers.ts` 中的 `domainResolveAtAlias`。
   - 确保 `@/` 对 `packages/schedule` 内部文件解析到 `packages/schedule/src`。
   - 同时保持 `schedule-orchestration` 自身的 `@/` 行为。
4. 如果 resolver 方式会扩大影响范围，则只在 `packages/schedule-orchestration/vitest.config.ts` 局部启用。
5. 不修改业务代码来绕过测试配置问题。
6. 运行测试并确认不再出现 `0 test` failed suites。
7. 回写审计报告中 Q-002 状态。

### 禁止做法

- 不允许把失败 suite skip 掉。
- 不允许把 test include 缩小到避开失败文件。
- 不允许用 mock 替换整个 `schedule` package 来掩盖 alias 配置问题。

### 验证命令

```bash
pnpm nx run schedule-orchestration:test --skipSync
```

必要时追加：

```bash
pnpm nx run schedule:test --skipSync
pnpm nx run memoflow:governance-check
```

### 完成标准

- `schedule-orchestration:test` 能执行现有 suite。
- 不再出现 `Cannot find package '@/server/domain/aggregates/calendar-entry'`。
- 不通过 skip、allowlist 或业务 mock 绕过失败。

## Repair Pass 03：Q-004 Route Auth 语义统一

### 问题摘要

多个 route 同时传入 `[auth]` middleware 和 `{ requireAuth: false }` adapter option。实际执行顺序是 middleware 先运行，因此这些 route 仍需要 token，但代码中的 adapter option 表达了 public 语义。

关键证据：

- `packages/task/src/api/routes/task-template.routes.ts:179-181`
- `packages/task/src/api/routes/task-template.routes.ts:320-326`
- `packages/task/src/api/routes/task-dependency.routes.ts:86-142`
- `packages/goal/src/api/routes/goal.routes.ts:183-185`
- `packages/setting/src/api/routes.ts:150-152`
- `packages/utils/src/result/route-registrar.ts:175-177`
- `packages/utils/src/result/express-adapter.ts:139-153`
- `apps/api/src/shared/infrastructure/http/middlewares/auth-middleware.ts:78-90`
- `apps/api/src/__tests__/smoke/task/task-template.smoke.test.ts:195-196`

### 修复目标

让每条 route 的认证要求只有一个真值源，避免 `[auth]` 和 `{ requireAuth: false }` 表达相反语义。

### 推荐步骤

1. 按 route 分类：
   - 必须认证的 route。
   - 真正 public 的 route。
   - optional-auth 的 route。
2. 先补 contract 测试：
   - 无 token 时应 401 的 route。
   - public route 无 token 应正常返回的 route。
   - optional-auth route 的匿名和登录态行为。
3. 对必须认证的 route：
   - 保留 `[auth]`。
   - 删除 `{ requireAuth: false }`。
4. 对真正 public 的 route：
   - 移除 `[auth]`。
   - 保留或显式设置 `{ requireAuth: false }`。
5. 对 optional-auth route：
   - 不复用强制 auth middleware。
   - 引入或复用 optional-auth middleware。
6. 更新 smoke test 中说明性注释，避免继续记录冲突语义。
7. 回写审计报告中 Q-004 状态。

### 禁止做法

- 不允许只改注释不改冲突配置。
- 不允许只删 middleware 或只删 option，而不先明确 route 的产品语义。
- 不允许改变未覆盖 route 的认证行为。

### 验证命令

```bash
pnpm nx run api:test:smoke
```

按实际影响追加：

```bash
pnpm nx run task:test
pnpm nx run goal:test
pnpm nx run setting:test
```

### 完成标准

- 同一 route 不再同时表达强制认证和 public。
- public/private/optional-auth 行为有测试保护。
- API smoke test 中不再依赖“代码配置冲突但实际仍认证”的注释。

## Repair Pass 04：Q-003 Server Feature Shape 标准收敛

### 问题摘要

ADR-031 把 `src/server/index.ts` 定义为 canonical server feature shape 的一部分，但当前仓库没有任何 `packages/*/src/server/index.ts`。治理脚本只检查目录，不检查该入口文件。实际 root barrel 直接导出 `./server/infrastructure`。此外，`schedule-orchestration` 仍通过 `./infrastructure-server` 暴露入口，但不在 audited feature package 列表中。

关键证据：

- `docs/architecture/adr/ADR-031-server-feature-standard-shape.md:16-52`
- `tools/governance/server-feature-shape-audit.mjs:24-25`
- `tools/governance/server-feature-shape-audit.mjs:74-96`
- `packages/task/src/index.ts:14-29`
- `packages/schedule-orchestration/src/index.ts:8`
- `packages/schedule-orchestration/project.json:1-7`

### 修复目标

让 ADR、治理脚本和实际 package 入口形成单一标准。

### 决策点

必须先做一次小决策，再动代码：

| 选项 | 含义                                                           | 影响                                                   |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------ |
| A    | `src/server/index.ts` 仍是 canonical 标准                      | 需要补齐 audited packages 的入口文件，并让治理脚本检查 |
| B    | root barrel 直出 `./server/infrastructure` 才是当前标准        | 需要修正 ADR，删除对 `server/index.ts` 的要求          |
| C    | feature packages 和 shared orchestration packages 使用不同标准 | 需要在 ADR 或 governance docs 中显式记录例外           |

推荐优先选 A，除非当前导出策略已经被构建或发布流程强依赖。

### 推荐步骤

1. 先确认 canonical 入口决策。
2. 如果选择 A：
   - 在治理脚本中检查 `src/server/index.ts`。
   - 为 audited feature packages 增加 `src/server/index.ts`。
   - root barrel 改为从 `./server` 或明确 canonical seam 导出。
   - 决定 `schedule-orchestration` 是否迁移到 server-first 或保留例外。
3. 如果选择 B：
   - 更新 ADR-031，移除 `server/index.ts` 要求。
   - 明确 root barrel 直出 `server/infrastructure` 的理由和边界。
   - 治理脚本不新增该文件检查。
4. 如果选择 C：
   - 在 ADR 中说明 feature package 和 shared domain package 的结构差异。
   - 给 `schedule-orchestration` 增加治理例外说明或专属检查。
5. 运行治理检查。
6. 回写审计报告中 Q-003 状态。

### 禁止做法

- 不允许一边保留 ADR 要求，一边让治理继续不检查。
- 不允许只补 `server/index.ts` 空文件但不接入导出链。
- 不允许把 `schedule-orchestration` 的例外继续隐式保留。

### 验证命令

```bash
pnpm nx run memoflow:governance-check
```

必要时追加：

```bash
pnpm nx run memoflow:docs-check
```

### 完成标准

- ADR、治理脚本和实际目录入口一致。
- 新 feature package 按文档实现时能通过治理。
- `schedule-orchestration` 的结构归属被明确处理。

## Repair Pass 05：Q-005 Repository Storage Path 配置集中

### 问题摘要

`REPOSITORY_STORAGE_PATH || '/tmp/memoflow-repository-storage'` 在多个模块重复维护，且未纳入 API env schema、`.env.example` 或 docs。当前重复点包括 API AI adapters、repository module、editor module、repository prisma adapter。

关键证据：

- `apps/api/src/main.ts:68-85`
- `packages/repository/src/api/module.ts:68-75`
- `packages/editor/src/api/module.ts:73-78`
- `packages/repository/src/server/infrastructure/prisma.ts:22-25`
- `apps/api/src/shared/infrastructure/config/env.schema.ts`
- `.env.example`

### 修复目标

建立 repository storage path 单一解析入口，避免不同模块使用不同默认值或遗漏 env 校验。

### 推荐步骤

1. 先补 config/helper 测试：
   - 未设置 env 时返回 canonical default。
   - 设置 env 时返回指定路径。
   - 空字符串或非法值按约定处理。
2. 建立单一解析入口：
   - 优先放在 repository package 暴露的 config helper。
   - 或放在 API bootstrap 级别，然后注入所有相关 modules/adapters。
3. 替换重复默认值：
   - `apps/api/src/main.ts`
   - `packages/repository/src/api/module.ts`
   - `packages/editor/src/api/module.ts`
   - `packages/repository/src/server/infrastructure/prisma.ts`
4. 更新配置入口：
   - API env schema。
   - `.env.example`。
   - 相关部署或开发文档。
5. 确认 AI knowledge、repository、editor 共用同一 storage root。
6. 回写审计报告中 Q-005 状态。

### 禁止做法

- 不允许继续在多个文件硬编码相同 default。
- 不允许只更新 `.env.example`，但代码仍重复解析。
- 不允许引入新依赖来做简单 env path 解析。

### 验证命令

```bash
pnpm nx run api:typecheck
pnpm nx run repository:test
```

按实际影响追加：

```bash
pnpm nx run editor:test
pnpm nx run memoflow:docs-check
```

### 完成标准

- `REPOSITORY_STORAGE_PATH` 只有一个 canonical 解析入口。
- env schema、example、docs 与实现一致。
- repository/editor/AI adapters 使用同一 resolved storage base dir。

## Repair Pass 06：Q-006 测试文档 Coverage 路径更新

### 问题摘要

`docs/test/running-tests.md` 仍描述 coverage 默认检查 legacy `src/domain-server/**` 路径，但 `vitest.shared.ts` 当前 governed roots 已迁移为 `src/server/domain/**`。

关键证据：

- `docs/test/running-tests.md:19`
- `vitest.shared.ts:74-79`

### 修复目标

让测试文档与当前 Vitest coverage roots 一致。

### 推荐步骤

1. 更新 `docs/test/running-tests.md` 中的 coverage 路径说明。
2. 明确 `vitest.shared.ts` 是 coverage roots 的实现真值源。
3. 不修改测试配置，除非发现文档更新暴露出新的配置错误。
4. 回写审计报告中 Q-006 状态。

### 验证命令

```bash
pnpm nx run memoflow:docs-check
```

### 完成标准

- 文档不再提 legacy `src/domain-server/**` 作为当前默认 coverage root。
- docs check 通过。

## Repair Pass 07：Q-007 Electron Schedule Module 双组装

### 问题摘要

`packages/schedule/src/electron/index.ts` 为了拿到 `scheduleTaskRepository`，先创建 `seedModule = createSchedulePowerSyncModule(ctx.db)`，随后又创建实际 `scheduleModule`。当前未确认有资源泄漏，但该写法让 module factory 同时承担 repository factory 职责，后续如果 factory 增加副作用，会扩大风险。

关键证据：

- `packages/schedule/src/electron/index.ts:107-113`
- `packages/schedule/src/server/infrastructure/powersync.ts:35-39`

### 修复目标

Electron schedule seam 只组装一次真实 module，或者使用明确的 repository factory 获取 `scheduleTaskRepository`。

### 推荐步骤

1. 先补 seam 测试：
   - 断言 Electron 初始化不会构建两个完整 schedule module。
   - 断言 runtime contribution 使用的 repository 来自最终 active module 或明确 factory。
2. 选择实现方式：
   - 增加 `createScheduleTaskPowerSyncRepository(db)`。
   - 或调整 `createSchedulePowerSyncModule` 返回结构，使 repository 可在一次组装中被复用。
3. 移除 `seedModule` 临时组装。
4. 确认 runtime start/stop 行为不变。
5. 回写审计报告中 Q-007 状态。

### 禁止做法

- 不允许只重命名 `seedModule` 但继续构建两次 module。
- 不允许暴露不必要的基础设施细节到 public API。
- 不允许混入 Q-001 的 lifecycle contract 修复，除非 Q-001 已完成并被依赖。

### 验证命令

```bash
pnpm nx run schedule:test --skipSync
```

必要时追加：

```bash
pnpm nx run desktop:test:main
```

### 完成标准

- Electron schedule seam 不再通过临时完整 module 获取 repository。
- seam 测试覆盖 module/repository 组装次数或来源。
- `schedule:test` 通过。

## 推荐执行顺序

1. `Q-001`：先修 runtime lifecycle，因为它影响真实运行状态。
2. `Q-002`：恢复 `schedule-orchestration` 测试，让后续跨 feature 调度改动有保护。
3. `Q-004`：统一 route auth 语义，消除安全边界歧义。
4. `Q-003`：收敛 server feature shape 标准和治理。
5. `Q-005`：集中 repository storage config。
6. `Q-006`：更新测试文档路径。
7. `Q-007`：清理 Electron schedule seam 双组装。

## 每个 Repair Pass 的回写要求

完成每个问题后，必须更新：

- `docs/audit/code-quality-consistency-audit.md`
- 本计划中对应 pass 的状态或备注

建议使用如下状态：

| 状态        | 含义                                |
| ----------- | ----------------------------------- |
| Pending     | 尚未开始                            |
| In Progress | 正在修复                            |
| Fixed       | 已修复且 targeted verification 通过 |
| Blocked     | 需要外部决策或依赖其他 pass         |
| Superseded  | 被后续架构决策替代                  |

当前状态：

| 问题 ID | 状态  |
| ------- | ----- |
| Q-001   | Fixed |
| Q-002   | Fixed |
| Q-003   | Fixed |
| Q-004   | Fixed |
| Q-005   | Fixed |
| Q-006   | Fixed |
| Q-007   | Fixed |

完成证据：

| 问题 ID | 完成内容                                                                                               | Targeted verification                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Q-001   | `schedule` runtime/module/API/Electron 启动语义改为可等待，启动失败可传播并可重试                      | `pnpm nx run schedule:test --skipSync`                                                                                 |
| Q-002   | `schedule-orchestration` 测试 alias 恢复，4 个 suite 能真实执行                                        | `pnpm nx run schedule-orchestration:test --skipSync`                                                                   |
| Q-003   | server feature canonical seam 与治理检查对齐；`data-portability` 无 domain 层的 seam 构建破口已修正    | `pnpm nx run memoflow:governance-check --skipSync`、`pnpm nx run api:typecheck --skipSync`                             |
| Q-004   | 删除 route 中与 `[auth]` 冲突的 `requireAuth: false`，清理过时 smoke 注释                              | `pnpm nx run api:test:smoke --skipSync`                                                                                |
| Q-005   | 新增 repository storage resolver，API/repository/editor 共用单一解析入口，env schema 与 example 已补齐 | `pnpm nx run repository:test --skipSync`、`pnpm nx run editor:test --skipSync`、`pnpm nx run api:typecheck --skipSync` |
| Q-006   | `docs/test/running-tests.md` coverage 路径改为当前 `src/server/domain/**` roots                        | `pnpm nx run memoflow:docs-check --skipSync`                                                                           |
| Q-007   | Electron schedule seam 改用明确 PowerSync repository factory，不再构建临时完整 module                  | `pnpm nx run schedule:test --skipSync`                                                                                 |

## 后续提示词

### Schedule lifecycle regression review

```text
请针对 schedule runtime lifecycle 做一次 focused regression review。只检查 start/dispose、listener 注册回滚、重复 start、启动失败重试和 Electron/API bootstrap await 语义，不做业务功能重构。发现问题时先补失败测试，再运行 pnpm nx run schedule:test --skipSync。
```

### Server feature shape regression review

```text
请检查新增或迁移中的 feature package 是否符合 ADR-031 和 tools/governance/server-feature-shape-audit.mjs。重点检查 src/server/index.ts、root barrel、无 domain 层包的显式例外，以及 schedule-orchestration 的例外说明。完成后运行 pnpm nx run memoflow:governance-check --skipSync 和 pnpm nx run api:typecheck --skipSync。
```

### Repository storage config regression review

```text
请检查 API、repository、editor 和 AI adapters 是否仍统一使用 resolveRepositoryStorageBaseDir()。如果发现新的硬编码 REPOSITORY_STORAGE_PATH 默认值，先补 resolver 测试，再做 focused cleanup。完成后运行 pnpm nx run repository:test --skipSync、pnpm nx run editor:test --skipSync 和 pnpm nx run api:typecheck --skipSync。
```

### Auth contract regression review

```text
请对 task/goal/setting API routes 做一次 auth contract regression review。重点查找同一 route 是否同时表达强制 auth 和 public/optional auth，补充缺失的 route contract 测试。完成后运行 pnpm nx run api:test:smoke --skipSync。
```

### Schedule orchestration alias regression review

```text
请检查 schedule-orchestration 的 Vitest alias 配置和跨包 projection seam，确认现有 suite 不是通过 skip/mock 绕过真实导入路径。完成后运行 pnpm nx run schedule-orchestration:test --skipSync。
```
