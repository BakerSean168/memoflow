---
tags:
  - plan
  - archive
  - architecture
  - modules
  - governance
description: 将其他 feature package 的内部目录与分层治理从 legacy 形态迁移到 governance 的 server-first 参考结构，并持续记录逐包实施进度
created: 2026-07-07T00:00:00+08:00
updated: 2026-07-07T14:10:58+00:00
archived: 2026-07-07T14:10:58+00:00
---

# Feature Internal Structure Rollout

## 归档结果

本计划已完成。所有审计内业务 feature package 的服务端内部结构已统一到
`src/server/{domain,application,transport,infrastructure}`，治理 legacy baseline
已移除，legacy 根目录会被治理脚本直接拒绝，并通过最终验证。

## 背景

`2026-07-06-feature-reference-module-rollout.md` 已完成 public seam 收敛：

- `@memoflow/contracts/<feature>` 作为公共契约真值源
- `@memoflow/<feature>` / `api` / `client` / `electron` 作为稳定公开结构

但这轮工作并没有把其他 feature package 的内部目录真正收敛到
`packages/governance` 的 `server/*` 参考结构。

当前真实状态是：

- `governance`：已使用 `src/server/{domain,application,transport,infrastructure}`
- 大多数 feature：仍使用 `domain-server` / `domain-client` / `domain-shared` /
  `application-server` / `infrastructure-server` / `controllers`
- `data-portability`：已完成 `server-first` 迁移，当前以空 `server/domain/` 骨架对齐统一结构

## 目标

把 `packages/governance` 从“唯一参考实现”推进到“所有业务 feature 的统一内部结构标准”：

- 业务 feature 的服务端内部统一为 `src/server/*`
- `controllers` 统一收敛为 `server/transport`
- `domain-server` 与 `domain-shared` 收敛为 `server/domain`
- `application-server` 收敛为 `server/application`
- `infrastructure-server` 收敛为 `server/infrastructure`
- 治理脚本不再长期维护 governance / legacy 双轨结构

## 当前实施状态

### 已完成

- `governance`
  - 作为目标参考结构继续保持 `src/server/{domain,application,transport,infrastructure}`
- `setting`
  - 已完成 `server-first` 迁移
  - root / `api` / `electron` seam 已改为消费 `src/server/*`
  - legacy 内部目录已移除
  - 相关治理脚本 baseline 已更新
  - 最近邻验证已通过：
    - `pnpm nx run setting:typecheck`
    - `pnpm nx run setting:test`
    - `pnpm nx run memoflow:governance-check`
- `account`
  - 已完成 `server-first` 组合根迁移
  - `AccountApplicationPort` 已沉淀到 `src/server/application`
  - `api/module.ts` 与 `electron/index.ts` 已切到 `server/infrastructure/*` helper
  - Electron `LIST` 已通过应用端口访问，不再直接绕过到 repository
  - `server/infrastructure/runtime/*` 已接管 account runtime contribution
  - `electron-entry`、`api/runtime`、`api/transport-handlers` 已移除
  - legacy server 目录与 baseline 豁免已清理
  - 最近邻验证已通过：
    - `pnpm nx run account:typecheck`
    - `pnpm nx run account:test`
    - `pnpm nx run memoflow:governance-check`
    - `pnpm nx run desktop:test:main -- --run src/main/ipc/__tests__/module-handler-contracts.spec.ts`
- `repository`
  - 已完成 `server-first` 组合根迁移
  - `RepositoryApplicationPort` 已沉淀到 `src/server/application`
  - `api/module.ts` 与 `electron/index.ts` 已切到 `server/infrastructure/*` helper
  - `server/infrastructure/runtime/*` 已接管 repository runtime contribution
  - `electron-entry`、`api/runtime`、`api/prisma`、`api/transport-handlers` 已移除
  - legacy server 目录与 baseline 豁免已清理
  - 最近邻验证已通过：
    - `pnpm nx run repository:typecheck`
    - `pnpm nx run repository:test`
    - `pnpm nx run memoflow:governance-check`
    - `pnpm nx run desktop:test:main -- --run src/main/ipc/__tests__/module-handler-contracts.spec.ts`
- `data-portability`
  - 已完成 `server-first` 组合根迁移
  - `DataPortabilityApplicationPort` 已沉淀到 `src/server/application`
  - `api/module.ts` 与 `electron/index.ts` 已切到 `server/infrastructure/*` helper
  - `server/infrastructure/runtime/*` 已接管 data portability runtime contribution
  - `api/controller.ts` 已并入 `server/transport/data-portability.controller.ts`
  - `electron-entry`、`api/transport-handlers` 已移除
  - legacy server 目录与 baseline 豁免已清理
  - 当前保留空 `server/domain/` 骨架以对齐统一结构
  - 最近邻验证已通过：
    - `pnpm nx run data-portability:typecheck`
    - `pnpm nx run data-portability:test`
    - `pnpm nx run memoflow:governance-check`
    - `pnpm nx run desktop:test:main -- --run src/main/ipc/__tests__/module-handler-contracts.spec.ts`
- `authentication`
  - 已完成 `server-first` 组合根迁移
  - `AuthenticationApplicationPort` 已沉淀到 `src/server/application`
  - `api/module.ts` 已切到 `createAuthenticationPrismaModule(...)`
  - `api/routes.ts` 与 `server/transport/authentication.controller.ts` 已直接消费应用端口
  - `server/infrastructure/runtime/*` 已接管 authentication runtime contribution
  - `domain-server` 与 `domain-shared` 已并入 `server/domain`
  - `api/runtime`、`api/transport-handlers`、`electron-entry` 与 legacy server 目录已移除
  - legacy baseline 豁免已清理
  - 最近邻验证已通过：
    - `pnpm nx run authentication:typecheck`
    - `pnpm nx run authentication:test`
    - `pnpm nx run desktop:test:main -- --run src/main/ipc/__tests__/module-handler-contracts.spec.ts`
    - `pnpm nx run memoflow:governance-check`
- `schedule`
  - 已完成 `server-first` 组合根迁移
  - `ScheduleApplicationPort` / `ScheduleEventApplicationPort` 已沉淀到 `src/server/application`
  - `api/module.ts` 已切到 `createSchedulePrismaModule(...)` 与 `server/infrastructure/runtime/*`
  - `api/routes.ts` / `api/schedule-event.routes.ts` 已直接消费应用端口
  - `server/transport/*` 已接管原 controller
  - `server/infrastructure/*` 已接管 Prisma / PowerSync 组合根与 runtime contribution
  - `domain-server` 与 `domain-shared` 已并入 `server/domain`
  - `application-server`、`infrastructure-server`、`controllers`、`api/runtime`、
    `api/transport-handlers`、`electron-entry` 与 legacy server 目录已移除
  - legacy baseline 豁免已清理
  - 最近邻验证已通过：
    - `pnpm nx run schedule:typecheck`
    - `pnpm nx run schedule:test`
    - `pnpm nx run memoflow:governance-check`
    - `pnpm nx run desktop:test:main -- --run src/main/ipc/__tests__/module-handler-contracts.spec.ts`
- `notification`
  - 已完成 `server-first` 组合根迁移
  - `NotificationApplicationPort` 已沉淀到 `src/server/application`
  - `api/module.ts` 已切到 `createNotificationPrismaModule(...)` 与 `server/infrastructure/runtime/*`
  - `api/routes.ts` 与 `server/transport/notification.controller.ts` 已直接消费应用端口
  - `server/infrastructure/*` 已接管 Prisma / PowerSync 组合根与 runtime contribution
  - `commands` 与 `schedule-execution` 专门 seam 已保留并改为消费新结构
  - `domain-server` 与 `domain-shared` 已并入 `server/domain`
  - `application-server`、`infrastructure-server`、`controllers`、`api/runtime`、
    `api/transport-handlers`、`electron-entry` 与 legacy server 目录已移除
  - legacy baseline 豁免已清理
  - 最近邻验证已通过：
    - `pnpm nx run notification:typecheck`
    - `pnpm nx run notification:test`
    - `pnpm nx run memoflow:governance-check`
    - `pnpm nx run desktop:test:main -- --run src/main/ipc/__tests__/module-handler-contracts.spec.ts`
- `editor`
  - 已完成 `server-first` 组合根迁移
  - `EditorApplicationPort` 已沉淀到 `src/server/application`
  - `api/module.ts` 已切到 `server/infrastructure/runtime/*`
  - `api/routes/*` 与 `server/transport/editor.controller.ts` 已直接消费应用端口
  - `server/infrastructure/*` 已接管 Prisma / PowerSync 组合根与 runtime contribution
  - `domain-server` 与 `domain-shared` 已并入 `server/domain`
  - `application-server`、`infrastructure-server`、`controllers`、`api/runtime`、
    `api/transport-handlers`、`electron-entry` 与 legacy server 目录已移除
  - legacy baseline 豁免已清理
  - 最近邻验证已通过：
    - `pnpm nx run editor:typecheck`
    - `pnpm nx run editor:test`
    - `pnpm nx run memoflow:governance-check`
    - `pnpm nx run desktop:test:main -- --run src/main/ipc/__tests__/module-handler-contracts.spec.ts`
- `reminder`
  - 已完成 `server-first` 组合根迁移
  - `ReminderApplicationPort` 已沉淀到 `src/server/application`
  - `api/module.ts` 已切到 `createReminderPrismaModule(...)` 与 `server/infrastructure/runtime/*`
  - `api/routes/*` 与 `server/transport/reminder.controller.ts` 已直接消费应用端口
  - `server/infrastructure/*` 已接管 Prisma / PowerSync 组合根、runtime contribution、
    `schedule-execution` 与 `schedule-projection` 专门 seam
  - `domain-server` 与 `domain-shared` 已并入 `server/domain`
  - `application-server`、`infrastructure-server`、`controllers`、`api/runtime`、
    `api/transport-handlers`、`electron-entry` 与 legacy server 目录已移除
  - legacy baseline 豁免已清理
  - 最近邻验证已通过：
    - `pnpm nx run reminder:typecheck`
    - `pnpm nx run reminder:test`
    - `pnpm nx run memoflow:governance-check`
    - `pnpm nx run desktop:test:main -- --run src/main/ipc/__tests__/module-handler-contracts.spec.ts`
- `task`
  - 已完成 `server-first` 组合根迁移
  - `TaskApplicationPort` 已沉淀到 `src/server/application`
  - `api/module.ts` 与 `electron/index.ts` 已切到 `server/infrastructure/*` helper
  - `server/transport/*` 已接管原 controller 与 task transport handler mapper
  - `server/infrastructure/*` 已接管 Prisma / PowerSync 组合根、runtime contribution、
    `schedule-execution` 与 `schedule-projection` 专门 seam
  - `testing`、`analytics` 与 schedule seam 已改为消费新结构
  - `domain-server` 与 `domain-shared` 已并入 `server/domain`
  - `application-server`、`infrastructure-server`、`controllers`、`api/runtime`、
    `api/prisma`、`api/transport-handlers`、`electron-entry` 与 legacy server 目录已移除
  - legacy baseline 豁免已清理
  - 最近邻验证已通过：
    - `pnpm nx run task:typecheck`
    - `pnpm nx run task:test`
    - `pnpm nx run memoflow:governance-check`
    - `pnpm nx run desktop:test:main -- --run src/main/ipc/__tests__/module-handler-contracts.spec.ts`
- `goal`
  - 已完成 `server-first` 组合根迁移
  - `GoalApplicationPort` 已沉淀到 `src/server/application`
  - `api/module.ts` 与 `electron/index.ts` 已切到 `server/infrastructure/*` helper
  - `server/transport/*` 已接管原 controller 与 goal transport handler mapper
  - `server/infrastructure/*` 已接管 Prisma / PowerSync 组合根、runtime contribution、
    `schedule-execution` 与 `schedule-projection` 专门 seam
  - `events`、`analytics` 与 schedule seam 已改为消费新结构
  - `domain-server` 与 `domain-shared` 已并入 `server/domain`
  - `application-server`、`infrastructure-server`、`controllers`、`api/runtime`、
    `api/prisma`、`api/transport-handlers`、`electron-entry` 与 legacy server 目录已移除
  - legacy baseline 豁免已清理
  - 最近邻验证已通过：
    - `pnpm nx run goal:typecheck`
    - `pnpm nx run goal:test`
    - `pnpm nx run memoflow:governance-check`
    - `pnpm nx run desktop:test:main -- --run src/main/ipc/__tests__/module-handler-contracts.spec.ts`
- `ai`
  - 已完成 `server-first` 组合根迁移
  - `AIApplicationPort` 已沉淀到 `src/server/application`
  - `api/module.ts` 与 `electron/index.ts` 已切到 `server/infrastructure/*` helper
  - `server/transport/*` 已接管原 controller 与 ai transport handler mapper
  - `server/infrastructure/*` 已接管 adapter、runtime contribution 与 PowerSync 组合根
  - `domain-server` 与 `domain-shared` 已并入 `server/domain`
  - `application-server`、`infrastructure-server`、`controllers`、
    `api/transport-handlers`、`electron-entry` 与 legacy server 目录已移除
  - legacy baseline 豁免已清理
  - 最近邻验证已通过：
    - `pnpm nx run ai:typecheck`
    - `pnpm nx run ai:test`
    - `pnpm nx run ai:build`
    - `pnpm nx run memoflow:governance-check`
    - `pnpm nx run desktop:test:main -- --run src/main/ipc/__tests__/module-handler-contracts.spec.ts`

### 进行中

- 暂无

### 未开始

- 暂无

## 当前实施方案

本轮按 feature 包逐个推进，不做长期双轨兼容；每个包都遵循同一套落地步骤：

1. 先确认该包的公开 seam 已经收敛到 `.` / `./api` / `./client` / `./electron`
2. 创建 `src/server/{domain,application,transport,infrastructure}` 目标骨架
3. 把 legacy 目录内容整包迁入新骨架，而不是保留长期并存
4. 把组合根统一收敛到 `server/infrastructure/*`
5. 把 controller 统一收敛到 `server/transport/*`
6. 把运行时副作用统一收敛到 `server/infrastructure/runtime/*`
7. 清理 `electron-entry`、`transport-handlers`、`api/runtime` 等过渡层
8. 移除 legacy 根目录，并由治理脚本阻止回归
9. 运行对应包最近邻验证与 `memoflow:governance-check`

## 当前包级执行顺序

### 第一批：低复杂度验证模板

- `setting`
  - 已完成，作为 `governance` 之外的第一份可复制样板
- `account`
  - 已完成，用于固化“有 runtime、有 Electron seam、有 controller”的标准迁移模板
- `repository`
  - 已完成，用于固化“多 repository adapter + 多 route split”的迁移模板
- `data-portability`
  - 已完成，用于消化非标准内部结构特例

### 第二批：中复杂度模块

- `authentication`（已完成）
- `schedule`（已完成）
- `notification`（已完成）
- `editor`（已完成）

### 第三批：高复杂度模块

- `reminder`（已完成）
- `task`（已完成）
- `goal`（已完成）
- `ai`（已完成）

## 当前审计结论

### 结构分叉

- `governance` 与 `setting` 已经是 `server/*` 形态
- `account` 已完成 server-first 迁移并移除治理 baseline 豁免
- `repository` 已完成 server-first 迁移并移除治理 baseline 豁免
- `data-portability` 已完成 server-first 迁移并移除治理 baseline 豁免
- `authentication` 已完成 server-first 迁移并移除治理 baseline 豁免
- `schedule` 已完成 server-first 迁移并移除治理 baseline 豁免
- `notification` 已完成 server-first 迁移并移除治理 baseline 豁免
- `editor` 已完成 server-first 迁移并移除治理 baseline 豁免
- `reminder` 已完成 server-first 迁移并移除治理 baseline 豁免
- `task` 已完成 server-first 迁移并移除治理 baseline 豁免
- `goal` 已完成 server-first 迁移并移除治理 baseline 豁免
- `ai` 已完成 server-first 迁移并移除治理 baseline 豁免

### 文档与治理真值冲突

- `packages/governance/README.md` 已把 `server/*` 定义为目标参考结构
- `ADR-031` 已把 legacy 目录降级为过渡形态，不再把它定义为标准
- `server-feature-shape-audit.mjs` 与 `package-internal-boundary-audit.mjs`
  已收敛为“server-first 默认 + legacy 根目录直接拒绝”
- `package-export-audit.mjs` 已收敛到
  `root / api / client / electron` 公开结构默认口径

### 结论

当前仓库已达成“公开 seam 基本收敛”与“内部目录全面对齐 governance/server-first”。

## 实施原则

1. 先统一治理真值，再迁移业务代码，避免一边改结构一边被旧文档重新合法化。
2. 每次按 feature 包整包迁移，不做长期双目录并存。
3. 先处理依赖和横向协作最少的包，再处理高复杂度包。
4. 专门 seam 如 `analytics`、`events`、`schedule-execution`、
   `schedule-projection`、`testing` 可以保留，但要从新结构稳定导出。
5. 迁移后由治理脚本强制执行，避免回退。

## 实施阶段

### Phase 1: 收紧治理真值

1. 更新 `ADR-031`，把 `governance` 的 `server/*` 明确为统一目标结构，
   legacy 结构改为“历史过渡形态”，不再描述为标准。当前已完成。
2. 更新 `tools/governance/server-feature-shape-audit.mjs`：
   - 从“governance 特判 + legacy 默认”改为“server/* 默认”
   - 迁移期间曾用显式 baseline 记录未迁移包；最终已移除 baseline，
     并直接拒绝 legacy 根目录
     当前已完成。
3. 更新 `tools/governance/package-internal-boundary-audit.mjs`：
   - 统一到 `server/domain` / `server/application` /
     `server/transport` / `server/infrastructure`
   - 移除 legacy 布局审计分支，不再维护永久双轨
     当前已完成。
4. 更新 `tools/governance/package-export-audit.mjs`：
   - 默认公开结构改为 `.` / `./api` / `./client` / `./electron`
   - 专门 seam 继续由 package-specific allowlist 显式声明

### Phase 2: 低复杂度迁移

- `setting`（已完成）
- `account`（已完成）
- `repository`（已完成）
- `data-portability`（已完成）

目标：

- 先验证最小 server-first 目录迁移方法
- 收敛 `transport`、`application`、`domain`、`infrastructure` 的新 import 习惯
- 固化可复制的迁移模板

### Phase 3: 中复杂度迁移

- `authentication`（已完成）
- `schedule`（已完成）
- `notification`（已完成）
- `editor`（已完成）

目标：

- 处理 `schema.ts`、API runtime、Electron entry、DI 装配等常见变体
- 清理仍残留的 root 旧层名泄漏

### Phase 4: 高复杂度迁移

- `reminder`（已完成）
- `task`（已完成）
- `goal`（已完成）
- `ai`（已完成）

目标：

- 处理调度编排、analytics、events、testing、runtime contribution 等专门 seam
- 收敛跨模块服务端类型依赖，避免继续从 legacy 层目录导出

## 模块优先级与风险

### 低风险

- `setting`：层次较浅，专门 seam 少
- `account`：业务面较窄
- `repository`：结构完整但外部依赖面可控

### 中风险

- `authentication`：已完成，曾有 `domain-client` 缺口历史但不再阻塞当前结构
- `editor`：已完成，包含 client / server / runtime 组合迁移
- `notification`：已完成，含 `commands` 与 `schedule-execution` 专门 seam
- `schedule`：已完成，当前作为中复杂度调度 runtime 迁移样板

### 高风险

- `reminder`：已完成，含调度执行与投影 seam
- `task`：已完成，含 testing、analytics、schedule seam
- `goal`：已完成，含 events、analytics、schedule seam
- `ai`：已完成，子目录最多，基础设施与 controller 面最广

## 完成标准

- 所有业务 feature package 的服务端内部结构统一为 `src/server/*`
- `ADR-031`、模块 README、治理脚本与真实代码一致
- 治理脚本默认只接受 `server/*` 结构
- 不再需要 governance/legacy 双轨 shape 规则
- `memoflow:governance-check` 可以阻止新模块继续复制 legacy 结构

## 最近邻验证

每迁移一个包，至少运行：

1. 对应包最近邻 `typecheck` / `test` / `build`
2. `pnpm nx run memoflow:governance-check`
3. 受影响调用方的最近邻验证

## 立即下一步

1. 按需归档本计划，后续新 feature package 默认按 `src/server/*` 结构落地
2. 如新增 package 形态例外，先更新治理文档与脚本，再落代码
