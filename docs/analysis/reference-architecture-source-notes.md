# ardanlabs/service 与 usememos/memos 源码核验笔记

> 本文只记录两个参考项目的源码事实及由事实直接支持的架构判断，不分析 MemoFlow。
>
> 核验日期：2026-08-13（UTC）

## 1. 样本与方法

本次使用用户指定命令做 shallow clone，并固定以下上游版本：

| 项目                | 本地目录                 | HEAD                                       | 提交时间                  | 提交主题                                            |
| ------------------- | ------------------------ | ------------------------------------------ | ------------------------- | --------------------------------------------------- |
| `ardanlabs/service` | `/tmp/ardanlabs-service` | `43e8ae07abdc554ab7361d73fcbbee7a87bfa891` | 2026-06-22T13:26:41-04:00 | `upgrading deps and fixing bugs`                    |
| `usememos/memos`    | `/tmp/usememos-memos`    | `bba1d6d4975a44cf60abee63a85fc1b2e2a3dea5` | 2026-08-12T20:52:25+08:00 | `fix(i18n): correct French memo link label (#6182)` |

路径均为对应上游仓库的相对路径。结论来自当前 HEAD 的源码，而不是项目介绍或二手文章。需要特别注意：用户方向锚点中提到的 Ardan `business/core/*` 已不是本次 HEAD 的目录；当前代码位于 `business/domain/*`。

## 2. ardanlabs/service 源码核验

### 2.1 Runtime 与业务能力确实分开，但目录名不应照搬

**源码事实**

- `api/services/sales/main.go:154-282` 是 Sales runtime 的启动与装配代码：它打开数据库，创建 audit/user/product/home/vproduct business，选择 auth HTTP 或 gRPC client，初始化 tracing，并把已构造对象交给 mux。
- `api/services/auth/main.go:130-247` 是另一个独立 runtime；它有自己的数据库、user business、keystore、auth service、HTTP mux，并在 `api/services/auth/main.go:263-279` 同时启动 gRPC auth adapter。
- 业务能力不放在 runtime 目录，而分别位于 `business/domain/auditbus`、`business/domain/userbus`、`business/domain/productbus`、`business/domain/homebus`、`business/domain/vproductbus`。
- HTTP presentation/application adapter 位于 `app/domain/*app`；例如 `app/domain/productapp/route.go:14-36` 接收 `productbus.ExtBusiness` 和 `authclient.Authenticator`，再绑定路由。

**判断**

方向“部署/运行边界不等于业务边界”得到直接支持。Sales/Auth 是进程与部署边界，User/Product/Home 才是业务包边界。不过这里的 `app/domain`、`business/domain` 命名具有 Ardan 项目的本地语义，不适合机械映射到其他语言或 monorepo。

### 2.2 Composition Root 位于外层 runtime，是本项目最清晰的可迁移做法

**源码事实**

- Sales 的 composition root 在 `api/services/sales/main.go:154-282`：
  - `sqldb.Open(...)` 构造 DB（159-172）；
  - `auditdb.NewStore`、`userdb.NewStore`、`productpg.NewStore`、`homedb.NewStore`、`vproductdb.NewStore` 构造 persistence adapter（179-198）；
  - `usercache.NewStore(log, userdb.NewStore(...), time.Minute)` 在装配点选择 cache decorator（185）；
  - `auditbus.NewBusiness`、`userbus.NewBusiness`、`productbus.NewBusiness` 等构造业务对象（181-198）；
  - auth client 的 HTTP/gRPC 实现由配置选择（205-218）；
  - tracer、mux config、route set 和 HTTP server 都在外层完成（225-299）。
- Auth runtime 同样在 `api/services/auth/main.go:130-247` 构造 DB、user store/cache/business、keystore、auth 对象、tracer 和 mux。
- `business/domain/productbus/productbus.go:56-87` 的 `Business` 只接收已经构造好的 `userBus`、`delegate`、`Storer` 和 extension；其中没有打开数据库或选择数据库实现。

**判断与边界**

“外层构造基础设施并注入业务”有充分证据。需要保留一个细节：composition root 不是单个绝对文件，`main.go` 把已构造依赖交给 `app/sdk/mux/mux.go:91-124`，后者再创建 web app 并调用 route adder；因此更准确的说法是“装配责任位于 runtime/app 外层”，而不是“所有 `new` 必须只出现在 main”。

### 2.3 Business 通过所需 Port 依赖 persistence，且 Port 由使用方拥有

**源码事实**

- 当前五个业务包都在自身包中声明 `Storer`：
  - `business/domain/auditbus/auditbus.go:18`
  - `business/domain/homebus/homebus.go:27`
  - `business/domain/productbus/productbus.go:26-37`
  - `business/domain/userbus/userbus.go:27-38`
  - `business/domain/vproductbus/vproductbus.go:14`
- 以 Product 为例，`business/domain/productbus/productbus.go:28-37` 声明业务所需的 create/update/delete/query 能力；`Business` 字段依赖 `Storer`（57-63），构造函数接收 `Storer`（65-87），方法调用 `b.storer`（130、153、162、171、186、196），不依赖 `productpg.Store`。
- PostgreSQL adapter `business/domain/productbus/stores/productpg/productpg.go:24-69` 实现该接口；transaction 版本也返回 `productbus.Storer`（40-55）。
- `business/domain/userbus/userbus.go:27-38` 与 `business/domain/userbus/stores/userdb/userdb.go:20-65` 展示相同的 consumer-owned interface 结构。
- Business 之间也通过业务接口协作：Product 接收 `userbus.ExtBusiness`，创建 Product 前查询 User 并执行 enabled 规则，见 `business/domain/productbus/productbus.go:56-70,107-134`。

**判断与纠偏**

“Business 依赖 Port、不依赖数据库实现”完全成立。不过它不是完全纯净的六边形核心：`Storer.NewWithTx` 暴露了 `business/sdk/sqldb.CommitRollbacker`，business 构造函数也注入 logger/delegate。这说明可借鉴的是依赖方向与 consumer-owned Port，而不是声称参考项目消除了所有基础设施概念。

### 2.4 跨边界主动转换类型，而不是共享一个万能模型

**源码事实**

- HTTP 模型在 `app/domain/productapp/model.go:17-26` 使用 JSON primitive（string、float64、int）；`toBusNewProduct` 在同文件 69-104 把字符串/数字解析为 `name.Name`、`money.Money`、`quantity.Quantity`，并从 request context 取得 UserID。
- 业务实体 `business/domain/userbus/model.go:13-42` 使用 `uuid.UUID`、`name.Name`、`mail.Address`、`role.Role`、`password.Password` 等强类型。
- persistence 自有 `userDB` row model，字段带 `db` tag 并使用 `sql.NullString`、`dbarray.String`；映射集中于 `business/domain/userbus/stores/userdb/model.go:16-89`。
- Product HTTP response 的反向转换在 `app/domain/productapp/model.go:34-52`，把业务 VO 转回 JSON primitive 与 RFC3339 时间。

**判断**

“edge primitive → business strong type → persistence row type”的证据非常直接。这里甚至允许 HTTP 与业务模型字段形态不同，mapper 分别属于 HTTP adapter 和 DB adapter。

### 2.5 Middleware 形成统一横切 pipeline，但实际顺序和能力应准确描述

**源码事实**

- 全局 middleware 在 `app/sdk/mux/mux.go:91-101` 按以下顺序配置：`Otel → Logger → Errors → Metrics → Panics`。
- `foundation/web/middleware.go:8-23` 逆序包裹 middleware，保证 slice 中第一个在请求时最先执行。
- `foundation/web/web.go:45-68` 还在 mux 外包了一层 `otelhttp.NewHandler`，负责从 W3C TraceContext 建立/衔接入口 span。
- route-specific auth/authorization 在路由注册处声明。Product 示例为 `app/domain/productapp/route.go:25-36`：先 `Authenticate`，再按路由选择 `Authorize`/`AuthorizeProduct`。
- `app/sdk/mid/authen.go:21-44` 从 authorization header 调 auth client，并把 UserID/Claims 写入 context；`app/sdk/mid/authorize.go:22-51` 从 context 取身份后调用 authorization client。
- request logging、统一 error conversion、metrics 和 panic recovery 分别位于：
  - `app/sdk/mid/logging.go:15-50`
  - `app/sdk/mid/errors.go:15-54`
  - `app/sdk/mid/metrics.go:11-36`
  - `app/sdk/mid/panics.go:12-37`
- validation 不是独立 middleware。以 create Product 为例，decode 与 DTO→business validation 位于 handler 内 `app/domain/productapp/productapp.go:27-43` 和 `app/domain/productapp/model.go:69-104`。

**纠偏**

不能把当前实现描述成完整的 `RequestID → Trace → Logger → Error → Metrics → Authenticate → Authorize → Validation → Controller`：

- 没有独立 RequestID middleware；主要关联键来自 OpenTelemetry trace（`foundation/web/web.go:45-68`、`app/sdk/mid/otel.go:12-25`）。
- validation 仍在 handler/mapper 内，不是 middleware。
- 当前精确主链更接近：外层 `otelhttp` → `Otel → Logger → Errors → Metrics → Panics` → route auth → route authorization → handler 内 decode/validation → business。

因此应借鉴“横切逻辑有统一 pipeline 与清晰顺序”，而不是把方向锚点中的理想 pipeline 说成上游逐项现状。

### 2.6 Context 的用法同时提供了正例与反例

**源码事实**

- `app/sdk/mid/mid.go:28-76` 在 context 中放 Claims 和 UserID，这是典型 request-scoped identity metadata。
- 同一文件也把完整 `userbus.User`、`productbus.Product`、`homebus.Home` 放入 context（78-118），授权 middleware 查询实体后写入，handler 再读取；Product 例见 `app/sdk/mid/authorize.go:106-160` 与 `app/domain/productapp/productapp.go:46-80`。
- transaction 也被写入 context，见 `app/sdk/mid/mid.go:120-131` 和 `app/sdk/mid/transaction.go:15-62`。
- web foundation 自己还存 tracer 与 `http.ResponseWriter`，见 `foundation/web/context.go:11-45`。

**纠偏**

Ardan 当前源码不能直接证明“context 只放 request/run metadata，不放业务对象”；它明确把完整业务实体放进 context。方向锚点是对参考实现的进一步约束，而不是该 HEAD 的事实复述。可迁移部分应限定为：认证入口把 scoped identity 写入 context、业务方法接收标准 `context.Context`、context 不被用作全局 dependency container。至于是否允许 route-loaded entity 或 transaction，应由目标项目另行收紧。

### 2.7 Cache 是可组合 adapter/decorator，而非业务逻辑

**源码事实**

- `business/domain/userbus/stores/usercache/usercache.go:18-37` 的 Cache Store 包含一个 `userbus.Storer` 并实现同一 Port。
- 写操作先委托被包装 storer，再更新/失效 cache；见同文件 57-88。
- query by ID/email 先查 cache、miss 后委托 storer；见 100-134。
- transaction 下复用同一 cache 但标记 `inTran`，只失效而不写入未提交数据；见 39-54、146-157。
- 是否启用 cache 由 composition root 决定：`api/services/sales/main.go:183-186` 和 `api/services/auth/main.go:151-155` 只给 User Store 包 cache；Product/Home 等没有为了形式统一而强制加 cache。

**判断**

这是“Cache 作为透明 repository decorator、按需求启用”的直接证据。另有 business extension decorator（例如 `business/domain/productbus/extensions/productotel/productotel.go:16-28`）包装 `ExtBusiness` 做 tracing；它说明 decorator 可以作用于不同边界，但不意味着所有横切能力都应放在同一层。

### 2.8 AI 受控写入主线不是 Ardan 示例直接提供的模式

当前 Ardan 示例域是 audit/user/product/home/reporting/auth，没有 `Agent → Proposal → Approval → Executor → Business → Repository` 实现。可以从其 Port、composition root、business API 与 adapter 结构类推如何放置 `ActionExecutor`，但不能把 AI proposal/approval pipeline 归因于该项目的具体源码。

### 2.9 Ardan 可迁移结论

1. runtime 最外层选择并装配 DB、adapter、decorator、business、external client 与 router。
2. 业务包声明自己需要的窄 Port；adapter 实现 Port，业务不 import adapter。
3. transport primitive、业务强类型、DB row type 分开，并在边界内映射。
4. middleware 有一处定义的全局顺序，路由只追加 auth/authorization 等局部策略。
5. cache 由 composition root 按需套在 repository 上。
6. 不应照抄其目录名，也不应照抄 context 中携带完整实体和 transaction 的做法。

## 3. usememos/memos 源码核验

### 3.1 契约确实是系统的“腰”，但真值源是 Proto，不是 Zod

**源码事实**

- API contract 的手写来源是 `proto/api/v1/*.proto`。例如 `proto/api/v1/memo_service.proto:17-147` 同时声明 service、RPC request/response 与 HTTP annotations；message/enum 从 149 行继续定义。
- `proto/api/v1/auth_service.proto:13-114` 同样在一处定义 Auth RPC、HTTP path、credentials oneof、response 和 token 时间字段。
- `proto/buf.gen.yaml:10-29` 从同一 proto 生成：
  - Go protobuf；
  - Go gRPC；
  - Go Connect；
  - gRPC-Gateway；
  - OpenAPI；
  - 前端 TypeScript（输出到 `web/src/types/proto`）。
- 前端直接 import 生成的 service/type/schema，例如 `web/src/connect.ts:1-12,184-203` 和 `web/src/hooks/useMemoQueries.ts:12-16`。
- Buf lint 与 breaking policy 在 `proto/buf.yaml:1-19`；生成入口记录在 `proto/README.md:1-16`。

**纠偏**

“Contract 是系统的腰”成立，但 Memos 当前技术实现是 `Proto → generated Go/TS/Connect/Gateway/OpenAPI`，不是 `Zod Schema → inferred TypeScript → RpcMap`。对 TypeScript 项目可借鉴“一个 schema 生成/推导多个 transport consumer”，不应把 Zod 当成 Memos 的源码事实。

### 3.2 Connect 是 adapter，且与 gRPC-Gateway 复用同一 service 实现

**源码事实**

- `server/router/api/v1/connect_handler.go:14-29` 的 `ConnectServiceHandler` 包装已有 `APIV1Service`，注释也明确目标是复用 gRPC service implementation。
- `server/router/api/v1/connect_handler.go:31-51` 用生成的 `apiv1connect.New*ServiceHandler` 注册所有 Connect service。
- 具体方法只解包 Connect request、调用同一个 `APIV1Service`、转换错误并包装 response；Memo 示例在 `server/router/api/v1/connect_services.go:306-346`。
- `server/router/api/v1/v1.go:92-185` 同时注册：
  - gRPC-Gateway generated handler 直接指向 `s`（138-161）；
  - Connect wrapper 指向 `NewConnectServiceHandler(s)`（170-183）。
- runtime 只构造一个 `APIV1Service`：`server/server.go:76-89`。

**判断与限制**

“多个 transport 汇聚到同一逻辑实现”有直接证据，Connect adapter 没有复制 Memo CRUD。限制是汇聚点 `APIV1Service` 不是干净的 Application Port；它同时是生成的 gRPC server interface implementation 和业务编排对象。因此应借鉴 adapter convergence，不应照抄其层级放置。

### 3.3 Memos 的 APIV1Service 是明确的反例：Transport、规则、Store 与 side effect 混合

**源码事实**

- `server/router/api/v1/v1.go:27-50` 的单个 `APIV1Service` 同时嵌入八个 generated server，直接持有 concrete `*store.Store`、Markdown service、SSEHub、notification sender、semaphore 和 stats cache。
- 构造器自己创建 Markdown service、SSEHub 和 semaphore，见 `server/router/api/v1/v1.go:52-67`；依赖没有全部由最外层注入。
- `CreateMemo` 同时做：当前用户加载、输入/内容长度校验、proto→store mapping、markdown payload、attachment/relation preparation、Store 写入、错误文本识别、Webhook、SSE 等，见 `server/router/api/v1/memo_service.go:83-190` 及后续方法尾部。
- `UpdateMemo` 在一个 service method 中处理 update mask、授权、业务规则、payload rebuild、attachment/relation mutation、notification 和 side effect，见 `server/router/api/v1/memo_service.go:424-589`。
- `DeleteMemo` 自己加载 reactions/attachments、发 webhook、删除 comments、删除 memo、广播 SSE，见 `server/router/api/v1/memo_service.go:592-666`。

**判断**

这验证了“不要照抄 APIV1Service”的方向。Memos 解决了 transport 复用，却没有形成独立 Application Use Case/Port；因此 transport convergence 与 application separation 必须作为两个不同目标评估。

### 3.4 Authentication 在入口统一完成，context 主要携带身份；完整 User 按需加载

**源码事实**

- Connect pipeline 在 `server/router/api/v1/v1.go:170-180` 配置 Metadata、Logging、Recovery、Auth interceptor。
- `server/router/api/v1/connect_interceptors.go:205-230` 的 Auth interceptor 从 request header 取 Authorization，经共享 Authorizer 完成 authenticate/access check，再调用 `auth.ApplyToContext`。
- gRPC-Gateway 走同一个 Authorizer：`server/router/api/v1/v1.go:92-137` 先认证与 access check，再将 identity 写入 request context。
- `server/auth/context.go:13-28` 定义 UserID、AccessToken、UserClaims、RefreshTokenID 等 context key；`ApplyToContext` 在 85-99 行写入身份。即使 PAT 认证得到 `*store.User`，`SetUserInContext` 也只写 UserID 和 token（48-60），不把完整 User 放入 context。
- access token claims 是轻量 identity snapshot（UserID、Username、Role、Status），见 `server/auth/context.go:63-83`。
- 业务方法需要完整 User 时，通过 context UserID 再查 Store；`server/router/api/v1/auth_service_session.go:246-263` 的 `fetchCurrentUser` 是集中示例。
- token parsing/credential resolution 位于 `server/auth/extract.go:8-32` 和 `server/auth/authenticator.go:17-225`，而不是散落在 Memo CRUD method 中。

**判断与限制**

这一实现接近 `Principal → context → 按需 User lookup`。不过 claims 内含 role/status，且 service method 仍自行做角色/owner authorization（例如 `server/router/api/v1/memo_service.go:445-455`）；所以“入口 authentication”成立，“所有 authorization 都在 middleware”并不成立。

### 3.5 Server State 收敛到 React Query，实时事件也走 Query Cache；但并非完全禁止手工 cache patch

**源码事实**

- 单一 `QueryClient` 在 `web/src/lib/query-client.ts:1-29` 配置，并由 `web/src/main.tsx:62-80` 的 `QueryClientProvider` 提供给应用。
- Memo query key factory、queries 与 mutations 集中在 `web/src/hooks/useMemoQueries.ts:18-34,126-159,187-279`。
- create/update/delete mutation 的后续动作通过 `setQueryData`、`setQueriesData`、`removeQueries`、`invalidateQueries` 操作 query cache，而不是维护另一份页面级 server object；见 `web/src/hooks/useMemoQueries.ts:187-279`。
- update mutation 做完整 optimistic flow：cancel、snapshot、patch、rollback、server response reconciliation、invalidate，见 `web/src/hooks/useMemoQueries.ts:206-259`。
- SSE change event 最终同样只驱动 memo/user query key 的 remove/invalidate，见 `web/src/hooks/useLiveMemoRefresh.ts:471-505`。

**纠偏与风险**

- Memos 并非“不手工改 cache”：`patchMemoInCollectionQueries` 会遍历所有 memo collection queries 并 patch，见 `web/src/hooks/useMemoQueries.ts:36-124`，update 还同时写 detail cache 与 collection caches（230-250）。这是有 rollback 的 optimistic update，不是随意组件 state，但维护成本仍真实存在。
- cache invalidation 也未完全收敛到一个唯一 mutation layer。编辑器保存流程在 `web/src/components/MemoEditor/hooks/useMemoSave.ts:52-74` 再次手工 invalidates lists/stats/detail/comments，与 `useMemoQueries` 有重叠策略。

因此可借鉴的准确表述是：server state 的 authority 统一为 React Query cache，mutation/SSE 都通过 query keys 收敛；对于复杂 optimistic update，仍需显式维护多个 cache projection，并应防止 invalidation policy 四处分散。

### 3.6 DB model 与 API Proto 分离，但 Store 不是按业务能力划分的窄 Repository Port

**源码事实**

- Store model 自己定义在 `store/*.go`。例如 `store/user.go:10-86` 的 `User/FindUser/UpdateUser` 与 API proto message 分开；Memo 对应 `store/memo.go`。
- API 与 Store 的类型转换是显式的，例如 state 转换在 `server/router/api/v1/common.go:20-37`，Memo create mapping 在 `server/router/api/v1/memo_service.go:100-105`，更完整 response conversion 位于 `server/router/api/v1/memo_service_converter.go`。
- database engine behind interface：`store/driver.go:8-88` 定义 `Driver`，`store/db/db.go:13-31` 按 profile 选择 sqlite/mysql/postgres adapter。
- 最外层创建链为 `cmd/memos/main.go:56-76`：profile → DB Driver → `store.New` → migration/config → `server.NewServer`。
- `store.Store` 是一个持有 Driver、profile、locks 与多个 cache 的 concrete facade，见 `store/store.go:12-62`。
- API service 直接依赖 `*store.Store`，见 `server/router/api/v1/v1.go:37-43`，而不是依赖每个 use case 所需的 `MemoRepository`/`UserRepository` interface。
- `Driver` 是覆盖 attachment/memo/relation/settings/user/idp/inbox/reaction/share/identity 的宽接口，见 `store/driver.go:8-88`。

**判断与纠偏**

“DB row/store model 不等于 API contract”成立，且多数据库实现被 Driver 隔离。但若把目标定为 Application/Domain 依赖窄 Repository Port，Memos 不是完整正例：上层依赖 concrete broad Store，底层 Driver 也是系统级宽接口。它更像 active-record-free 的 Store facade，而不是 capability-owned repository ports。

### 3.7 Memos 的 cache 也说明为何不能机械推广 cache pattern

`store/store.go:25-62` 直接在 broad Store 内构造 instance/user/user-setting cache，cache 并非独立 decorator；这与 Ardan 的 `usercache.NewStore(storer)` 模式不同。Memos 只缓存选定对象，仍支持“按需求加 cache、不必给每个 repository 加 cache”的结论，但不支持“所有 cache 都已实现为透明 decorator”。

### 3.8 Memos runtime 具有外层装配，但不是彻底的 composition root

**源码事实**

- `cmd/memos/main.go:36-76` 构造 profile、DB driver、Store、Server，是主 composition root。
- `server/server.go:44-98` 又在 Server 内创建 Echo、APIV1Service、file/RSS/MCP services 并注册 routes。
- `server/router/api/v1/v1.go:52-67` 的 APIV1Service 构造器继续内部创建 Markdown/SSE/semaphore。

**判断**

Memos 有清晰启动链，但依赖构造分布在 main、Server、APIV1Service 三层。它适合说明 runtime bootstrap 如何串起系统，不适合作为“所有 adapter 都在最外层注入”的严格范本。

### 3.9 Memos 可迁移结论

1. 让一个 schema source 同时生成后端、前端和多 transport contract；本项目的具体 source 是 Proto。
2. Connect/Gateway adapter 可以复用同一操作实现，避免每种 transport 复制业务流程。
3. authentication policy 可以被不同 transport 共享，并把轻量 identity 放入 context。
4. React Query cache 可作为 server state authority；HTTP mutation 与 SSE event 都指向同一 query-key 体系。
5. API Proto 与 Store model 应显式转换。
6. 不应照抄胖 `APIV1Service`、concrete broad `*store.Store` 依赖、超宽 `Driver`，也不应忽略 optimistic cache patch 本身的复杂度。

## 4. 对方向锚点的逐条核验矩阵

| 方向                                    | 源码核验                     | 最准确的表述                                                                                                           |
| --------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Runtime ≠ Domain                        | 支持                         | Ardan 的 Sales/Auth runtime 装配多个独立 business domain；目录名是实现细节。                                           |
| Composition Root 最外层                 | Ardan 强支持；Memos 部分支持 | Ardan main 主导 DB/store/business/client/router 装配；Memos 的构造责任还下沉到 Server/APIV1Service。                   |
| Business 依赖 Port                      | Ardan 强支持                 | 五个 business 包都拥有 `Storer`；但 transaction/logger 等概念仍进入 business API。                                     |
| 跨层允许类型转换                        | 强支持                       | Ardan 有 HTTP primitive、business VO、DB row；Memos 有 API Proto、Store model、DB adapter。                            |
| Middleware 管横切能力                   | 支持但需纠偏                 | Ardan 有统一 Otel/Logger/Error/Metrics/Panic 与 route auth；没有独立 RequestID/validation middleware。                 |
| Context 只放执行元数据                  | Memos 较支持；Ardan 反证     | Memos 主要放 identity/claims；Ardan 还放 User/Product/Home 与 transaction，不能作为该约束的直接范本。                  |
| Cache 是 Decorator                      | Ardan 支持；Memos 不同实现   | Ardan User cache 实现同一 Storer decorator 且按需装配；Memos 把选定 cache 内置在 Store。                               |
| AI 写入走 Proposal/Approval/Executor    | 两项目均无直接证据           | 这是目标系统应自行强化的安全架构，不能声称从当前参考源码直接验证。                                                     |
| Contract 是系统的腰                     | Memos 强支持                 | 真值源是 Proto/Buf，不是 Zod；同源生成 Go、Connect、Gateway、OpenAPI、TS。                                             |
| Transport 是 Adapter                    | Memos 支持                   | Connect 与 Gateway 复用 APIV1Service；但 convergence point 仍过胖，不等于独立 Application Port。                       |
| Authentication 在入口完成               | Memos 强支持                 | 多 transport 共用 Authorizer，context 放 ID/claims，完整 User 按需查 Store；细粒度 authorization 仍有 service 内判断。 |
| Server State 统一 Query Cache           | Memos 强支持但非零复杂度     | QueryClient 是 authority，SSE 也 invalidate cache；optimistic update 仍会手工 patch detail/list projections。          |
| Database Model 是 infrastructure detail | 部分支持                     | API/Store 类型确实分离；但 Memos 上层直接依赖 concrete broad Store，未形成 capability-owned repository ports。         |

## 5. 用于后续架构评审的引用建议

后续主报告引用参考项目时，建议采用以下限定语，避免过度归因：

- “借鉴 Ardan 的 runtime composition root 和 consumer-owned Storer Port”，而不是“照搬 Ardan 目录结构”。
- “借鉴 Ardan 的 edge/domain/persistence mapper”，并明确它使用强业务 VO。
- “借鉴 Ardan 的统一 middleware 顺序”，但把 RequestID、validation 等标为目标设计，而非上游现状。
- “将 context 收紧为 metadata 是对 Ardan 的改良”，因为其当前实现还会携带完整业务实体。
- “借鉴 Memos 的 Proto 单一契约与多 adapter 生成链”，若目标仓库使用 Zod，则说明是同一原则的 TypeScript 实现，不要归因成 Memos 使用 Zod。
- “借鉴 Memos 的 Connect/Gateway convergence”，同时把 `APIV1Service` 的职责混合列为反例。
- “借鉴 Memos 的 QueryClient/SSE convergence”，但承认 optimistic update 与分散 invalidation 的维护成本。
- “借鉴 Memos 的 API/Store model 分离”，不把其 broad Store/Driver 描述成理想的 per-domain Repository Port。
