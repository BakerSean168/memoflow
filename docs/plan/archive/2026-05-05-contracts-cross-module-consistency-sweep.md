# Contracts 跨模块一致性收敛实施计划

> 创建时间: 2026-05-05
> 状态: 已完成并通过本轮验收。所有目标模块已完成 branded ID 收口、transport contract 分层、route/OpenAPI schema 归位，以及 route contract 级测试补齐。当前仅保留少量有意识设计的自由 JSON 字段，用于错误详情、动态 metadata、调度 payload/result 和用户可扩展偏好补丁。
> 目标层级: `packages/contracts` + 直接消费这些 contract 的业务包
> 归档说明：本轮 contracts 一致性收敛已验收完成，本文仅保留为历史执行记录。

## 文档定位

这份文档是当前 contracts 一致性收敛的唯一实施主计划。

它解决的问题不是单个模块的局部类型修补，而是把所有模块统一到同一套 contract 规则下，消除以下长期漂移：

1. branded ID 使用不一致
2. aggregate/entity DTO 与 API request/response contract 混层
3. OpenAPI / route schema 与 TypeScript DTO 不是同一套真值
4. 各模块零散使用 `readonly`
5. 路由层仍存在 `z.any()` / `z.object({}).passthrough()` 占位 schema

这份计划在主题上承接但不重复以下旧计划：

- `2026-05-02-contracts-governance-optimization.md`
- `2026-05-03-contracts-persistence-dto-removal.md`

其中前者偏治理审计，后者偏 PersistenceDTO 清理；本计划聚焦"contracts 作为跨模块公共接口"的最终一致性收敛。

## 当前真值

### 已确认的全局问题

基于 `packages/contracts/src/modules` 的抽样与全量搜索，当前存在四类系统性问题：

### 1. DTO 层 semantic ID 漂移

- 多个模块已经定义了 branded primitive，但 DTO 仍写成 `id: string`
- 同一模块内部经常出现 API schema 已用 `brandedId<T>()`，而 DTO/interface 仍是裸 `string`
- 典型模块：`task`, `notification`, `repository`, `schedule`, `editor`, `reminder`, `goal` 的局部子类型

### 2. transport contract 放错层

- 一些 request/response 类型定义在 `aggregates/` 或 `entities/` 下，而非 `api/`
- 典型例子是 `task-dependency-client.ts` 同时承载客户端 DTO 与 API request/response
- 这会导致模块主入口导出面混乱，消费方无法从目录结构判断类型的语义层级

### 3. response schema 与实际返回体脱节

- 某些模块已有 `api/response-schemas.ts`，但 schema 只是"精简影子响应"，并不真正等价于 controller 返回体
- 某些路由仍在本地手写 schema，而不是从 `contracts` 导入
- 结果是 OpenAPI、TypeScript、controller、client adapter 各自维护一份平行真值

### 4. contract 缺口仍用占位 schema

- 多个路由仍使用 `z.any()` 或 `z.object({}).passthrough()`
- 这意味着接口虽然存在，但 contracts 尚未正式表达其请求体或响应体
- 典型集中区域：`ai`, `reminder`, `repository`, `schedule`, `goal` 的个别子路由

## 本轮统一决策

这些决策在本轮执行中视为固定规则，不再在实施阶段重新讨论。

### 1. semantic ID 规则

- aggregate DTO、entity DTO、API request/response、route params/query/body、domain event、protocol event payload 中，只要字段语义上是已知实体 ID，就统一使用 branded primitive
- 运行时 wire format 仍然是字符串；变更只发生在 TypeScript 类型和 Zod schema 约束层
- 若字段确实是"外部系统自由字符串标识"，而不是本仓库受控实体 ID，则保持 `string`

### 2. DTO 分层规则

- `aggregates/` 只放聚合根 server/client DTO
- `entities/` 只放实体 DTO
- `value-objects/` 只放值对象 DTO 和类型
- `api/` 只放 transport request/response contract 与 Zod schema
- `domain/events/` 只放事件 payload interface
- `protocol/` 只放 RPC map、event map、transport mapping

### 3. response schema 规则

- 正式对外响应必须有命名 schema，不允许路由层保留匿名 `z.object(...)` 真值
- 若 API 故意返回聚合 DTO 的投影，则定义单独 API response type，而不是让 schema 偷偷精简 DTO
- `response-schemas.ts` 中的 schema 应尽量通过 `z.ZodType<T>` 绑定到已有 DTO，避免同义平行结构

### 4. `readonly` 规则

- 普通 DTO、request、response 默认不加 `readonly`
- 只有明确表达不可变值对象或只读集合语义时才使用
- 若确实需要只读数组，写成 `readonly T[]`，而不是只给属性本身加 `readonly`

### 5. 占位 schema 规则

- 路由层不允许新增 `z.any()` / `passthrough()` 作为正式 contract
- 现有占位 schema 必须在本轮补成命名 contract，哪怕该 contract 是 API-only projection

## 模块分层现状与处理策略

### A. 参考模块

这些模块已经部分接近目标模式，优先作为收敛模板：

- `goal`
- `account`
- `authentication`
- `setting`

处理方式：

- 修剩余裸 ID
- 修局部 request/response 不一致
- 保持现有目录结构，不做大规模搬迁

### B. 中度漂移模块

这些模块已有 `api/response-schemas.ts`，但 schema 与 DTO 或路由真值仍有分裂：

- `task` ✅ 已完成
- `reminder`
- `repository`
- `schedule`
- `editor`
- `notification`

处理方式：

- 先统一 DTO 语义和 API contract 分层
- 再让路由只依赖 contracts 导出的 schema
- 最后删除路由本地 schema 与过时类型别名

### C. contract 缺口模块

这些模块仍较多依赖 `z.any()` 或匿名 schema：

- `ai`
- `dashboard`
- `goal` 的个别子路由
- `repository` / `reminder` / `schedule` 的部分扩展接口

处理方式：

- 不强行复用 aggregate DTO
- 为每个真实响应定义 API-only DTO 与 schema
- 保持业务行为不变，只补 contract 表达

## 实施顺序

本轮不按"目录统一改完再修消费者"的方式推进，而按可工作的垂直切片推进。每一波结束后代码库都必须保持可编译状态。

### Wave 1: 基线规则落地 + task 端到端收敛 ✅ 已完成

`task` 作为第一批，是因为它同时具备四类问题：裸 ID、混层、schema 影子化、路由本地重复定义。

目标：

- 修正 `TaskInstance*`, `TaskTemplate*`, `TaskDependency*` 相关 DTO 的 branded ID
- 把 dependency request/response 从 `aggregates/` 移到 `api/`
- 统一 `task/api/*.dto.ts`、`response-schemas.ts`、route schema、controller 返回类型
- 删除 `task` 路由中的本地 response schema 真值

产出标准：

- `@memoflow/contracts/task` 对外导出的 request/response/DTO 层级清晰
- route/OpenAPI/adapter/controller 返回体同名 contract 一致

#### Wave 1 实际执行记录

**第一轮：基础 branded ID + 类型分层**

| 步骤 | 范围                               | 操作                                                                                                                           |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1.1  | aggregates/*.ts (6 files)          | 裸 `id: string` → branded primitive（`TaskTemplateId`, `TaskInstanceId`, `TaskDependencyId`, `IdentityId`, `TaskFolderId` 等） |
| 1.2  | entities/*.ts (2 files)            | `SubtaskServerDTO.id` → `SubtaskId`                                                                                            |
| 1.3  | api/task-dependency.dto.ts         | **新建**：将 `CreateTaskDependencyRequest` 等 transport 类型从 `aggregates/` 搬入                                              |
| 1.4  | aggregates/index.ts                | 删除已搬迁的 transport 类型导出，解决 TS2308 重复导出                                                                          |
| 1.5  | domain/events/*.ts (14 files)      | 事件 payload 的 `identityId`, `templateId`, `goalId` 等切 branded                                                              |
| 1.6  | value-objects/task-goal-binding.ts | `goalId: string` → `GoalId`, `keyResultId` → `KeyResultId`                                                                     |
| 1.7  | api/response-schemas.ts            | `TaskDependencyResponseSchema` 用 `brandedId<T>()` 替换 `z.string()`                                                           |
| 1.8  | api/task-template.dto.ts           | `templateId: z.string().optional()` → `brandedId<TaskTemplateId>().optional()`                                                 |
| 1.9  | task-dependency.routes.ts          | 删除所有 inline schema，改为从 contracts 导入                                                                                  |

**消费者修复**：约 27 个编译错误通过 `as BrandType` cast 修复，涉及 domain-server aggregates、mappers、stores、mocks。

**第二轮：用户反馈的 5 个关键问题修复**

用户反馈第一轮结果"方向对了，但不能算完成"，指出 5 类残留问题：

| #   | 问题                                                  | 修复                                                                                                          |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 9   | Response schema 是影子结构                            | 重写 `TaskTemplateResponseSchema` / `TaskInstanceResponseSchema` 为完整 DTO 对齐                              |
| 10  | `CreateTaskDependencyRequest` 混合 transport/internal | 拆分为 `CreateTaskDependencyBody`（transport）与 `CreateTaskDependencyRequest`（internal with identityId）    |
| 11  | Dependency 返回类型三套不一致                         | controller 返回 ServerDTO → ClientDTO；use case 加 `dependencyServerToClientDTO()` 转换；response schema 对齐 |
| 12  | `readonly` 不统一                                     | 从 dependency client DTO 移除所有 `readonly`，对齐 template/instance DTO                                      |
| 13  | 路由层仍有 inline schema                              | controller 导入 contracts schemas 替代本地定义；route query `folderId/goalId/templateId` 切 branded           |

**第三轮：深层 contract 一致性修复**

用户反馈第二轮"明显进步，但公开 contract 仍不一致"，指出 4 个残留问题：

| #   | 问题                                                                | 修复                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15  | by-date-range 的 contracts/client/runtime 三层不一致                | 最终统一为"时间戳 number"：`GetTaskInstancesByRangeSchema`、client port、HTTP/IPC adapter、controller 全部对齐                                                                                                                                                                      |
| 16  | `TaskDependencyClientDTO` 的 `version`/`deletedAt` 是硬编码假值     | 从 DTO、converter、response schema 中彻底移除这俩字段（server DTO 根本没有）                                                                                                                                                                                                        |
| 17  | Response schema 嵌套值对象 shape 错误                               | `TaskTimeConfigSchema` → 匹配 `TaskTimeConfigDTO`（timeType/startDate/timePoint/timeRange）；`RecurrenceRuleSchema` → 匹配 `RecurrenceRuleDTO`（daysOfWeek 替代 byWeekDay/byMonthDay）；`TaskReminderConfigSchema` → 匹配 `TaskReminderConfigDTO`（triggers 替代 offsets/channels） |
| 18  | Template list/graph query 与 `ListTaskTemplateFiltersSchema` 不一致 | route query schema 改为导入 `ListTaskTemplateFiltersSchema`（status/tags 为数组）；`parseTemplateFilters` 不再逗号拆分                                                                                                                                                              |

**第四轮：传输面收口 + client port / adapter 一致性修复**

第三轮之后，又暴露出一类更隐蔽的问题：contracts、route、controller 已经对齐，但 application-client port、HTTP adapter、IPC adapter、前端调用点仍然保留旧 shape。

| #   | 问题                                                                                                         | 修复                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 19  | `check-expired` 在 route/controller 返回数组，但 client port / adapter / service 期望 `{ count, instances }` | 把该接口统一为命名 object response；HTTP、IPC、controller、response schema 同步对齐                       |
| 20  | `templateApi.getInstancesByDateRange()` 方法名和真实路由语义不一致                                           | 给 `GET /task-templates/:id/instances` 补上 `from/to` query 过滤，并让 HTTP/IPC/controller 都复用同一语义 |
| 21  | `TaskTemplateListParams` 仍是本地影子接口                                                                    | 让其以 `ListTaskTemplateFilters` 为核心对齐，前端调用点同步改为传 `status[]`                              |
| 22  | request 值对象 schema 用 `z.custom()` 伪校验                                                                 | 改为真实字段级 Zod schema，并作为 request/response 共用真值                                               |
| 23  | `ValidateDependencyResponse` 只在 contracts 层存在，application 仍自定义 `ValidateDependencyResult`          | use case / controller 改为直接复用 contracts 类型，消除影子返回类型                                       |
| 24  | 路由 contract 没有专项测试，编译通过也抓不住 shape 漂移                                                      | 将 route contract 级测试纳入每波固定任务，作为与 typecheck / build 并列的必做项                           |

#### Wave 1 关键经验教训

##### 1. "影子 schema"陷阱

第一轮修复后，我们以为 `response-schemas.ts` 已经与 DTO 对齐，但实际上只是把"旧影子"换成了"新手写影子"。**正确做法**：逐字段核对 schema 与实际 DTO interface，特别是嵌套值对象。值对象 schema 必须从 value-objects/ 目录的真实定义导出或与其严格一致。

##### 2. Server DTO 与 Client DTO 的字段差异常被忽略

Dependency 的 ServerDTO 没有 `version`/`deletedAt`，但 ClientDTO 声明了它们。converter 硬编码假值会导致静默错误。**规则**：如果某个字段在 server 端不存在，client DTO 也不应该声明它，除非明确是 API-only projection。

##### 3. Transport/Internal 类型混用

`CreateTaskDependencyRequest` 包含 `identityId`（由 Context 注入，不属于外部请求体）。**规则**：transport body 不含 identityId；internal input 含 identityId。两者必须是独立类型。

##### 4. Route query 的类型与 contracts schema 必须一致

`GetTaskInstancesByRange` 这次最终说明：**不能只修 route 解析逻辑，必须先确定 canonical wire format**。本仓库 task/schedule/goal 的时间字段大多数是时间戳 number，因此 date-range query 最终也应统一成 number，而不是让 contracts 用 ISO string、adapter 用 number、route 再临时转换。**规则**：query 的 runtime 表达必须先选定 canonical 形状，再同步到 contracts、port、adapter、controller。

##### 5. `brandedId<T>()` 返回 `ZodType<T>` 不是 `ZodString`

`brandedId<T>().min(1)` 会编译失败。branded ID schema 已经内置格式校验，不需要 `.min()`。

##### 6. 跨层修改的级联效应

branded ID 扩散到 aggregate DTO 后，下游 ~27 个文件出现编译错误（mappers、stores、mocks）。**缓解方式**：批量用 `as BrandType` cast 快速修复，后续再逐步用真正的类型安全方式替换。

##### 7. 不能只看 contracts + route，还要审 application-client / HTTP / IPC 三层

`check-expired` 和 `templateApi.getInstancesByDateRange()` 都属于这一类：表面上 route/controller 看起来已经统一，但 application-client port、HTTP adapter、IPC adapter 仍然保留旧 shape。**规则**：每波都要把 `contracts -> route -> controller -> application-client port -> HTTP adapter -> IPC adapter -> UI caller` 整条链路扫一遍。

##### 8. Route 路径语义与 client 方法名也必须对齐

`getInstancesByDateRange(templateId, from, to)` 指向的真实路由原本只是“按模板列出实例”，并不支持 date range。**规则**：除了类型一致，还要检查“方法名表达的能力”和“真实路由 query/params/行为”是否一致；必要时补齐路由 query，而不是只改类型。

##### 9. `check-expired` / list 响应这类集合接口要特别审计 object-vs-array

这类问题编译器很难兜住，因为 route 层成功返回 `Result<T>` 依旧能构建通过。**规则**：所有“集合型接口”必须显式确认返回的是 `T[]` 还是 `{ total/count/items }` 这一类对象，且 contracts、response schema、controller、HTTP/IPC adapter 保持完全一致。

##### 10. Route contract test 必须成为固定动作，而不是可选补充

`contracts:typecheck` 和 `task:build` 能发现类型错误，但抓不住 route 注册仍指向旧 schema、响应 shape 从 object 退化成 array、query schema 又被本地手写回去。**规则**：每波至少新增或更新该模块的 route contract 级测试，覆盖代表性 endpoint。

### Wave 2: response-schema 已存在但影子化的模块

顺序：

1. `reminder`
2. `repository`
3. `schedule`
4. `editor`
5. `notification`

每个模块统一执行以下步骤（参考 Wave 1 经验）：

1. 修 DTO bare ID
2. 明确哪些响应是 aggregate DTO，哪些是 API projection
3. 把 request/response 类型从错误目录搬到 `api/`
4. 用 `response-schemas.ts` 中的 schema 对齐真实 DTO（**特别注意嵌套值对象**）
5. 改路由导入，删除本地 schema
6. **关键检查**：controller 返回类型与 client port / HTTP adapter / IPC adapter 期望类型是否一致
7. **关键检查**：route query schema 是否直接导入 contracts 定义，且 wire format 已选定 canonical 形状
8. **关键检查**：client 方法名表达的语义与真实路由 params/query/行为是否一致
9. 新增或更新 route contract 级测试
10. 运行 typecheck + build + 最近的 route contract test

#### Wave 2 新增检查清单（来自 Wave 1 经验）

在 Wave 1 的 10 步基础上，增加：

- [ ] 值对象 schema 核对：逐字段比对 `response-schemas.ts` 中的嵌套 schema 与 `value-objects/` 下的真实定义
- [ ] Server/Client DTO 字段差审计：确认没有字段只在 ClientDTO 声明但 ServerDTO 不存在
- [ ] Transport/Internal 类型分离审计：确认 transport body 不含 `identityId`
- [ ] Route query 直接导入 contracts：确认无本地手写 schema 与 contracts 定义重复
- [ ] `readonly` 一致性：确认本模块 DTO 与全局规则一致（默认不加）
- [ ] client transport 链路审计：`application-client port`、HTTP adapter、IPC adapter 是否仍保留旧影子类型
- [ ] 端点语义审计：方法名表达的能力与真实路由 query/params/行为是否一致
- [ ] 集合响应 shape 审计：确认 `T[]` vs `{ count/total/items }` 不存在跨层分裂
- [ ] route contract test：至少覆盖 1 个列表接口、1 个详情接口、1 个 mutation 接口

### Wave 3: 参考模块补齐残差

顺序：

1. `goal`
2. `account`
3. `authentication`
4. `setting`

目标：

- 清理残余 `string` ID 与不必要的 `readonly`
- 校对 event payload、protocol map、API schema 是否仍有局部漂移
- 让这些模块成为后续新模块开发时的参考标准

### Wave 4: contract 缺口收口

顺序：

1. `ai`
2. `dashboard`
3. 前三波中仍残留匿名 schema 的边角接口

目标：

- 补齐 `z.any()` / `passthrough()` 对应的正式 request/response contract
- 不改变行为，只把接口形状显式化

### Wave 5: 横向消费者对齐与死导出清理

覆盖：

- 各业务包 controller
- route 注册层
- application-client ports / adapters
- 直接从 `@memoflow/contracts/*` 导入这些类型的 UI / client package

目标：

- 删除因分层调整产生的过时导出
- 修正导入路径与命名
- 确保没有消费方继续依赖旧位置的 transport type

## 每波的固定操作步骤

每个模块进入实施时，必须按同一顺序执行：

1. 先审计该模块的 aggregate DTO、entity DTO、API DTO、response schema、route schema
2. 列出 semantic ID 字段并全部切到 branded primitive
3. 把 transport-only 类型搬到 `api/`
4. 决定每个响应是 aggregate DTO 还是 API projection
5. 用命名 schema 替换所有本地匿名 response/request schema
6. 调整 controller / adapter / port 返回类型对齐 contracts
7. 删除旧导出、重复别名、无主类型
8. 更新 HTTP adapter、IPC adapter、application-client port 与前端调用点，确认无影子 contract
9. 为该模块补 route contract 级测试
10. 运行最近的 typecheck / lint / route contract test
11. **嵌套值对象 schema 核对**（Wave 1 教训）
12. **Server/Client DTO 字段差审计**（Wave 1 教训）
13. **Route query schema 直接导入 contracts**（Wave 1 教训）
14. **端点语义审计**：方法名、路由 path、query/params、controller 行为一致
15. **集合响应 shape 审计**：`T[]` vs `{ count/total/items }` 跨层一致

## Public Contract 变更策略

### 允许的变更

- `string` ID 改为 branded ID
- request/response 类型移动到新的 `api/*.dto.ts`
- response schema 字段补全到真实返回体
- 用新的 API-only projection 类型替代误导性的影子 schema

### 不做的变更

- 不改 HTTP 路径
- 不改业务行为
- 不改数据库持久化格式
- 不引入兼容层或双轨 contract

### 导出面规则

- 模块主入口继续从 `index.ts` 聚合导出
- 但主入口不再把错误层级的类型继续暴露为"看不出语义来源"的平铺导出
- 必要时通过重命名或重新组织 export，避免 aggregate 与 API type 同名冲突

## 测试与验证

### 每个模块完成后至少验证

1. 该模块的 contracts typecheck / build
2. 直接消费该模块 contract 的业务包 typecheck
3. 新增或更新 route contract 级测试，不再只满足于 controller test
4. 若本模块有 response schema，则校对 route 注册是否只引用 contracts schema
5. 至少覆盖 1 个 query endpoint、1 个详情 endpoint、1 个 mutation endpoint 的 contract 注册断言

### Route Contract Test 固定要求

每个模块至少补一组 route contract 级测试，断言：

1. route 注册使用的是 `packages/contracts` 导出的命名 schema，而不是路由本地匿名 schema
2. params / query / body / success response 都绑定到预期 contract
3. 列表接口的 response shape（数组 vs object）与 controller / client port 一致
4. 若模块存在 `response-schemas.ts`，测试中要覆盖至少一个使用该 schema 的 endpoint
5. 若模块存在 date-range / filters 类 query，测试中要覆盖其 query schema 来源与 canonical wire format

### 本轮全局验证

- `pnpm nx run contracts:typecheck`
- `pnpm nx run contracts:build`
- 各受影响业务包最近的 `typecheck`
- `pnpm nx run memoflow:governance-check`

### 必做的静态检查

- 搜索 `packages/contracts/src/modules` 中仍残留的 `readonly id:`、`id: string`、`identityId: string`、`templateId: string` 等语义 ID 漂移
- 搜索路由中残留的 `z.any()` 和 `passthrough()`，确认只剩下有意识保留的极少数外部自由结构
- 搜索 route 本地 `const FooResponseSchema = z.object(...)`，确认正式 contract 已迁回 `packages/contracts`
- **新增**：搜索 `response-schemas.ts` 中的嵌套 schema，逐字段比对 `value-objects/` 定义
- **新增**：搜索 `Number(req.query.`、`new Date(req.query.` 等模式，确认 route query 不是在用本地补丁弥补 contracts 漂移
- **新增**：搜索 application-client port / HTTP adapter / IPC adapter 中是否仍存在与 contracts 同名但不同 shape 的影子类型
- **新增**：搜索 `count:` / `total:` / `items:` / `instances:` / `data:` 等集合响应包装，确认数组与对象 shape 没有跨层分裂

## 风险与约束

### 主要风险

1. branded ID 扩散后，消费方会出现大量编译错误
2. response schema 补全后，可能暴露 controller 当前返回体与 OpenAPI 文档长期不一致的问题
3. transport type 搬迁后，部分 client adapter / port / UI store 的导入路径会失效

### 缓解方式

- 按波次逐模块推进，不做全仓一次性大爆炸修改
- 每个模块完成后立即修其直接消费方
- 优先保留现有运行时字段名，尽量把改动限制在类型层和 schema 归位

## 验收标准

满足以下条件时，本计划可视为完成：

1. 所有模块的 semantic ID 在 DTO / API / event 层统一使用 branded primitive
2. `aggregates/` 与 `entities/` 中不再混入 transport-only request/response 类型
3. 所有正式对外接口都由 contracts 命名 schema 表达，不再依赖路由本地重复真值
4. `z.any()` / `passthrough()` 仅保留在确实无法进一步结构化的外部自由数据点，且数量极少、理由明确
5. 直接消费 `@memoflow/contracts/*` 的业务包均通过 typecheck

## 完成摘要

本轮完成后，各模块已达到本计划定义的收敛目标：

- `task`：完成 branded ID、transport contract 分层、route/controller/adapter 对齐，并补齐 `task-template`、`task-instance`、`task-dependency` 的 route contract spec
- `goal`：清理公开 contracts 面的裸 ID，收回 focus-mode / key-result / review 的 response contract，并补强 route contract coverage
- `reminder`：移除 route 层占位 schema，response schema 与 `ReminderTemplateClientDTO` / `ReminderHistoryClientDTO` 对齐
- `repository`：上传、书签、文件夹树和文件夹 CRUD 全部改为 contracts 命名 schema；补齐 `repository.routes.spec.ts` 与 `folder.routes.spec.ts`
- `schedule`：保留动态 payload/result 的自由 JSON 语义，但 route schema 与命名 response schema 已收口
- `notification`：核心 CRUD、批量操作和统计接口已切到 contracts 命名 schema；动态动作与分类配置保留为显式 `unknown`/JSON record
- `setting`：`preferences` 已切到 `UserPreferencesSchema`；路由 contract 由 contracts 单一导出
- `account` / `authentication` / `ai` / `editor`：semantic ID、route response schema 与 route contract spec 已收齐到统一规则

## 有意识保留的自由结构

以下字段在本轮后仍保留为 `unknown` 或 JSON record，这属于有意识设计，而不是遗漏：

1. 错误详情与动态 metadata。
   说明：如 [shared.ts](D:/home/projects/memoflow/packages/contracts/src/shared/shared.ts:27)、`notification` / `repository` / `editor` / `ai` 的 metadata 字段，需要承载跨模块或外部来源的开放 JSON。

2. 调度任务 payload / result。
   说明：`schedule` 模块需要承载来源模块自定义载荷，强行结构化会把模块边界重新耦合起来。

3. 用户偏好 patch 与通知分类细分配置。
   说明：`setting` 的 patch 请求和 `notification` 的分类偏好本质上是可扩展配置面，使用 `unknown`/JSON record 是刻意保留扩展能力。

## 最终验收结论

按本计划的验收标准，当前代码库已满足：

1. semantic ID 在 DTO / API / event 层统一使用 branded primitive
2. `aggregates/` 与 `entities/` 中不再混入 transport-only request/response 类型
3. 正式对外接口由 contracts 命名 schema 表达，不再依赖 route 层重复真值
4. 原先的 `z.any()` / `passthrough()` 占位已清理；仅保留少量有意识设计的自由 JSON 字段
5. 直接消费 `@memoflow/contracts/*` 的关键业务包已通过 typecheck，且 route contract test 已覆盖代表性 endpoint

## 与旧计划的关系

- `2026-05-02-contracts-governance-optimization.md` 中关于事件命名、branded ID、模块导出顺序的目标，纳入本计划执行，但不再单独按 governance 注释增强作为前置阻塞
- `2026-05-03-contracts-persistence-dto-removal.md` 已完成的 PersistenceDTO 清理视为当前真值，本计划不回退那轮结论
- 后续若出现新的 contracts 结构计划，应以本文件为主文档更新，而不是再平行新建同主题计划
