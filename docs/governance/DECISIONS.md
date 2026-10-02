---
tags:
  - governance
  - decisions
  - ddd
description: Governance 模块决策记录 - 只记录稳定且重要的设计选择
created: 2026-03-14T00:00:00
updated: 2026-07-06T00:00:00+08:00
---

# Governance 决策记录

## Repository-native Engineering Governance input

Engineering rules use `tools/governance/engineering-rules.json` and the semantic pin in
`tools/governance/pinned-engineering-rules.json`. The native adapter needs no Product UUIDs,
contracts, database, exporter or published Product snapshot. DDD-003 has explicit partial,
read-only package-boundary coverage; DDD-001/002/004/005 remain visible and non-enforcing.
`autofix-proposal` emits review-required guidance without applying changes.

```bash
node tools/governance/engineering-rule-source-audit.mjs --check
node tools/governance/engineering-input-dependency-audit.mjs
node tools/governance/engineering-rule-adapter.mjs --source tools/governance/engineering-rules.json --mode check
node tools/governance/engineering-rule-adapter.mjs --source tools/governance/engineering-rules.json --mode report
node tools/governance/engineering-rule-adapter.mjs --source tools/governance/engineering-rules.json --mode autofix-proposal
```

ADR-113 remains Proposed. AGENT.md Governance-first policy and Product presence guards remain
active. The real-owner vertical slice policy is a proposal only; GOV-7903 remains blocked.

## Product Governance decision history (retained compatibility context)

The numbered decisions below describe the existing Product reference module. They do not
define the active Engineering input and are not superseded while ADR-113 is Proposed.

## 1. 这是“最佳实践示范模块”，不是“最少实现模块”

- 目标不是只够用
- 目标是让后来者直接照着抄也不会走偏

## 2. Props vs State 双命名约定保留

- Value Object / factory params 使用 `Props`
- Aggregate / Entity 内部持久状态使用 `State`
- 原因：与 `ValueObject` 基类 API 以及可变生命周期语义都更一致

## 3. 公共契约必须集中到 `@memoflow/contracts/governance`

- governance 包内不再保留第二份公共 contracts
- transport port 如果只是模块内部技术 seam，不进入 contracts 包
- IPC channel 与 RPC payload 也属于 governance protocol，不再挂在通用 `contracts/electron` 下

## 4. 根入口只暴露服务端组合根

- `@memoflow/governance` 只负责 server composition root
- `api`、`client`、`electron` 各自使用语义化子路径
- 不再对外暴露 layer-named seam
- 不再从根入口暴露 `createGovernancePowerSyncModule` 这类技术命名工厂

补充（参考 plan §3.5：公开 seam 与导出约束）：

- `createGovernancePrismaRepositories` / `createGovernancePowerSyncRepositories` / `createGovernanceEventLogRuntime` 是宿主装配所需的 **abstract ingredient factory**，不是 concrete adapter surface，也不是 layer-named seam；它们由 apps 的 runtime composer 调用，用来选择 adapter 并组装 instance。
- 具体 `*Repository` class（`RulePrismaRepository`、`PowerSyncRuleRepository` 等）仍不通过根入口导出。
- 宿主装配在 apps 完成（`apps/api/src/runtime/compose-governance.ts`、`apps/desktop/src/main/runtime/compose-governance.ts`）；`api` / `electron` module 只做 transport + lifecycle。

## 5. 前端不再消费 governance 包内 `domain-client`

- governance 负责返回 DTO
- app-vue 本地派生展示模型
- UI helper 不再伪装成领域模型

原因：

- UI 展示逻辑属于 app 层，不属于治理运行时包
- 这样能减少模块特例和双轨认知负担
- 也让 governance 更适合作为其他模块的严格参照

## 6. Branded ID 必须贯穿 contracts / runtime / validation

- 类型层：branded types
- 运行时：`createIdType<T>()`
- 校验层：`brandedId<T>()`
- 三层不一致会导致 schema 接受不了系统自己生成的 ID

## 7. 路由必须按资源 / feature 拆分

- governance 要展示 ADR-021，而不是继续单大文件
- route 也是架构实践的一部分，不是附属品

## 8. 顶层交付 seam 与服务端内部层次必须分开

- 顶层交付 seam：`api` / `client` / `electron`
- 服务端内部层次：`server/domain` / `server/application` / `server/transport` / `server/infrastructure`
- `server/transport` 只负责 controller 与 transport 翻译
- 模块运行时副作用属于 `server/infrastructure/runtime`

## 9. 轻量 docs 作为主入口，包内长文档作为深度资料

- `docs/governance/*` 负责导航、速查、变更手册、决策
- `packages/governance/*.md` 保留深度背景与实现细节
