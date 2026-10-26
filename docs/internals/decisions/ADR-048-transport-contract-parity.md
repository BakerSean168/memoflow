---
tags:
  - adr
  - architecture
  - reference-architecture
  - transport-parity
  - contracts
description: ADR-047 - Transport Contract Parity — adapter-owned validation, HTTP/IPC parity fixtures, mapper boundary and direct Vitest gate / 传输契约一致：adapter 拥有校验、HTTP/IPC parity fixture、mapper 边界与 direct Vitest 门禁
created: 2026-08-16
updated: 2026-08-16
---

# ADR-048: Transport Contract Parity / 传输契约一致

**状态**: 已采纳
**日期**: 2026-08-16

## 背景

RefArch Phase 2 建立了 canonical `ExecutionContext` 与统一的 HTTP/IPC
adapter（`expressAdapter` / `ipcAdapter`），但 Gooal/Task/Notification 的
mutation 输入校验仍然分散在 controller（每个方法内部 `Schema.safeParse`），
HTTP route 的 OpenAPI request schema 只是文档，Electron IPC handler 直接
把 raw payload 传给 controller。结果：

1. HTTP 与 IPC 的 wire shape 是否一致没有可执行证明——两条 transport 各自
   手工解析 `req.body` / positional args，可能投影成不同的 canonical input。
2. OpenAPI 文档与实际 runtime 校验可能漂移——route 引用一个 schema，
   controller 校验另一个对象。
3. RPC map、Zod schema、route、IPC channel、response envelope 各自独立维护，
   没有一个"反向可追踪"的单一来源。
4. 生产 transport/infrastructure 边界存在大量 `as unknown as` DTO 强转，
   掩盖契约不匹配。

本 ADR 冻结 Phase 4 的决策：transport shape validation 由共享 adapter 拥有，
HTTP/IPC 用同一 canonical fixture 证明 parity，schema/map/envelope 单源，
边界用命名 mapper 而非强转。

## 决策

### 1. Adapter 是唯一 transport shape validation owner

- `expressAdapterWithValidation` / `ipcAdapterWithValidation` 是 mutation 输入
  的唯一 runtime validator；controller 不再从 raw `Request` / Electron event /
  body 读取 identity/header，也不再二次 `safeParse` 同一 schema。
- 校验顺序固定为：auth/context 提取 → validation → controller。缺失 auth
  仍为 `401`；malformed input 仍为 `400`/`VALIDATION_ERROR`；domain/application
  errors 保持现有 Result code/status。
- Controller 接收 inferred parsed input，只保留业务错误映射与 application
  delegation。

### 2. HTTP/IPC parity fixture 规则

- 每个 mutation 有一个 shared canonical fixture；两条 transport 只负责
  提取/验证/响应转换，最终调用同一个 `ApplicationPort`/controller method，
  返回相同业务 `Result`、error code/details 与 response data shape。
- Projector 只把现有 wire payload（包括 positional IPC args）组成 contract
  input；不改变 renderer/API wire shape，也不执行业务默认值以外的规则。
- HTTP identity 来自 auth middleware，IPC identity 来自 authenticated profile
  context；fixture body 中出现 `identityId` 必须被 schema 拒绝或忽略，不能
  覆盖 context。

### 3. Single source of truth chain

每个 mutation 沿以下链路反向可追踪，链中每个名称只指向一个定义：

```text
Zod request schema (input) + z.infer type
  -> RpcMap[operation][0]
  -> HTTP route / IPC channel registration
  -> controller/application method
  -> Zod response schema (data) + z.infer type
  -> shared HTTP/IPC response envelope
```

- RPC map 只 import `../api` 的 inferred request/response types，禁止 map 内联
  object type。
- HTTP OpenAPI `request` 与 `responses` 注册必须引用相同 schema objects；
  route 通过 `routeWithValidation` 的 `validation.schema` 绑定同一对象。
- 需要 path/query/body 合并时新增命名 contract schema 或显式 input projector，
  不得在 route callback 内拼一个未命名 object 后再 cast。
- `identityId`、`deviceId`、request metadata 不属于 public mutation body schema。

### 4. Mapper boundary policy

- 边界强转使用命名 mapper（`toGoal*Input/fromGoal*Response`、
  Prisma row mapper 等）；mapper 负责 branded-id 转换、enum 收窄、
  nullable/default 字段、date/timestamp 转换与嵌套响应投影。
- Mapper 不得执行持久化、授权或业务决策；不把 cast 替换成 `any` 或宽泛
  `Record<string, unknown>`。
- 新增生产跨边界 DTO `as unknown as` 会使 cast inventory 失败；test doubles、
  generated/native APIs 与显式低层 transaction adapter 允许在 allowlist 中。

### 5. Direct Vitest gate

- 本阶段门禁使用 direct Vitest（`node node_modules/vitest/vitest.mjs run
--config <pkg>/vitest.config.ts <files>`），不使用已知会 hang 的
  `pnpm nx run <package>:test`。
- 每条 migration 必须有对应的 route/electron/parity surface spec 可执行证据。

## 影响

- Controller 变薄：去掉重复 safeParse，接受 inferred input。
- Route 文件显式绑定 validation schema；OpenAPI 与 runtime 不再漂移。
- 新增 `routeWithValidation` / adapter `projectInput`/`projectArgs` 公共选项，
  带双语 JSDoc。
- 生产 `as unknown as` 在 transport DTO/application/Prisma 边界逐步由 mapper
  替代；测试与 native 基础设施保留 allowlist。
- 治理试点（governance create-rule）先行，验证模式后再推广 Goal →
  Task → Notification。

## 相关决策

- ADR-010（Centralized Contracts）：共享类型单一来源。
- ADR-027（Zod-to-OpenAPI）：文档从 schema 自动生成。
- ADR-030（Result Pattern）：统一 Result/HTTP/IPC 转换。
- ADR-031（Server Feature Standard Shape）：feature 包统一结构。
- ADR-045（Unified Request/Execution Context）：canonical context 归属。

## 实施说明

- 试点：`packages/governance` create-rule mutation 使用真实
  `expressAdapterWithValidation` / `ipcAdapterWithValidation`，并配
  governance transport parity spec（同一 fixture 两条 transport 调用同一
  app spy）。
- 推广顺序：Goal → Task → Notification，每个 mutation 的 RPC map / schema /
  route / IPC / response envelope 必须一起闭合。
- 不使用 second prose mutation ledger；ledger 只存在于 plan/inventory 与
  executable surface specs。
