---
tags:
  - governance
  - playbook
  - maintenance
description: Governance 变更手册 - 常见改动的最短路径
created: 2026-03-14T00:00:00
updated: 2026-07-06T00:00:00+08:00
---

# Governance 变更手册

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

## 更新 Engineering rule metadata

Edit the native source, preserving sorted unique codes/tags and strict example shapes.
Review semantic changes, then regenerate only the native pin:
`node tools/governance/engineering-rule-source-audit.mjs --write`.
Run native source/parity/isolation tests and `pnpm nx run memoflow:governance-check`.
Legacy Product snapshot/pins stay as compatibility evidence and are not regenerated here.

## Product Governance compatibility maintenance

The following procedures describe the physically retained Product feature, not active
Engineering rule input ownership. They remain subject to AGENT.md and the ADR-113 gate.

## 新增规则字段

1. 更新 `packages/contracts/src/modules/governance/` 中对应 DTO / Zod schema / response schema
2. 更新 `src/server/domain/aggregates/rule.ts` 的 state / create / load / toDTO
3. 更新 Prisma / PowerSync mapper
4. 更新相关 tests

## 新增状态流转

1. 在 `src/server/domain/aggregates/rule.ts` 增加业务方法
2. 如有必要，补 domain event
3. 更新 use case 编排
4. 更新 controller 错误映射
5. 更新 tests 与文档

## 新增 HTTP 端点

1. 先判断属于哪个资源：`Rule` 还是 `RuleRevision`
2. 优先落在现有资源文件：`governance-rules.routes.ts` 或 `governance-rule-revisions.routes.ts`
3. 只有当某个资源继续膨胀到不优雅时，才在该资源内部继续细分 feature 文件
4. 在 route 文件内注册 OpenAPI
5. 在 `src/api/routes/index.ts` 聚合
6. 补 route contract spec

## 新增查询参数

1. 修改 `packages/contracts/src/modules/governance/api/*.ts` 中 query schema
2. 修改 route parser
3. 修改 use case 输入类型与实现
4. 补 schema / use case / route 测试

## 新增 IPC 通道或 payload

1. 只改 `packages/contracts/src/modules/governance/protocol/*`
2. 先对齐 `GovernanceChannels` 与 `GovernanceRpcMap`
3. 再对齐 `src/client/index.ts` 与 `src/electron/index.ts`
4. 不要回到 `packages/contracts/src/electron/ipc-channels.ts` 添加 governance 常量

## 新增持久化实现差异

1. 优先对齐 `src/server/domain/repositories/` 中的仓储接口
2. 再对齐 Prisma 与 PowerSync 双 mapper
3. 避免让某一端独享领域语义

## 新增示例规则 seed

1. 修改 `src/server/infrastructure/seed/seed-data.ts`
2. 保证它既能说明业务规则，也能说明代码规范
3. 不要把 seed 写成只对 demo 有意义的空内容

## 调整前端缓存策略

1. `@memoflow/governance/client` 只负责调用并返回 DTO
2. Pinia 只缓存 POJO / DTO，不缓存 class 实例
3. app-vue 在 `display-rule.ts` 本地派生展示模型
4. 只有 UI 真的需要派生字段时，才在 app 层增加 helper

## 调整服务端内部结构

1. 业务模型只进 `src/server/domain/`
2. 用例和统一调用门面只进 `src/server/application/`
3. 控制器和 transport 翻译只进 `src/server/transport/`
4. 模块运行时副作用只进 `src/server/infrastructure/runtime/`
5. 持久化适配器和组合根只进 `src/server/infrastructure/`
6. 不要恢复 `domain-shared`、`domain-server`、`application-server`、`controllers` 这种分裂目录

## 调整公开导出面

1. 公共契约只走 `@memoflow/contracts/governance`
2. server root 只走 `@memoflow/governance`
3. HTTP 模块只走 `@memoflow/governance/api`
4. renderer client 只走 `@memoflow/governance/client`
5. desktop main 只走 `@memoflow/governance/electron`
6. mocks 只走 `@memoflow/contracts/mocks`
