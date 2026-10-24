---
tags:
  - plan
  - active
  - architecture
  - ai
  - composition-root
description: Externalize the final API AI composition residual into the API runtime while preserving every HTTP and internal checkpoint route / 将最后一个 API AI 组合残余外移到 API runtime，并保持全部 HTTP 与内部 checkpoint 路由不变
created: 2026-08-14T00:00:00Z
updated: 2026-08-14T00:00:00Z
---

# API AI Composition Root Externalization Plan / API AI Composition Root 外移执行方案

## 1. Background and Current State / 背景与现状

### 1.1 Scope and verified baseline / 范围与已核对基线

This plan closes the last feature-package API composition residual on branch
`feat/governance-composition-root` at commit
`c2a4256b264cb7aa4717eedf38089c46e4b8383d`. Governance, Goal, Task, the seven
other API packages in the batch, and AI Desktop already use host-owned runtime
composers. API AI is the only feature package that still selects persistence and
service adapters inside `register()`.

本计划在分支 `feat/governance-composition-root`、提交
`c2a4256b264cb7aa4717eedf38089c46e4b8383d` 上清理最后一个 feature package API
组合残余。Governance、Goal、Task、batch 中另外七个 API package 与 AI Desktop
都已使用宿主持有的 runtime composer；API AI 是唯一仍在 `register()` 内选择
持久化与服务 adapter 的 feature package。

The truth sources inspected for this plan are the current code first, then the
three archived composition-root plans:

本计划先以当前代码为真值，再参考三份归档 composition-root 计划：

- `packages/ai/src/api/module.ts`
- `packages/ai/src/server/infrastructure/ai.module.ts`
- `packages/ai/src/server/infrastructure/powersync.ts`
- `apps/desktop/src/main/runtime/compose-ai.ts`
- `apps/api/src/main.ts`
- `packages/ai/src/index.ts` and `packages/ai/src/api/index.ts`
- `docs/plan/archive/2026-08-13-governance-composition-root-externalization.md`
- `docs/plan/archive/2026-08-14-goal-task-composition-root-externalization.md`
- `docs/plan/archive/2026-08-14-batch-composition-root-externalization.md`

The work is structural only. It must not change AI domain behavior, request or
response contracts, database schema, HTTP authentication, OpenAPI paths, module
registration order, or ai-service availability behavior.

本次仅做结构调整。不得改变 AI 领域行为、请求/响应契约、数据库 schema、HTTP
认证、OpenAPI path、模块注册顺序或 ai-service 可用性行为。

### 1.2 Current API assembly path / 当前 API 装配路径

The verified call chain is:

已核对的调用链如下：

```text
apps/api/src/main.ts
  -> createAIApiModule({ five context-based host-port factories })
  -> ApiBootstrapper.register(ai module)
  -> createAIApiModule.register(context)
       -> context.db
       -> getAIServiceRuntimeConfig()
       -> four AI Prisma persistence adapters
       -> eight config-backed AIService adapters + evaluation-report adapter
       -> five host adapters from the callbacks
       -> createAIModule(...)
       -> instance.start()
       -> public AI controllers from instance.api
       -> two checkpoint controllers from newly constructed Prisma adapters
       -> mount twelve route groups
```

Concrete evidence:

具体证据：

1. `packages/ai/src/api/module.ts:29-49` imports `PrismaClient`, four AI
   persistence adapters, two checkpoint Prisma adapters, all service runtime
   adapters, and `createAIModule` into the transport file.
2. `packages/ai/src/api/module.ts:89` defines `AIApiModuleContext` as
   `ServerModuleContext<PrismaClient>`; `module.ts:122-166` reads `context.db`,
   reads environment configuration, constructs dependencies, and calls
   `createAIModule()` inside `register()`.
3. The config-backed list is **eight**, not seven:
   `AIServiceChatExecutionAdapter`, `AIServiceGoalPlanningAdapter`,
   `AIServiceGoalAutomationAdapter`, `AIServiceKnowledgeIngestionAdapter`,
   `AIServiceKnowledgeQueryAdapter`, `AIServiceKnowledgeNoteGenerationAdapter`,
   `AIServiceAnalyticsQueryAdapter`, and `AIServiceAgentRuntimeAdapter`
   (`module.ts:135-160`). `AIEvaluationReportFileAdapter` is always constructed
   (`module.ts:162`).
4. `module.ts:168-170` stores the instance in a package-level
   `activeAIModule`, starts it, and then uses `aiModule.api` for the public AI
   controllers (`module.ts:183-241`).
5. Two route groups are a hidden exception to the application-port track:
   `module.ts:243-249` directly constructs `AgentCheckpointPrismaAdapter` and
   `LangGraphCheckpointPrismaAdapter` and gives them to controllers. A migration
   that moves only the `createAIModule()` call would therefore leave database
   composition in the transport and would not meet the goal.
6. `module.ts:319-322` disposes the package-global active instance. There is no
   per-handle lifecycle state or partial route-mount rollback.

### 1.3 Existing repository seams and the missing Prisma lane / 现有 repository seam 与缺失的 Prisma lane

`createAIModule()` currently requires two repositories and accepts the other
persistence ports optionally (`packages/ai/src/server/infrastructure/ai.module.ts:92-125`):

`createAIModule()` 当前要求两个 repository，并将其余持久化 port 作为可选依赖
（`packages/ai/src/server/infrastructure/ai.module.ts:92-125`）：

- required: `conversationRepository`, `providerConfigRepository`
- API currently supplies: `knowledgeIndexRepository`, `executionLogPort`
- API transport currently bypasses the module for: `agentCheckpointPort`,
  `langGraphCheckpointPort`

The Desktop lane already has the batch Step A ingredient seam:
`AIPowerSyncRepositorySet` and `createAIPowerSyncRepositories(db)` contain
conversation, provider config, knowledge index, and execution log ports
(`packages/ai/src/server/infrastructure/powersync.ts:46-91`). The Desktop composer
then constructs service adapters and host ports before calling `createAIModule()`
and `createAIElectronModule({ instance })`
(`apps/desktop/src/main/runtime/compose-ai.ts:124-152`).

Desktop lane 已有 batch Step A 的 ingredient seam：`AIPowerSyncRepositorySet` 与
`createAIPowerSyncRepositories(db)` 包含 conversation、provider config、knowledge
index、execution log 四个 port（`powersync.ts:46-91`）。Desktop composer 随后先
创建 service adapter 与 host port，再调用 `createAIModule()` 和
`createAIElectronModule({ instance })`（`compose-ai.ts:124-152`）。

There is **no** `packages/ai/src/server/infrastructure/prisma.ts` and no
`AIPrismaRepositorySet` factory at this baseline. Prisma concrete classes are
re-exported by the package-internal infrastructure barrel only because the
residual API transport currently imports them. No consumer outside
`packages/ai` imports those concrete AI Prisma classes.

当前不存在 `packages/ai/src/server/infrastructure/prisma.ts`，也不存在
`AIPrismaRepositorySet` factory。Prisma concrete class 目前仅因残余 API transport
需要而由 package-internal infrastructure barrel 重新导出；`packages/ai` 外部没有
消费者直接导入这些 concrete AI Prisma class。

### 1.4 Current host ports and ownership / 当前 host port 与 ownership

`apps/api/src/main.ts:216-237` passes five factories into the transport module:

`apps/api/src/main.ts:216-237` 当前向 transport module 传入五个 factory：

| Host capability / 宿主能力 | Current construction / 当前构造             | Real ingredients / 真实原料                |
| -------------------------- | ------------------------------------------- | ------------------------------------------ |
| knowledge-note persistence | `RepositoryKnowledgeNotePersistenceAdapter` | `repositoryApiModule.getApplicationPort()` |
| knowledge source           | `RepositoryKnowledgeSourceAdapter`          | `context.db`, `repositoryStorageBaseDir`   |
| knowledge index status     | `RepositoryKnowledgeIndexStatusAdapter`     | `repositoryApiModule.getApplicationPort()` |
| analytics read             | `ControlledAnalyticsReadAdapter`            | `context.db`                               |
| automation tool executor   | `BackendAutomationToolExecutorAdapter`      | `context.db`, `repositoryStorageBaseDir`   |

The repository handle's `getApplicationPort()` is instance-bound and returns
`options.instance.api` even before registration
(`packages/repository/src/api/module.ts:123-135`). Therefore API main can obtain
that stable port while composing AI; constructing the AI adapters does not call
repository business behavior. Repository remains registered before AI
(`apps/api/src/main.ts:249-253`), so request-time startup order remains unchanged.

Repository handle 的 `getApplicationPort()` 绑定于 instance，并在 register 前即可
返回 `options.instance.api`（`repository/src/api/module.ts:123-135`）。因此 API main
可以在组装 AI 时取得稳定 port；创建 AI adapter 本身不会调用 repository 业务行为。
Repository 仍先于 AI 注册（`main.ts:249-253`），所以请求期启动顺序不变。

### 1.5 Routes, consumers, and public surface / 路由、消费者与公开表面

The current module mounts the following relative paths
(`packages/ai/src/api/module.ts:304-316`). `ApiBootstrapper` mounts the shared
router under both `/api` and `/api/v1` (`apps/api/src/bootstrap.ts:151-153`), so
both effective prefixes must remain available.

当前 module 挂载以下相对路径（`packages/ai/src/api/module.ts:304-316`）。
`ApiBootstrapper` 再将共享 router 同时挂到 `/api` 与 `/api/v1`
（`bootstrap.ts:151-153`），因此两套最终前缀都必须保留。

| Relative mount / 相对挂载                | Existing source / 现有来源                         |
| ---------------------------------------- | -------------------------------------------------- |
| `/ai/providers`                          | `instance.api` provider handlers                   |
| `/ai`                                    | `instance.api` capabilities handlers               |
| `/ai/agents`                             | `instance.api` agent-runtime handlers              |
| `/ai/chat`                               | `instance.api` conversation/chat handlers          |
| `/ai/assistant`                          | `instance.api` assistant facade                    |
| `/ai/knowledge`                          | `instance.api` knowledge query handlers            |
| `/ai/knowledge-notes`                    | `instance.api` note generation/persistence handler |
| `/ai/analytics`                          | `instance.api` analytics query handler             |
| `/ai`                                    | `instance.api` evaluation report handler           |
| `/ai/generate`                           | `instance.api` goal generation handler             |
| `/internal/agents/checkpoints`           | direct `AgentCheckpointPrismaAdapter` today        |
| `/internal/agents/langgraph-checkpoints` | direct `LangGraphCheckpointPrismaAdapter` today    |

Search at the baseline finds exactly one API app construction and one
registration of `createAIApiModule`, both in `apps/api/src/main.ts`. Nothing in
`apps/api` consumes an AI `getApplicationPort()` or an `AIModuleInstance` after
registration. Consequently the target AI API handle does **not** need a
`getApplicationPort()` accessor; adding one would widen a seam with no consumer.

基线搜索只发现一个 `createAIApiModule` 构造点与一个注册点，均位于
`apps/api/src/main.ts`。`apps/api` 中没有代码在注册后消费 AI 的
`getApplicationPort()` 或 `AIModuleInstance`。因此目标 AI API handle 不需要
`getApplicationPort()`；新增无消费者 accessor 只会扩大 seam。

## 2. Target Design / 目标设计

### 2.1 API composer interface / API composer 接口

Add `apps/api/src/runtime/compose-ai.ts` with this exact host-facing interface:

新增 `apps/api/src/runtime/compose-ai.ts`，采用以下宿主接口：

```ts
import type { PrismaClient } from '@memoflow/database';
import type { AIServiceRuntimeConfig } from '@memoflow/ai';
import type { AIApiModuleDef } from '@memoflow/ai/api';
import type { RepositoryApplicationPort } from '@memoflow/repository';

export interface ComposeAIDependencies {
  readonly db: PrismaClient;
  readonly repositoryApiPort: RepositoryApplicationPort;
  readonly repositoryStorageBaseDir: string;
  readonly aiServiceRuntimeConfig?: AIServiceRuntimeConfig | null;
}

export function composeAI(dependencies: ComposeAIDependencies): AIApiModuleDef;
```

Interface semantics are explicit:

接口语义必须明确：

- `db` is the shared API-lane Prisma client owned by `apps/api`.
- `repositoryApiPort` is the exact instance-bound port returned by the already
  composed repository handle.
- `repositoryStorageBaseDir` is the host-resolved path already owned by API main.
- omitted/`undefined` `aiServiceRuntimeConfig` means the composer calls
  `getAIServiceRuntimeConfig()` lazily; explicit `null` means remote ai-service
  adapters are disabled. This gives tests and alternate hosts a deterministic
  no-config branch without moving environment reads back into transport.

- `db` 是 `apps/api` 持有的共享 API-lane Prisma client。
- `repositoryApiPort` 是已组合 repository handle 返回的同一个 instance-bound port。
- `repositoryStorageBaseDir` 是 API main 已解析并持有的宿主路径。
- 省略或传入 `undefined` 时由 composer 延迟调用 `getAIServiceRuntimeConfig()`；
  显式 `null` 表示禁用远端 ai-service adapter。这样测试和其他宿主可确定性覆盖
  no-config 分支，同时环境读取不会回到 transport。

Do not pass the five old callback factories into this interface. The composer
has every ingredient needed to construct the five app-local host adapters, so
exposing five more parameters would reproduce the shallow interface being
removed. These adapters remain legitimate app-local platform adapters under
`docs/standards/architecture.md`; the composer merely owns their construction.

不要把旧的五个 callback factory 搬到新接口。Composer 已拥有构造五个 app-local
host adapter 的全部原料，再暴露五个参数只会复制正在移除的浅接口。这些 adapter
仍是 `docs/standards/architecture.md` 允许的 app-local platform adapter；composer
只接管其构造。

### 2.2 Prisma ingredient seam and checkpoint decision / Prisma ingredient seam 与 checkpoint 决策

Add the missing package-owned Prisma factory:

新增缺失的 package-owned Prisma factory：

```ts
export interface AIPrismaRepositorySet {
  readonly conversationRepository: IAIConversationRepository;
  readonly providerConfigRepository: IAIProviderConfigRepository;
  readonly knowledgeIndexRepository: IKnowledgeIndexRepository;
  readonly executionLogPort: IAIExecutionLogPort;
  readonly agentCheckpointPort: IAgentCheckpointPort;
  readonly langGraphCheckpointPort: ILangGraphCheckpointPort;
}

export function createAIPrismaRepositories(db: PrismaClient): AIPrismaRepositorySet;
```

The first four fields mirror `AIPowerSyncRepositorySet` and are the persistence
ports consumed by `createAIModule()` today. The last two are required because
the API module currently creates them directly for internal routes. They are
API/Prisma-only ingredients; do not add fake PowerSync checkpoint adapters or
widen `AIPowerSyncRepositorySet` merely for shape symmetry.

前四个字段与 `AIPowerSyncRepositorySet` 对齐，也是当前 `createAIModule()` 消费的
持久化 port。后两个字段不可遗漏，因为 API module 目前为 internal route 直接创建
它们。它们是 API/Prisma-only ingredient；不要为了形状对称而虚构 PowerSync
checkpoint adapter 或扩大 `AIPowerSyncRepositorySet`。

To make `createAIApiModule({ instance })` genuinely transport-only, extend the
transport-neutral module seam as follows:

为了让 `createAIApiModule({ instance })` 真正成为纯 transport，按以下方式扩展
transport-neutral module seam：

1. Add optional `agentCheckpointPort` and `langGraphCheckpointPort` to
   `AIModuleDependencies` with an all-or-none invariant. `createAIModule()` must
   fail closed if exactly one is supplied.
2. Expose the supplied pair as one optional nested checkpoint surface on
   `AIApplicationPort` (for example `checkpoints.agent` and
   `checkpoints.langGraph`). The API transport requires this nested surface and
   wires both checkpoint controllers from `instance.api`; Desktop supplies
   neither and remains unchanged.
3. Do not expose `PrismaClient`, concrete adapters, or a second transport option
   alongside `instance`. Do not attach raw `db` to `AIModuleInstance`.

- 在 `AIModuleDependencies` 增加可选的 `agentCheckpointPort` 与
  `langGraphCheckpointPort`，并规定二者必须同时存在或同时缺省；只提供一个时
  `createAIModule()` 必须 fail closed。
- 将这对 port 作为一个可选、嵌套的 checkpoint surface 暴露在
  `AIApplicationPort`（例如 `checkpoints.agent` 与 `checkpoints.langGraph`）。API
  transport 要求该 surface 存在，并从 `instance.api` 接线两个 checkpoint
  controller；Desktop 两者都不提供，行为不变。
- 不向 transport option 暴露 `PrismaClient`、concrete adapter 或与 `instance`
  并列的第二套依赖；不把裸 `db` 挂到 `AIModuleInstance`。

This is a deliberate depth decision: every HTTP controller now consumes the
single transport-facing application interface. The persistence adapters remain
behind the module seam, and the API transport has no reason to know which lane
implements checkpoint storage.

这是有意的深模块设计：所有 HTTP controller 都消费同一个 transport-facing
application interface。持久化 adapter 留在 module seam 之后，API transport 不再
知道 checkpoint storage 由哪条 lane 实现。

### 2.3 Required assembly order / 必须保持的装配顺序

`composeAI()` must follow this order and the tests must assert factory/constructor
invocation order and object identity:

`composeAI()` 必须遵循以下顺序，测试必须断言 factory/constructor 调用顺序与对象
identity：

```text
runtime db
  -> createAIPrismaRepositories(db) exactly once
  -> resolve injected config or getAIServiceRuntimeConfig()
  -> construct five app-local host adapters from
       db + repositoryApiPort + repositoryStorageBaseDir
  -> construct eight config-backed AIService adapters when config exists
       + always construct AIEvaluationReportFileAdapter
  -> createAIModule({ repository set, checkpoint pair, service ports, host ports })
  -> createAIApiModule({ instance })
```

The five host adapters are:

五个 host adapter 为：

- `RepositoryKnowledgeNotePersistenceAdapter(repositoryApiPort)`
- `RepositoryKnowledgeSourceAdapter(db, repositoryStorageBaseDir)`
- `RepositoryKnowledgeIndexStatusAdapter(repositoryApiPort)`
- `ControlledAnalyticsReadAdapter(db)`
- `BackendAutomationToolExecutorAdapter(db, repositoryStorageBaseDir)`

The no-config branch passes every optional config-backed service port as
`undefined`, exactly matching current API and Desktop behavior. The evaluation
report adapter and five host ports remain present in both branches.

no-config 分支把所有 config-backed service port 作为 `undefined` 传入，严格保持
当前 API 与 Desktop 行为；evaluation report adapter 与五个 host port 在两个分支
中都存在。

### 2.4 Transport-only `createAIApiModule` / 纯 transport 的 `createAIApiModule`

The target package interface is:

目标 package 接口为：

```ts
export type AIApiModuleContext = Pick<
  ServerModuleContext<unknown>,
  'app' | 'router' | 'middleware' | 'openApiRegistry'
>;

export interface AIApiModuleOptions {
  readonly instance: AIModuleInstance;
}

export function createAIApiModule(options: AIApiModuleOptions): AIApiModuleDef;
```

`packages/ai/src/api/module.ts` must contain no `PrismaClient`, no `context.db`,
no `getAIServiceRuntimeConfig()`, no repository/service adapter construction,
and no package-level active instance. It keeps controllers, individual route
builders, middleware/OpenAPI injection, route mounting, and module lifecycle.

`packages/ai/src/api/module.ts` 不得再包含 `PrismaClient`、`context.db`、
`getAIServiceRuntimeConfig()`、repository/service adapter 构造或 package-level
active instance。它继续保留 controller、各 route builder、middleware/OpenAPI
注入、route 挂载与 module 生命周期。

Use the established per-handle lifecycle state machine:

采用已建立的 per-handle 生命周期状态机：

- validate `options.instance` and the required checkpoint application surface
  fail-closed;
- permit `register()` only from `created`;
- build all controllers and routes from `options.instance.api` before starting;
- call `instance.start()` once, then mount the twelve route groups in the exact
  current order;
- record `router.stack.length` before the first mount and restore it if any of
  the twelve `router.use()` calls throws, so a partial AI route set cannot leak;
- on any registration failure, enter `failed`, best-effort `dispose()` once,
  log cleanup failure, and rethrow the original error;
- make `destroy()` idempotent and a no-op after `failed`; set state before
  disposal so a disposal exception cannot make a retry dispose twice.

- fail-closed 校验 `options.instance` 与 API 必需的 checkpoint application surface；
- `register()` 只允许从 `created` 进入；
- 启动前从 `options.instance.api` 创建全部 controller 与 route；
- 调用一次 `instance.start()`，再按当前完全相同的顺序挂载十二组 route；
- 首次挂载前记录 `router.stack.length`，任一 `router.use()` 抛错时恢复，避免泄漏
  半套 AI route；
- 注册任一步骤失败后进入 `failed`，best-effort 调用一次 `dispose()`、记录 cleanup
  错误，并重新抛出原始错误；
- `destroy()` 幂等，`failed` 后为 no-op；dispose 前先切换 state，避免 dispose 抛错
  后重试造成二次释放。

All twelve relative mounts listed in §1.5, their registration order, middleware,
OpenAPI registry usage, controller request validation, and response envelopes
remain byte-for-byte or behaviorally equivalent. In particular, the externally
visible `/ai/chat`, `/ai/providers`, `/ai/knowledge-notes`, and `/ai/generate`
mounts and both internal checkpoint mounts must not move.

§1.5 列出的十二个相对 mount、注册顺序、middleware、OpenAPI registry 使用、
controller 请求校验与响应 envelope 必须保持逐字或行为等价。尤其是外部可见的
`/ai/chat`、`/ai/providers`、`/ai/knowledge-notes`、`/ai/generate` 与两个 internal
checkpoint mount 不得迁移路径。

### 2.5 API main and consumer shape / API main 与消费者形状

Replace the direct transport-factory import in `apps/api/src/main.ts` with the
local runtime composer:

将 `apps/api/src/main.ts` 对 transport factory 的直接导入替换为本地 runtime
composer：

```ts
import { composeAI } from './runtime/compose-ai';

const aiApiModule = composeAI({
  db: prisma,
  repositoryApiPort: repositoryApiModule.getApplicationPort(),
  repositoryStorageBaseDir,
});
```

Production omits `aiServiceRuntimeConfig`, so the API composer owns the lazy
environment read. Remove `createAIApiModule` and `AIApiModuleContext` imports
from main, remove the five context-based closures and their null checks, and
keep `.register(aiApiModule)` in the existing position between Task and Goal.

生产 wiring 省略 `aiServiceRuntimeConfig`，由 API composer 持有延迟环境读取。
从 main 删除 `createAIApiModule` 与 `AIApiModuleContext` import，删除五个基于
context 的 closure 及其空值检查，并保持 `.register(aiApiModule)` 位于 Task 与
Goal 之间的原位置。

There is no AI `getApplicationPort()` addition. Repository's existing accessor
remains because the new AI composer is now its explicit consumer; update the
repository composer surface spec wording from “AI residual” to “AI composer”.

不新增 AI `getApplicationPort()`。Repository 现有 accessor 继续保留，因为新 AI
composer 是其明确消费者；repository composer surface spec 的措辞从 “AI
residual” 改为 “AI composer”。

### 2.6 Public exports and residual closure / 公开导出与残余清理

Expose only the new ingredient factory and port-shaped type through
`@memoflow/ai`:

通过 `@memoflow/ai` 只公开新增 ingredient factory 与 port-shaped type：

- export `createAIPrismaRepositories` and `AIPrismaRepositorySet` through
  `server/infrastructure/index.ts`, `server/index.ts`, and `src/index.ts`;
- keep `AIService*Adapter`, `AIEvaluationReportFileAdapter`,
  `getAIServiceRuntimeConfig`, and `AIServiceRuntimeConfig` on the root because
  both host composers genuinely construct/consume them;
- remove concrete Prisma adapter re-exports from
  `server/infrastructure/index.ts` after the API transport no longer consumes
  them; internal adapter tests keep relative imports and the internal
  `adapters/prisma/index.ts` may remain;
- do not add `@memoflow/ai/server` to `package.json` exports and do not expose
  concrete Prisma classes from the root.

- 通过 `server/infrastructure/index.ts`、`server/index.ts`、`src/index.ts` 导出
  `createAIPrismaRepositories` 与 `AIPrismaRepositorySet`；
- `AIService*Adapter`、`AIEvaluationReportFileAdapter`、
  `getAIServiceRuntimeConfig`、`AIServiceRuntimeConfig` 继续保留在 root，因为两个
  宿主 composer 都真实构造/消费它们；
- API transport 不再消费后，从 `server/infrastructure/index.ts` 删除 concrete
  Prisma adapter re-export；内部 adapter 测试继续使用 relative import，内部
  `adapters/prisma/index.ts` 可保留；
- 不在 `package.json` 新增 `@memoflow/ai/server` export，也不从 root 暴露 concrete
  Prisma class。

Residual documentation cleanup must preserve history while correcting current
claims:

残余文档清理必须保留历史事实，同时修正当前状态：

- rewrite `packages/ai/src/api/module.ts` and `packages/ai/src/api/index.ts`
  English-first + 中文 JSDoc as transport-only documentation;
- update `docs/standards/architecture.md:44` to say all feature package API
  transports are host-composed; retain the distinction that app-local
  infrastructure modules such as Dashboard/PowerSync may still consume the
  bootstrap DB context;
- update `apps/api/src/shared/contracts/api-module.ts:68-88` to remove the stale
  “unmigrated sibling may compose from context.db” wording without removing the
  shared `db` field still used by app-local infrastructure modules;
- update `packages/ai/src/server/infrastructure/__tests__/ai-repositories.surface.spec.ts`
  and `apps/api/src/runtime/compose-repository.surface.spec.ts` comments/names
  that call API AI a residual;
- update every API-AI residual occurrence in
  `docs/plan/archive/2026-08-14-batch-composition-root-externalization.md`
  (baseline scope, AI Desktop note, Step E deviations, repository consumer,
  Step C exclusion, docs requirement, final `rg` expectation, risk, and success
  checklist). Keep the historical statement that API AI was outside that
  batch's implementation scope, but annotate it as closed by this plan rather
  than rewriting history as if the batch itself performed the migration.

## 3. Implementation Steps / 分步实现

Each step has a narrow rollback point. No compatibility overload or dual
factory signature is introduced; this repository does not require backward
compatibility. Step B is intentionally an atomic package + host cutover because
changing the transport signature without its composer and main switch would
leave the workspace untypecheckable.

每一步都有窄回滚点。不引入兼容 overload 或双 factory signature；本仓库不要求向后
兼容。Step B 有意把 package 与 host 切换作为一个原子阶段，因为只改 transport
signature 而不同时加入 composer 与 main 切换，会使 workspace 无法 typecheck。

### Step 0 - Baseline and inventory / 基线与清单

**Content / 内容**

- Record the branch/HEAD and clean/dirty state.
- Capture every API AI composition import, `context.db` use, route mount,
  concrete Prisma adapter export, and residual documentation occurrence.
- Establish direct AI/API tests, typecheck/lint, governance, and docs baselines.

- 记录分支/HEAD 与工作树状态。
- 固定所有 API AI composition import、`context.db` 使用、route mount、concrete
  Prisma adapter export 与残余文档出现位置。
- 建立 AI/API direct test、typecheck/lint、governance、docs 基线。

**Files / 文件**: none / 无。

**Verification / 验证**

```bash
git status --short --branch
git rev-parse HEAD
rg -n "createAIApiModule|AIApiModuleContext|context\.db|getAIServiceRuntimeConfig|AgentCheckpointPrismaAdapter|LangGraphCheckpointPrismaAdapter" packages/ai/src/api apps/api/src
rg -n "router\.use\(" packages/ai/src/api/module.ts
rg -n "API AI|API-AI|residual API-AI|residual per plan|follow-up residual" docs/plan/archive/2026-08-14-batch-composition-root-externalization.md docs/standards/architecture.md packages/ai/src apps/api/src/runtime
pnpm nx run ai:typecheck
pnpm nx run ai:lint
pnpm nx run api:typecheck
pnpm nx run api:lint
node node_modules/vitest/vitest.mjs run --config packages/ai/vitest.config.ts
node node_modules/vitest/vitest.mjs run --config apps/api/vitest.config.ts
pnpm nx run memoflow:governance-check
pnpm nx run memoflow:docs-check
```

**Independent completion and rollback / 独立完成与回滚**

No production file changes. Record every pre-existing failure before Step A;
do not attribute an unexplained baseline failure to the migration.

不修改生产文件。进入 Step A 前记录所有既有失败；不得把未解释的 baseline failure
归因于迁移。

### Step A - Add the Prisma ingredient and checkpoint application seam / 新增 Prisma ingredient 与 checkpoint application seam

**Content / 内容**

1. Add `prisma.ts` with `AIPrismaRepositorySet` and
   `createAIPrismaRepositories(db)`; instantiate the six verified Prisma
   adapters exactly once.
2. Extend `AIModuleDependencies` with the checkpoint pair and enforce the
   all-or-none invariant.
3. Add the optional nested checkpoint surface to `AIApplicationPort` and bind
   it from the supplied ports in `createAIModule()`.
4. Export the factory/set type through the existing root seam only; keep all
   concrete Prisma classes private to package implementation.
5. Extend the AI repository surface spec for the six-field Prisma set, the
   four-field unchanged PowerSync set, host-port exclusion, root exports, and
   concrete-class non-export.

- 新增 `prisma.ts`，定义 `AIPrismaRepositorySet` 与
  `createAIPrismaRepositories(db)`；六个已核对 Prisma adapter 各实例化一次。
- 为 `AIModuleDependencies` 增加 checkpoint pair，并强制 all-or-none invariant。
- 为 `AIApplicationPort` 增加可选嵌套 checkpoint surface，并在
  `createAIModule()` 中从输入 port 绑定。
- 只通过现有 root seam 导出 factory/set type；concrete Prisma class 留在 package
  implementation 内。
- 扩展 AI repository surface spec，锁定六字段 Prisma set、四字段且不变的
  PowerSync set、host-port 排除、root export 与 concrete-class 不导出。

**Files / 文件**

- add `packages/ai/src/server/infrastructure/prisma.ts`
- `packages/ai/src/server/infrastructure/ai.module.ts`
- `packages/ai/src/server/application/ai.application.port.ts`
- `packages/ai/src/server/infrastructure/index.ts`
- `packages/ai/src/server/index.ts`
- `packages/ai/src/index.ts`
- `packages/ai/src/server/infrastructure/__tests__/ai-repositories.surface.spec.ts`
- add a focused checkpoint-pair spec beside `ai.module.ts` if the existing
  module specs cannot express the invariant cleanly

**Verification / 验证**

```bash
node node_modules/vitest/vitest.mjs run --config packages/ai/vitest.config.ts packages/ai/src/server/infrastructure/__tests__/ai-repositories.surface.spec.ts
node node_modules/vitest/vitest.mjs run --config packages/ai/vitest.config.ts packages/ai/src/server/infrastructure
pnpm nx run ai:typecheck
pnpm nx run ai:lint
pnpm nx run api:typecheck
pnpm nx run desktop:typecheck
```

**Independent completion and rollback / 独立完成与回滚**

This step is additive at the host edge: the old API transport still works, and
Desktop supplies neither checkpoint port. Roll back by removing the new factory,
exports, and optional checkpoint surface together; no schema/data rollback is
needed.

该阶段对宿主边缘是 additive：旧 API transport 仍可工作，Desktop 也不提供
checkpoint port。回滚时一起移除新 factory、export 与可选 checkpoint surface；
不涉及 schema/data 回滚。

### Step B - Atomic API transport and host-composer cutover / 原子切换 API transport 与宿主 composer

**Content / 内容**

1. Rewrite `createAIApiModule` to accept only `{ instance }`, use the DB-free
   context `Pick`, consume public and checkpoint handlers from `instance.api`,
   and implement the per-handle failure-safe lifecycle in §2.4.
2. Add `apps/api/src/runtime/compose-ai.ts` with the exact dependency interface
   and assembly order from §2.1-2.3. It owns `getAIServiceRuntimeConfig()` and
   constructs all five host adapters, eight conditional service adapters, and
   the unconditional evaluation-report adapter.
3. Switch `apps/api/src/main.ts` from `@memoflow/ai/api` direct composition to
   `composeAI()`. Resolve the repository application port once and keep module
   registration order unchanged.
4. Add `compose-ai.spec.ts` with mocked package factories/classes. Assert exact
   call order, exactly one Prisma set, exact object identity for `db`, repository
   port and storage path, both config/no-config branches, checkpoint pair
   forwarding, and `createAIApiModule({ instance })`.
5. Add `compose-ai.surface.spec.ts`. Assert main imports the local composer and
   no longer names `createAIApiModule`/`AIApiModuleContext` or imports
   `@memoflow/ai/api`; assert only the composer imports the package `/api` seam;
   assert no app deep `/server` import and no AI transport DB/config/concrete
   adapter construction.
6. Add an AI API module lifecycle/route-mount spec covering all twelve prefixes,
   start-before-mount, duplicate registration, rollback after an intermediate
   mount failure, original-error preservation, and idempotent destroy.

- 将 `createAIApiModule` 改为只接收 `{ instance }`，使用无 DB 的 context `Pick`，
  从 `instance.api` 消费公开与 checkpoint handler，并实现 §2.4 的 per-handle
  failure-safe 生命周期。
- 新增 `apps/api/src/runtime/compose-ai.ts`，使用 §2.1-2.3 的精确依赖接口与装配
  顺序。它持有 `getAIServiceRuntimeConfig()`，并构造五个 host adapter、八个条件式
  service adapter 与始终存在的 evaluation-report adapter。
- 将 `apps/api/src/main.ts` 从直接 `@memoflow/ai/api` 组合切到 `composeAI()`。
  一次取得 repository application port，并保持 module 注册顺序不变。
- 新增 `compose-ai.spec.ts`，mock package factory/class，断言精确调用顺序、只创建
  一个 Prisma set、`db`/repository port/storage path 的对象 identity、config 与
  no-config 两个分支、checkpoint pair 透传及 `createAIApiModule({ instance })`。
- 新增 `compose-ai.surface.spec.ts`，断言 main 只导入本地 composer，不再出现
  `createAIApiModule`/`AIApiModuleContext` 或 `@memoflow/ai/api`；只有 composer
  导入 package `/api` seam；app 不 deep import `/server`，AI transport 不再组合
  DB/config/concrete adapter。
- 新增 AI API module lifecycle/route-mount spec，覆盖十二个 prefix、start-before-
  mount、重复注册、中途 mount 失败回滚、原始错误保持与幂等 destroy。

**Files / 文件**

- `packages/ai/src/api/module.ts`
- `packages/ai/src/api/index.ts` (type exports updated; residual prose is Step C)
- add `packages/ai/src/api/module-lifecycle.spec.ts`
- add `apps/api/src/runtime/compose-ai.ts`
- add `apps/api/src/runtime/compose-ai.spec.ts`
- add `apps/api/src/runtime/compose-ai.surface.spec.ts`
- `apps/api/src/main.ts`

**Verification / 验证**

```bash
node node_modules/vitest/vitest.mjs run --config packages/ai/vitest.config.ts packages/ai/src/api/module-lifecycle.spec.ts packages/ai/src/api/routes
node node_modules/vitest/vitest.mjs run --config apps/api/vitest.config.ts apps/api/src/runtime/compose-ai.spec.ts apps/api/src/runtime/compose-ai.surface.spec.ts apps/api/src/bootstrap.spec.ts
pnpm nx run ai:typecheck
pnpm nx run ai:lint
pnpm nx run api:typecheck
pnpm nx run api:lint
pnpm nx run desktop:typecheck
```

**Independent completion and rollback / 独立完成与回滚**

Commit package transport, composer, main switch, and their tests as one atomic
slice. Targeted rollback restores the old API transport signature and the one
main call site together while retaining the additive Prisma factory if useful;
do not add a compatibility union or restore a package-global accessor as an
intermediate architecture.

将 package transport、composer、main 切换与测试作为一个原子 slice 提交。定向
回滚时一起恢复旧 API transport signature 与 main 的唯一调用点；additive Prisma
factory 可保留。不要用兼容 union 或 package-global accessor 作为中间架构。

### Step C - Lock public surface and close every residual note / 锁定公开表面并关闭全部残余说明

**Content / 内容**

1. Finish English-first + 中文 JSDoc for the new Prisma factory, composer,
   transport handle, interfaces, parameter semantics, assembly order, and
   lifecycle failure behavior.
2. Remove the obsolete residual JSDoc from `packages/ai/src/api/index.ts` and
   `module.ts`; describe the API seam as transport-only.
3. Remove no-longer-needed concrete Prisma re-exports from the infrastructure
   barrel and strengthen the repository surface spec. Keep root service adapter
   exports as the documented host-composer exception.
4. Update architecture and `IApiModule` contract prose to close the last feature
   residual while accurately retaining app-local DB context users.
5. Update all batch-plan residual notes as historical-then / closed-now records.
6. Update repository composer docs/spec wording so `getApplicationPort()` is
   described as an explicit dependency of `composeAI`, not a residual callback.
7. Regenerate or check the test inventory if governance/docs gates require it.

- 为新 Prisma factory、composer、transport handle、interface、参数语义、装配顺序
  与生命周期失败行为补齐 English-first + 中文 JSDoc。
- 从 `packages/ai/src/api/index.ts` 与 `module.ts` 删除过时 residual JSDoc，改为
  transport-only seam 说明。
- 从 infrastructure barrel 删除不再需要的 concrete Prisma re-export，并加强
  repository surface spec；root service adapter export 作为宿主 composer 的已记录
  例外继续保留。
- 更新 architecture 与 `IApiModule` contract 文案，关闭最后一个 feature residual，
  同时准确保留 app-local DB context consumer。
- 将 batch plan 的所有 residual 说明更新为“当时存在 / 现在已由本计划关闭”。
- 更新 repository composer 文档/spec，把 `getApplicationPort()` 描述为
  `composeAI` 的明确依赖，而不是 residual callback。
- governance/docs gate 要求时重新生成或检查 test inventory。

**Files / 文件**

- `packages/ai/src/api/module.ts`
- `packages/ai/src/api/index.ts`
- `packages/ai/src/server/infrastructure/prisma.ts`
- `packages/ai/src/server/infrastructure/index.ts`
- `packages/ai/src/index.ts`
- `packages/ai/src/server/infrastructure/__tests__/ai-repositories.surface.spec.ts`
- `apps/api/src/runtime/compose-ai.ts`
- `apps/api/src/runtime/compose-repository.ts`
- `apps/api/src/runtime/compose-repository.surface.spec.ts`
- `apps/api/src/shared/contracts/api-module.ts`
- `docs/standards/architecture.md`
- `docs/plan/archive/2026-08-14-batch-composition-root-externalization.md`
- generated test inventory file only if the canonical inventory command changes it

**Verification / 验证**

```bash
rg -n "API AI|API-AI|residual API-AI|residual per plan|follow-up residual" docs/plan/archive/2026-08-14-batch-composition-root-externalization.md docs/standards/architecture.md packages/ai/src apps/api/src/runtime
rg -n "createAIApiModule|AIApiModuleContext|from ['\"]@memoflow/ai/api" apps/api/src/main.ts
rg -n "PrismaClient|context\.db|getAIServiceRuntimeConfig|new (AI.*Prisma|AIService|AgentCheckpointPrisma|LangGraphCheckpointPrisma)" packages/ai/src/api/module.ts packages/ai/src/api/index.ts
rg -n "from ['\"]@memoflow/ai/server|from ['\"]@memoflow/ai/server/infrastructure" apps/api/src
pnpm test:inventory:check
pnpm nx run memoflow:governance-check
pnpm nx run memoflow:docs-check
pnpm nx run ai:typecheck
pnpm nx run ai:lint
pnpm nx run api:typecheck
pnpm nx run api:lint
```

Expected `rg` semantics: historical batch references may remain only when they
explicitly say the residual existed at batch completion and link/name this
closure; current-state docs and code comments must not claim API AI is still a
follow-up. Main must have no direct `/api` transport import. The AI transport
search must return no composition dependency.

预期 `rg` 语义：历史 batch 引用仅可在明确说明“batch 完成时存在，现已由本计划
关闭”时保留；当前状态文档与代码注释不得再声称 API AI 仍是 follow-up。Main 不得
直接导入 `/api` transport。AI transport 搜索不得返回任何 composition dependency。

**Independent completion and rollback / 独立完成与回滚**

This step changes surfaces and documentation only after Step B has removed the
last consumer. Roll back individual export/doc edits only for an identified
consumer or false claim; do not broadly restore concrete adapter barrels or the
residual architecture statement.

该阶段只在 Step B 删除最后一个 consumer 后修改 surface 与文档。仅为明确 consumer
或错误断言定向回滚对应 export/doc；不要整体恢复 concrete adapter barrel 或 residual
架构说明。

### Step D - Final verification and runtime smoke / 最终验证与运行时 smoke

**Content / 内容**

- Run the complete AI and API direct Vitest configurations, touched-project
  typecheck/lint, smoke, governance, docs, and inventory gates.
- Run the local prod-like Docker lane because this migration moves lazy runtime
  env resolution and API startup wiring. Verify API and ai-service health and
  inspect logs for AI registration/config failures.
- Record the final route/composition inventory. Archive movement is a separate
  completion action; do not mark this active plan done merely because it compiles.

- 运行完整 AI/API direct Vitest、受影响项目 typecheck/lint、smoke、governance、
  docs 与 inventory gate。
- 本迁移移动了延迟 runtime env 读取和 API 启动 wiring，因此运行本地 prod-like
  Docker lane，核对 API 与 ai-service health，并检查 AI 注册/config failure 日志。
- 记录最终 route/composition 清单。归档移动是单独完成动作；不能只因编译通过就将
  active plan 标记完成。

**Files / 文件**: no new implementation files / 不新增实现文件。

**Verification / 验证**

```bash
node node_modules/vitest/vitest.mjs run --config packages/ai/vitest.config.ts
node node_modules/vitest/vitest.mjs run --config apps/api/vitest.config.ts
pnpm nx run ai:typecheck
pnpm nx run ai:lint
pnpm nx run api:typecheck
pnpm nx run api:lint
pnpm nx run desktop:typecheck
pnpm nx run api:test:smoke
pnpm test:inventory:check
pnpm nx run memoflow:governance-check
pnpm nx run memoflow:docs-check
pnpm runtime:preflight:local-docker
pnpm docker:local:up
pnpm docker:local:ps
pnpm docker:local:logs
```

After runtime verification, stop the lane with `pnpm docker:local:down` when it
is not intentionally being kept for further work. Confirm `migrator` exited 0
and API, Web, ai-service, and PowerSync are healthy per
`docs/guides/development/local.docker.md`.

运行时验证结束且无需继续使用时执行 `pnpm docker:local:down`。按
`docs/guides/development/local.docker.md` 确认 `migrator` 以 0 退出，API、Web、
ai-service、PowerSync 均 healthy。

**Independent completion and rollback / 独立完成与回滚**

Verification creates no schema migration. If runtime smoke exposes a wiring
regression, roll back only the Step B API cutover and retain the additive Step A
factory for diagnosis; rerun direct tests before attempting the cutover again.

验证不创建 schema migration。若 runtime smoke 暴露 wiring 回归，只定向回滚 Step B
的 API 切换，并保留 Step A additive factory 用于诊断；再次切换前重跑 direct test。

## 4. Verification Checklist / 验证清单

### 4.1 Per-step gates / 分阶段 gate

| Gate                | Required evidence / 必需证据                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Step 0 baseline     | HEAD/worktree and every existing failure recorded; current routes, concrete imports, and residual references inventoried / 记录 HEAD、工作树、既有失败、route、concrete import 与 residual 清单                                                                                                                                                                                                                          |
| Step A ingredients  | six-field Prisma set; unchanged four-field PowerSync set; checkpoint pair invariant; no concrete root export / 六字段 Prisma set、四字段 PowerSync set 不变、checkpoint pair invariant、root 不导出 concrete class                                                                                                                                                                                                       |
| Step B cutover      | mocked order/object-identity specs; main uses `composeAI`; transport accepts only `{ instance }`; lifecycle and twelve mounts pass / mock 顺序与 identity、main 使用 composer、transport 只收 instance、生命周期与十二 mount 通过                                                                                                                                                                                        |
| Step C surface/docs | residual prose closed without falsifying archive history; no transport composition import; governance/docs/inventory green / residual 正确关闭且不篡改历史、transport 无组合 import、治理/文档/inventory 通过                                                                                                                                                                                                            |
| Step D final        | full direct AI/API Vitest, touched typecheck/lint, API smoke, local Docker health and final `rg` inventory / 全量 direct test、受影响检查、API smoke、本地 Docker health 与最终搜索清单（已验证：`pnpm docker:local:ps` 显示 6 个服务全部 healthy —— api/web/ai-service/powersync/redis/postgres；API `GET /healthz` 200、ai-service `GET /healthz` 200；API 日志 0 条 error/AI 注册失败；AI 路由挂载正常返回 401 auth） |

### 4.2 Behavior invariance matrix / 行为不变矩阵

- `getAIServiceRuntimeConfig()` remains lazy and is called at API composition
  time, after environment loading and before bootstrap registration. Missing
  base URL/secret still produces no remote service adapters.
- All eight config-backed adapters receive the exact same resolved config
  object; evaluation report remains unconditional.
- The five host adapters receive the exact same Prisma client, repository
  application port, and storage base directory as the current closures.
- `createAIPrismaRepositories(db)` is called once; all six returned port objects
  are the exact objects passed into the module/application seam.
- The repository application port is obtained from the already composed
  repository handle, and Repository remains registered before AI.
- AI instance starts once and disposes once; failed registration cannot leave a
  partial route set or a live runtime contribution.
- Public AI routes and internal checkpoint routes keep the relative paths in
  §1.5, both `/api` and `/api/v1` root mounts, existing auth middleware, OpenAPI
  registration, payload validation, and response envelopes.
- Desktop `composeAI()` and `AIPowerSyncRepositorySet` behavior do not change;
  no API-only checkpoint implementation is invented for Desktop.
- No AI application accessor is added without a consumer.

- `getAIServiceRuntimeConfig()` 仍延迟执行：环境加载后、bootstrap 注册前、API
  composition 时读取；缺少 base URL/secret 时仍不创建远端 service adapter。
- 八个 config-backed adapter 接收完全相同的 config 对象；evaluation report 仍始终
  存在。
- 五个 host adapter 接收与旧 closure 完全相同的 Prisma client、repository
  application port 与 storage base dir。
- `createAIPrismaRepositories(db)` 只调用一次，返回的六个 port 对象原样进入
  module/application seam。
- Repository application port 来自已组合的 repository handle，Repository 仍先于
  AI 注册。
- AI instance 只 start/dispose 一次；注册失败不会遗留半套路由或存活 runtime
  contribution。
- 公开 AI route 与 internal checkpoint route 保持 §1.5 相对路径、`/api` 与
  `/api/v1` 两个 root mount、现有 auth middleware、OpenAPI 注册、payload 校验与
  response envelope。
- Desktop `composeAI()` 与 `AIPowerSyncRepositorySet` 行为不变；不为 Desktop
  虚构 API-only checkpoint 实现。
- 不新增无消费者的 AI application accessor。

### 4.3 Final surface locks / 最终 surface lock

```bash
# Main owns only the local host composer; direct transport composition is gone.
rg -n "createAIApiModule|AIApiModuleContext|from ['\"]@memoflow/ai/api" apps/api/src/main.ts

# The package API transport contains transport/lifecycle only.
rg -n "PrismaClient|context\.db|getAIServiceRuntimeConfig|AIConversationPrismaRepository|AIProviderConfigPrismaRepository|AIKnowledgeIndexPrismaRepository|AIExecutionLogPrismaAdapter|AgentCheckpointPrismaAdapter|LangGraphCheckpointPrismaAdapter|AIService[A-Za-z]+Adapter|AIEvaluationReportFileAdapter" packages/ai/src/api/module.ts packages/ai/src/api/index.ts

# No app deep-import bypass; compose-ai may use package root + /api only.
rg -n "from ['\"]@memoflow/ai/server|from ['\"]@memoflow/ai/server/infrastructure" apps/api/src

# Route mounts remain exact.
rg -n "router\.use\('/(ai|internal/agents)" packages/ai/src/api/module.ts

# Every historical residual reference is annotated closed; no current-state residual remains.
rg -n "API AI|API-AI|follow-up residual|residual per plan" docs/plan/archive/2026-08-14-batch-composition-root-externalization.md docs/standards/architecture.md packages/ai/src apps/api/src/runtime
```

The first three searches must return no forbidden match. The route search must
return the same twelve mount statements in the same order. The last search is a
review list, not necessarily empty: archived historical statements are allowed
only when they explicitly record closure by this plan.

前三个搜索不得返回 forbidden match。Route 搜索必须按相同顺序返回同样的十二个
mount。最后一个搜索是 review 清单，不要求绝对为空；归档历史说明仅可在明确记录
“已由本计划关闭”时保留。

## 5. Success Criteria / 成功标准

- [ ] `AIPrismaRepositorySet` and `createAIPrismaRepositories(db)` exist and
      expose exactly the six verified Prisma persistence ports without concrete
      adapter leakage.
- [ ] The four shared Prisma fields match the unchanged PowerSync ingredient
      shape; the two checkpoint fields remain an explicit API-only deviation.
- [ ] `AIModuleDependencies` enforces checkpoint all-or-none input and
      `AIApplicationPort` exposes the supplied pair through one nested optional
      application surface.
- [ ] `apps/api/src/runtime/compose-ai.ts` owns Prisma selection, lazy runtime
      config, all eight conditional service adapters, the evaluation-report adapter,
      and all five app-local host adapters.
- [ ] `composeAI` has only `db`, `repositoryApiPort`,
      `repositoryStorageBaseDir`, and optional config override at its external
      interface; the old five callback factories are gone.
- [ ] `createAIApiModule({ instance })` is transport-only, uses a DB-free context
      `Pick`, wires every controller from `instance.api`, and has no package-global
      active instance.
- [ ] All twelve route mounts, OpenAPI behavior, auth, payload/result contracts,
      `/api` + `/api/v1` exposure, and registration order are unchanged.
- [ ] API main imports and calls only `composeAI` for AI assembly; it no longer
      imports `createAIApiModule` or `AIApiModuleContext` directly.
- [ ] No AI `getApplicationPort()` is added; Repository's existing instance-bound
      accessor is consumed explicitly by the AI composer wiring.
- [ ] Root exports include the Prisma ingredient factory/type and retain the
      genuinely host-used service/config exports, while concrete Prisma adapters do
      not leak through root/infrastructure public surfaces.
- [ ] AI API JSDoc, architecture standards, shared API-module contract prose,
      repository composer surface wording, and every batch-plan residual note
      describe the final host-composed state accurately in English-first + 中文.
- [ ] Composer/order/surface/lifecycle/route tests, full AI/API direct Vitest,
      AI/API typecheck/lint, Desktop typecheck, API smoke, test inventory,
      governance-check, docs-check, and local Docker health verification are green.
- [ ] Local Docker lane verified (2026-08-14, revision
      `7d7407c2169bf6f3dd3bc5d0c3e02a0495d53cfd-dirty`): `pnpm docker:local:ps`
      shows all six services `(healthy)` — `memoflow-api-1`, `memoflow-web-1`,
      `memoflow-ai-service-1`, `memoflow-powersync-1`, `memoflow-postgres-1`,
      `memoflow-redis-1`; API `GET /healthz` → 200 `{"status":"ok"}`; ai-service
      `GET /healthz` → 200 `{"status":"healthy",...}`; API logs contain 0 error /
      no AI registration or config failure lines; AI routes mount normally
      (`/api/ai/*`, `/api/internal/agents/checkpoints` return 401 auth, not 404).
- [ ] Final `rg` inventory finds no feature-package API transport that composes
      from `context.db`; API AI is no longer listed as an open residual.

## 6. Risks and Rollback / 风险与回滚

### 6.1 Risks / 风险

1. **Checkpoint composition is missed / 遗漏 checkpoint 组合**: moving only the
   four `createAIModule` persistence fields leaves two Prisma adapters in
   transport. Prevent this with the six-field set and the transport forbidden-
   import surface spec.
2. **A fake Desktop parity seam is invented / 虚构 Desktop 对称 seam**: Desktop
   has no checkpoint routes or PowerSync checkpoint adapters. Keep the pair
   optional and API-only; do not widen the PowerSync set.
3. **Config semantics drift / 配置语义漂移**: reading env at module import time,
   constructing partial service adapters, or treating explicit `null` as “read
   env” changes availability. Document and test omitted/undefined versus null
   semantics and assert all eight adapters share one config object.
4. **Repository port timing changes / Repository port 时序变化**: main now calls
   `getApplicationPort()` before module registration rather than inside AI
   registration. This is safe only because the verified accessor returns the
   bound `instance.api` unconditionally; lock exact identity and retain
   Repository-before-AI registration.
5. **Partial route installation / 部分路由安装**: AI has twelve separate
   `router.use()` calls. A later mount failure can leave earlier mounts installed
   unless the router stack is restored. Test failure after a middle mount.
6. **Application interface widens carelessly / Application interface 无序扩大**:
   checkpoint ports are a real second adapter seam (Prisma production + test
   doubles), but they should be grouped as one optional internal checkpoint
   surface. Do not expose `db`, concrete classes, or unrelated repository fields.
7. **Concrete exports are removed too early / concrete export 过早删除**: remove
   infrastructure barrel exports only after transport and all consumers switch;
   use repository-wide `rg` before deletion.
8. **Historical docs become false / 历史文档失真**: the batch truly left API AI
   out of scope. Annotate its residual as subsequently closed; do not rewrite the
   batch checklist to claim it implemented work it did not perform.
9. **App-local DB users are conflated with feature residuals / 混淆 app-local DB
   consumer 与 feature residual**: Dashboard and PowerSync app-local modules may
   still use bootstrap context DB. Architecture wording must claim completion
   for feature package API transports, not deletion of `IApiModuleContext.db`.

### 6.2 Targeted rollback / 定向回滚

- **Step A**: remove `prisma.ts`, its root exports, and the optional checkpoint
  application surface together. No database or data migration exists.
- **Step B**: restore the old `createAIApiModule` signature/body and the single
  `apps/api/src/main.ts` call/import together. Retain the additive Prisma factory
  if it helps diagnosis. Never introduce a permanent union signature or a
  package-global service locator.
- **Step C**: restore only a concrete export required by a proven consumer and
  only the documentation statement contradicted by code. Do not broadly restore
  the residual or all infrastructure exports.
- **Runtime rollback**: stop the local lane with `pnpm docker:local:down`; no
  volume or schema deletion is required. In production, revert the atomic Step B
  code change rather than changing environment variables to mask composition
  errors.
- **Safety**: no `git reset --hard`, broad checkout, database reset, or volume
  deletion is part of this plan.
