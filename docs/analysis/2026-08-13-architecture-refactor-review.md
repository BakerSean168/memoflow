# MemoFlow 架构重构评审：基于 ardanlabs/service 与 usememos/memos

> 评审日期：2026-08-13（UTC）
> 评审范围：MemoFlow 当前工作区、`/tmp/ardanlabs-service`、`/tmp/usememos-memos` 的 shallow clone 版本。
> 参考源码核验底稿：[reference-architecture-source-notes.md](./reference-architecture-source-notes.md)。

## 1. 执行摘要

1. **MemoFlow 的主分层已经成立，应做一致性收敛而不是推倒重来。** 主要 feature 包普遍具备 `server/domain`、`server/application`、`server/infrastructure`、`server/transport`，Goal/Task/Reminder/Schedule/Notification/Account 都定义了 repository Port，Prisma/PowerSync 作为 Adapter 实现。这个方向与 Ardan 的 consumer-owned `Storer`、Memos 的 API/Store 类型分离一致，优先维持。
2. **API runtime 已有 Composition Root，但模块内部仍承担大量装配。** `apps/api/src/main.ts:103-236` 负责 DB、CloudAuth、跨模块 adapter 和模块白名单；然而 `IApiModule.register(context)` 又被设计为“在模块内创建 Repo → Service → Controller”（`apps/api/src/shared/contracts/api-module.ts:55-84`），Goal 的 `packages/goal/src/api/module.ts:52-86` 即为实例。它比“业务对象自己 new PrismaClient”安全，但离理想的最外层组装仍有一层可收敛的隐式组合根。
3. **生产代码中有两组 Application -> Prisma 边界违例，严重度不同。** Goal 的 `relation.use-cases.ts:9-11,46-112` 和 `wallet.use-cases.ts:8-10,50-156` 在 use-case 文件内实现 Prisma repository，是 P0 的直接层反转；Data Portability 已有正确的 `DataPortabilityImportStore`/read Port，但把 `prisma-data-portability-import-store.ts` 与 `prisma-adapters.ts` 放在 `server/application` 下，是 P1 的实现归属错误。两组都应迁到各自 `server/infrastructure`，Application 只保留 Port 与用例。
4. **HTTP 与 IPC 的业务汇聚点已经存在，是应保留的强项。** Goal/Task 的 HTTP 与 Electron 都通过同一 `create*TransportHandlers(applicationPort)` 和 Controller；例如 `packages/goal/src/api/module.ts:72-86`、`packages/goal/src/electron/index.ts:93-131`，Task 也在 `packages/task/src/electron/index.ts:87-121` 使用同一 transport handlers。不要再为 IPC 复制一套业务；应把所有模块逐步收敛到同一形态。
5. **鉴权入口基本正确，但 Context 与 API 横切 pipeline 还不完整。** `apps/api/src/shared/infrastructure/http/middlewares/auth-middleware.ts:23-55` 通过 `cloudAuth.resolveNodePrincipal` 得到 identity，再把 Principal-like 数据写入 `req.user`；Electron 由 `withAuthenticatedValue` / `ExecutionContext` 注入身份，业务层没有解析 Authorization header 的证据。问题是 `ExecutionContext` 目前只有 `identityId/deviceId/device`（`packages/contracts/src/shared/execution-context.ts:5-24`），Express adapter 只把 `req.id/traceId` 用于响应 envelope（`packages/utils/src/result/express-adapter.ts:208-221`），而 `applyGlobalMiddleware` 也没有统一 Request ID、OpenTelemetry span 和结构化 request logger。Python AI service 已有 request context/HMAC，TS API -> AI service 也会传 request ID；应从 API 入口补齐同一条 trace 链。
6. **Contracts 方向正确，且已经有大量单一来源治理；剩余风险是“多种 contract 层共存”而不是完全重复。** Goal/Task 的 Zod schema、inferred type、RPC map 已集中在 `packages/contracts/src/modules/*/api` 与 `protocol/*`，例如 `goal-rpc-map.ts:9-56`、`task-rpc-map.ts:1-39`。同时 `server` 内部 DTO、client aggregate DTO、Prisma row、AI snake_case contract 各自存在，这是合理的边界转换。下一步不是把所有类型合成一个，而是清理少数仍手写的跨边界 shape，并让 HTTP/IPC adapter 都从同一 schema 验证。
7. **AI 受控写入的骨架已经比参考项目更先进，但 Backend Executor 仍是浅而宽的分发器。** `apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts:35-67,69-368` 内部再次创建 Goal/Task/Reminder Prisma module，并在一个 `executeGoalAutomation` 中按 `action.tool` 分支。这满足“AI 不直接写表”的最低线，因为它调用 module application API；但它仍把 action dispatch、跨模块编排、错误策略和 Prisma composition 混在一个 Adapter，建议深化为 `ActionExecutor -> GoalCommands/TaskCommands/ReminderCommands -> Application Port`。
8. **前端目前不是 Query Cache 架构。** Web/Vue 使用 Pinia store + composable（例如 `packages/app-vue/src/modules/task/stores/task-store.ts:25-110`、`useTaskTemplates.ts:76-230`、`notification/useNotification.ts:35-119`），mutation 后直接 `add/update/remove` 或重新 fetch；源码没有 TanStack Query 的 `QueryClient/invalidateQueries`。这在单一宿主内可工作，但跨 Web/Desktop/PowerSync/SSE 时容易出现多份 server state。建议先以 Notification 或 Task 为试点引入 query authority，不要一次性重写全部 UI。

## 2. MemoFlow 当前架构地图

下面按“部署/运行边界、业务能力、用例编排、技术适配、横切平台”分类。目录名保持 MemoFlow 的 Nx 语义，不引入 Ardan 的 `api/app/business` 命名。

### 2.1 Runtime / Composition Root

| Runtime              | 当前实现                                                                                                      | 评审结论                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Cloud API            | `apps/api/src/main.ts`、`apps/api/src/bootstrap.ts`                                                           | **基本正确**：DB/CloudAuth/跨模块 Port/模块注册/生命周期均在 API runtime；但 `register()` 内仍有模块级组合根。                    |
| Web                  | `apps/web/src/main.ts`、`packages/app-vue/src`                                                                | **维持**：Presentation 通过注入的 module client/service 使用 HTTP 或 Desktop API；状态主要由 Pinia 管理。                         |
| Desktop main         | `apps/desktop/src/main/bootstrap.ts`、`desktop-main-runtime.ts`、`profile/desktop-profile-runtime-manager.ts` | **维持并继续清理**：PowerSync DB、IPC module、profile lifecycle 在 main/runtime；仍有少量 feature 级模块状态与 IPC handler 集中。 |
| AI service           | `apps/ai-service/src/ai_service/app.py`、`middleware/*`、`api/routes/*`                                       | **强项**：FastAPI app factory/lifespan 统一创建 shared client 与 workflow services；内部 HMAC、request context 已独立。           |
| Migrator / scheduler | `apps/migrator`、`apps/api/src/shared/infrastructure/cron`                                                    | **维持**：生命周期不进入 domain；scheduler 通过 runtime ownership/lease 运行。                                                    |

### 2.2 Domain / Business Capability

| Capability             | 主要位置                                  | 当前状态                                                                              |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Goal                   | `packages/goal/src/server/domain`         | **强**：Goal aggregate、VO、policy、repository Port；关系/钱包是尚未完成归位的试点。  |
| Task                   | `packages/task/src/server/domain`         | **强**：Template/Instance/Dependency aggregate 与四类 repository Port。               |
| Knowledge / Repository | `packages/repository/src/server/domain`   | **强**：knowledge connection/projection/lease 等 capability 通过 Port 表达。          |
| Reminder               | `packages/reminder/src/server/domain`     | **强**：四类 repository Port，状态与触发规则在 domain。                               |
| Schedule               | `packages/schedule/src/server/domain`     | **强**：schedule/task/execution Port、VO、lease 语义清晰。                            |
| Notification           | `packages/notification/src/server/domain` | **强**：Notification aggregate、channel、reliable delivery contract 与 domain event。 |
| Account                | `packages/account/src/server/domain`      | **强**：Account aggregate、closure operation Port、VO 和 ownership rule。             |

### 2.3 Application / Use Case / Port

主要形态是 `packages/<capability>/src/server/application`：

- `application/<capability>.application.port.ts` 对外给 transport 的 callable surface；
- `use-cases/commands` 与 `queries` 编排 domain 和 Port；
- `application/ports/*` 放跨 capability 的外部依赖；
- `event-handlers`、`outbox`、`runtime contribution` 负责可靠异步路径。

**现状判断：** Goal/Task/Reminder/Schedule/Notification/Account 的核心 CRUD 已是深模块；接口复杂度集中在 transport/application port，而不是散落在路由。关系/钱包的 `Prisma*Repository` 是应立即修正的直接层反转；Data Portability 的 Port 已分离，但两个 Prisma adapter 文件仍需从 Application 归位到 Infrastructure。

### 2.4 Infrastructure / Adapter

- Prisma：`packages/*/src/server/infrastructure/adapters/prisma`，并由 `infrastructure/prisma.ts`、`infrastructure/*module.ts` 组装。
- PowerSync：`packages/*/src/server/infrastructure/adapters/powersync`，由 Electron module 选择。
- Memory/In-memory：Account、AI、Notification 等已有测试或本地 adapter。
- External API：AI provider gateway 在 `packages/ai/src/server/infrastructure/gateways`；TS → Python AI service 在 `chat-execution/ai-service-*`。
- Durable messaging：outbox/lease/reliable adapter 位于各 capability infrastructure，不进入 domain entity。

**现状判断：** Prisma model 已大多被 mapper/adapter 隔离；跨模块的少数 API runtime adapter（尤其 BackendAutomationToolExecutor、KnowledgeSource/Analytics adapter）仍直接收 `PrismaClient`，这是 composition seam 的主要候选。

### 2.5 Platform / Cross-cutting

- API HTTP：`apps/api/src/shared/infrastructure/http/middlewares`、`middleware`、`response-builder`、OpenAPI。
- Contract：`packages/contracts/src/modules/*/{api,protocol,domain,value-objects}`。
- HTTP/IPC result adapter：`packages/utils/src/result/express-adapter.ts`、`ipc-adapter.ts`。
- Auth context：`packages/contracts/src/shared/execution-context.ts`、`packages/contracts/src/electron/authenticated-ipc.ts`。
- Logging：`@memoflow/utils/logger`，但入口 request trace 还没有统一注入。
- UI state：Pinia stores + module composables；没有统一 server-state cache。

## 3. 逐条对照分析

### 3.1 Runtime != Domain

**参考项目怎么做：** Ardan 的 `api/services/sales/main.go:154-299` 是 Sales runtime，业务能力位于 `business/domain/*bus`；Auth 也是独立 runtime。Memos 的 `cmd/memos/main.go:36-76` 负责 profile/driver/store/server 启动，但 `APIV1Service` 仍是一个偏胖的逻辑汇聚点，不能照抄。

**MemoFlow 现状：** `apps/api`、`apps/desktop`、`apps/ai-service` 是运行宿主；Goal/Task/Knowledge 等位于独立 Nx package。这个边界已成立。`packages/goal/src/server/infrastructure/goal.module.ts` 以及 `task.module.ts` 等把 domain/application 组装成 module instance，说明业务没有依赖 Express/Electron。

**建议：**

- **维持（P0）** `apps/*` 作为 runtime；不要新增 `apps/business` 或改成 Ardan 目录。
- **优化（P1）** 更新 `apps/api/src/main.ts` 的注释，删除“模块内部自行管理数据库访问”这类容易误导的描述；改为“runtime 提供 database capability，feature module 只组装注入的 Port”。
- **优化（P1）** 将 `createGoalPrismaModule(db, ...)` 等从 `packages/<feature>/src/api/module.ts` 逐步移动到 `apps/api/src/main.ts` 的 `compose*Runtime` 函数；模块 API 只接收已组装的 `GoalModuleInstance/ApplicationPort`。

### 3.2 Composition Root 放最外面

**参考项目怎么做：** Ardan 在 `api/services/sales/main.go:159-218` 创建 DB、store、cache decorator、business、auth client、tracer，再交给 mux；业务 `Business` 不打开 DB。Memos 有外层 composition root，但 `server/server.go` 和 `APIV1Service` 仍继续构造依赖，是应吸取的限制。

**MemoFlow 现状：** `apps/api/src/main.ts:103-207` 已经创建 Prisma、CloudAuth、schedule orchestration、跨模块 adapters；这是正确的主根。问题是 `apps/api/src/bootstrap.ts:81-116` 仍在运行时创建 auth middleware，且 `packages/goal/src/api/module.ts:52-86` 在 `register` 内组装 repository/application/事件监听器。`IApiModule` 的规范注释（`apps/api/src/shared/contracts/api-module.ts:65-84`）甚至把这种下沉组合根定义为标准。

**建议：**

- **P1** 新增 `apps/api/src/runtime/compose-api-modules.ts`：接受 `PrismaClient`, `CloudAuth`, `repositoryStorageBaseDir` 等 runtime dependencies，返回已组装的 `IApiModule[]` 或 module handles。
- **P1** 试点顺序遵循 AGENT.md 治理模块铁律：**先以 `packages/governance`（reference module，业务虚构）跑通** composition root 外移模式，再迁移 Goal/Task（`createGoalPrismaModule`、`createTaskPrismaModule`、event listener、schedule contribution 在 `main.ts` 组装；`createGoalApiModule` 改为 `createGoalApiModule({ instance })`，只挂 routes/destroy）。
- **P2** governance + Goal/Task 跑通后，其余模块（reminder、schedule、notification、account、repository、data-portability 等）按相同模式批量迁移；不要求把所有跨模块 adapter 都塞进一个巨大函数，可按 capability slice 拆 `compose-goal.ts`、`compose-schedule.ts`。
- **风险：** 组装顺序和 module lifecycle 可能被改变。每个 slice 保留现有 `bootstrap.spec.ts`、module surface spec，并增加“dispose 后 listener 不再触发”测试。

### 3.3 Business 依赖 Port，不依赖实现

**参考项目怎么做：** Ardan 的 `business/domain/productbus/productbus.go:26-87` 由 `productbus.Storer` 描述所需能力，`productpg` adapter 在外层实现；`NewWithTx` 是它的基础设施泄漏，应只借鉴方向。Memo 的 concrete broad `*store.Store`（`server/router/api/v1/v1.go:37-67`）不是理想范本。

**MemoFlow 现状：**

- **维持：** `packages/account/src/server/domain/repositories/i-account-repository.ts`、`goal/.../i-goal-repository.ts`、`task/.../i-task-*`、`reminder/.../i-*`、`schedule/.../i-*`、`notification/.../i-*` 均是 Port；Prisma adapter 在 infrastructure 目录。
- **风险：** `packages/goal/src/server/application/use-cases/commands/relation.use-cases.ts:9-11,46-112` 与 `wallet.use-cases.ts:8-10,50-156` 把 Prisma implementation 放进 Application。它们虽然 use case 构造函数仍接 interface，但同文件拥有 implementation，导致层依赖反向。
- **值得优化：** `packages/data-portability/src/server/application/import-store/prisma-data-portability-import-store.ts:8-224` 与 `server/application/prisma-adapters.ts:9-111` 也 import `PrismaClient` 并实现 adapter。这里的 use case 已经依赖 `DataPortabilityImportStore`/read Port，且 PowerSync 实现位于 Infrastructure，因此是目录归属和治理问题，不是用例接口设计失败。
- **风险：** `apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts:42-66` 和 `apps/api/src/modules/ai/controlled-analytics-read.adapter.ts` 直接收 `PrismaClient`。这在 runtime adapter 内合法，但它让 AI composition 依赖具体 feature module，而不是 Goal/Task/Notification Application Port。

**建议：**

- **P0** 将关系实现拆为 `packages/goal/src/server/infrastructure/adapters/prisma/relation-prisma.repository.ts`，Port 移至 `server/domain/repositories/i-relation-repository.ts` 或 `server/application/ports`；`relation.use-cases.ts` 只保留 `SubjectRef/RelationDTO`（更理想是移至 contracts/domain）和 use case。
- **P0** 将钱包实现拆为 `wallet-prisma.repository.ts`，同样让 `wallet.use-cases.ts` 只依赖 `IWalletRepository`。把 `$transaction` 封装在 adapter 或显式 transaction runner Port，禁止 Application import `PrismaClient`。
- **P1** 将 Data Portability 的 Prisma import store 和 read adapters 移至 `packages/data-portability/src/server/infrastructure/prisma`（可拆 `import-store` 与 `export-adapters`）；更新 `server/infrastructure/prisma.ts` 与 export surface，Port 和 use case 保持不动。
- **P1** 为 `BackendAutomationToolExecutorAdapter` 改成构造注入 `GoalApplicationPort`、`TaskApplicationPort`、`ReminderApplicationPort`、`KnowledgeSourcePort`、`AnalyticsReadPort`；在 `main.ts` 组合。这样既能测试 executor，也避免它重新启动三套 module。
- **P1** 在上述生产实现迁走后设 ESLint/治理规则：`packages/*/src/server/application/**`、`domain/**` 禁止 `@memoflow/database` import；测试文件可按测试基础设施规则豁免，现有 `surface.spec.ts` 的规则检查可复用。

### 3.4 跨层类型转换

**参考项目怎么做：** Ardan 的 `app/domain/productapp/model.go` 用 JSON primitive 转业务 VO，再由 `userdb/model.go` 转 DB row；Memos 用 proto message、store model、DB driver 分层，转换在 `server/router/api/v1/common.go` 和 converter 中。

**MemoFlow 现状：** Contracts 已按边界拆分：Goal 的请求/响应 schema 在 `packages/contracts/src/modules/goal/api/goal-crud.dto.ts`、`response-schemas.ts`；Task 的 public request schema 明确不包含 `identityId`（`packages/contracts/src/modules/task/api/task-template.dto.ts:43-65`），内部 input 才加入 identity。Prisma mapper 例如 `packages/account/src/server/infrastructure/adapters/prisma/mappers/account-prisma.mapper.ts`、Goal/Task/AI 的 mapper 都在 infrastructure。

**维持：** 不把 Prisma generated type 导出到 client；不把 Python snake_case contract 直接暴露给 domain；primitive 在 transport，强类型在 domain。

**优化：**

- **P1** 对 `packages/ai/src/server/infrastructure/chat-execution/ai-service-*` 建立显式 `toAIServiceRequest/fromAIServiceResponse` mapper，将 `include_key_results`、`provider_config`、`prompt_tokens` 等细节限制在 adapter；Application Port 继续使用 camelCase/domain result。
- **P1** 对 Goal/Task 的 controller 做 schema-only input：`identityId` 只能来自 `ExecutionContext`，禁止 HTTP/IPC body 传入；已有 schema 方向正确，补 surface test 覆盖每个模块。
- **P2** 检查 `as unknown as` 的跨边界强转，优先处理 `packages/app-vue/src/modules/notification/composables/useNotification.ts:69-75` 一类将局部状态强转成 DTO 的路径；用 contract factory 或 mapper 替代，而不是把 server DTO 扩大为万能类型。

### 3.5 Middleware 与横切 pipeline

**参考项目怎么做：** Ardan 的实际链路是外层 `otelhttp`，再 `Otel -> Logger -> Errors -> Metrics -> Panics`（`app/sdk/mux/mux.go:91-101`），路由额外挂 Authenticate/Authorize；它没有独立 RequestID 或 validation middleware。Memos 的 Connect interceptor 有 metadata、logging、recovery、auth；AI service 则有 request context + HMAC auth。

**MemoFlow 现状：** API 的 `applyGlobalMiddleware` 只有 `helmet/cookie/cors/json/compression/performance`（`apps/api/src/shared/infrastructure/middleware/global.ts:24-84`）；`applyErrorHandlers` 统一错误 envelope，但 `auth-middleware.ts:52-53` 仍直接 `console.error`。Express adapter 会从 `req.id/traceId` 生成 response metadata，却没有将它加入 `Context`。

**建议：**

- **P0** 在 `apps/api/src/shared/infrastructure/http/middlewares/request-context.middleware.ts` 新增 requestId/traceId middleware：优先接受可信 `X-Request-Id`（限制长度/字符），否则生成 UUID；将 requestId、traceId、startedAt 写入 request typed context，并在 response header/envelope 回传。
- **P0** 将 `packages/contracts/src/shared/execution-context.ts` 扩为 `ExecutionContext { identityId, requestId, traceId, deviceId?, agentRunId?, threadId?, checkpointId?, approvalState? }`；只放 request/run-scoped metadata，不放 Prisma、业务实体或 repository。
- **P1** `packages/utils/src/result/express-adapter.ts` 与 `ipc-adapter.ts` 改为接收同一 `Context` extractor interface；HTTP/IPC 都向 Application controller 传完整 scoped context，避免 HTTP 用 `req.user`、IPC 用隐式 desktop stub 的语义分叉。
- **P1** 把 `console.error` 替换为注入/共享 logger，补 requestId/traceId/identityId 字段。Performance middleware 已是实例注入（`MetricsStore` 在 `bootstrap.ts:44-60`），维持这个方向。
- **P2** 若有 OpenTelemetry 运行时依赖，再在 API 入口接 W3C traceparent；不要先引入仅为“看起来完整”的 tracing SDK。成功标准是 Web/HTTP/AI service 的同一个 requestId 可在三处日志检索。

### 3.6 Context 与 Authentication

**参考项目怎么做：** Memos 的 Auth interceptor 解析 Authorization 后只把 UserID/claims 放 context，完整 User 按需 `Store.GetUser`；Ardan 还会把已加载 User/Product 和 transaction 放 context，这是不应照搬的反例。

**MemoFlow 现状：** API middleware 使用 `cloudAuth.resolveNodePrincipal`，并校验 Account Active；routes 通过 `req.user.identityId` 或 `expressAdapter` 提取身份。Electron module 通过 `withAuthenticatedValue` 获取 `ExecutionContext`，Goal/Task handlers 明确把 identity 从 context 传给 controller。没有业务层 `parseAuthorizationHeader/decodeJWT/verifyToken` 的生产代码匹配。

**维持：** authentication 留在 HTTP middleware/IPC auth wrapper；Application 只接 `ExecutionContext`/Principal；完整 Account 需要时走 Account repository/use case。

**优化：**

- **P1** 引入显式 `Principal { identityId; role?: string; sessionId?: string }`（建议在 contracts/shared），让 `req.user` 是 transport representation，controller 入参统一转 `ExecutionContext`。
- **P1** 将 Account Active/closure 检查抽成 `AccountStatusPort` 或 auth adapter；当前 `createAuthMiddleware` 直接依赖 Prisma `account` capability，属于 platform adapter 的合理起点，但不应被每个业务 handler 重复实现。
- **P2** 对 route-level ownership 做 application policy：middleware 只负责 authentication/粗粒度 role，资源 owner 规则留在 use case/domain policy，避免 Memos 那种 APIV1Service 中到处重复 authorization。

### 3.7 Contract 是系统的腰

**参考项目怎么做：** Memos 的真值源是 `proto/api/v1/*.proto`，Buf 同时生成 Go、Connect、Gateway、OpenAPI 和 TS；不是 Zod。MemoFlow 的等价原则是 `packages/contracts` 中的 Zod schema + inferred type + RPC/event map。

**MemoFlow 现状：** `packages/contracts/src/modules/*/api` 已大量使用 `z.infer`；`protocol/*-rpc-map.ts` 只引用 API types；surface specs 明确禁止 DTO dual body。HTTP adapters 在 `packages/<feature>/src/infrastructure-client/adapters/http`，IPC adapters 在 `.../adapters/ipc`，共享 `application-client` Port。

**维持：** contracts 继续做唯一 transport schema source；不要在 Vue、Express、Electron 各写一套请求 DTO；server/domain model 可以不同。

**优化：**

- **P1** 为每个高频写操作建立三段可追踪链：`Schema -> RpcMap -> HTTP/IPC adapter -> Controller/Application Port`，先覆盖 Goal/Task/Notification。
- **P1** 统一 route validation 入口：优先使用 `expressAdapterWithValidation` / IPC 对应 adapter，逐步删除 routes 内重复 `safeParse`；保留复杂 SSE/stream route 的专用 adapter。
- **P2** 将 response envelope schema 也纳入 contracts，并让 OpenAPI registry 复用同一 schema；不要因为 OpenAPI 生成而复制 DTO。

### 3.8 Transport 是 Adapter，HTTP/IPC 共享一套 Use Case

**参考项目怎么做：** Memos 的 Connect 与 Gateway 都指向一个 `APIV1Service`，说明 transport convergence；但 `APIV1Service` 同时承担业务规则、Store、副作用，是反例。Ardan 的 app route 接业务接口，不在 HTTP adapter 中重新写 business。

**MemoFlow 现状：** Goal HTTP `packages/goal/src/api/module.ts:72-86` 与 Electron `packages/goal/src/electron/index.ts:93-131` 都从 `goalModule.api` 生成 handlers/controller；Task Electron 同理。`packages/utils/src/result/express-adapter.ts` / `ipc-adapter.ts` 已提供通用协议转换。

**维持：** 一个 Application Port，多种 transport adapter；controller 负责协议 mapping/validation，不承担跨模块持久化流程。

**优化：**

- **P1** 做 transport parity surface test：同一 request fixture 分别走 HTTP adapter 和 IPC adapter，断言调用同一个 controller/Application method；Goal/Task 先行。
- **P1** 让 `packages/<feature>/src/server/transport/*controller.ts` 成为唯一 controller surface，routes/index.ts 只做 path + middleware + adapter 绑定。
- **P2** 不创建新的 `create*TransportHandlers` 变体；已有 factory 是 convergence point，缺功能时扩充 application port 或 controller method。

### 3.9 Database Model 是 Infrastructure detail

**参考项目怎么做：** Memos 的 `store.User/Memo` 与 API proto 分离，转换在 `server/router/api/v1/*converter.go`；但 concrete broad `*store.Store` 不是窄 repository Port。Ardan 的 `userdb` row 与 business model 分离更接近目标。

**MemoFlow 现状：** Prisma mapper 已存在于 Account/Goal/Task/AI 等 infrastructure；domain aggregates 不 import Prisma。生产代码的 Application 例外包括 Goal relation/wallet，以及 Data Portability 下位置错误的 Prisma import/read adapters；另有少数 API runtime adapter 直接读 Prisma，后者在层级上合法但边界偏宽。

**建议：**

- **P0** 完成 relation/wallet mapper/repository 归位。
- **P1** 将 Data Portability 的 Prisma 实现移入 `server/infrastructure`；保留 `DataPortabilityImportStore` 与 read Port 在 Application，PowerSync/Prisma 都从外层实现同一 Port。
- **P1** 对 `apps/api/src/modules/ai/controlled-analytics-read.adapter.ts`、`repository-knowledge-source.adapter.ts` 等建立 `AnalyticsReadPort` / `KnowledgeSourcePort` 的 infrastructure implementation；Application/AI executor 只收 Port。
- **P2** 保留 Prisma `TransactionClient` 细节在 adapter/transaction runner；不要为了“纯 domain”把真实事务语义伪装成简单 Promise。

### 3.10 Cache 是 Decorator，不是 Business

**参考项目怎么做：** Ardan 的 `usercache.NewStore(storer)` 实现同一 `userbus.Storer`，在 Sales/Auth composition root 按需包裹；Memos 把部分 cache 放在 broad Store 内，不是透明 decorator。

**MemoFlow 现状：** 未见把所有 repository 强制套 cache 的实现；PowerSync、Prisma、memory adapter 已提供更直接的选择。`apps/desktop/src/main/utils/ipc-cache.ts` 是 IPC cache，不应误认成 domain repository cache。

**建议：**

- **维持（P0）** 当前不为 Goal/Task/Knowledge 机械增加 cache。
- **P2** 真有热点后，在 `server/infrastructure/adapters/cache` 实现 `CachedKnowledgeRepository` 等同 Port decorator，并在 `apps/api`/desktop composition root 选择；测试 cache hit/miss、失效、事务可见性。

### 3.11 AI 受控执行链

**参考项目怎么做：** Ardan/Memos 没有 Agent/Proposal/Approval 的直接实现，不能归因于参考项目。该链是 MemoFlow 的安全目标。

**MemoFlow 现状：** `packages/ai/src/server/infrastructure/proposal-kernel`、`assistant-facade`、`application/ports/*` 已提供 proposal/agent/application seams；AI service internal client 使用 HMAC、`X-Request-Id`、`X-Identity-Id`（`ai-service-internal-client.ts:100-135`）。但 `BackendAutomationToolExecutorAdapter` 用一个大循环处理 goal/task/reminder/knowledge/analytics，并重新创建 feature module。

**建议：**

- **P0** 将 `IAIAutomationToolExecutorPort` 的实现拆成 `GoalActionExecutor`、`TaskActionExecutor`、`ReminderActionExecutor`、`KnowledgeQueryExecutor`；顶层只负责排序、依赖和 receipt。
- **P0** 将 `createGoalPrismaModule/createTaskPrismaModule/createReminderPrismaModule` 从 `BackendAutomationToolExecutorAdapter` 移到 `apps/api/src/main.ts`，注入各自 `ApplicationPort`。Desktop 以 PowerSync port 做同样组合，保持两宿主行为一致。
- **P1** 明确 `Proposal -> Approval -> Executor` 的状态与幂等键：proposal/approval/run metadata 进入 `ExecutionContext` 或 AI run aggregate，不能靠 action body 传入；executor 只执行已批准 command。
- **P1** 每个 action executor 增加 contract test：失败 action 不会执行后续依赖 action，重复 `operationId` 不重复写入。
- **风险：** 大循环拆解可能改变 action 顺序和现有 receipt 文案；先用当前 `backend-automation-tool-executor.adapter.test.ts` 固定行为，再替换实现。

### 3.12 Frontend Server State 与实时事件

**参考项目怎么做：** Memos 以 React Query 的单一 `QueryClient` 为 authority；mutation 做 optimistic patch/rollback/invalidate，SSE 通过 query keys refresh。它仍有多 projection patch 和少量分散 invalidation，不能宣称“零手工 cache”。

**MemoFlow 现状：** Pinia 是 UI/server data 的混合承载：Task store 保存 templates/instances，Goal store 保存 goals/records，Notification store 保存列表与 unread count。`useTaskTemplates.ts:139-225`、`useNotification.ts:56-103` 在 mutation 后直接局部更新；Goal initialization 甚至明确写着 future 才订阅 domain events（`packages/app-vue/src/modules/goal/initialization/index.ts:25-27`），Notification 则已经订阅 eventBus 并直接写 store（`notification/initialization/index.ts:22-69`）。这意味着实时事件处理策略不统一。

**建议：**

- **P1 试点 Notification：** 新增 `packages/app-vue/src/platform/server-state/notification-query-client.ts`，将 list/unread/read/delete 与 `notification:*` event 收敛到 query key；Pinia 只保留筛选、分页、view preference。
- **P1 试点 Task：** 选择 templates/instances 其中一组，mutation 成功后 invalidate query，而不是同时 `add/update/remove` 与全量 fetch；保留 optimistic update 仅在有明确 UX 价值时使用。
- **P1** 统一 PowerSync `db:tables-changed`、SSE、eventBus 到 server-state invalidation dispatcher；组件不直接监听 transport event。
- **P2** 评估引入 `@tanstack/vue-query` 的成本与离线 PowerSync 交互；不在没有试点指标前全仓替换 Pinia。
- **风险：** Electron 离线和本地 PowerSync 不是普通 HTTP cache。先定义 query source（HTTP、PowerSync 或 hybrid）与 stale/online policy，再决定库。

## 4. 重点重构候选清单

| 优先级 | 现状                                                             | 问题                                                                 | 目标设计                                                                                     | 改动范围                                                                                                                                                                       | 主要风险                                                       |
| ------ | ---------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| **P0** | Goal relation/wallet use-case 文件内含 Prisma repository         | Application 反向依赖 DB；Port 无法跨 Prisma/PowerSync 复用           | `domain/application Port` + `infrastructure/adapters/prisma` mapper/repository               | `packages/goal/src/server/application/use-cases/commands/{relation,wallet}.use-cases.ts`；新增 infrastructure files；module wiring/tests                                       | 事务行为、错误码和 Decimal 转换变化                            |
| **P0** | AI backend executor 自己组装三套 Prisma module                   | executor 浅而宽；测试困难；AI 绑定 Prisma module lifecycle           | API runtime 组装 Goal/Task/Reminder Application Port，executor 只做 action orchestration     | `apps/api/src/main.ts`、`apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts`、`packages/ai/src/server/application/ports`                                      | action 顺序、receipt、跨模块事件重复注册                       |
| **P0** | API 无统一 request-scoped context/trace pipeline                 | API 与 AI service 的 requestId 不一定来自同一个入口；日志搜索断链    | RequestContext middleware → Principal middleware → adapters → Application/AI internal client | `apps/api/src/shared/infrastructure/http/middlewares`、`packages/contracts/src/shared/execution-context.ts`、`packages/utils/src/result/*adapter.ts`                           | 现有 response envelope、smoke test、SSE header 兼容            |
| **P1** | `IApiModule.register()` 内含 composition root                    | runtime 与 feature package ownership 混合；依赖顺序隐含              | `apps/api/src/runtime/compose-*.ts` 完成 assembly，module register 只挂 transport/lifecycle  | `apps/api/src/main.ts`、`bootstrap.ts`、各 `packages/*/src/api/module.ts`                                                                                                      | 迁移面大，应先 Goal/Task slice                                 |
| **P1** | HTTP/IPC 共享 handlers 但 parity 依赖人工保持                    | 新增 channel/route 可能一边漏实现                                    | contract fixture 驱动的 HTTP/IPC parity tests                                                | `packages/goal`、`packages/task`、`packages/utils/result`、contracts                                                                                                           | IPC 参数序列化与 HTTP status 差异                              |
| **P1** | Data Portability 的 Prisma import/read adapters 位于 Application | Port 已存在但实现归属错误；破坏 Application 禁止数据库依赖的可治理性 | Port/use case 留在 Application，Prisma 与 PowerSync 实现都归 Infrastructure                  | `packages/data-portability/src/server/application/{import-store/prisma-data-portability-import-store.ts,prisma-adapters.ts}`、`server/infrastructure/prisma.ts`、exports/tests | 大量 import path 变化；跨 capability 导出/导入事务行为必须保持 |
| **P1** | Pinia 同时承载 server state，事件策略分散                        | mutation 局部 patch、refetch、eventBus 写 store 并存，多宿主易漂移   | Query Cache authority；Pinia 仅 UI state；SSE/PowerSync/eventBus 统一 invalidate             | `packages/app-vue/src/modules/notification` 先试点，再 task                                                                                                                    | 离线/PowerSync freshness、optimistic rollback                  |
| **P1** | `ExecutionContext` 只有 identity/device                          | agent run、thread、approval、trace 不能在应用层稳定传递              | metadata-only Request/Execution Context，AI run context 显式建模                             | `packages/contracts/src/shared`、controllers、AI ports                                                                                                                         | 过度把业务对象塞入 context；必须保持 metadata-only             |
| **P2** | AI service 已有完整 request context，API/AI trace 尚未全链路接通 | Python 日志和 TS 日志只能按局部 requestId 对齐                       | API 生成/接收 requestId，AI internal client 原样转发，Python response echo                   | API middleware、`packages/ai` internal client、AI tests                                                                                                                        | 代理/重试时 requestId 语义和敏感 header 处理                   |
| **P2** | Prisma mapper 已较完整但少数 runtime adapter 直接查库            | 跨模块 read/write 入口变多，未来替换 persistence 成本高              | `AnalyticsReadPort`、`KnowledgeSourcePort` 等由 infrastructure adapter 实现                  | `apps/api/src/modules/ai/*adapter.ts`、对应 packages application ports                                                                                                         | read model 性能和 SQL 查询能力损失                             |

## 5. 不建议做的事

1. **不要照抄 Ardan 的目录名。** MemoFlow 已有 Nx `apps` + `packages` 语义；要强化的是 dependency direction、Port ownership 和 composition seam。
2. **不要把 Memos 的 `APIV1Service` 作为目标。** 它把 transport、Store、规则、Webhook、SSE、Notification 混在一个 service；MemoFlow 应保持 Transport → Application → Domain → Repository。
3. **不要把 Memos 的 Proto 事实改写成“Zod 经验”。** MemoFlow 可以用 Zod 实现同一“单一契约源”原则，但参考项目的 source 是 Proto/Buf。
4. **不要为了“所有 repository 都完整”给每个 Port 加 cache。** 只有出现可测的热点、第二个实现或明确一致性策略时才加 decorator。
5. **不要把完整 Goal/Task/Prisma entity 放进 Context。** Ardan 当前实现确实把部分实体和 transaction 放 context，但这不是 MemoFlow 应采用的约束；MemoFlow 的 context 应只传 request/run-scoped metadata。
6. **不要先做全仓 Query Cache 替换。** Pinia 还承担离线/桌面与 UI state；先以 Notification/Task 试点，量化重复 fetch、事件延迟、回滚错误，再推广。
7. **不要把 HTTP DTO、Domain aggregate、Prisma Model、Python Pydantic shape 合并为万能类型。** 少量 mapper 是 locality 和安全边界，不是无谓 boilerplate。
8. **不要把所有横切能力塞进 Application service。** Request ID、日志、错误 envelope、metrics、auth 是 platform/transport concerns；Application 只消费已经解析的 context 和 Port。

## 6. 落地路线

### 阶段 0：建立可验证基线（1 个独立变更）

- 固定当前参考版本与本文底稿；为 Goal/Task/AI executor 记录现有行为测试入口。
- 先记录 Application/Domain 对 `@memoflow/database` 的现有生产 import allowlist（Goal 两处、Data Portability 两处），禁止新增；AI executor 禁止新增 `create*PrismaModule`。
- 成功标准：`pnpm nx run memoflow:governance-check`、Goal/Task/AI 相关 unit/surface tests 通过；无行为变更。

### 阶段 1：修正明确层反转（P0）

- 迁移 Goal relation/wallet Prisma repository 与 mapper。
- 保持 `IRelationRepository/IWalletRepository` 的方法和错误语义；只改变实现位置与 module wiring。
- 将 Data Portability 的 Prisma import store/read adapters 移到 Infrastructure；随后删除 allowlist，启用 Application/Domain 禁止 `@memoflow/database` 的全量治理规则。
- 将 Backend Executor 依赖改为 Application Port，先保留现有 action loop，避免同时改变业务语义。
- 验证：Goal unit/integration、API smoke、`backend-automation-tool-executor.adapter.test.ts`、PowerSync module tests。

### 阶段 2：统一 API Request/Execution Context（P0/P1）

- 加入 API request context middleware，统一 requestId/traceId/startedAt。
- 扩展 `ExecutionContext`，改 Express/IPC adapter 传递同一形状；Principal 只从入口解析。
- AI internal client 继续使用现有 HMAC 和 `X-Request-Id`，改为优先传入入口 requestId，不自行随机生成（无入口上下文时才 fallback）。
- 验证：auth middleware、result adapter、SSE、AI service request context tests；日志中可关联 API 与 Python 请求。

### 阶段 3：外移 Composition Root（P1）—— governance 先行

试点顺序（见 AGENT.md「治理模块（试点示范）」）：**governance → goal/task → 批量其余模块**。

- **第一步 governance**：新增 `apps/api/src/runtime/compose-governance.ts`，把 Prisma/PowerSync adapter 选择、runtime contribution、event listener 组装外移；`packages/governance/src/api/module.ts` 只接受已组装 instance；同步补充详细注释作为 reference module 示范。
- **第二步 goal/task**：新增 `compose-goal.ts`、`compose-task.ts`（组合最深：双 adapter、event listener、schedule contribution、HTTP/IPC parity、AI executor 耦合），在 governance 验证的模式上迁移。
- **第三步批量**：其余模块（reminder、schedule、notification、account、repository、data-portability 等）按相同模式套用。
- `packages/*/src/api/module.ts` 只接受已组装 instance，并负责 transport registration 与 lifecycle。
- Electron 保留自身 runtime composition，但复用同一 Application/Transport wiring，不跨宿主共享 Prisma implementation。
- 验证：API bootstrap integration、Electron IPC tests、module dispose/listener tests（每阶段独立验证）。

### 阶段 4：Transport parity 与 contracts 收敛（P1）

- 以 Goal/Task/Notification 为样本，把 route 内 validation 迁到 `expressAdapterWithValidation`/IPC validation adapter。
- 为每个 mutation 建 HTTP/IPC 同 fixture parity test；RPC map、Zod schema、response envelope 作为唯一 source。
- 清理少数 `as unknown as` DTO 转换，补 mapper。
- 验证：contracts surface specs、HTTP route specs、Electron IPC specs、OpenAPI generation check。

### 阶段 5：Server State 试点（P1/P2）

- Notification：Query Cache authority，Pinia 保留 page/filter；eventBus/SSE 只调用 invalidation dispatcher。
- Task：templates 或 instances 二选一，比较 query cache 与现有 Pinia 的 fetch 次数、stale 窗口、mutation rollback。
- 只有试点稳定后，才决定是否引入 `@tanstack/vue-query` 覆盖更多模块；PowerSync offline policy 单独记录 ADR。
- 验证：Vue composable/store tests、Web e2e、Desktop renderer smoke、断网/重连场景。

### 阶段 6：长期可观测性与装配治理（P2）

- API 统一 logger/request metrics/trace；必要时接 OpenTelemetry。
- 将 `IApiModule` contract 从“模块内部 composition root”改成“runtime 注入 module instance”的文档与类型约束。
- 对跨模块 read Port、AI proposal approval、reliable operation receipt 建立架构 surface tests。
- 验证：governance check、全量 typecheck/lint、API/AI/Web/Desktop 关键 journey。

## 结论

MemoFlow 不需要一次性重写架构。最有价值的顺序是：先修正 Goal 两个直接的 Application -> Prisma 反转，并归位 Data Portability 的 Prisma adapters；再深化 AI executor 和 request context 边界，随后外移 Goal/Task composition root，最后以真实 UI 痛点试点 Query Cache。这样每一阶段都能独立验证，也能保留当前已经做对的 Port、mapper、HTTP/IPC convergence、reliable messaging 和 AI HMAC 边界。
