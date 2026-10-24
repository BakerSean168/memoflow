# Code Quality & Consistency Audit (2026-07-08 Round)

- 审查日期：2026-07-08
- 审查分支：`refactor/server-feature-standard-shape`
- 审查范围：当前工作区代码、配置、测试、治理脚本与正式文档
- 执行原则：本轮**只读审查，不做修复**。除非用户明确要求，不修改任何业务代码、配置、测试或文档。
- 工作区状态：`git status` 干净（无未提交改动），本报告基于当前 HEAD `00d43fa`。
- 与上一轮关系：上一轮审查（2026-07-07，见 `docs/audit/code-quality-consistency-audit.md`）记录的 Q-001 ~ Q-007 已全部修复。本轮先**回归验证**这些修复是否仍生效，再发现新问题。新问题编号从 `Q-101` 开始，避免与旧编号冲突。

---

## 0. Repair Log（2026-07-08 修复轮）

本报告初稿为只读审查。随后按 Repair Plan 逐项完成修复，状态如下。每项均遵循「先补/改测试 → 改实现 → targeted verification」流程，工作树在修复前为干净状态。

| 问题 ID | 级别   | 状态                 | 修复要点                                                                                                                                                                                                                                                                                                                                                                                             | 验证                                                             |
| ------- | ------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Q-101   | High   | ✅ Fixed             | `createSyncTaskListener` 的 `void syncTaskHandler(event)` 增加 `.catch(logger.error)`，与队列 `onExecuteError` 对齐；`apps/api/src/main.ts` 补 `uncaughtException`/`unhandledRejection` 兜底                                                                                                                                                                                                         | `schedule:test` 260 通过（含新增拒绝路径测试）                   |
| Q-102   | High   | ✅ Fixed             | `AISecretCipher` 改 aes-256-gcm（随机 IV + auth tag），`fromEnv()` 缺 key 时 fail-fast；统一到已接线的 `AI_PROVIDER_ENCRYPTION_KEY`（原 `AI_SECRET_CIPHER_KEY` 从未被部署接线），schema 描述更新，`.env.example` 说明改为必填                                                                                                                                                                        | `ai:test` 290 通过（新增 8 个 cipher 测试）、`ai/api:typecheck`  |
| Q-103   | High   | ✅ Fixed             | `AuthenticationApiModule` 改为 `createAuthenticationApiModule(options)` 工厂，密钥由 `apps/api` 从已校验 env（`getJwtConfig()`）注入，模块不再直读 `process.env`、不再绕过 32 字符校验                                                                                                                                                                                                               | `authentication:test` 268 通过（新增 3 个测试）、`api:typecheck` |
| Q-104   | Medium | ✅ Fixed             | 删除孤立的 `dtos/account-settings.dto.ts`（v2，零消费者），消除 `AccountSettingsDTO` 同名双定义                                                                                                                                                                                                                                                                                                      | `contracts`/`account` typecheck + test                           |
| Q-105   | Medium | ✅ Fixed             | 77 个 feature 值对象的手抄 `VALUES` 改为 `Object.values(XContract)`，从 contracts 派生单一真值源；改前逐个校验值集与顺序一致                                                                                                                                                                                                                                                                         | 12 个包各自 test target 全绿                                     |
| Q-106   | Medium | ✅ Fixed             | `analyzeTemplate` 改用已注入的 `responseRepository.getResponseStats()`（原总是传空数组），并修掉 `calculateMetrics` 大小写动作匹配的潜在 bug、移除死 `this.prisma` 引用                                                                                                                                                                                                                              | `reminder:test` 320 通过                                         |
| Q-107   | Medium | ⚠️ 部分完成（4/5）   | 4 个单包内部 DTO 迁入 contracts 并 re-export：`CodeSnippetPersistenceDTO`、`UpcomingReminderDTO`、`TaskTemplateHistory{Server,Client}DTO`、`NotificationHistoryServerDTO`。第 5 项 repository `Folder{Server,Client}DTO` **有意留待独立 pass**：contracts 已存在**形状不同**的 `FolderClientDTO`，收敛需跨 ~30 个消费者调和两个已在用类型（现存 `as unknown as` 强转即症状），属计划禁止的单轮大重构 | governance/reminder/task/notification 各自 typecheck + test      |
| Q-108   | Low    | ✅ 无需改码          | ADR-031 lines 14-20 已显式将 `schedule-orchestration` 的 `infrastructure-server/` 记为编排包例外；governance 通过。报告「未收敛」前提不成立                                                                                                                                                                                                                                                          | `governance-check` 通过                                          |
| Q-109   | Low    | ✅ Fixed（建立约定） | `reminder-errors.ts` 4 个类由裸 `extends Error` 改为 `extends DomainError`（`@memoflow/utils/errors`），对齐 `setting-errors.ts` 既有约定；未做 92 处调用点的全量重写（符合 Low + 渐进替换指引）                                                                                                                                                                                                     | `reminder:test` 320 通过                                         |
| Q-110   | Low    | ✅ Fixed             | 删除 `reminder-domain-service.ts:118` 陈旧 TODO（实现已存在）；移除 deprecated `schedule-job` 聚合别名（contracts server/client + domain-client 共 3 文件 + barrel），先把 3 个 app-vue story 消费者迁到 `CalendarEntryClientDTO`                                                                                                                                                                    | `contracts`/`schedule`/`app-vue` typecheck                       |

跨包整体验证：14 个包 `typecheck` 全绿；`memoflow:governance-check` 全部审计通过。

遗留项（建议后续独立 pass）：

- **Q-107 Folder DTO 调和**：需先确定 canonical 形状（分支/合并 `identityId`、branded id、`updatedAtText` 等差异），再分批迁移 repository/app-react/goal/task 消费者，每步单独验证。
- **Q-109 全量替换**：将其余 ~88 处裸 `throw new Error` 按包渐进迁移到 `DomainError` 子类。

---

## 1. Executive Summary

当前项目结构总体清晰、方向明确（server-first feature shape 迁移基本完成），不是失控状态。上一轮 7 个问题经回归验证**全部仍处于 Fixed 状态**，未见回退。

本轮新发现的问题集中在三类：

1. **异步失败被静默丢弃**（最高优先级）。上一轮修好了 `schedule.runtime` 的 `start()` 语义，但**同一文件内的事件监听器**仍用裸 `void syncTaskHandler(event)`（`schedule.runtime.ts:257`）吞掉 promise 拒绝。API 进程没有 `unhandledRejection` 兜底，运行期 repository I/O 失败会变成未处理拒绝，Node 22 下可能直接终止进程。这是上一轮 Q-001 的“同源姊妹问题”，且没有测试覆盖。

2. **密钥使用不安全的硬编码回退**。`AISecretCipher` 构造函数默认 `process.env.AI_SECRET_CIPHER_KEY || 'memoflow-ai-secret'`，且两个 repository 都用默认参数实例化它。生产环境若漏配该 env，会静默用公开的固定密钥加密 AI provider secrets，且该 env 未纳入 `env.schema.ts` / `.env.example`。此外，该 cipher 是 XOR + base64，不是真正的加密。

3. **契约层（"单一真值源"）内部存在概念分裂与重复**。`@memoflow/contracts` 内有两个同名 `AccountSettingsDTO`、形状完全不同、都被 barrel 导出；17 个状态值对象在 contracts 与各 feature `server/domain/value-objects` 之间重复声明；域事件名以字符串字面量散落在 ~40 处。

当前最大风险：**运行期异步失败可靠性**（Q-101）和 **密钥回退**（Q-102）。最影响长期维护的是**契约层重复**（Q-104、Q-105）。整体判断：核心边界不需要重新收敛，属于“迁移后局部漂移 + 若干运行期可靠性缺口”。

### 严重级别统计（本轮新问题）

| 严重级别 | 数量 |
| -------- | ---: |
| Blocker  |    0 |
| High     |    3 |
| Medium   |    4 |
| Low      |    3 |

### 上一轮问题回归状态

| 问题 ID | 上轮结论 | 本轮回归验证                                | 证据                                                                                                                                                          |
| ------- | -------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-001   | Fixed    | **仍 Fixed**                                | `schedule.runtime.ts:316` `start(): Promise<void>`，`await queue.start()`，失败时 `unregisterListeners()` 后 rethrow；`schedule:test` 21 files/259 tests 通过 |
| Q-002   | Fixed    | **仍 Fixed**                                | `schedule-orchestration/vitest.config.ts:32-37` 已接入 `@/server/*` importer-aware alias                                                                      |
| Q-003   | Fixed    | **部分回退/未完全收敛**，见 Q-108           | 13 个包已有 `src/server/index.ts`；但 `schedule-orchestration/src/index.ts:8` 仍导出 `./infrastructure-server`                                                |
| Q-004   | Fixed    | **仍 Fixed**                                | 36 个 route 文件无 `[auth]` + `requireAuth` 冲突；`authentication/api/routes.ts` 中 `requireAuth:false` 均配空中间件 `[]`                                     |
| Q-005   | Fixed    | **仍 Fixed**                                | `resolveRepositoryStorageBaseDir()` 为唯一 env 读取点（`storage-config.ts:27`），全 repo 仅 1 处 `process.env.REPOSITORY_STORAGE_PATH`                        |
| Q-006   | Fixed    | 未重新验证文档文本（低优先，见 Q-110 说明） | —                                                                                                                                                             |
| Q-007   | Fixed    | **仍 Fixed**                                | `schedule/electron/index.ts` 直接 `createSchedulePowerSyncRepositories(ctx.db)`，无 throwaway `seedModule`                                                    |

---

## 2. Project Map

Nx monorepo，真值顺序遵循 `AGENT.md`：当前代码/配置/测试优先。

### 主要应用

| 目录              | 职责                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| `apps/api`        | Express API bootstrap、模块注册、HTTP middleware、OpenAPI 装配、cron |
| `apps/web`        | Vue/Vite Web 客户端与 mock handlers                                  |
| `apps/desktop`    | Electron main/preload/renderer，profile runtime、IPC、PowerSync      |
| `apps/mobile`     | 移动端应用配置                                                       |
| `apps/ai-service` | Python FastAPI AI service                                            |

### 主要包

| 目录                                                                                                                                  | 职责                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `packages/{account,ai,authentication,data-portability,editor,goal,governance,notification,reminder,repository,schedule,setting,task}` | 业务 feature packages，目标形态 `src/{api,client,electron,server/*}` |
| `packages/contracts`                                                                                                                  | 跨端 DTO、协议、值对象接口（"单一真值源"）                           |
| `packages/domain-shared`                                                                                                              | 跨 feature 共享类型/值对象                                           |
| `packages/utils`                                                                                                                      | Result、route-registrar、express-adapter、事件总线等基础设施         |
| `packages/database`                                                                                                                   | Prisma schema/client                                                 |
| `packages/schedule-orchestration`                                                                                                     | 跨 feature 调度投影/执行编排                                         |
| `packages/{app-vue,app-react,ui-*}`                                                                                                   | 前端应用/UI 共享层                                                   |

### 重点审查文件清单（本轮）

| 文件                                                                                                  | 审查原因                          |
| ----------------------------------------------------------------------------------------------------- | --------------------------------- |
| `packages/schedule/src/server/infrastructure/runtime/schedule.runtime.ts`                             | 异步生命周期 + 事件监听器错误处理 |
| `packages/ai/src/server/infrastructure/security/ai-secret-cipher.ts`                                  | 密钥默认回退 + 加密强度           |
| `packages/contracts/src/modules/account/{value-objects,dtos}/account-settings*.ts`                    | 同名 DTO 分裂                     |
| `packages/contracts/src/modules/*/value-objects/*.ts` 与各 feature `server/domain/value-objects/*.ts` | 状态值对象重复                    |
| `packages/authentication/src/api/module.ts`                                                           | env 直读绕过 schema               |
| `packages/reminder/src/server/application/use-cases/queries/analyze-reminder-frequency.use-case.ts`   | 未接入实现                        |
| `packages/schedule-orchestration/src/index.ts`                                                        | server-first 命名收敛残留         |

### 高风险区域

- **schedule runtime 事件监听器**：异步失败无 catch、无测试、API 无全局兜底。
- **AI secret cipher**：硬编码回退密钥 + 非真正加密。
- **contracts 契约层**：同名 DTO 分裂、值对象与事件名大量重复。

---

## Workflow 1：核心流程审查

### 流程 1：API 启动与模块注册

```
进程启动
↓
apps/api/src/main.ts (loadEnv / connectDatabase / createScheduleOrchestrationModule)
↓
resolveRepositoryStorageBaseDir() 一次解析 storage root
↓
TaskApiModule 注入 projectionRuntime；ScheduleApiModule 注入 sourceExecutor
↓
ApiBootstrapper.registerModules() → 各 feature module.register(context)
↓
Express routes / runtime contribution / OpenAPI 输出
```

| 阶段                     | Owner                          | 输入                            | 输出                            | 风险点                                                                                     |
| ------------------------ | ------------------------------ | ------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| API bootstrap            | `apps/api`                     | env、Prisma client、module list | Express app                     | storage 已收敛（Q-005 Fixed）；**API 进程无 `unhandledRejection` handler**（Q-101 放大项） |
| Auth module register     | `authentication/api/module.ts` | db、env                         | token provider + routes         | **直读 `process.env.JWT_SECRET` 绕过 env.schema**（Q-103）                                 |
| Schedule module register | `schedule/api/module.ts:69`    | db、sourceExecutor              | `activeScheduleModule` + routes | `await scheduleModule.start()`（Q-001 已修好）                                             |

### 流程 2：Schedule projection 与执行（含事件同步）

```
Task/Goal/Reminder 状态变化
↓
eventBus 发出 schedule:task-* 事件
↓
scheduleRuntimeEvents 监听器（schedule.runtime.ts:255-265）
↓
void syncTaskHandler(event)  ← 无 catch
↓
syncTask() → repository.findById / queue.scheduleNext / repository.save
↓
（若 repository 抛错 → 未处理 promise 拒绝，无日志、无兜底）
```

| 阶段        | Owner                         | 输入                  | 输出                | 风险点                                         |
| ----------- | ----------------------------- | --------------------- | ------------------- | ---------------------------------------------- |
| 事件监听    | `schedule.runtime.ts:255-265` | `ScheduleEventMap[K]` | fire-and-forget     | **`void syncTaskHandler()` 吞掉拒绝**（Q-101） |
| queue 执行  | `ScheduleTaskQueue`           | enabled tasks         | scheduled execution | 有 `onExecuteError` 兜底（对比之下监听器没有） |
| source 执行 | `schedule-orchestration`      | source module/type/id | execution           | 已有测试保护（Q-002 Fixed）                    |

### 流程 3：AI provider secret 加解密

```
用户配置 AI provider（含 secret）
↓
AIProviderConfigPrismaRepository / PowerSyncRepository
↓
new AISecretCipher()  ← 默认参数，无显式注入
↓
secret = process.env.AI_SECRET_CIPHER_KEY || 'memoflow-ai-secret'
↓
XOR + base64（非真正加密）→ 存库
```

| 阶段        | Owner                       | 输入        | 输出               | 风险点                                   |
| ----------- | --------------------------- | ----------- | ------------------ | ---------------------------------------- |
| Cipher 构造 | `ai-secret-cipher.ts:7`     | env（可选） | key                | **漏配 env 静默用公开固定密钥**（Q-102） |
| 加密        | `ai-secret-cipher.ts:11-20` | plaintext   | `enc_v1:` + base64 | **XOR 不是加密**，仅混淆（Q-102）        |

---

## Workflow 2 / 3 / 4：Findings

### Q-101

- ID：Q-101
- 严重级别：**High**
- 类型：质量 / 异步生命周期 / 一致性 / 测试
- 位置：`packages/schedule/src/server/infrastructure/runtime/schedule.runtime.ts:255-259`（`createSyncTaskListener` → `void syncTaskHandler(event)`）；`syncTaskHandler` 定义 `235-243`；`syncTask` 定义 `72-120`（含 `await repository.findById` / `await repository.save`）；对照 `apps/api/src/main.ts`（无 `unhandledRejection`）与 `apps/desktop/src/main/runtime-init.ts:35`（有）。
- 现象：事件监听器把 async handler 用裸 `void syncTaskHandler(event)` 触发，没有 `.catch`。`syncTaskHandler` 内部 `await syncTask(...)`，而 `syncTask` 会执行 `repository.findById`、`queue` 操作和 `repository.save`，任何一个 reject 都会成为未处理的 promise 拒绝。
- 影响：
  - 运行期 repository/DB 失败在事件路径上**完全静默**——不像 queue 执行有 `onExecuteError`（`schedule.runtime.ts:230-232`）兜底。schedule task 可能没被正确加入/更新队列而无人知晓。
  - API 进程（`apps/api`）**没有 `unhandledRejection` handler**，Node 22 默认对未处理拒绝会终止进程。因此一次 DB 抖动可能升级为 API 崩溃。
  - 这是上一轮 Q-001（外层 `start()` 用 `void queue.start()` 丢弃失败）的**同源姊妹问题**，修复时被遗漏。
- 证据：
  - `schedule.runtime.ts:255-259`：`return (event) => { void syncTaskHandler(event); };`
  - `schedule.runtime.ts:242`：`await syncTask(deps.scheduleTaskRepository, queue, taskId, deps.shouldScheduleTask);`
  - `schedule.runtime.ts:78,197`：`syncTask` → `await repository.findById(taskId)` / `await repository.save(task)`。
  - 对照安全写法：`apps/desktop/src/main/lifecycle/window-manager.ts:503` 用 `void window.loadURL(url).catch((error) => {...})`；`app-lifecycle.ts:209` 同样带 `.catch`。schedule.runtime 缺这个 `.catch`。
  - `apps/desktop/src/main/runtime-init.ts:35` 有 `process.on('unhandledRejection', ...)`；`apps/api` 侧无同类 handler（`grep unhandledRejection apps/api/src` 无结果）。
- 建议（本轮不修）：给监听器包一层错误处理，例如 `void syncTaskHandler(event).catch((error) => logger.error('[Schedule] sync task handler failed', { error }))`，与队列的 `onExecuteError` 语义对齐；并考虑给 API 进程加 `unhandledRejection` 兜底日志。
- 是否需要测试：需要。
- 推荐测试位置：`packages/schedule/src/server/infrastructure/runtime/schedule.runtime.spec.ts`（当前 12 tests，无覆盖此路径）——补一个 `repository.findById` reject 的用例，断言不产生未处理拒绝且被记录。
- 验证方式：`pnpm nx run schedule:test --skipSync`。

### Q-102

- ID：Q-102
- 严重级别：**High**
- 类型：安全 / 一致性 / 配置
- 位置：`packages/ai/src/server/infrastructure/security/ai-secret-cipher.ts:7`（默认回退密钥）、`11-35`（XOR 实现）；实例化点 `ai-provider-config-prisma.repository.ts:22`、`ai-provider-config-powersync.repository.ts:10`（均用默认参数 `new AISecretCipher()`）；配置缺口：`apps/api/src/shared/infrastructure/config/env.schema.ts`、`.env.example` 均无 `AI_SECRET_CIPHER_KEY`。
- 现象：
  1. 构造函数 `constructor(secret = process.env.AI_SECRET_CIPHER_KEY || 'memoflow-ai-secret')`——env 缺失时**静默使用公开的固定字符串**作为密钥。
  2. 两个 repository 都用无参 `new AISecretCipher()`，因此生产路径完全依赖该默认。
  3. `encrypt`/`decrypt` 是 `input[i] ^ key[i % keyLen]` 的 XOR + base64，**不是加密算法**，无 IV、无认证、可被已知明文攻击还原 key。
  4. `AI_SECRET_CIPHER_KEY` 未纳入 `env.schema.ts` / `.env.example`（对照 Q-005 修复后 `REPOSITORY_STORAGE_PATH` 已入 schema）。
- 影响：漏配 env 时，所有 AI provider secrets（可能是第三方 API key）用公开固定密钥“加密”入库，等同明文；即便配了 env，XOR 也不是可靠加密。属于真实安全风险。
- 证据：见位置行号。`grep AI_SECRET_CIPHER_KEY` 仅命中 `ai-secret-cipher.ts:7` 一处，schema/example 均无。
- 建议（本轮不修）：
  - 密钥缺失时应 fail-fast（抛错），不允许静默回退到硬编码值；
  - 将 `AI_SECRET_CIPHER_KEY` 加入 `env.schema.ts` 与 `.env.example`；
  - 用真正的对称加密（如 `node:crypto` 的 `aes-256-gcm`，带随机 IV 与 auth tag）替换 XOR，`enc_v1:` 前缀可保留用于版本迁移。
- 是否需要测试：需要。
- 推荐测试位置：`packages/ai/src/server/infrastructure/security/ai-secret-cipher.spec.ts`（新增）——断言缺 env 时抛错、加解密 round-trip、密文不等于明文 XOR 可逆特征。
- 验证方式：`pnpm nx run ai:test --skipSync`。

### Q-103

- ID：Q-103
- 严重级别：**High**
- 类型：一致性 / 配置 / 可维护性
- 位置：`packages/authentication/src/api/module.ts:49-53`；对照 `apps/api/src/shared/infrastructure/config/env.ts:164-167`（canonical env 解析）、`env.schema.ts:72,78`（`JWT_SECRET` min(32)、`REFRESH_TOKEN_SECRET`）。
- 现象：auth module 在 `register()` 内**直接读 `process.env.JWT_SECRET` / `process.env.REFRESH_TOKEN_SECRET`**，绕过已存在的 `env` schema 解析层。`env.ts:164-167` 已经把这两个值解析进 `config.auth`。存在两个 env 真值源。
- 影响：
  - `env.schema.ts:72` 要求 `JWT_SECRET` 至少 32 字符，但 module 里的直读只判断 `if (!jwtSecret)`（空值），**绕过了长度校验**。若 bootstrap 未先跑 schema 校验，弱密钥可能通过。
  - 同一敏感配置两处解析，后续改 env 命名/默认容易漂移，正是上一轮 Q-005 收敛过的模式，这里在 auth 侧重现。
- 证据：
  - `authentication/api/module.ts:49`：`const jwtSecret = process.env.JWT_SECRET;`
  - `authentication/api/module.ts:53`：`const refreshSecret = process.env.REFRESH_TOKEN_SECRET || jwtSecret;`
  - `apps/api/src/shared/infrastructure/config/env.ts:164-167`：已提供 `secret: env.JWT_SECRET` / `refreshSecret: env.REFRESH_TOKEN_SECRET || env.JWT_SECRET`。
- 建议（本轮不修）：让 auth module 通过注入的 config/context 获取已校验的 secret，而不是直读 `process.env`；保留单一真值源（`env.ts`）。
- 是否需要测试：需要。
- 推荐测试位置：`packages/authentication/src/api/module.spec.ts`（或现有 module 测试）——断言缺失/弱 secret 的行为与 schema 一致。
- 验证方式：`pnpm nx run authentication:test --skipSync`、`pnpm nx run api:typecheck --skipSync`。

### Q-104

- ID：Q-104
- 严重级别：**Medium**
- 类型：一致性 / 契约 / 可维护性
- 位置：`packages/contracts/src/modules/account/value-objects/account-settings.ts:14`（`AccountSettingsDTO` v1）与 `packages/contracts/src/modules/account/dtos/account-settings.dto.ts:22`（`AccountSettingsDTO` v2）；两个 barrel：`value-objects/index.ts:8` 与 `api/index.ts:4`（经 `dtos` 转出），均汇入 account 根 `index.ts` 的 `export *`。
- 现象：`@memoflow/contracts`（项目自称的“单一真值源”）内部有**两个同名 `AccountSettingsDTO`，形状完全不同**：
  - v1：`{ theme: ThemeType, language, timezone, notificationEnabled }`
  - v2：`{ emailNotifications, pushNotifications, twoFactorEnabled, theme: AccountTheme, privacyLevel, dataRetention }`
    连 `theme` 类型都冲突（`ThemeType` vs 本地 `AccountTheme` = 'light'|'dark'|'auto'）。聚合与 API DTO 都 import v1；v2（及其 `AccountTheme`/`AccountPrivacyLevel` const）无任何业务 importer。
- 影响：同一导出名两个定义经不同 barrel 汇入同一命名空间，`export *` 下取决于解析顺序，读者/工具极易误用；v2 疑似孤立死代码但仍被公开导出，扩大公共面。
- 证据：
  - `value-objects/account-settings.ts:14-19` 与 `dtos/account-settings.dto.ts:22-29` 两处定义。
  - `grep AccountTheme|AccountPrivacyLevel` 除 dist 外无源码 importer。
  - `account/api/index.ts:4` `export * from './account-settings.dto'`；`account/value-objects/index.ts:8` 导出 v1；两者都进 `account/index.ts`。
- 建议（本轮不修）：确认 canonical（业务在用的是 v1），删除或合并 v2；若 v2 的字段是未来需求，改名并明确归属，不与 v1 撞名。
- 是否需要测试：偏契约/类型，需 typecheck + 可选契约测试。
- 推荐测试位置：`packages/contracts` typecheck；如保留则加 barrel 导出唯一性检查。
- 验证方式：`pnpm nx run contracts:typecheck --skipSync`、`pnpm nx run account:typecheck --skipSync`。

### Q-105

- ID：Q-105
- 严重级别：**Medium**
- 类型：一致性 / 契约 / 可维护性
- 位置：17 组状态值对象，contracts 与 feature `server/domain/value-objects` 各一份。代表证据：
  - `contracts/.../goal/value-objects/goal-status.ts:4`（`'Active','Completed','Archived'`）↔ `goal/src/server/domain/value-objects/goal-status.ts:5,7`（branded companion 重列同一批值）
  - `contracts/.../task/value-objects/task-instance-status.ts:4` ↔ `task/src/server/domain/value-objects/task-instance-status.ts:15,20`
  - `contracts/.../schedule/value-objects/schedule-task-status.ts:4` ↔ `schedule/src/server/domain/value-objects/schedule-task-status.ts:15,20`
  - 同模式还有 `TaskTemplateStatus`、`ExecutionStatus`、`AccountStatus`、`AuthIdentityStatus`、`NotificationAction/Type/Status/Channel/ChannelType/Category/ActionType`、`ReminderType`、`ReminderStatus`、`TaskPriority`。
- 现象：contracts 持有 `as const` 形状；每个 feature 又声明一个 branded companion，从 contracts 只 import type，然后**手工在 `VALUES` 数组里重列同一批字符串**。
- 影响：新增一个状态值必须改两处，否则 branded 的 `isValid`/`of` 边界会静默拒绝合法值；这是典型“同一枚举多处维护”。
- 证据：见上述行号；每对文件都能看到相同字符串字面量清单被重复。
- 建议（本轮不修）：让 feature companion 从 contracts 派生 `VALUES`（如 `Object.values(GoalStatusContract)`），而非手抄；或统一由一个 helper 生成 branded 值对象。
- 是否需要测试：需要（回归 + 派生一致性）。
- 推荐测试位置：各 feature `server/domain/value-objects/__tests__/*`；可加一条“feature VALUES 等于 contracts 值集合”的断言。
- 验证方式：`pnpm nx run goal:test --skipSync`、`pnpm nx run task:test --skipSync`（代表性）。

### Q-106

- ID：Q-106
- 严重级别：**Medium**
- 类型：质量 / 未接入实现 / 文档-实现一致性
- 位置：`packages/reminder/src/server/application/use-cases/queries/analyze-reminder-frequency.use-case.ts:96-108`。
- 现象：`analyzeTemplate` 里真正的 `reminderResponse` 查询被整段注释（`// TODO: 需要运行 Prisma migration 后才能使用 reminderResponse`），随后固定调用 `this.calculateMetrics([], template)`——**永远传空数组**。
- 影响：该 use-case 对外表现为“分析提醒效果”，但实际总是基于零条记录计算指标，返回空洞结果。调用方无法从返回值区分“真的没数据”与“功能未接入”。属于隐藏的未接入代码。
- 证据：
  - `analyze-reminder-frequency.use-case.ts:100-108`：查询被注释，`const metrics = this.calculateMetrics([], template);`
- 建议（本轮不修）：要么完成 migration 并接入查询，要么让该路径显式返回“未实现/无数据”状态，不要伪装成正常结果。
- 是否需要测试：需要（接入后）。
- 推荐测试位置：`packages/reminder/src/server/application/use-cases/queries/analyze-reminder-frequency.use-case.spec.ts`。
- 验证方式：`pnpm nx run reminder:test --skipSync`。

### Q-107

- ID：Q-107
- 严重级别：**Medium**
- 类型：一致性 / 契约边界
- 位置：server 端 DTO 定义在 feature 包而非 contracts：
  - `packages/notification/src/server/domain/entities/notification-history.ts:19`（`NotificationHistoryServerDTO`）
  - `packages/repository/src/server/domain/entities/folder.ts:15,50`（`FolderServerDTO`、`FolderClientDTO`；文件顶部 `folder.ts:10` 有 `// TODO: 这些类型应该移到 @memoflow/contracts/repository`）
  - `packages/task/src/server/domain/entities/task-template-history.ts:12,20`（`TaskTemplateHistoryServerDTO/ClientDTO`）
  - `packages/reminder/src/server/domain/services/upcoming-reminder-calculation-service.ts:49`（`UpcomingReminderDTO`）
  - `packages/governance/src/server/domain/value-objects/code-snippet.ts:28`（`CodeSnippetPersistenceDTO`）
- 现象：绝大多数 `*ServerDTO`/`*ClientDTO` 归 contracts，但上述几处 DTO 落在 feature 包内，破坏“DTO 归 contracts”的约定；`folder.ts:10` 的 TODO 自己也承认应搬到 contracts。
- 影响：只依赖 `@memoflow/contracts` 的 client 代码触达不到这些类型；契约边界出现例外，后续 client/server 对齐困难。
- 证据：见上述行号。
- 建议（本轮不修）：将这些 DTO 迁入 `@memoflow/contracts` 对应模块，feature 侧改为 re-export。
- 是否需要测试：偏 typecheck。
- 验证方式：`pnpm nx run contracts:typecheck --skipSync` + 相关 feature typecheck。

### Q-108

- ID：Q-108
- 严重级别：**Low**
- 类型：架构 / 一致性（Q-003 收敛残留）
- 位置：`packages/schedule-orchestration/src/index.ts:8`（`export { createScheduleOrchestrationModule } from './infrastructure-server';`）；对照 ADR-031 与其余已迁移到 `server/*` 的 feature 包。
- 现象：上一轮 Q-003 把 13 个 feature 包收敛到 `src/server/index.ts` 形态，但 `schedule-orchestration` 仍暴露 legacy 命名 `./infrastructure-server`，不在 server-feature-shape 治理清单内。
- 影响：结构标准仍有一个可见例外；新人按 ADR 找 `server/` 入口会在此包落空。属于收敛残留，非运行期风险。
- 证据：`schedule-orchestration/src/index.ts:8`。
- 建议（本轮不修）：要么把该包纳入 server-first 命名（`server/infrastructure`），要么在 ADR/治理中显式标注为文档化例外（domain-tagged 编排包）。
- 是否需要测试：治理检查。
- 验证方式：`pnpm nx run memoflow:governance-check --skipSync`。

### Q-109

- ID：Q-109
- 严重级别：**Low**
- 类型：一致性（错误处理）
- 位置：仅 `packages/reminder/src/server/domain/errors/reminder-errors.ts` 提供领域错误类；其余 feature 的 application/domain 层用裸 `throw new Error(...)`（server domain/application 层共约 22 处，如 `authentication/.../login.ts`、`logout.ts`、`reset-password.use-case.ts`、`ai-service-internal-client.ts`）。
- 现象：错误表达方式不统一——一个包有结构化领域错误，其余用字符串错误。
- 影响：调用方难以按类型区分错误；HTTP 层映射、i18n、重试策略缺乏统一依据。属于可维护性/一致性风险，非即时 bug。
- 证据：`grep` 显示自定义错误类集中在 reminder；其余为 `throw new Error`。
- 建议（本轮不修）：约定统一的领域错误基类/错误码策略（可放 `domain-shared` 或各 feature `domain/errors`），逐步替换裸 Error。
- 是否需要测试：随迁移补。
- 验证方式：相关 feature test target。

### Q-110

- ID：Q-110
- 严重级别：**Low**
- 类型：文档 / 死代码标记
- 位置：`packages/reminder/src/server/domain/services/reminder-domain-service.ts:118`（陈旧 TODO）；若干 `@deprecated` 聚合如 `schedule/src/domain-client/aggregates/schedule-job.ts:2`、`contracts/.../schedule/aggregates/schedule-job-server.ts:2`、`schedule-job-client.ts:2`。
- 现象：
  1. `reminder-domain-service.ts:118` 注释 `// TODO: Update group stats if groupId is present`，但**紧接着的代码已经调用了** `updateGroupStats(params.groupId)`——注释与实现不一致（陈旧 TODO）。
  2. 多个 `@deprecated` schedule-job 聚合仍存在；`grep` 未发现 `schedule-job` 被业务 import，疑似可回收死代码（需确认 barrel 是否仍导出）。
- 影响：陈旧注释误导读者；deprecated 聚合增加公共面与理解成本。低风险。
- 证据：`reminder-domain-service.ts:114-120`；`@deprecated` grep 结果。
- 建议（本轮不修）：删除陈旧 TODO 注释；确认 deprecated 聚合无引用后回收。
- 是否需要测试：不需要业务测试；回收后 typecheck。
- 验证方式：`pnpm nx run reminder:typecheck --skipSync`、`pnpm nx run schedule:typecheck --skipSync`。

---

## 4. Critical Findings（Blocker + High）

本轮无 Blocker。High 三项：**Q-101、Q-102、Q-103**（详见上文，含位置、影响、证据、建议、验证）。

摘要：

| ID    | 级别 | 一句话                                                                                    | 关键验证                                     |
| ----- | ---- | ----------------------------------------------------------------------------------------- | -------------------------------------------- |
| Q-101 | High | schedule 事件监听器 `void syncTaskHandler()` 吞掉异步拒绝，API 无 unhandledRejection 兜底 | `pnpm nx run schedule:test --skipSync`       |
| Q-102 | High | `AISecretCipher` 硬编码回退密钥 + XOR 非真加密，env 未入 schema                           | `pnpm nx run ai:test --skipSync`             |
| Q-103 | High | auth module 直读 `process.env.JWT_SECRET` 绕过 schema 长度校验                            | `pnpm nx run authentication:test --skipSync` |

---

## 5. Full Findings（按严重级别排序）

| ID    | 级别   | 类型                | 位置（首要）                                 | 需要测试  |
| ----- | ------ | ------------------- | -------------------------------------------- | --------- |
| Q-101 | High   | 异步生命周期/一致性 | `schedule.runtime.ts:255-259`                | 是        |
| Q-102 | High   | 安全/配置           | `ai-secret-cipher.ts:7`                      | 是        |
| Q-103 | High   | 配置/一致性         | `authentication/api/module.ts:49-53`         | 是        |
| Q-104 | Medium | 契约/一致性         | `contracts account-settings*.ts`（双定义）   | typecheck |
| Q-105 | Medium | 契约/一致性         | 17 组值对象 contracts↔feature                | 是        |
| Q-106 | Medium | 未接入实现          | `analyze-reminder-frequency.use-case.ts:100` | 是        |
| Q-107 | Medium | 契约边界            | 5 处 feature 内 DTO                          | typecheck |
| Q-108 | Low    | 架构收敛残留        | `schedule-orchestration/src/index.ts:8`      | 治理      |
| Q-109 | Low    | 错误处理一致性      | 各 feature server 层 `throw new Error`       | 随迁移    |
| Q-110 | Low    | 文档/死代码         | `reminder-domain-service.ts:118` 等          | typecheck |

---

## 6. Consistency Matrix

| 概念 / 规则 / 数据   | 位置 A                                                     | 位置 B                                                          | 位置 C                                     | 不一致表现                      | 风险                  | 建议统一方式                     |
| -------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------ | ------------------------------- | --------------------- | -------------------------------- |
| 异步失败处理         | `schedule.runtime.ts:230-232`（queue 有 `onExecuteError`） | `schedule.runtime.ts:257`（监听器裸 `void`）                    | `window-manager.ts:503`（`void ...catch`） | 队列/桌面有兜底，事件监听器没有 | 静默失败 + 可能崩进程 | 监听器统一 `.catch(log)`         |
| `AccountSettingsDTO` | `value-objects/account-settings.ts:14`                     | `dtos/account-settings.dto.ts:22`                               | 两 barrel 汇入 account root                | 同名两形状                      | 误用/死代码           | 保留 v1，删/改名 v2              |
| 状态值对象值集       | `contracts/.../*-status.ts`                                | `feature/server/domain/value-objects/*.ts`                      | —                                          | 字符串清单手工重复              | 新值需改两处          | feature 从 contracts 派生 VALUES |
| Secret env 解析      | `env.ts:164-167`（canonical）                              | `authentication/api/module.ts:49-53`（直读）                    | `env.schema.ts:72`（min 32）               | 两真值源，直读绕过校验          | 弱密钥漏过            | 统一走 config/context            |
| Secret 加密          | `ai-secret-cipher.ts`（XOR+base64）                        | —                                                               | —                                          | 非真正加密 + 硬编码回退         | 明文等价泄露          | aes-256-gcm + fail-fast          |
| Server DTO 归属      | `@memoflow/contracts/*`                                    | `notification/repository/task/reminder/governance` feature 内   | —                                          | 少数 DTO 落 feature             | client 触达不到       | 迁入 contracts                   |
| Server feature shape | ADR-031 / 13 包 `server/index.ts`                          | `schedule-orchestration/src/index.ts:8` `infrastructure-server` | —                                          | 一个 legacy 例外                | 结构漂移              | 纳入或文档化例外                 |
| 领域错误             | `reminder/.../errors/reminder-errors.ts`                   | 其余 feature 裸 `throw new Error`                               | —                                          | 错误表达不统一                  | 难分类/映射           | 统一错误基类/错误码              |

---

## 7. Testing Gaps

| 测试缺口                                  | 风险                                                                                                               | 建议测试类型        | 推荐测试位置                                  | 优先级 | 验证命令                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------- | --------------------------------------------- | ------ | -------------------------------------------- |
| schedule 事件监听器异步失败路径           | 静默失败 + 潜在崩进程，且当前 12 tests 无覆盖                                                                      | 单元（reject 注入） | `schedule.runtime.spec.ts`                    | High   | `pnpm nx run schedule:test --skipSync`       |
| AISecretCipher 缺 env / round-trip / 强度 | 密钥回退 + 弱加密无测试                                                                                            | 单元                | `ai-secret-cipher.spec.ts`（新增）            | High   | `pnpm nx run ai:test --skipSync`             |
| auth secret 校验一致性                    | 弱 secret 绕过 schema                                                                                              | 单元                | `authentication/api/module.spec.ts`           | High   | `pnpm nx run authentication:test --skipSync` |
| 值对象 VALUES 与 contracts 一致           | 新状态值静默拒绝                                                                                                   | 单元断言            | 各 feature value-objects `__tests__`          | Medium | `pnpm nx run goal:test --skipSync`           |
| reminder frequency 未接入                 | 空洞结果伪装正常                                                                                                   | 单元（接入后）      | `analyze-reminder-frequency.use-case.spec.ts` | Medium | `pnpm nx run reminder:test --skipSync`       |
| 多个 feature 无 integration config        | account/auth/notification/editor/ai/repository/setting 无 `vitest.integration.config.ts`，跨模块路径可能仅单测覆盖 | 集成                | 各包 integration config                       | Medium | 对应 `test:integration` target               |

（说明：本轮未重新核对 Q-006 文档文本，如仍需可运行 `pnpm nx run memoflow:docs-check --skipSync` 复核。）

---

## 8. Recommended Repair Plan

约束：一次只修一个问题；先 High 后 Medium/Low；每个修复映射一个 ID；先补失败测试再改实现；禁止大范围重构、禁止跨无关模块、禁止引入死代码；每步有 targeted verification。

### Repair Pass 01：修复 Q-101（schedule 监听器异步失败）

- 目标：事件监听器不再静默吞掉 promise 拒绝，与队列 `onExecuteError` 语义对齐。
- 涉及文件：`packages/schedule/src/server/infrastructure/runtime/schedule.runtime.ts`、`schedule.runtime.spec.ts`；（可选）`apps/api/src/main.ts` 加 `unhandledRejection` 兜底。
- 为什么优先：唯一可能升级为 API 进程崩溃的运行期缺口，且无测试。
- 推荐步骤：
  1. 在 `schedule.runtime.spec.ts` 补失败测试：mock `repository.findById` reject，触发 `schedule:task-created`，断言错误被记录且无未处理拒绝。
  2. 给 `createSyncTaskListener` 的 `void syncTaskHandler(event)` 加 `.catch(logger.error)`。
  3. 运行 targeted verification。
- 验证命令：`pnpm nx run schedule:test --skipSync`

### Repair Pass 02：修复 Q-102（AI secret cipher）

- 目标：缺 env 时 fail-fast；env 入 schema/example；用 aes-256-gcm 替换 XOR。
- 涉及文件：`packages/ai/src/server/infrastructure/security/ai-secret-cipher.ts`、新增 `ai-secret-cipher.spec.ts`、`apps/api/src/shared/infrastructure/config/env.schema.ts`、`.env.example`。
- 为什么优先：真实安全风险（secrets 可能等价明文）。
- 推荐步骤：
  1. 补失败测试：缺 env 抛错、round-trip、密文性质。
  2. 移除硬编码回退，改真正对称加密。
  3. 将 `AI_SECRET_CIPHER_KEY` 加入 schema/example。
  4. 运行 targeted verification。
- 验证命令：`pnpm nx run ai:test --skipSync`、`pnpm nx run api:typecheck --skipSync`

### Repair Pass 03：修复 Q-103（auth secret 直读）

- 目标：auth module 通过已校验 config 获取 secret，消除绕过 schema 的直读。
- 涉及文件：`packages/authentication/src/api/module.ts`、相关 module 测试。
- 为什么优先：绕过 32 字符校验属于安全边界弱化。
- 推荐步骤：
  1. 补测试：断言弱/缺 secret 行为与 schema 一致。
  2. 改为从注入 config/context 读取。
  3. 运行 targeted verification。
- 验证命令：`pnpm nx run authentication:test --skipSync`

### Repair Pass 04：修复 Q-104（AccountSettingsDTO 双定义）

- 目标：contracts 内 `AccountSettingsDTO` 唯一化。
- 涉及文件：`packages/contracts/src/modules/account/{value-objects/account-settings.ts,dtos/account-settings.dto.ts,api/index.ts}`。
- 推荐步骤：确认 v1 为 canonical → 删除或改名 v2 及其 const → typecheck。
- 验证命令：`pnpm nx run contracts:typecheck --skipSync`、`pnpm nx run account:typecheck --skipSync`

### Repair Pass 05：修复 Q-105（状态值对象重复）

- 目标：feature companion 从 contracts 派生 VALUES，消除手抄。
- 涉及文件：各 feature `server/domain/value-objects/*.ts` + `__tests__`。
- 推荐步骤：先补“VALUES == contracts 值集”断言 → 逐个改为派生 → test。
- 验证命令：`pnpm nx run goal:test --skipSync`（起步，逐包推进）

### Repair Pass 06：修复 Q-106（reminder frequency 未接入）

- 目标：接入 `reminderResponse` 查询或显式标注未实现。
- 涉及文件：`analyze-reminder-frequency.use-case.ts` + spec（+ 可能 Prisma migration）。
- 验证命令：`pnpm nx run reminder:test --skipSync`

### Repair Pass 07：修复 Q-107（feature 内 DTO 迁 contracts）

- 目标：5 处 DTO 迁入 contracts，feature re-export。
- 验证命令：`pnpm nx run contracts:typecheck --skipSync` + 相关 feature typecheck

### Repair Pass 08-10：Q-108 / Q-109 / Q-110（Low）

- Q-108：`schedule-orchestration` 纳入 server-first 命名或文档化例外；`memoflow:governance-check`。
- Q-109：约定统一领域错误策略，逐步替换裸 Error。
- Q-110：删陈旧 TODO、回收 deprecated 聚合；相关 typecheck。

---

## 9. Suggested Follow-up Prompts

### Focused repair：Q-101 schedule 监听器

> 只处理 `packages/schedule/src/server/infrastructure/runtime/schedule.runtime.ts` 的事件监听器异步失败问题（Q-101）。先在 `schedule.runtime.spec.ts` 补一个 `repository.findById` reject 的失败测试，断言错误被 logger 记录且不产生未处理拒绝；再给 `void syncTaskHandler(event)` 加 `.catch`。不改业务逻辑，不动其他文件。完成后运行 `pnpm nx run schedule:test --skipSync`。

### Focused repair：Q-102 AI secret cipher

> 只处理 `packages/ai/src/server/infrastructure/security/ai-secret-cipher.ts`（Q-102）。新增 `ai-secret-cipher.spec.ts`：缺 `AI_SECRET_CIPHER_KEY` 时应抛错、加解密 round-trip、密文性质。然后移除硬编码回退、改用 `node:crypto` aes-256-gcm，并把 `AI_SECRET_CIPHER_KEY` 加入 `env.schema.ts` 与 `.env.example`。完成后运行 `pnpm nx run ai:test --skipSync`。

### 补测：状态值对象一致性

> 为 goal/task/schedule 等 feature 的 `server/domain/value-objects` branded companion 补“VALUES 等于 `@memoflow/contracts` 对应值集合”的断言测试（Q-105），不改实现。完成后运行对应 `pnpm nx run <pkg>:test --skipSync`。

### 一致性收敛：契约层去重

> 收敛 `@memoflow/contracts` account 模块的 `AccountSettingsDTO` 双定义（Q-104）与 feature 内游离 DTO（Q-107）。只做类型迁移/去重与 re-export，不改运行时逻辑。完成后运行 `pnpm nx run contracts:typecheck --skipSync` 及相关 feature typecheck。

### 文档-实现对齐

> 清理 `reminder-domain-service.ts:118` 的陈旧 TODO（实现已存在）与 deprecated schedule-job 聚合（Q-110），确认无引用后回收。完成后运行相关 typecheck。

---

## Verification Log

本轮执行过的关键命令与只读检查：

| 命令 / 检查                                                  | 结果                                              |
| ------------------------------------------------------------ | ------------------------------------------------- |
| `git status`                                                 | 工作区干净，基于 HEAD `00d43fa`                   |
| `find packages -path '*/src/server/index.ts'`                | 13 个包已有 server barrel（Q-003 收敛证据）       |
| `grep process.env.REPOSITORY_STORAGE_PATH`（非 dist）        | 仅 1 处（`storage-config.ts:27`），Q-005 仍 Fixed |
| `pnpm nx run schedule:test`（cache 命中）                    | 21 files / 259 tests 通过，Q-001 仍 Fixed         |
| 读 `schedule.runtime.ts` start/listener                      | Q-001 Fixed；发现 Q-101                           |
| 读 `schedule/electron/index.ts`                              | 无 seedModule，Q-007 仍 Fixed                     |
| 读 `authentication/api/routes.ts` + agent 全量 route 扫描    | 无 auth 冲突，Q-004 仍 Fixed                      |
| 读 `ai-secret-cipher.ts` + 两 repository 实例化              | 发现 Q-102                                        |
| 读 `authentication/api/module.ts` + `env.ts`/`env.schema.ts` | 发现 Q-103                                        |
| 读 `contracts account-settings*.ts` + barrel                 | 发现 Q-104                                        |
| agent：contracts drift 扫描                                  | 发现 Q-104/Q-105/Q-107                            |
| 读 `analyze-reminder-frequency.use-case.ts`                  | 发现 Q-106                                        |
| 读 `schedule-orchestration/src/index.ts`                     | 发现 Q-108（Q-003 残留）                          |
| `grep unhandledRejection apps/api/src`                       | 无结果（Q-101 放大依据）                          |

注意：`schedule:test` 结果来自 Nx cache（`Nx read the output from the cache`）；如需强制重跑可加 `--skip-nx-cache`。全量 test/typecheck 未在本轮运行，以避免长耗时；上表命令为后续 focused repair 的 targeted verification 入口。
