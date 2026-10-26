---
tags:
  - standards
  - architecture
  - layering
  - contracts
description: MemoFlow 运行时容器、垂直 feature、领域/应用/基础设施、契约和组合根规范
created: 2026-01-15T00:00:00
updated: 2026-08-17T00:00:00+09:00
---

# 架构与分层规则

## 1. 核心边界

- `apps/*` 是运行时容器，负责入口、宿主装配、环境配置、生命周期和平台适配。
- `packages/<feature>` 是垂直业务切片，内部包含 domain、application、transport、infrastructure 和 client seam。
- `packages/contracts` 是**跨边界稳定契约中心**，只拥有 request、query、snapshot、outcome、public failure、event、RPC 和 serialization primitive。
- `packages/domain-shared` 只保存真正跨 bounded context 且业务语义一致的值对象和纯领域 primitive。
- `packages/utils` 保存技术性、无业务所有权的通用能力，不拥有全局业务错误层级。
- 数据库、PowerSync、HTTP client、IPC client 等基础设施 package 不承载 feature business policy。
- 文档、代码和治理脚本都以当前 Nx 工作区和可执行证据为准；目标架构通过迁移计划逐步实现，不假装当前代码已经全部符合。

详细失败/结果所有权见：

- [ADR-049](../decisions/ADR-049-domain-outcome-and-failure-contracts.md)；
- [失败与结果契约规范](./failure-and-outcome-contracts.md)；
- [Contracts 模块开发规范](./contract-module-development-spec.md)。

## 2. 依赖方向

箭头 `A -> B` 表示 A 依赖 B。

```text
host app
  -> presentation/client adapter
  -> feature public application port
  -> application
  -> domain

transport -> application
infrastructure -> application/domain-owned ports
host composer -> concrete infrastructure + feature factory
```

关键规则：

- Domain 不依赖 application、transport、infrastructure、UI 或 host。
- Application 依赖 domain 和 Port，不依赖 Express、Electron、Vue、Pinia、Prisma 或 provider SDK。
- Infrastructure 实现 Port，负责 DB/provider/filesystem/network 的 anti-corruption mapping。
- Transport 只做 context/auth 提取、schema validation、application delegation 和协议投影。
- Presentation 只消费 public outcome/failure/snapshot，不重新实现业务不变量。
- Host app 选择 concrete adapter、建立 module instance、控制 start/stop/drain；feature transport 不从 bootstrap context 偷取 DB 再自行组装。

## 3. 垂直 Feature Package

当前采用单 package 多层模式：

```text
packages/<feature>/src/
├── server/
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   └── transport/
├── client/ or application-client/
├── api/
├── electron/
└── index.ts
```

### 3.1 Domain

拥有 aggregate、entity、value object、policy、Domain Fault 和 domain-owned Port。

禁止：

- HTTP status、i18n、provider code、requestId/traceId；
- Prisma/PowerSync/SDK；
- wire DTO interface implementation；
- persistence/client serialization policy。

### 3.2 Application

拥有 use case、operation outcome、Domain Fault/public failure mapper、transaction orchestration、consumer-owned capability Port。

Application boundary优先返回 typed：

```text
Result<OperationOutcome, OperationFailure>
```

预期的“下一步状态”是 Outcome，不是 generic error。

### 3.3 Infrastructure

拥有：

- repository adapter；
- Prisma/PowerSync mapper；
- BetterAuth/GitHub/AI provider ACL；
- technical retry/backoff；
- diagnostic enrichment；
- filesystem/network/native platform implementation。

Provider code/status/message 不得离开该层。

### 3.4 Transport

拥有：

- HTTP/IPC/SSE 参数投影；
- auth/context extraction；
- adapter-owned runtime validation；
- public failure → status/header/envelope；
- route/channel registration。

Controller 不应二次解析 raw request，也不应执行 provider/domain error mapping。

### 3.5 Client / Presentation Adapter

拥有：

- query/mutation state；
- loading/empty/outcome/failure；
- recovery action；
- stable code/outcome → i18n/view projection；
- host-specific navigation/redirect/native bridge。

不拥有服务端业务不变量，不根据 raw message/provider status 分支。

## 4. Contracts Ownership

### 4.1 必须进入 contracts

- 跨 app/process/package public boundary 的 command/query；
- runtime validation schema；
- response snapshot；
- operation outcome；
- public failure code/schema；
- RPC/event map；
- durable event/message/receipt；
- serialization-safe primitive；
- public application/client port。

### 4.2 默认留在 feature

- domain aggregate/entity interface；
- Domain Fault；
- repository/internal Port；
- application helper/transaction state；
- persistence/provider row；
- UI props/local state；
- diagnostic cause/stack。

“多层都会用”不等于“跨边界 public”。contracts 与 domain 通过命名 mapper连接，不通过 class `implements` 强耦合。

## 5. 失败与结果所有权

| 语义                      | Owner                               | 示例                               |
| ------------------------- | ----------------------------------- | ---------------------------------- |
| 领域拒绝                  | feature domain                      | `TaskHierarchyCycle`               |
| 正常用例分支              | feature application/public contract | `email_verification_required`      |
| 跨边界失败                | contracts/<feature>                 | `AUTH_INVALID_CREDENTIALS`         |
| 通用失败类别              | contracts/result                    | `conflict`、`unavailable`          |
| provider/DB 失败          | infrastructure adapter              | BetterAuth `EMAIL_NOT_VERIFIED`    |
| HTTP status/header        | HTTP transport                      | `409`、`Retry-After`               |
| IPC/SSE projection        | IPC/SSE adapter                     | terminal failure envelope          |
| 文案与恢复动作            | presentation                        | locale key、focus/retry/navigation |
| cause/stack/provider body | observer/logger                     | diagnostic only                    |

硬规则：

1. message 不驱动业务分支；
2. provider code 不进入 application/UI；
3. Domain Fault 不含 HTTP/i18n；
4. Public Failure JSON-safe、无 cause/stack；
5. HTTP/IPC 使用同一 canonical outcome/failure；
6. UI 保存 stable semantics，不保存最终文案；
7. 正常下一步状态不计入 error rate。

## 6. Cross-feature Communication

### 6.1 同步调用

跨 feature query/command 使用：

- consumer-owned narrow Port；或
- provider feature 的 public application port。

Port 由 host composer 注入 concrete adapter。禁止 consumer import provider infrastructure/application implementation。

### 6.2 异步副作用

跨模块可靠副作用使用 versioned durable message、outbox/inbox/receipt。进程内 EventBus 只能做低延迟 wake-up，不能是唯一真值。

### 6.3 关系与引用

跨 feature 不直接修改对方表或 aggregate。关系、贡献、投递等使用明确 contract/ledger，由 owning module处理。

### 6.4 禁止万能 Service

不要用一个全局 `BusinessService`、`ErrorService`、`ModuleRegistry` 承担所有 feature 语义。Port 应小、面向 consumer、按 capability/operation 命名。

## 7. Composition Root

Feature package 暴露：

- domain/application factory；
- repository/adapters 的宿主装配 ingredient；
- transport module factory，接收已组装 instance；
- explicit application port；
- runtime contribution/lifecycle interface。

Host runtime composer负责：

```text
choose persistence/provider adapter
  -> build repository/capability ports
  -> create feature application instance
  -> bind runtime contributions
  -> create HTTP/IPC transport module
  -> register/start
```

规则：

- 每个 host、每个 feature 只有一个 authoritative module instance；
- AI、Data Portability、Schedule Orchestration 等 consumer 不得偷偷创建第二个 feature module；
- `register()` 不读取 `context.db` 重新组装；
- start/stop/drain 有明确顺序和失败清理；
- destroy 按依赖逆序；
- application port object identity 通过 composer tests 锁定；
- 全局唯一 worker/scheduler 使用 DB lease/ownership，不靠“只有一个进程”的假设。

## 8. Apps as Runtime Containers

### 8.1 允许的 app-local 代码

- 入口点；
- host DI/composer；
- environment/config；
- route/channel mounting；
- Express/Electron/Expo 等 platform integration；
- provider capability adapter；
- runtime lifecycle；
- deployment/health/build identity。

### 8.2 不允许的 app-local 代码

- Domain aggregate/value object/business rule；
- feature application use case；
- 跨 app 重复的业务执行器；
- provider error到业务语义的重复映射；
- 第二套 feature state machine；
- app-local复制的 public contract。

重复出现在 API/Desktop 的业务编排应下沉到 feature/application package；app仅实现不同 platform Port。

## 9. Presentation and Client State

- Server state使用 query/mutation boundary，不复制为多个互相竞争的 local store；
- operation state有一个 owner；
- outcome/failure保留机器语义，文案用 computed projection；
- locale变化不需要重新请求；
- recovery根据 code/outcome，不根据 message；
- durable receipt只保存safe code/params/retry/request reference；
- programmer crash和public operation failure使用不同 UI boundary；
- Web/Desktop可有不同 presentation，但共享 application semantics和contract。

“Client Domain”不是第二套服务端领域模型。客户端需要的通常是 snapshot/view model、interaction state和host adapter，而不是复制 aggregate和业务校验。

## 10. Persistence and Mapping

- Domain model不 import DB row；
- infrastructure mapper负责 row ↔ domain state；
- application mapper负责 domain ↔ public snapshot/outcome/failure；
- transport projector负责 raw request ↔ canonical command；
- mapper不执行授权、持久化或业务决定；
- `as unknown as` 不能代替 mapper；
- Prisma错误先在adapter分类，再按operation映射public semantics；
- PowerSync/Prisma必须通过相同application contract证明行为一致。

## 11. Nx Tags 与包内治理

### 11.1 当前现实

当前多数 feature package 使用 `layer:domain`，但 package 内包含 domain/application/infrastructure/transport。该 tag 是历史上的粗粒度 package tag，不代表整个 package 都是纯 domain。

`package-internal-boundary-audit.mjs` 是包内 source-layer 依赖方向的当前权威门禁。Nx graph主要控制 package isolation和app/ui/shared/infra大层级。

### 11.2 目标

Active architecture plan 将评估迁移到 `layer:feature` / `type:feature` 或等价标签：

- package tag表达vertical slice；
- AST audit表达domain/application/infra/transport；
- 不再通过允许“domain package → infra package”解释内部适配器；
- 不要求把每个feature拆成多个npm package。

在迁移完成前，不得以粗粒度 Nx tag 为理由绕过包内 audit。

## 12. 当前包内治理

`tools/governance/package-internal-boundary-audit.mjs` 已接入
`pnpm nx run memoflow:governance-check`，主要覆盖：

- domain 不导入 infrastructure、application-client、api、controllers；
- application 不导入 infrastructure、client、api、controllers；
- controllers 不导入 infrastructure/client/api；
- package root不泄漏 concrete infrastructure；
- raw event bus等回退路径受审计。

现有 known violations 是迁移债务，不代表规则无效。新增 violation 必须 fail closed，不能通过扩大baseline隐藏。

ADR-049 后续治理还将增加：

- provider code leakage；
- message-based branch；
- raw Result message rethrow；
- public failure registry/JSON-safety；
- i18n/HTTP/IPC coverage；
- compatibility alias expiry。

未落地前不得在文档中宣称这些新规则已执行；以 active plan evidence为准。

## 13. 测试分层

| 层             | 测试责任                                         |
| -------------- | ------------------------------------------------ |
| Domain         | invariant、state、Domain Fault、domain fact      |
| Application    | fault/port failure → outcome/public failure      |
| Infrastructure | provider/DB fixture → MemoFlow semantics         |
| Contract       | schema、serialization、registry、compatibility   |
| Transport      | auth/context、validation、status/envelope/parity |
| Presentation   | i18n、recovery、locale、safe persistence         |
| E2E            | deterministic product journey、host integration  |
| Governance     | forbidden pattern和surface mutation fixture      |

测试 fixture不得通过UI文案猜测数据前置条件；global setup/API/DB fixture负责确定性准备，真实signup/import等journey另行覆盖。

## 14. Deployment and Configuration Boundary

- `.env` 文件不是配置契约；每个host使用typed environment schema；
- schema声明required、optional、public、secret、forbidden和environment-specific字段；
- build产物包含sanitized revision/dirty/build metadata；
- product/E2E验收前校验 source revision = Web build = API build = runtime compose evidence；
- dirty/old image可以用于开发，不得作为正式验收证据；
- diagnostics artifact不包含secret。

## 15. 仓库约定

- 当前项目处于快速演进期，可优先做根因修复，但仍需保护公开wire、数据和product journey；
- breaking change必须有明确migration，不能用“无需兼容”跳过数据/协议安全；
- 规则可机器化时由治理脚本执行，文档记录所有权和理由；
- 跨多个feature或长期规则的变更必须有ADR；
- implementation plan记录阶段、tickets、验证和rollback；
- 完成声明只基于实际运行命令和证据。

## 16. 机器可执行治理

常用入口：

```bash
pnpm nx run memoflow:docs-check --skip-nx-cache
pnpm nx run memoflow:governance-check --skip-nx-cache
```

现有治理能力包括：

- JSDoc/public surface；
- package internal boundary；
- package export；
- architecture surface locks；
- raw event bus；
- test inventory/oracle；
- transport parity与schema引用规则；
- target baseline/到期治理。

治理变更流程：

1. 先生成current inventory；
2. 修复高风险路径或建立有期限baseline；
3. 添加positive/negative/mutation fixture；
4. 在feature分支运行docs/governance；
5. 合并后逐步从report-only升级fail-closed；
6. 禁止无owner/retireBy的长期allowlist。

## 17. 架构 Code Review Checklist

- [ ] 代码的语义owner是谁：domain/application/contract/infra/transport/presentation/host？
- [ ] 是否把provider/HTTP/UI细节放进domain/application？
- [ ] 是否把feature-private类型误放进contracts/shared？
- [ ] normal alternate state是否建模为outcome？
- [ ] public failure是否typed、JSON-safe、可穷尽？
- [ ] 跨feature是否依赖narrow port而非implementation？
- [ ] module instance是否由host唯一组装？
- [ ] mapper是否显式且无业务副作用？
- [ ] HTTP/IPC/PowerSync是否使用同一application contract？
- [ ] UI是否保存semantics而非message？
- [ ] tests是否按层验证且fixture确定性？
- [ ] governance是否能阻止同类回归？

## 18. 结论

MemoFlow 的目标不是把所有东西放进同一个共享包，也不是把每个feature拆成几十个npm package。目标是让每个变化只有一个明确owner：

```text
业务规则变 -> feature domain
用例流程变 -> feature application
边界shape变 -> contracts
provider/DB变 -> infrastructure adapter
HTTP/IPC变 -> transport
文案/交互变 -> presentation
宿主/部署变 -> apps runtime
```

当依赖方向与所有权一致时，Web、Desktop、API、PowerSync和AI才能共享业务语义，而不共享实现偶然性。
