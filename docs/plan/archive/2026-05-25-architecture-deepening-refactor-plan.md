# 2026-05-25 Architecture Deepening Refactor Plan

## 背景

当前仓库已经有清晰的目标架构：

- `apps/*` 应该是运行时 container
- `packages/*` 应该承载领域 module、application module、adapter 和共享 interface
- 组合根应显式，避免 singleton / service locator

这些方向已经被 [`AGENT.md`](../../../AGENT.md)、[`docs/standards/architecture.md`](../../standards/architecture.md) 和多份 ADR 固化，尤其是：

- [`ADR-016-apps-as-containers.md`](../../architecture/adr/ADR-016-apps-as-containers.md)
- [`ADR-018-smart-container-application-service-pattern.md`](../../architecture/adr/ADR-018-smart-container-application-service-pattern.md)
- [`ADR-023-server-side-clean-architecture-refactor.md`](../../architecture/adr/ADR-023-server-side-clean-architecture-refactor.md)
- [`ADR-025-module-composition-pattern.md`](../../architecture/adr/ADR-025-module-composition-pattern.md)

但当前代码状态是“新旧两套架构同时存在”。部分 module 已经很接近目标态，部分 module 仍保留旧的 seam、浅 module 和运行时耦合，导致整体 locality 和 leverage 不稳定。

本计划不是零散“清理代码风格”，而是一次面向目标架构的系统性深化方案。

## 2026-05-27 执行审计结论

本计划对应的重构已经取得实质进展。基于 `2026-05-27` 当前工作树的最终审计结果，**可以判定本轮计划定义的主线已经达到“优雅完整实现”**；当前只剩少量非阻塞 polish 与基础设施观察项，不再构成计划阻塞。

### 当前总体判断

- 已经真实落地的部分
  - `dashboard` 已从单文件 helper 升级为第一类 read-model module。
  - Web 与 desktop renderer 已从全局 startup registry 切到显式 startup hook，`InitializationManager` 不再命中活跃启动路径。
  - `app-react` 与 `patterns` 根导出已经从 mega barrel 收敛为 curated surface。
  - shared Vue 已完成第一轮减重，`goal` / `repository` / `schedule` / `task` / `auth` 有实际拆分与去重。
  - desktop `ProfileRegistry` / `SessionManager` 已移除类级 `getInstance()`，开始回到构造注入。
  - `getDesktopProfileRuntimeManager()` 已退出活跃路径。
  - `desktop-runtime-locator-audit` 已接入 `governance-check`，并对 desktop main 的 runtime locator 回流提供治理覆盖。
  - `governance-check` 现在通过。
  - `desktop:typecheck` 现在通过。
  - `desktop:lint` 现在通过（`0` error，保留 warning）。
  - `desktop:test`、`web:lint`、`web:test`、`api:test:smoke` 当前通过。
  - `app-react:typecheck` 现在通过。
  - `platform-leakage-audit` 不再对 `ipc-client` 注释示例误报。
  - desktop renderer 已把 router / dashboard adapter / store hook 迁到明确子路径；剩余根入口导入主要是 `App.vue` / `DesktopAuthApp.vue` 这类 UI shell surface。
  - desktop main 活跃路径已不再命中 `getWindowManager()`、`getDesktopAuthService()`、模块级 `runtimeManager` 这类旧 locator 语言。
- 当前无主阻塞
  - ai-service 的 test / typecheck / lint 当前全部为绿。
  - shared Vue 第二轮深拆已经通过热点复扫和关键 gate 重新证明没有回流到旧的大文件形态。
  - 剩余事项只包括可选的 warning 清理与 infra 观察项，不影响本轮计划完成判定。

### 本次审计的硬证据

- `pnpm nx run memoflow:docs-check --skipNxCache` 当前通过。
- `pnpm nx run memoflow:governance-check --skipNxCache` 当前通过。
- `pnpm nx run app-react:typecheck --skipNxCache` 当前通过。
- `pnpm nx run desktop:typecheck --skipNxCache` 当前通过。
- `pnpm nx run desktop:lint` 当前通过，结果为 `0` error、`118` warning。
- `pnpm nx run api:test:smoke`、`pnpm nx run web:lint`、`pnpm nx run web:test`、`pnpm nx run desktop:test` 当前通过。
- `pnpm nx run ai-service:test` 当前通过（`77 passed`），标准命令来自 `apps/ai-service/project.json` 的 `uv run pytest tests/`。
- `pnpm nx run ai-service:typecheck` 当前通过（`uv run pyright src`）。
- `pnpm nx run ai-service:lint` 当前通过，`0` error。
- `project.json` 中的 `governance-check` 当前已经串联 `desktop-runtime-locator-audit.mjs`。
- `rg “getDesktopProfileRuntimeManager\\(|setDesktopProfileRuntimeManager\\(“ apps/desktop/src/main` 当前不再命中活跃路径。
- `platform-leakage-audit` 已能区分注释示例与实现代码，不再被 `packages/ipc-client/src/index.ts` 误伤。
- `rg “getWindowManager\\(|getDesktopAuthService\\(|let runtimeManager|_windowManager” apps/desktop/src/main` 当前只剩注释或测试局部变量，不再命中生产运行路径。
- `rg "^export \\*" packages/app-react/src/index.ts packages/app-vue/src/index.ts packages/patterns/src/index.ts packages/test-utils/src/index.ts` 当前无命中。
- `rg "window\\.electronAPI" packages/app-vue packages/app-react packages/contracts packages/utils packages/patterns packages/http-client packages/ipc-client` 当前只命中 `packages/ipc-client/src/index.ts` 的注释示例。
- desktop renderer 当前对 `@memoflow/app-vue` 的消费，已经以 `router`、`plugins/i18n`、`modules/*`、`di`、`desktop` 等明确子路径为主。
- 热点文件行数已明显下降：
  - [`packages/app-vue/src/modules/ai/views/AIChatView.vue`](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue) `221` 行
  - [`packages/app-vue/src/modules/editor/stores/editor-workspace-store.ts`](../../../packages/app-vue/src/modules/editor/stores/editor-workspace-store.ts) `125` 行
  - [`packages/app-vue/src/modules/repository/composables/useRepository.ts`](../../../packages/app-vue/src/modules/repository/composables/useRepository.ts) `202` 行
  - [`packages/app-vue/src/modules/goal/composables/useGoal.ts`](../../../packages/app-vue/src/modules/goal/composables/useGoal.ts) `212` 行
  - [`apps/ai-service/src/ai_service/services/goal_planning_service.py`](../../../apps/ai-service/src/ai_service/services/goal_planning_service.py) `359` 行
  - [`apps/ai-service/src/ai_service/evals/runner.py`](../../../apps/ai-service/src/ai_service/evals/runner.py) `652` 行

### 对后续执行的约束

- 后续不得再把“建立了新 seam”视为完成；只有旧 seam 不再被生产运行路径调用，才算完成。
- 后续不得再用 allowlist 或单次 grep 绿灯，替代最终回归审计。
- 对于已收口的 TypeScript/desktop 轨道，后续只允许做回归防线和局部 polish，不再把它们重新表述为主阻塞。
- 后续 stage 状态以“代码 + 命令 + 运行路径”三者同时成立为准，而不是以文档描述或局部重构为准。

## 证据摘要

### 已经较接近目标态的区域

- Web app 容器已经明显变薄，`apps/web/src` 主要承载 bootstrap、platform、mocks 和 test。
- 某些 package 已有较好的组合根模式，例如 [`packages/repository/src/api/module.ts`](../../../packages/repository/src/api/module.ts) 在 `89` 行通过 `createRepositoryModule(...)` 装配依赖，并在 `100` 行启动 module。

### 当前最明显的架构摩擦

1. 前端共享 Vue package 仍是热点家族，但第二轮减重已经真实发生
   - [`packages/app-vue/src/modules/goal/composables/useGoal.ts`](../../../packages/app-vue/src/modules/goal/composables/useGoal.ts) 当前 `212` 行。
   - [`packages/app-vue/src/modules/repository/composables/useRepository.ts`](../../../packages/app-vue/src/modules/repository/composables/useRepository.ts) 当前 `202` 行，已退回 page façade 角色。
   - [`packages/app-vue/src/modules/ai/views/AIChatView.vue`](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue) 当前 `221` 行，主文件已明显从 workflow sink 收缩为布局与组合。
   - [`packages/app-vue/src/modules/editor/stores/editor-workspace-store.ts`](../../../packages/app-vue/src/modules/editor/stores/editor-workspace-store.ts) 当前 `125` 行，store 厚度已明显下降。

2. 平台差异泄漏进共享前端 module
   - [`packages/app-vue/src/modules/authentication/composables/useAuth.ts`](../../../packages/app-vue/src/modules/authentication/composables/useAuth.ts) 在 `32` 行开始直接判断 `window.electronAPI`。
   - `packages/app-vue/src/shared/utils/*desktop*` 也承载了明显的 desktop-specific 分支。

3. 组合根重复，client registry 没有统一 seam
   - Web 端 [`apps/web/src/platform/di-app.ts`](../../../apps/web/src/platform/di-app.ts) 从 `34` 行到 `189` 行维护一长串 `createLazyService` 和 `app.provide(...)`。
   - React 端 [`packages/app-react/src/providers/app-client-registry-provider.tsx`](../../../packages/app-react/src/providers/app-client-registry-provider.tsx) 在 `45` 行集中创建 `AppClientRegistry`，形态更深、更稳定。
   - 同一类 client wiring 在不同 runtime / framework 中有重复实现，说明 composition seam 还不够深。

4. Desktop 主进程的认证/runtime 家族仍然较重，但 locator seam 已明显收敛
   - [`apps/desktop/src/main/modules/authentication/application/auth-desktop-application-service.ts`](../../../apps/desktop/src/main/modules/authentication/application/auth-desktop-application-service.ts) 当前 `489` 行，仍是 desktop main 的厚服务热点。
   - [`apps/desktop/src/main/modules/authentication/infrastructure/session-manager.ts`](../../../apps/desktop/src/main/modules/authentication/infrastructure/session-manager.ts) 当前 `769` 行，依然是重量级基础设施对象，但类级 `getInstance()` 已退出主路径。
   - [`apps/desktop/src/main/main.ts`](../../../apps/desktop/src/main/main.ts) 当前 `225` 行，运行时 owner 已明显变薄，但认证/生命周期家族仍值得持续关注。

5. 共享 package 中仍残留 legacy singleton / container seam
   - [`packages/governance/src/infrastructure-server/di/governance-container.ts`](../../../packages/governance/src/infrastructure-server/di/governance-container.ts) 在 `24` 行保留 `GovernanceContainer` singleton，并明确标注 legacy。
   - [`packages/goal/src/shared/di.ts`](../../../packages/goal/src/shared/di.ts) 在 `12` 行仍保留通用 `DIContainer` helper。
   - 仓库内 `rg "legacy|遗留|@deprecated"` 能找到大量未清退的兼容层，说明架构迁移还停留在“并存期”。

6. 各领域 package 的 module shape 不一致
   - `goal` / `task` 更接近 `commands + queries + use-cases`
   - `schedule` 同时存在 `services`、`ports`、`use-cases`
   - `reminder` 出现 `reminder-query-application-service.use-case.ts` 这类混合命名
   - `dashboard` 目前只有单文件 [`packages/dashboard/src/index.ts`](../../../packages/dashboard/src/index.ts)，`89` 行开始直接承载聚合读取与统计逻辑，还是一个浅 module

7. 全局初始化 / 调度的 singleton 风险已经缩小，但仍需防回流
   - Web 与 desktop renderer 的活跃启动路径已经退出 `InitializationManager` 语言。
   - desktop main 的 runtime locator 也已纳入 `desktop-runtime-locator-audit`。
   - 当前风险不再是“这些 seam 仍在主路径里普遍活跃”，而是“未来是否重新回流”；因此治理脚本与最终回归审计仍然必要。

8. 测试 taxonomy、命名规范与治理脚本之间存在漂移
   - [`ADR-013-standard-testing-strategy.md`](../../architecture/adr/ADR-013-standard-testing-strategy.md) 仍写 `*.integration.ts`，但 [`docs/test/README.md`](../../test/README.md) 已把集成测试入口定义为 `*.integration.test.ts`。
   - 当前仓库实际分布也支持这一点：`*.spec.*` 约 `296` 个，`*.test.*` 约 `132` 个，`*.integration.test.*` 有 `6` 个，而 `*.integration.*`（不含 `.test`）为 `0`。
   - `packages/app-vue` 中的 store source 已统一成 `kebab-case`，但对应测试仍大量保留 camel/Pascal 混合文件名，例如 [`goal-store.ts`](../../../packages/app-vue/src/modules/goal/stores/goal-store.ts) 对应 [`goalStore.spec.ts`](../../../packages/app-vue/src/modules/goal/stores/goalStore.spec.ts)，[`editor-workspace-store.ts`](../../../packages/app-vue/src/modules/editor/stores/editor-workspace-store.ts) 对应 [`editorWorkspaceStore.spec.ts`](../../../packages/app-vue/src/modules/editor/stores/editorWorkspaceStore.spec.ts)。
   - 当前 [`tools/governance/file-naming-audit.mjs`](../../../tools/governance/file-naming-audit.mjs) 明确跳过 `__tests__`、`test`、`tests`、`e2e`，并把 `*.spec.ts`、`*.test.ts` 视为 test support file 直接豁免；这意味着命名规范并没有覆盖测试层。
   - 当前 [`project.json`](../../../project.json) 中的 `governance-check` 已串联 `platform-leakage-audit`、`singleton-audit` 与 `desktop-runtime-locator-audit`；后续治理缺口更偏向测试 taxonomy 与 package-internal boundary enforcement，而不是这些基础审计是否存在。

9. 当前 boundary model 粒度过粗，而且与文档口径冲突
   - [`docs/standards/architecture.md`](../../standards/architecture.md) 规定 domain 不应依赖 infrastructure；但 [`eslint.config.ts`](../../../eslint.config.ts) 当前 `moduleBoundaryDepConstraints` 明确允许 `layer:domain` 依赖 `layer:infra`。
   - [`eslint.config.ts`](../../../eslint.config.ts) 同时对 `__tests__`、`e2e`、`src/test` 和 `packages/test-utils` 关闭了 `@nx/enforce-module-boundaries`，意味着测试层天然能绕开主边界模型。
   - 当前 tags 只在 project 级生效，但多个 feature package 本身就是“单包多层”，例如 [`packages/goal/project.json`](../../../packages/goal/project.json) 整体被标记为 `layer:domain`，实际目录却同时包含 `application-server`、`infrastructure-server`、`api`、`controllers` 等多层内容。
   - 同样地，[`packages/app-vue/project.json`](../../../packages/app-vue/project.json) 整体被标为 `layer:ui`，但内部又包含 runtime-aware shared utils 与 platform-sensitive code；这说明当前 tag 模型无法精确约束包内 layering，只能粗略约束包与包之间的 import。

10. 热点区域已经出现可见的重复实现，说明抽象边界没有形成

- `jscpd` 在本次热点目录扫描中发现 `25` 个 clone，约 `1.32%` 重复行。
- Desktop auth 测试与 coordinator 测试中有多段大块重复，集中在：
  - `apps/desktop/src/main/modules/authentication/application/__tests__/*`
- `schedule` 视图卡片出现明显 triplicate UI：
  - [`TaskModuleTasksCard.vue`](../../../packages/app-vue/src/modules/schedule/components/TaskModuleTasksCard.vue)
  - [`GoalTasksCard.vue`](../../../packages/app-vue/src/modules/schedule/components/GoalTasksCard.vue)
  - [`ReminderTasksCard.vue`](../../../packages/app-vue/src/modules/schedule/components/ReminderTasksCard.vue)
- `editor` 索引工具存在逻辑重复：
  - [`link-index.ts`](../../../packages/app-vue/src/modules/editor/utils/link-index.ts)
  - [`resource-reference-index.ts`](../../../packages/app-vue/src/modules/editor/utils/resource-reference-index.ts)
- `authentication` 表单与测试也存在镜像重复：
  - [`LoginForm.vue`](../../../packages/app-vue/src/modules/authentication/components/LoginForm.vue)
  - [`RegisterForm.vue`](../../../packages/app-vue/src/modules/authentication/components/RegisterForm.vue)
- `task` 目录里还出现了疑似平行副本：
  - [`packages/app-vue/src/modules/task/components/TaskInstanceCard.vue`](../../../packages/app-vue/src/modules/task/components/TaskInstanceCard.vue)
  - [`packages/app-vue/src/modules/task/components/cards/TaskInstanceCard.vue`](../../../packages/app-vue/src/modules/task/components/cards/TaskInstanceCard.vue)

### 全仓热点 inventory

- 当前 `packages/*` 中，只有 `12` 个业务 feature package 同时具备 `module.ts + domain-server + application-server + infrastructure-server + api + controllers + application-client + infrastructure-client` 这套完整 shape：
  - `account`
  - `ai`
  - `authentication`
  - `editor`
  - `goal`
  - `governance`
  - `notification`
  - `reminder`
  - `repository`
  - `schedule`
  - `setting`
  - `task`
- `dashboard` 是最关键的业务 outlier：它仍然没有 `module.ts` 和标准 layering，却承担跨领域 read-model 逻辑。
- 其余 `16` 个 package 更像 support / runtime / UI / data package，例如 `app-vue`、`app-react`、`contracts`、`utils`、`ipc-client`、`ui-*`、`database`、`powersync-schema`。它们不应该被硬套 server feature shape，但需要形成各自稳定的 package language。
- 当前最大源码文件并不只出现在 shared Vue：
  - 行为型热点包括：
    - [`packages/task/src/domain-server/aggregates/task-template.ts`](../../../packages/task/src/domain-server/aggregates/task-template.ts) 约 `54.4 KB`
    - [`packages/goal/src/domain-server/aggregates/goal.ts`](../../../packages/goal/src/domain-server/aggregates/goal.ts) 约 `46.3 KB`
    - [`packages/app-vue/src/modules/ai/views/AIChatView.vue`](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue) 约 `47.0 KB`
    - [`apps/desktop/src/main/modules/authentication/infrastructure/session-manager.ts`](../../../apps/desktop/src/main/modules/authentication/infrastructure/session-manager.ts) 约 `38.6 KB`
  - composition root 热点包括：
    - [`packages/reminder/src/infrastructure-server/reminder.module.ts`](../../../packages/reminder/src/infrastructure-server/reminder.module.ts) 约 `30.2 KB`
    - [`packages/repository/src/infrastructure-server/repository.module.ts`](../../../packages/repository/src/infrastructure-server/repository.module.ts) 约 `21.5 KB`
    - [`packages/ai/src/infrastructure-server/ai.module.ts`](../../../packages/ai/src/infrastructure-server/ai.module.ts) 约 `21.4 KB`
    - [`packages/goal/src/infrastructure-server/goal.module.ts`](../../../packages/goal/src/infrastructure-server/goal.module.ts) 约 `21.3 KB`
- 同时也存在“很大但不是当前架构优先项”的数据型文件：
  - [`packages/app-vue/src/locales/en-US.ts`](../../../packages/app-vue/src/locales/en-US.ts) 约 `137.2 KB`
  - [`packages/app-vue/src/locales/zh-CN.ts`](../../../packages/app-vue/src/locales/zh-CN.ts) 约 `133.9 KB`
  - [`packages/powersync-schema/src/index.ts`](../../../packages/powersync-schema/src/index.ts) 约 `32.1 KB`
- 这些文件体积大，但主要承担 locale / schema 数据清单，不应与 workflow / composition / aggregate hotspot 放在同一优先级。

### Support / runtime package family drift

- `app-vue` 当前同时扮演了多个角色：
  - framework shell
  - router / plugin / layout package
  - feature presentation package
  - shared desktop-aware utility package
  - 它的根导出 [`packages/app-vue/src/index.ts`](../../../packages/app-vue/src/index.ts) 同时暴露 DI、plugin、router、layout、shared util 和大量 feature module，说明 package interface 已经是一个 mega barrel。
- `app-react` 也呈现同类问题：
  - [`packages/app-react/src/index.ts`](../../../packages/app-react/src/index.ts) 同时导出 screens、providers、hooks、components、root layout。
  - [`packages/app-react/src/providers/app-session-provider.tsx`](../../../packages/app-react/src/providers/app-session-provider.tsx) 内部直接完成 auth graph 创建、token refresh、session bootstrap、persisted session 恢复。
  - [`packages/app-react/src/hooks/useRepositoryWorkspace.ts`](../../../packages/app-react/src/hooks/useRepositoryWorkspace.ts) 这类 hook 直接承担 workspace orchestration，说明 React package 也在变成 framework-specific application layer。
- `contracts` 当前混合了多种协议职责：
  - DTO / primitive / result 类型
  - Electron channel constants，例如 [`packages/contracts/src/electron/ipc-channels.ts`](../../../packages/contracts/src/electron/ipc-channels.ts)
  - mocks，例如 [`packages/contracts/src/mocks/goal.mock.ts`](../../../packages/contracts/src/mocks/goal.mock.ts)
  - 虽然根导出 [`packages/contracts/src/index.ts`](../../../packages/contracts/src/index.ts) 已经收缩，但 package family 仍同时承载“正式协议”和“测试数据生成”。
- transport package 语言不对齐：
  - [`packages/http-client/src/result-http-client.ts`](../../../packages/http-client/src/result-http-client.ts) 走显式 config + token provider + refresh handler
  - [`packages/ipc-client/src/types.ts`](../../../packages/ipc-client/src/types.ts) 则允许“不传 bridge 时自动从 `window.electronAPI` 获取”
  - 这意味着两个平行 transport adapter family 在 explicitness 上并不一致。
- `utils` 当前是一个过宽的 kernel 包：
  - 根导出 [`packages/utils/src/index.ts`](../../../packages/utils/src/index.ts) 同时暴露 domain 基类、validation、frontend helpers、logger、initialization manager
  - [`packages/utils/src/domain/cross-platform-event-bus.ts`](../../../packages/utils/src/domain/cross-platform-event-bus.ts) 这类跨平台通信抽象，与 `initialization-manager.ts`、frontend helpers、result adapters 一起放在同一个包里，family contract 已经过宽。
- `patterns` 是典型 catch-all 包：
  - [`packages/patterns/src/index.ts`](../../../packages/patterns/src/index.ts) 直接导出 `scheduler`、`repository`、`cache`、`events`
  - 同时目录里还存在 `goal` 子目录，说明“generic pattern”与“半领域抽象”已经开始混装。
- `test-utils` 同时承载 fixture/mocks/setup/infra runner：
  - [`packages/test-utils/src/setup/database.ts`](../../../packages/test-utils/src/setup/database.ts) 直接管理 Docker container、Prisma schema sync 和数据库清理
  - 同包里又有 `fixtures`、`mocks`、`browser`、`vue`、`fast` setup，说明测试 support family 还缺清晰 taxonomy。
- 相对而言，`ui-core`、`ui-vue-shadcn`、`ui-react-native` 当前更像 cohesive UI family，优先级低于上面这些 support/runtime 包。

### App runtime drift matrix

- `web`
  - 当前较接近 container 目标态。
  - 入口 [`apps/web/src/bootstrap/app.ts`](../../../apps/web/src/bootstrap/app.ts) 主要负责 `createApp`、router、theme、i18n、service install 和 startup phase。
  - 主要残留问题集中在 `platform/di-app.ts` 和 startup lifecycle，不在页面 app 壳本身。
- `mobile`
  - 当前是最薄的 app runtime。
  - `apps/mobile/src/app/*` 基本只是 Expo Router route wrapper，例如 [`apps/mobile/src/app/explore/repository.tsx`](../../../apps/mobile/src/app/explore/repository.tsx) 直接 re-export `@memoflow/app-react` screen。
  - 这说明移动端大体遵守“app 只做 runtime shell”，可作为 container 正例。
- `api`
  - [`apps/api/src/bootstrap.ts`](../../../apps/api/src/bootstrap.ts) 已经形成比较清楚的 `ApiBootstrapper`。
  - 但 app 内仍保留厚实现 module，尤其是 [`apps/api/src/modules/powersync/module.ts`](../../../apps/api/src/modules/powersync/module.ts) 直接承载 token、CRUD normalization、Prisma delegate mapping、snapshot endpoint 等大量逻辑。
  - `dashboard` 也仍保留 app-side read adapter 逻辑，说明 API app 还没有完全退回到 transport/infrastructure edge。
- `desktop`
  - 仍是最重的 runtime。
  - [`apps/desktop/src/main/main.ts`](../../../apps/desktop/src/main/main.ts)、[`window-manager.ts`](../../../apps/desktop/src/main/lifecycle/window-manager.ts)、[`session-manager.ts`](../../../apps/desktop/src/main/modules/authentication/infrastructure/session-manager.ts) 共同说明 main-process 仍在持有大量业务与 lifecycle orchestration。
  - 这部分已经在 desktop auth/profile 方案里覆盖，但从 app-family 角度看，它依然是最主要的 apps-as-containers 偏移点。
- `ai-service`
  - app factory [`apps/ai-service/src/ai_service/app.py`](../../../apps/ai-service/src/ai_service/app.py) 本身相对清楚：settings、shared http client、service wiring、middleware、router 注册。
  - 但 app 内部的 Python package 已经形成独立子系统，且有明显 monolith hotspot：
    - [`services/goal_planning_service.py`](../../../apps/ai-service/src/ai_service/services/goal_planning_service.py) 约 `42.0 KB`
    - [`evals/runner.py`](../../../apps/ai-service/src/ai_service/evals/runner.py) 约 `39.1 KB`
  - 说明 ai-service 的问题不是 app shell 不清楚，而是 service / eval / orchestrator 子系统还缺更深的 module seam。

### 仓库覆盖审计

- 业务 feature 包：`account`、`ai`、`authentication`、`editor`、`goal`、`governance`、`notification`、`reminder`、`repository`、`schedule`、`setting`、`task`
  - 已覆盖
  - 主要落在 Wave B、C、D、E
  - 其中 `goal`、`repository`、`schedule`、`reminder`、`task`、`ai` 是当前主热点
- 业务 outlier 包：`dashboard`
  - 已覆盖
  - 主要落在 Batch 5 / Issue E1
  - 当前是 server shape tracer bullet
- 前端 app-shell 包：`app-vue`、`app-react`
  - 已覆盖
  - 主要落在 Wave B、C、E
  - 当前问题不是单个 feature，而是 shell/provider/hook/util/feature surface 混装
- protocol / transport / kernel / test support 包：`contracts`、`http-client`、`ipc-client`、`utils`、`patterns`、`test-utils`
  - 已覆盖
  - 主要落在 Wave A、B、E
  - 当前问题是 family contract 过宽、transport seam 不一致、治理不足
- app runtime：`web`、`mobile`、`api`、`desktop`、`ai-service`
  - 已覆盖
  - 主要落在 Wave B、D
  - `mobile` / `web` 作为 thin-shell 对照组，`api` / `desktop` / `ai-service` 是主要收边对象
- UI family：`ui-core`、`ui-vue-shadcn`、`ui-react-native`
  - 已标记为观察项
  - 当前未发现与 `app-vue` / `app-react` 同级的 architecture drift
  - 仅在 support package family contract 收敛时顺带审视导出面，不作为首批重构中心
- data / asset / schema family：`assets`、`powersync-schema`
  - 已标记为观察项
  - 当前主要承担资源清单或 schema 清单职责
  - 体积大但不构成当前的主架构摩擦
- shared foundation：`domain-shared`
  - 已标记为观察项
  - 当前根入口较窄，只暴露 shared primitives
  - 除非后续发现 shared primitive 语义漂移，否则不单独起 tranche
- database infrastructure：`database`
  - 已标记为次优先级观察项
  - 当前作为 Prisma 运行时与生成客户端的统一入口，[`packages/database/src/index.ts`](../../../packages/database/src/index.ts) 角色相对清楚
  - 若后续 app runtime 收边要求进一步外推连接生命周期，再单独起 issue
- standalone scheduler family：`scheduler-server`
  - 已标记为次优先级观察项
  - 当前更像独立引擎包，[`packages/scheduler-server/src/index.ts`](../../../packages/scheduler-server/src/index.ts) 导出接口、引擎、类型
  - 仅当 `schedule` / singleton scheduler 清退需要时再升级优先级
- 仓库级治理与 workspace config：`package.json`、[`project.json`](../../../project.json)、[`nx.json`](../../../nx.json)、[`eslint.config.ts`](../../../eslint.config.ts)
  - 已覆盖
  - 主要落在 Wave A
  - 当前它们是“规则真值入口”，不是独立业务模块；重构重点在让这些入口与真实架构重新对齐
- tooling / audit scripts：`tools/docs/*`、`tools/governance/*`、`tools/test/*`
  - 已覆盖
  - 主要落在 Wave A 与验证矩阵
  - 当前优先级集中在 governance/docs/test target 审计脚本；其余 build/publish/helper script 暂不作为主重构对象
- infra/devops helper scripts：`tools/docker/*`、各类本地发布/构建脚本
  - 已标记为观察项
  - 当前更偏运行与发布支持，不是当前最主要的 architecture drift 来源
  - 除非后续发现它们反向固化了错误的 package/app seam，否则不单独起 tranche

### 当前不建议优先开刀的区域

- locale / schema 大文件
  - [`packages/app-vue/src/locales/en-US.ts`](../../../packages/app-vue/src/locales/en-US.ts)
  - [`packages/app-vue/src/locales/zh-CN.ts`](../../../packages/app-vue/src/locales/zh-CN.ts)
  - [`packages/powersync-schema/src/index.ts`](../../../packages/powersync-schema/src/index.ts)
  - 原因：这些文件大，但主要是数据清单，不是当前 deepest architecture friction
- Expo Router route wrapper
  - `apps/mobile/src/app/*`
  - 原因：当前已经接近 thin shell，应作为正例保留，而不是优先重构
- cohesive UI family
  - `ui-core`、`ui-vue-shadcn`、`ui-react-native`
  - 原因：目前更像稳定 UI family，没有证据显示它们正在吸收跨层复杂度
- infra/devops helper scripts
  - `tools/docker/*`、发布脚本、本地 compose helper
  - 原因：当前更接近运维支持脚本，不是“业务逻辑与架构语言不一致”的主战场

这些都说明当前最大的成本不是某个 bug，而是 seam 不统一，导致理解成本、修改成本和测试策略都分散。

## 需要深化的重构方向

### 1. 深化前端 feature module，拆掉大而浅的 composable / store / view

**涉及 module**

- `packages/app-vue/src/modules/goal/*`
- `packages/app-vue/src/modules/repository/*`
- `packages/app-vue/src/modules/ai/*`
- `packages/app-vue/src/modules/editor/*`

**问题**

- `useGoal`、`useRepository` 这类 module interface 很宽，内部同时承担 service orchestration、DTO 转换、store mutation、错误翻译、平台恢复、上传流程和 UI 状态。
- 删除这些 file 后，复杂度不会消失，只会散落到多个 caller，说明当前 module 还没真正做深，而是把许多并列职责堆在一起。
- 大 view 例如 `AIChatView.vue` 直接承载 workflow state、持久化恢复、列表切换、工具模式切换和消息 UI，locality 很差。

**目标状态**

- 每个 feature 拆成明确的 presentation module：
  - `view-model module`
  - `workflow/orchestration module`
  - `store module`
  - `platform adapter`
- composable 只暴露小 interface，不再直接知道 transport、desktop auth recovery、IPC 清洗等细节。
- 把“操作流程”从 view/composable 挪到更深的 application-facing module。

**收益**

- 提高 locality：修改一个流程时不必同时进入 view、store、gateway、desktop recovery 分支。
- 提高 leverage：页面只消费少量 view-model interface。
- 测试会从“mount 大组件 + mock 一切”转成“直接测 workflow module / view-model module”。

### 2. 建立统一的 client composition seam，删除 web / react 重复 wiring

**涉及 module**

- [`apps/web/src/platform/di-app.ts`](../../../apps/web/src/platform/di-app.ts)
- [`packages/app-react/src/providers/app-client-registry-provider.tsx`](../../../packages/app-react/src/providers/app-client-registry-provider.tsx)
- 各 `packages/*/application-client`
- 各 `packages/*/infrastructure-client`

**问题**

- Web 和 React 都在做同一件事：把 `httpClient` 组装成 feature service。
- 当前 seam 太低级，导致每个 runtime 都必须重复知道 feature service 构造细节。
- `app-vue`、`app-react`、`apps/web` 分别各有一套 client wiring 语言，理解成本高。

**目标状态**

- 新建统一 `client registry module` 或 `runtime client module factory`。
- 所有 feature 统一提供 `createXxxServiceFromClientAdapters(...)` 或 `registerXxxClient(...)` 形态。
- Web、Desktop Renderer、Mobile 只决定 transport adapter，不再逐个手写 service 组装。

**收益**

- 提高 leverage：新增 feature 时只补一个标准 factory，不再修改多处 runtime wiring。
- 提高 locality：client 装配逻辑收敛到一处。
- 让 runtime container 更接近纯 container。

### 3. 把 desktop authentication 从 app 内子架构提炼为独立 deep module

**涉及 module**

- `apps/desktop/src/main/modules/authentication/*`
- `apps/desktop/src/main/profile/*`
- `apps/desktop/src/main/auth/*`
- `packages/authentication/*`

**问题**

- Desktop auth 现在基本形成了一套独立系统，但留在 `apps/desktop` 内部。
- `AuthDesktopApplicationService`、`SessionManager`、`TokenManager`、profile runtime manager 之间 seam 模糊，且大量通过 singleton 或 “先初始化再取现成实例” 协调。
- 这直接违背 `apps as containers` 的目标。

**目标状态**

- 提取 `desktop-auth` deep module，至少形成：
  - `session lifecycle module`
  - `credential/offline auth module`
  - `desktop auth shell adapter`
  - `profile-bound auth runtime module`
- app 侧只保留启动顺序、窗口事件和 IPC 注册。
- `SessionManager` 拆分为更小的 module：
  - session restore
  - token refresh orchestration
  - device identity
  - offline login
  - lifecycle timer

**收益**

- 将 desktop 主进程从“业务子系统容器”拉回真正的 runtime container。
- 测试更容易做成 module-level，而不是必须拉起整个 main-process 风格上下文。

### 4. 统一 server-side module shape，停止每个领域自创分层语言

**涉及 module**

- `packages/goal`
- `packages/task`
- `packages/schedule`
- `packages/reminder`
- `packages/dashboard`
- `apps/api/src/modules/dashboard`
- `apps/api/src/modules/powersync`

**问题**

- 不同领域 package 在 `application-server` 里分别使用 `services`、`use-cases`、`ports`、`query service` 等不同命名和结构。
- `dashboard` 目前只是一个单文件 helper，不是第一类 module。
- app 侧仍有 `dashboard-read-service.ts` 这类“半提取”逻辑，说明领域抽象尚未闭合。

**目标状态**

- 为所有 server feature 定义统一 module shape：
  - `domain-server`
  - `application-server/commands`
  - `application-server/queries`
  - `infrastructure-server/adapters`
  - `api/transport`
  - `module.ts` composition root
- `dashboard` 升级成真正的 read-model module，而不是单个函数文件。
- `powersync` 明确标记为 runtime-specific integration module；与领域逻辑保持清晰 seam。

**收益**

- AI / 人类维护者都能预测目录与职责。
- code review 的注意力能从“这块到底属于哪一层”转向“实现是否正确”。

### 5. 删除 legacy container / singleton seam，收敛到一种 DI 语言

**涉及 module**

- `packages/governance/src/infrastructure-server/di/governance-container.ts`
- `packages/goal/src/shared/di.ts`
- `apps/api/src/shared/infrastructure/cron/*`
- `packages/utils/src/*initialization-manager*`
- Desktop 各种 `getInstance()` manager

**问题**

- 现在同时存在：
  - composition root factory
  - singleton manager
  - generic container helper
  - active module singleton
- 这会让 caller 无法预期应该通过构造注入、module factory 还是全局查找获取依赖。

**目标状态**

- 只保留两层 seam：
  - composition root
  - explicit adapter / service instance
- 只在极少数必须全局唯一的 runtime resource 上保留单例，并写清原因。
- 清退 `legacy`、`deprecated`、`backward compatibility` 专用 container。

**收益**

- 降低隐藏状态。
- 提高测试可替换性。
- 降低初始化顺序 bug。

### 6. 分离 platform adapter 与 shared presentation，避免 Electron 分支污染共享 UI

**涉及 module**

- `packages/app-vue/src/modules/authentication/composables/useAuth.ts`
- `packages/app-vue/src/shared/utils/desktop-*`
- `packages/app-vue/src/layouts/MainLayout.vue`
- `apps/desktop/src/renderer/platform/*`

**问题**

- 共享 Vue module 直接感知 `window.electronAPI`，导致 shared presentation interface 被 platform 细节污染。
- 这降低了 package 的可复用性，也让 Web/Desktop 分支逻辑在同一 caller 中缠绕。

**目标状态**

- Electron 专属能力统一走 `desktop renderer adapter`。
- shared UI module 只依赖抽象 interface，例如：
  - `AuthEnvironmentPort`
  - `WindowChromePort`
  - `DesktopSessionRecoveryPort`
- runtime 决定注入 web adapter 还是 desktop adapter。

**收益**

- 前端 shared module 更纯。
- 框架共享和平台共享不再互相污染。

### 7. 把测试 taxonomy 和治理规则收敛成可执行真值

**涉及 module**

- `docs/test/*`
- `docs/architecture/adr/ADR-013-standard-testing-strategy.md`
- `tools/governance/file-naming-audit.mjs`
- `project.json`
- `tools/test/*`

**问题**

- 测试命名和入口规则分散在 ADR、薄文档和真实 target 中，且已经发生漂移。
- 现有治理主要关注文档入口、project target 和 source file naming，但没有覆盖：
  - 测试 taxonomy 一致性
  - architecture boundary 违规
  - singleton / service locator 回流
  - shared package 的 runtime-specific API 访问
- 结果是“规则存在，但不构成 gate”。

**目标状态**

- 为测试建立单一真值：
  - 快测试
  - 集成测试
  - smoke
  - e2e
  - bench
- ADR、`docs/test` 和 target 命名统一到同一种语言。
- 扩展 governance checks，新增至少四类 audit：
  - shared package 禁止 `window.electronAPI`
  - 禁止新增 `getInstance()` / singleton seam
  - 测试文件命名与 target taxonomy 对齐
  - `apps/*` 禁止新增业务 use-case / repository implementation

**收益**

- 让文档、治理和代码现实重新对齐。
- 防止本次重构完成后再次回到“规则靠口头记忆”的状态。
- 把架构约束从 review 经验升级为可执行 gate。

### 8. 重建 boundary model，让“架构图”与“治理图”一致

**涉及 module**

- `eslint.config.ts`
- `nx.json`
- 各 `project.json`
- `docs/standards/architecture.md`
- `docs/architecture/adr/ADR-009*`、`ADR-016*`、`ADR-023*`

**问题**

- 当前 boundary model 是 project-level tag model，但 feature package 现实是 package 内部包含多层。
- 这导致治理只能约束 “goal 不能依赖 task”，却无法约束 “goal 的 domain-server 不能摸到 infrastructure-server”。
- 更严重的是，文档口径与 lint 口径冲突：标准文档说 domain 不能依赖 infrastructure，lint 却允许 `layer:domain -> layer:infra`。

**目标状态**

- 明确两种 boundary：
  - project boundary
  - package-internal boundary
- 对单包多层 feature，引入更细粒度的 enforce 方式，例如：
  - path-based restricted imports
  - subpath export discipline
  - feature-internal lint rules
- 文档、ADR、lint rule 三者收敛到一个一致说法。

**收益**

- 让治理工具真正表达目标架构，而不是只表达近似版本。
- 减少“规则写了，但越界仍合法”的假安全感。
- 为后续所有重构 tranche 提供可回归的硬约束。

### 9. 把重复实现从“复制粘贴复用”改成 deep module 复用

**涉及 module**

- `packages/app-vue/src/modules/schedule/components/*TasksCard.vue`
- `packages/app-vue/src/modules/editor/utils/*index*.ts`
- `packages/app-vue/src/modules/authentication/components/*Form.vue`
- `apps/desktop/src/main/modules/authentication/application/__tests__/*`

**问题**

- 当前重复不是偶发，而是集中出现在架构热点区域。
- 这说明调用方拿不到足够深的 module，只能复制已有实现再局部改名。
- UI 层、测试层和 utility 层都出现这种模式，意味着问题不只是“少一个 helper”，而是 interface 太浅。

**目标状态**

- 对 UI：提取共享 card shell / shared section / shared props shape。
- 对测试：提取统一 fixture builder 和 coordinator harness。
- 对 utility：把重复算法收敛到单一 index/query module。
- 对疑似平行副本：明确保留一个 canonical module，删除另一个。

**收益**

- 降低维护成本。
- 避免一个行为改动需要同步改 2-3 份近似实现。
- 为后续拆分大模块创造更稳定的复用基座。

### 10. 把启动/初始化生命周期从全局 phase registry 收敛为显式 runtime seam

**涉及 module**

- [`packages/utils/src/initialization-manager.ts`](../../../packages/utils/src/initialization-manager.ts)
- [`apps/web/src/bootstrap/app.ts`](../../../apps/web/src/bootstrap/app.ts)
- [`apps/api/src/main.ts`](../../../apps/api/src/main.ts)
- [`apps/desktop/src/shared/initialization/infra-initialization.ts`](../../../apps/desktop/src/shared/initialization/infra-initialization.ts)
- [`apps/desktop/src/renderer/bootstrap/app.ts`](../../../apps/desktop/src/renderer/bootstrap/app.ts)
- [`packages/notification/src/api/initialization.ts`](../../../packages/notification/src/api/initialization.ts)
- [`packages/app-vue/src/modules/notification/initialization/index.ts`](../../../packages/app-vue/src/modules/notification/initialization/index.ts)
- [`packages/app-vue/src/modules/goal/initialization/index.ts`](../../../packages/app-vue/src/modules/goal/initialization/index.ts)
- [`packages/goal/src/api/initialization.ts`](../../../packages/goal/src/api/initialization.ts)

**问题**

- 当前 feature package 通过 `registerXxxInitializationTasks()` 自注册到全局 `InitializationManager`，runtime container 只是在事后统一 `executePhase(...)`。
- 这使启动顺序、所有权和失败语义被隐藏进全局 phase registry，而不是显式留在 runtime composition root。
- 结果是 caller 很难判断某个 feature 是“导入即可生效”、需要“先注册再执行”，还是已经被其它 runtime 隐式初始化。

**目标状态**

- 用显式 `startup plan module` / `runtime lifecycle hook` 取代全局任务注册。
- feature package 导出：
  - `createXxxStartupHook(...)`
  - 或 `getXxxRuntimeLifecycle(...)`
- Web、API、Desktop Renderer / Main 在 composition root 中显式拼装和执行这些 hook。
- 全局 `InitializationManager` 只保留在极少数跨 runtime 的兼容期，最终退出主路径。

**收益**

- 启动顺序变得可读、可测、可替换。
- runtime container 真正拥有生命周期，而不是把生命周期外包给一个全局 phase bus。
- 可以独立验证某个 feature 的 startup contract，而不必构造整个 app phase 环境。

### 11. 明确 support package family contract，停止用 mega package 承载多种角色

**涉及 module**

- [`packages/app-vue/src/index.ts`](../../../packages/app-vue/src/index.ts)
- [`packages/app-react/src/index.ts`](../../../packages/app-react/src/index.ts)
- [`packages/utils/src/index.ts`](../../../packages/utils/src/index.ts)
- [`packages/patterns/src/index.ts`](../../../packages/patterns/src/index.ts)
- [`packages/test-utils/src/index.ts`](../../../packages/test-utils/src/index.ts)

**问题**

- 当前不少 support 包不是“没有结构”，而是“每个包都把多种 family contract 混在一个入口里”。
- 这会让 caller 很难预测一个 package 到底是：
  - framework shell
  - feature presentation
  - kernel helper
  - test support
  - protocol surface
- 一旦根导出成为 mega barrel，任何新增能力都更容易被“顺手塞进现有包”，而不是形成更清楚的 seam。

**目标状态**

- 先定义 support package taxonomy：
  - app shell packages
  - protocol / transport packages
  - kernel / pattern packages
  - test support packages
  - UI family packages
- 每个 family 只允许一种主语言和一种导出策略。
- 对于 `app-vue` / `app-react`，优先收敛为 curated entrypoints + subpath exports，而不是继续扩大根 barrel。
- 对于 `utils` / `patterns` / `test-utils`，收缩到明确的 family contract；必要时拆成更小的 package 或更严格的子路径。

**收益**

- 降低 support 层的概念漂移。
- 让新增代码更容易找到“应该落在哪类包”。
- 避免业务重构完成后，又被 support mega package 把复杂度重新吸回去。

### 12. 对齐 protocol / transport support package，强制显式 adapter seam

**涉及 module**

- [`packages/contracts/src/index.ts`](../../../packages/contracts/src/index.ts)
- [`packages/contracts/src/electron/ipc-channels.ts`](../../../packages/contracts/src/electron/ipc-channels.ts)
- [`packages/contracts/src/mocks/goal.mock.ts`](../../../packages/contracts/src/mocks/goal.mock.ts)
- [`packages/http-client/src/result-http-client.ts`](../../../packages/http-client/src/result-http-client.ts)
- [`packages/ipc-client/src/types.ts`](../../../packages/ipc-client/src/types.ts)

**问题**

- `contracts` 当前同时承载正式协议、runtime-specific Electron channel、以及 mock generator。
- `http-client` 与 `ipc-client` 虽然都是 transport adapter family，但 explicitness 不一致：前者要求显式 config，后者允许隐式读取 `window.electronAPI`。
- 这会让“协议在哪里结束，runtime adapter 从哪里开始”变得模糊。

**目标状态**

- 保持 `contracts` 的协议中心角色，但把 family 内边界说清：
  - 正式协议
  - runtime-specific protocol
  - 测试 mock surface
- transport package 统一采用显式 adapter creation language：
  - 显式传入 `bridge` / `client`
  - runtime fallback 只能存在于 runtime edge，不存在于 support package 默认路径
- 让 HTTP / IPC adapter family 在 caller 视角上尽可能对齐。

**收益**

- 协议、运行时和测试数据不再在同一层次混用。
- transport seam 更可预测，更容易做多 runtime 复用。
- 后续治理可以明确禁止 support package 默认触碰 `window` / runtime global。

### 13. 重申 apps-as-containers，把 app 自有厚逻辑压回 runtime edge 或独立 module

**涉及 module**

- [`apps/api/src/bootstrap.ts`](../../../apps/api/src/bootstrap.ts)
- [`apps/api/src/modules/powersync/module.ts`](../../../apps/api/src/modules/powersync/module.ts)
- [`apps/api/src/modules/dashboard/module.ts`](../../../apps/api/src/modules/dashboard/module.ts)
- [`apps/desktop/src/main/main.ts`](../../../apps/desktop/src/main/main.ts)
- [`apps/ai-service/src/ai_service/app.py`](../../../apps/ai-service/src/ai_service/app.py)
- [`apps/ai-service/src/ai_service/services/goal_planning_service.py`](../../../apps/ai-service/src/ai_service/services/goal_planning_service.py)
- [`apps/ai-service/src/ai_service/evals/runner.py`](../../../apps/ai-service/src/ai_service/evals/runner.py)

**问题**

- 当前各 app runtime 已经不是统一状态：
  - `mobile` 很薄
  - `web` 基本薄，但仍有 startup / client seam 漂移
  - `api` 和 `desktop` 仍保留厚 app-owned module
  - `ai-service` app shell 还算清楚，但内部 Python 子系统开始在 app 范围内膨胀
- 如果不把 app-layer 也纳入大重构，最终只会出现“packages 更整齐了，但 apps 继续长业务逻辑”的二次偏移。

**目标状态**

- Web / Mobile 保持 thin runtime shell，避免回流。
- API app 仅保留：
  - bootstrap
  - transport registration
  - runtime-specific integration module
- Desktop app 仅保留：
  - process lifecycle
  - window lifecycle
  - runtime bootstrap
- ai-service app 仅保留：
  - FastAPI process wiring
  - middleware / route registration
  - process-scoped shared resources
- 任何超出这些职责的厚逻辑，都应下沉到独立 module 或在 app 内形成更清楚的 submodule seam。

**收益**

- 把 ADR-016 真正落实到所有 runtime，而不是只落实到一部分前端 app。
- 让“app 是容器还是业务实现”不再取决于具体 runtime。
- 为后续 multi-runtime 共享和治理 audit 提供一致基线。

## 大重构方案

### Phase 0: 先立“唯一 shape”

- 输出一份 `feature module shape` 规范，覆盖 client / server / presentation / runtime 四类 module。
- 明确 boundary model 的唯一真值：project-level 规则负责什么，package-internal 规则负责什么。
- 把命名规则固定下来：
  - `*.use-case.ts`
  - `*.port.ts`
  - `*.adapter.ts`
  - `*.module.ts`
  - `*.view-model.ts`
- 为禁止模式补治理规则：
  - 新增 runtime 代码不得引入新的 `getInstance()`
  - `packages/app-vue` 不得直接访问 `window.electronAPI`
  - `apps/*` 不得新增业务规则 module
  - 测试 taxonomy 必须与 target 命名和文档一致

### Phase 1: 先收敛 client composition seam

- 先抽统一 `client registry` / `runtime client module factory`
- 让 Web、Desktop Renderer、Mobile 共享 service 装配语言
- 删除 `apps/web/src/platform/di-app.ts` 中按 feature 手工拼接的大段 wiring

**原因**

- 这是后续前端 feature 深化的前提。
- 不先统一 composition seam，拆大 composable 会变成“从一个大文件拆成很多仍然耦合 runtime 的小文件”。

### Phase 2: 拆 Vue 侧四个最大浅 module

- 第一批：
  - `goal`
  - `repository`
  - `editor`
  - `ai`
- 每个 feature 按相同模板拆：
  - `workflow module`
  - `view-model module`
  - `store module`
  - `platform adapter`

**原因**

- 这是最直接影响日常开发速度和理解成本的区域。
- 这些 file 已经是最明显的 locality 热点。

### Phase 3: 提炼 desktop-auth module

- 从 `apps/desktop/src/main/modules/authentication/*` 开始抽离
- 目标是让 `main.ts` 只做：
  - runtime boot
  - IPC registration
  - window / lifecycle glue
- 同时把 profile runtime 与 auth runtime 的耦合改成显式 seam

### Phase 4: 统一 server feature module shape

- 以 `dashboard` 为 tracer bullet，先把它升级成完整 module
- 然后对齐 `schedule`、`reminder`
- 最后清理 `goal`、`task` 中仍然历史遗留的命名和 layering 偏差

### Phase 5: 清退 legacy seam

- 删除共享 package 中的 legacy container
- 删除旧兼容 entry point
- 删除只为旧调用方保留的 singleton helper

### Phase 6: 用治理脚本守住结果

- 增加 lint / governance check：
  - 检测 `window.electronAPI` 是否出现在 shared package
  - 检测 `getInstance()` 是否新增
  - 检测 `apps/*` 是否新增业务 use-case / repository 实现
  - 检测 feature package 是否满足标准 shape
  - 检测测试文件命名是否符合统一 taxonomy
  - 检测 ADR / docs/test / target 命名是否仍然一致
  - 检测文档规则与 lint depConstraints 是否仍然一致

## 实施矩阵

### Tranche A: 治理对齐层

- 目标
  - 统一命名、测试 taxonomy、boundary model 口径
  - 把“应然架构”转成可执行 gate
- 前置条件
  - 无
- 产出
  - 更新后的 architecture/test/governance 文档
  - 扩展后的 governance audit
  - package-internal boundary rule 设计
- 验收
  - 文档、lint、target 命名不再自相矛盾
  - `governance-check` 能捕获 shared UI 访问 `window.electronAPI`
  - `governance-check` 能捕获新增 singleton seam

### Tranche B: Client composition 收敛层

- 目标
  - 消除 Web/React/Renderer 的重复 service wiring
- 前置条件
  - Tranche A 至少完成 boundary model 与命名真值定义
- 产出
  - 统一 client registry / runtime client factory
  - 删除一批 runtime 手写 wiring
- 验收
  - 新增一个 feature client 时，不需要在多个 runtime 重复写装配代码
  - `apps/web/src/platform/di-app.ts` 不再是 feature-by-feature 拼接中心

### Tranche C: Vue shared presentation 深化层

- 目标
  - 拆解 `goal`、`repository`、`editor`、`ai` 中的大浅 module
- 前置条件
  - client composition seam 已稳定
- 产出
  - workflow/view-model/store/platform adapter 四分结构
  - 更小的 composable interface
- 验收
  - 大文件长度和单模块职责显著下降
  - feature 测试更多落在 workflow/view-model，而非巨型 view mount

### Tranche D: Desktop auth 提炼层

- 目标
  - 把桌面认证子系统从 app 内逻辑迁出为独立 deep module
- 前置条件
  - boundary model 已可表达 runtime vs feature seam
- 产出
  - `desktop-auth` 相关 module
  - 更薄的 `main.ts`
  - 拆分后的 session lifecycle modules
- 验收
  - main-process 代码以 boot/wiring 为主
  - auth 生命周期不再依赖层层 singleton 获取

### Tranche E: Server feature shape 对齐层

- 目标
  - 用同一种语言表达 `goal/task/schedule/reminder/dashboard`
- 前置条件
  - governance 能表达 package-internal boundary
- 产出
  - 升级后的 `dashboard` module
  - 对齐后的 application-server shape
- 验收
  - 新 feature package 可以被模板化生成
  - 审查时不再需要先判断“这个模块作者习惯哪套分层词汇”

## 首批执行 backlog

### Batch 1: 修治理真值，不先改业务逻辑

**建议提交序列**

1. 对齐 architecture / test / governance 文档口径
2. 修正 lint depConstraints 与文档冲突
3. 扩展 governance audit，覆盖 shared-electron / singleton / test taxonomy

**首批目标文件**

- [`docs/standards/architecture.md`](../../../docs/standards/architecture.md)
- [`docs/test/README.md`](../../../docs/test/README.md)
- [`docs/architecture/adr/ADR-013-standard-testing-strategy.md`](../../../docs/architecture/adr/ADR-013-standard-testing-strategy.md)
- [`eslint.config.ts`](../../../eslint.config.ts)
- [`project.json`](../../../project.json)
- [`tools/governance/file-naming-audit.mjs`](../../../tools/governance/file-naming-audit.mjs)
- 新增 architecture-boundary audit 脚本

**切入理由**

- 现在如果先做业务重构，仓库没有足够的 gate 防止新代码继续回流到旧形态。
- 这批改动最适合作为所有后续 tranche 的前置基线。

### Batch 2: 统一 client composition seam

**建议提交序列**

1. 抽 `runtime client registry` / `client module factory`
2. 让 React provider 消费统一 registry
3. 让 Web `di-app` 消费统一 registry
4. 移除 editor runtime 的 ad-hoc service locator

**首批目标文件**

- [`apps/web/src/platform/di-app.ts`](../../../apps/web/src/platform/di-app.ts)
- [`packages/app-react/src/providers/app-client-registry-provider.tsx`](../../../packages/app-react/src/providers/app-client-registry-provider.tsx)
- [`packages/app-react/src/providers/app-session-provider.tsx`](../../../packages/app-react/src/providers/app-session-provider.tsx)
- [`packages/app-vue/src/modules/editor/services/editor-client-gateway.ts`](../../../packages/app-vue/src/modules/editor/services/editor-client-gateway.ts)
- [`packages/app-vue/src/modules/editor/services/editor-service-runtime.ts`](../../../packages/app-vue/src/modules/editor/services/editor-service-runtime.ts)

**直接证据**

- Web 侧 [`di-app.ts`](../../../apps/web/src/platform/di-app.ts) 从 `34` 行到 `189` 行维护按 feature 展开的装配逻辑。
- React 侧 [`createAppClientRegistry`](../../../packages/app-react/src/providers/app-client-registry-provider.tsx) 已经在 `45` 行形成了更深的 registry seam。
- Editor 侧仍通过 [`getEditorRuntimeService()`](../../../packages/app-vue/src/modules/editor/services/editor-client-gateway.ts:17) 访问一个显式 service locator。

### Batch 2.5: 去掉全局 InitializationManager 注册式启动

**建议提交序列**

1. 定义 `startup hook` / `runtime lifecycle` 的唯一创建语言
2. 让 notification / goal 停止自注册全局 phase task
3. 让 Web / API / Desktop 显式组装 startup plan
4. 缩小 `InitializationManager` 到兼容层，最终退出主路径

**首批目标文件**

- [`packages/utils/src/initialization-manager.ts`](../../../packages/utils/src/initialization-manager.ts)
- [`apps/web/src/bootstrap/app.ts`](../../../apps/web/src/bootstrap/app.ts)
- [`apps/api/src/main.ts`](../../../apps/api/src/main.ts)
- [`apps/desktop/src/shared/initialization/infra-initialization.ts`](../../../apps/desktop/src/shared/initialization/infra-initialization.ts)
- [`apps/desktop/src/renderer/bootstrap/app.ts`](../../../apps/desktop/src/renderer/bootstrap/app.ts)
- [`packages/notification/src/api/initialization.ts`](../../../packages/notification/src/api/initialization.ts)
- [`packages/app-vue/src/modules/notification/initialization/index.ts`](../../../packages/app-vue/src/modules/notification/initialization/index.ts)
- [`packages/app-vue/src/modules/goal/initialization/index.ts`](../../../packages/app-vue/src/modules/goal/initialization/index.ts)
- [`packages/goal/src/api/initialization.ts`](../../../packages/goal/src/api/initialization.ts)

**直接证据**

- `InitializationManager.getInstance()` 当前命中 `9` 个文件，已经跨越 Web、API、Desktop、shared Vue feature 和 package API 层。
- Web 侧 [`bootstrap/app.ts`](../../../apps/web/src/bootstrap/app.ts) 先 `registerNotificationInitializationTasks()`，再统一执行 `APP_STARTUP` phase。
- [`packages/goal/src/api/initialization.ts`](../../../packages/goal/src/api/initialization.ts) 与 [`packages/app-vue/src/modules/notification/initialization/index.ts`](../../../packages/app-vue/src/modules/notification/initialization/index.ts) 都在通过 package-local helper 向全局 phase registry 注入任务，说明 runtime lifecycle ownership 已经漂出 composition root。

### Batch 3: 先拆两块最高价值的 Vue shared module

**建议提交序列**

1. 拆 `goal`
2. 拆 `repository`
3. 把 desktop-specific recovery 从 shared composable 移到 adapter

**首批目标文件**

- [`packages/app-vue/src/modules/goal/composables/useGoal.ts`](../../../packages/app-vue/src/modules/goal/composables/useGoal.ts)
- [`packages/app-vue/src/modules/goal/stores/goal-store.ts`](../../../packages/app-vue/src/modules/goal/stores/goal-store.ts)
- [`packages/app-vue/src/modules/repository/composables/useRepository.ts`](../../../packages/app-vue/src/modules/repository/composables/useRepository.ts)
- [`packages/app-vue/src/modules/repository/stores/repository-store.ts`](../../../packages/app-vue/src/modules/repository/stores/repository-store.ts)
- [`packages/app-vue/src/shared/utils/desktop-auth-recovery.ts`](../../../packages/app-vue/src/shared/utils/desktop-auth-recovery.ts)
- [`packages/app-vue/src/modules/authentication/composables/useAuth.ts`](../../../packages/app-vue/src/modules/authentication/composables/useAuth.ts)

**切入理由**

- `goal` 和 `repository` 已经同时具备：
  - 大文件
  - orchestration 过宽
  - store mutation 过多
  - platform recovery 混入
- 这两块拆完，shared presentation 的新 shape 会比较清晰，后续 `editor`、`ai` 可直接套模板。

### Batch 3.5: 删除热点目录里的平行副本和伪复用

**建议提交序列**

1. 先清理 `schedule` 的 triplicate cards
2. 再合并 `editor` 重复索引工具
3. 最后清理 `task` / `authentication` 的平行副本与镜像测试

**首批目标文件**

- [`packages/app-vue/src/modules/schedule/components/TaskModuleTasksCard.vue`](../../../packages/app-vue/src/modules/schedule/components/TaskModuleTasksCard.vue)
- [`packages/app-vue/src/modules/schedule/components/GoalTasksCard.vue`](../../../packages/app-vue/src/modules/schedule/components/GoalTasksCard.vue)
- [`packages/app-vue/src/modules/schedule/components/ReminderTasksCard.vue`](../../../packages/app-vue/src/modules/schedule/components/ReminderTasksCard.vue)
- [`packages/app-vue/src/modules/editor/utils/link-index.ts`](../../../packages/app-vue/src/modules/editor/utils/link-index.ts)
- [`packages/app-vue/src/modules/editor/utils/resource-reference-index.ts`](../../../packages/app-vue/src/modules/editor/utils/resource-reference-index.ts)
- [`packages/app-vue/src/modules/task/components/TaskInstanceCard.vue`](../../../packages/app-vue/src/modules/task/components/TaskInstanceCard.vue)
- [`packages/app-vue/src/modules/task/components/cards/TaskInstanceCard.vue`](../../../packages/app-vue/src/modules/task/components/cards/TaskInstanceCard.vue)
- [`packages/app-vue/src/modules/authentication/components/LoginForm.vue`](../../../packages/app-vue/src/modules/authentication/components/LoginForm.vue)
- [`packages/app-vue/src/modules/authentication/components/RegisterForm.vue`](../../../packages/app-vue/src/modules/authentication/components/RegisterForm.vue)

**切入理由**

- 这批文件已经不是“复杂但必要”，而是存在真实的复制实现。
- 如果不先消掉平行副本，后续拆分 deeper module 时会把重复一起抽象进去，反而固化错误结构。

### Batch 4: Desktop auth / profile lifecycle 解耦

**建议提交序列**

1. 先拆 `ProfileRegistry`
2. 再拆 `DesktopProfileRuntimeManager`
3. 最后再切 `AuthDesktopApplicationService` / `SessionManager`

**首批目标文件**

- [`apps/desktop/src/main/profile/profile-registry.ts`](../../../apps/desktop/src/main/profile/profile-registry.ts)
- [`apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts`](../../../apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts)
- [`apps/desktop/src/main/modules/authentication/application/auth-desktop-application-service.ts`](../../../apps/desktop/src/main/modules/authentication/application/auth-desktop-application-service.ts)
- [`apps/desktop/src/main/modules/authentication/infrastructure/session-manager.ts`](../../../apps/desktop/src/main/modules/authentication/infrastructure/session-manager.ts)
- [`apps/desktop/src/main/main.ts`](../../../apps/desktop/src/main/main.ts)

**直接证据**

- [`desktop-profile-runtime-manager.ts`](../../../apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts) 在 `131` 行开始承担 prepare/activate/deactivate 全流程，又直接碰 snapshot、db、auth service、session manager。
- [`profile-registry.ts`](../../../apps/desktop/src/main/profile/profile-registry.ts) 自身又是另一个 singleton owner。
- 两者 together 构成了 profile lifecycle 与 auth lifecycle 的缠绕中心。

### Batch 5: 用 dashboard 作为 server shape tracer bullet

**建议提交序列**

1. 拆 dashboard 的 read-model module
2. 把 API adapter 留在 app/package edge
3. 再对齐 `schedule` / `reminder`

**首批目标文件**

- [`packages/dashboard/src/index.ts`](../../../packages/dashboard/src/index.ts)
- [`apps/api/src/modules/dashboard/dashboard-read-service.ts`](../../../apps/api/src/modules/dashboard/dashboard-read-service.ts)
- [`apps/api/src/modules/dashboard/module.ts`](../../../apps/api/src/modules/dashboard/module.ts)

**切入理由**

- `dashboard` 当前是最典型的浅 module：单文件承载数据聚合、统计和投影规则。
- 它又横跨多个领域，非常适合作为“read-model module 应该长什么样”的 tracer bullet。

### Batch 5.5: 收敛 support package family contract 与导出边界

**建议提交序列**

1. 定义 support package taxonomy 与 family contract
2. 收瘦 `app-vue` / `app-react` 根导出
3. 对齐 `contracts` / `http-client` / `ipc-client` 的 protocol-transport seam
4. 收缩 `utils` / `patterns` / `test-utils` 的 catch-all surface

**首批目标文件**

- [`packages/app-vue/src/index.ts`](../../../packages/app-vue/src/index.ts)
- [`packages/app-react/src/index.ts`](../../../packages/app-react/src/index.ts)
- [`packages/utils/src/index.ts`](../../../packages/utils/src/index.ts)
- [`packages/patterns/src/index.ts`](../../../packages/patterns/src/index.ts)
- [`packages/test-utils/src/index.ts`](../../../packages/test-utils/src/index.ts)
- [`packages/contracts/src/index.ts`](../../../packages/contracts/src/index.ts)
- [`packages/contracts/src/electron/ipc-channels.ts`](../../../packages/contracts/src/electron/ipc-channels.ts)
- [`packages/contracts/src/mocks/goal.mock.ts`](../../../packages/contracts/src/mocks/goal.mock.ts)
- [`packages/http-client/src/result-http-client.ts`](../../../packages/http-client/src/result-http-client.ts)
- [`packages/ipc-client/src/types.ts`](../../../packages/ipc-client/src/types.ts)

**直接证据**

- [`packages/app-vue/src/index.ts`](../../../packages/app-vue/src/index.ts) 根导出同时暴露 DI、plugins、router、layouts、shared util 和多个 feature module。
- [`packages/app-react/src/index.ts`](../../../packages/app-react/src/index.ts) 根导出同时暴露 hooks、providers、screens、components 和 root layout。
- [`packages/utils/src/index.ts`](../../../packages/utils/src/index.ts) 同时暴露 domain 基类、frontend helpers、logger、validation、initialization manager。
- [`packages/ipc-client/src/types.ts`](../../../packages/ipc-client/src/types.ts) 当前允许不传 bridge 时直接从 `window.electronAPI` 取值，说明 support transport seam 还不够显式。

### Batch 6: 对齐 app runtime contract，清理 app-owned 厚逻辑

**建议提交序列**

1. 固化 apps-as-containers matrix，把 `mobile` / `web` 作为正例写成真值
2. 收边 API app-owned module，只保留 runtime-specific integration
3. 继续瘦身 Desktop main-process container
4. 为 ai-service 切开 app shell、service orchestration、eval harness

**首批目标文件**

- [`apps/api/src/bootstrap.ts`](../../../apps/api/src/bootstrap.ts)
- [`apps/api/src/modules/powersync/module.ts`](../../../apps/api/src/modules/powersync/module.ts)
- [`apps/api/src/modules/dashboard/module.ts`](../../../apps/api/src/modules/dashboard/module.ts)
- [`apps/desktop/src/main/main.ts`](../../../apps/desktop/src/main/main.ts)
- [`apps/ai-service/src/ai_service/app.py`](../../../apps/ai-service/src/ai_service/app.py)
- [`apps/ai-service/src/ai_service/services/goal_planning_service.py`](../../../apps/ai-service/src/ai_service/services/goal_planning_service.py)
- [`apps/ai-service/src/ai_service/evals/runner.py`](../../../apps/ai-service/src/ai_service/evals/runner.py)

**直接证据**

- [`apps/mobile/src/app/explore/repository.tsx`](../../../apps/mobile/src/app/explore/repository.tsx) 这类 route wrapper 说明 mobile 已经接近 thin shell，可作为对照组。
- [`apps/api/src/bootstrap.ts`](../../../apps/api/src/bootstrap.ts) 的 `ApiBootstrapper` 已经清楚，但 [`apps/api/src/modules/powersync/module.ts`](../../../apps/api/src/modules/powersync/module.ts) 仍承载大量厚实现。
- [`apps/ai-service/src/ai_service/app.py`](../../../apps/ai-service/src/ai_service/app.py) 本身 wiring 清楚，但 [`goal_planning_service.py`](../../../apps/ai-service/src/ai_service/services/goal_planning_service.py) 和 [`evals/runner.py`](../../../apps/ai-service/src/ai_service/evals/runner.py) 已经成为 app 内部子系统热点。

## 每批次风险控制

### Batch 1 风险

- 风险
  - 一次性 tightening audit 可能暴露大量现存违规
- 控制
  - 先以 report-only / allowlist 方式落地，再逐批收紧

### Batch 2 风险

- 风险
  - runtime 装配抽象过头，反而引入新间接层
- 控制
  - 只抽 “shared creation language”，不抽象业务 API

### Batch 2.5 风险

- 风险
  - 过早删除 phase registry，导致 runtime startup 顺序回归或 feature 漏初始化
- 控制
  - 先把 `startup hook` seam 显式化，再逐个 feature 从 registry 迁出
  - 保留短期兼容层，但只允许 runtime root 调用，不允许 feature 再继续自注册

### Batch 3 风险

- 风险
  - UI 行为回归
- 控制
  - 每拆一个 feature，同步补 workflow/view-model 测试而不是只依赖 mount test

### Batch 4 风险

- 风险
  - desktop auth/profile 生命周期边界切错，影响启动链路
- 控制
  - 先把 profile registry 与 runtime manager 解缠，再动 auth 生命周期

### Batch 5 风险

- 风险
  - dashboard 跨领域读取逻辑拆散后，read-model 语义不稳定
- 控制
  - 保留统一 `DashboardReadSource` seam，先抽 module，再考虑进一步按子视图拆分

### Batch 5.5 风险

- 风险
  - 一次性收紧 support package 导出面，可能影响大量现有导入路径
- 控制
  - 先定义 family contract 和推荐子路径，再逐步压缩 root barrel
  - 优先禁止新增混装，旧入口按 tranche 慢慢迁出，不在一批里暴力清空

### Batch 6 风险

- 风险
  - 把 app-owned 逻辑下沉时，容易误伤真正 runtime-specific integration
- 控制
  - 先区分“runtime edge 必须存在”和“只是 app 暂存的厚逻辑”
  - `mobile` / `web` 先作为 thin-shell 对照，再处理 `api` / `desktop` / `ai-service`

### Batch 3.5 风险

- 风险
  - 错把“有意分叉”当重复代码删除
- 控制
  - 先通过 props/behavior 对照确认 canonical module，再删副本
  - 先抽 shared piece，再删最薄的 mirror implementation

## 执行清单

### Batch 1 执行清单

- [ ] 对齐 [`docs/standards/architecture.md`](../../../docs/standards/architecture.md)、[`docs/test/README.md`](../../../docs/test/README.md)、[`ADR-013-standard-testing-strategy.md`](../../architecture/adr/ADR-013-standard-testing-strategy.md) 的命名和 layering 语言
- [ ] 修正 [`eslint.config.ts`](../../../eslint.config.ts) 中与文档冲突的 depConstraints
- [ ] 为测试目录定义“受控豁免”而不是“整体关闭边界检查”
- [ ] 扩展 [`tools/governance/file-naming-audit.mjs`](../../../tools/governance/file-naming-audit.mjs)，让测试文件命名进入治理范围
- [ ] 新增 architecture audit：扫描 shared package 中的 `window.electronAPI`
- [ ] 新增 singleton audit：扫描新增 `getInstance()` / `new XxxManager()` 风格回流
- [ ] 把新增 audit 接进 [`project.json`](../../../project.json) 的 `governance-check`

**建议提交切片**

1. 文档真值统一
2. Lint / depConstraints 对齐
3. Governance audits 落地并接入 root target

**完成定义**

- `docs`、ADR、lint 规则不再互相矛盾
- `governance-check` 能在 CI 上报告 platform leakage 和 singleton 回流
- 测试文件命名不再是治理盲区

### Batch 2 执行清单

- [ ] 先定义统一 `runtime client registry` interface，只承载 client adapter 装配
- [ ] 把 React 当前的 `createAppClientRegistry` 提炼成共享 module 或共享创建语言
- [ ] 让 [`app-session-provider.tsx`](../../../packages/app-react/src/providers/app-session-provider.tsx) 停止私有构造 auth client graph
- [ ] 让 [`apps/web/src/platform/di-app.ts`](../../../apps/web/src/platform/di-app.ts) 从“逐 feature 手工装配”收敛到“消费 registry/factory”
- [ ] 明确 editor runtime 是同一个 seam 的特例还是独立 workflow module
- [ ] 删除 [`editor-client-gateway.ts`](../../../packages/app-vue/src/modules/editor/services/editor-client-gateway.ts) 的 service locator 读法
- [ ] 为新 seam 补最小覆盖测试：web/runtime 创建、react/provider 创建、editor runtime 创建

**建议提交切片**

1. 抽共享 client creation language
2. React 接入统一 seam
3. Web 接入统一 seam
4. Editor 去掉 locator-style runtime access

**完成定义**

- Web、React、Editor 不再各自维护一套 feature client 装配语言
- 新增一个 feature client 时，只需要补同一种 registry/factory 入口
- runtime container 只决定 transport adapter，不决定 feature 内部 wiring

### Batch 2.5 执行清单

- [ ] 定义统一 `startup hook` / `runtime lifecycle` interface，替代 `registerXxxInitializationTasks()`
- [ ] 让 `notification` 的 Web / app-vue 初始化逻辑停止向全局 manager 自注册
- [ ] 让 `goal` 的初始化逻辑从 package API helper 改为显式 hook 输出
- [ ] 让 [`apps/web/src/bootstrap/app.ts`](../../../apps/web/src/bootstrap/app.ts) 显式创建并执行 startup plan，而不是“先注册再跑 phase”
- [ ] 让 [`apps/api/src/main.ts`](../../../apps/api/src/main.ts) 与 Desktop 初始化路径采用同一种 lifecycle 语言
- [ ] 缩小 [`packages/utils/src/initialization-manager.ts`](../../../packages/utils/src/initialization-manager.ts) 的职责范围，避免继续成为 feature startup bus
- [ ] 为 startup hook order / failure semantics 补独立测试

**建议提交切片**

1. 定义 lifecycle seam
2. `notification` 迁出 phase registry
3. `goal` 迁出 phase registry
4. Web / API / Desktop runtime startup plan 显式化

**完成定义**

- feature package 不再通过全局 singleton phase manager 隐式完成启动
- runtime composition root 明确拥有 startup order 和 failure semantics
- 新增 feature startup 时，调用方可以从显式 hook interface 预测初始化契约

### Batch 3 执行清单

- [ ] 先为 `goal` 列出 interface 面：view state、workflow、store mutation、desktop recovery、transport call
- [ ] 把 `goal` 中的 workflow/orchestration 从 [`useGoal.ts`](../../../packages/app-vue/src/modules/goal/composables/useGoal.ts) 挪到独立 module
- [ ] 让 [`goal-store.ts`](../../../packages/app-vue/src/modules/goal/stores/goal-store.ts) 回到状态持有者角色，不直接承载跨流程编排
- [ ] 用同样方式拆 [`useRepository.ts`](../../../packages/app-vue/src/modules/repository/composables/useRepository.ts)
- [ ] 把 [`desktop-auth-recovery.ts`](../../../packages/app-vue/src/shared/utils/desktop-auth-recovery.ts) 从 shared composable 依赖中抽离成 adapter
- [ ] 收敛 [`useAuth.ts`](../../../packages/app-vue/src/modules/authentication/composables/useAuth.ts) 的 platform 判断入口
- [ ] 为 `goal`、`repository` 各补一套 workflow-level 测试，避免只剩组件 mount 测试

**建议提交切片**

1. `goal` interface inventory + workflow module
2. `goal` composable/store 收口
3. `repository` workflow module
4. shared recovery adapter 提炼

**完成定义**

- `useGoal`、`useRepository` 不再同时承担 store、transport、platform recovery、error translation
- 共享 composable 只暴露页面真正消费的少量 interface
- 同类拆分模式可以直接复制到 `editor` 和 `ai`

### Batch 3.5 执行清单

- [ ] 先对照 `schedule` 三张 card 的 props、事件、文案差异，确认 canonical shape
- [ ] 把共通 card shell 抽成单个 deep module，只保留 domain-specific adapter bits
- [ ] 合并 [`link-index.ts`](../../../packages/app-vue/src/modules/editor/utils/link-index.ts) 与 [`resource-reference-index.ts`](../../../packages/app-vue/src/modules/editor/utils/resource-reference-index.ts) 的重复索引流程
- [ ] 决定 [`TaskInstanceCard.vue`](../../../packages/app-vue/src/modules/task/components/TaskInstanceCard.vue) 与 [`components/cards/TaskInstanceCard.vue`](../../../packages/app-vue/src/modules/task/components/cards/TaskInstanceCard.vue) 的 canonical owner
- [ ] 合并 `authentication` 表单共享逻辑，再删除镜像实现
- [ ] 清理对应镜像测试，保留行为导向测试而不是按副本复制测试

**建议提交切片**

1. `schedule` triplicate cards 合并
2. `editor` index utilities 合并
3. `task` / `authentication` 平行副本删除

**完成定义**

- `jscpd` 热点 clone 数下降
- 同一行为不再以“复制一个近似组件/工具”方式扩展
- 后续 deeper module 抽象面对的是唯一实现，而不是多份近似实现

### Batch 4 执行清单

- [ ] 为 desktop auth/profile 先画出 lifecycle seam：profile selection、profile activation、session restore、token refresh、offline login、window binding
- [ ] 把 [`profile-registry.ts`](../../../apps/desktop/src/main/profile/profile-registry.ts) 从 singleton owner 改为显式 runtime-owned module
- [ ] 拆 [`desktop-profile-runtime-manager.ts`](../../../apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts) 中的 prepare/activate/deactivate orchestration
- [ ] 把 [`SessionManager`](../../../apps/desktop/src/main/modules/authentication/infrastructure/session-manager.ts) 按 restore / refresh / timer / device identity / offline auth 分段
- [ ] 收口 [`AuthDesktopApplicationService`](../../../apps/desktop/src/main/modules/authentication/application/auth-desktop-application-service.ts) 的职责，只保留 application-facing orchestration
- [ ] 让 [`main.ts`](../../../apps/desktop/src/main/main.ts) 只负责 runtime startup、事件订阅和 IPC 注册
- [ ] 为 profile lifecycle 和 auth lifecycle 补独立 module-level tests

**建议提交切片**

1. profile registry 去 singleton
2. profile runtime orchestration 深化
3. session lifecycle 模块化
4. auth desktop application orchestration 收口
5. main-process container 变薄

**完成定义**

- `apps/desktop` 回到 runtime container 角色
- profile lifecycle 与 auth lifecycle 的 seam 清晰可替换
- auth 相关测试不再默认依赖完整 main-process 风格上下文

### Batch 5 执行清单

- [ ] 为 `dashboard` 定义 read-model module 的标准 shape：query input、projection、read source、transport adapter
- [ ] 拆 [`packages/dashboard/src/index.ts`](../../../packages/dashboard/src/index.ts) 的聚合读取与统计逻辑
- [ ] 把 [`dashboard-read-service.ts`](../../../apps/api/src/modules/dashboard/dashboard-read-service.ts) 留在 app/package edge，只做 adapter 协调
- [ ] 让 [`apps/api/src/modules/dashboard/module.ts`](../../../apps/api/src/modules/dashboard/module.ts) 消费新的 deep module composition root
- [ ] 用 `dashboard` 的 shape 反推 `schedule` / `reminder` 应该统一成什么 application-server 目录语言
- [ ] 记录一份“server feature standard shape”到文档或 ADR，作为后续批次真值

**建议提交切片**

1. `dashboard` read-model module 定型
2. API adapter 收边
3. server feature shape 真值文档化

**完成定义**

- `dashboard` 不再是单文件浅 module
- API app 层只保留 transport / module edge
- 后续 `schedule`、`reminder` 有可直接套用的 server-side shape

### Batch 5.5 执行清单

- [ ] 定义 support package taxonomy：app shell、protocol/transport、kernel/pattern、test support、UI family
- [ ] 为 `app-vue` / `app-react` 约束根导出职责，减少 mega barrel 暴露面
- [ ] 明确 `contracts` 中正式协议、Electron protocol、mock surface 的边界
- [ ] 让 `ipc-client` 停止默认隐式读取 `window.electronAPI`，改为显式 bridge seam
- [ ] 对齐 `http-client` / `ipc-client` 的 adapter creation language
- [ ] 收缩 `utils` 根入口，区分 kernel、frontend helper、lifecycle helper
- [ ] 收缩 `patterns` 与 `test-utils` 的 catch-all surface，并为其建立受控子路径

**建议提交切片**

1. support package taxonomy 文档化
2. `app-vue` / `app-react` 导出面收敛
3. `contracts` / transport seam 对齐
4. `utils` / `patterns` / `test-utils` family contract 收缩

**完成定义**

- support 包家族拥有可预测的主角色和导出策略
- 新代码不再默认落入 mega barrel / catch-all package
- protocol / transport support seam 比当前更显式、更可治理

### Batch 6 执行清单

- [ ] 写清 apps-as-containers matrix：`web`、`mobile`、`api`、`desktop`、`ai-service` 各自允许承载什么职责
- [ ] 把 `api` 中真正 runtime-specific integration 和“暂时留在 app 的厚逻辑”区分开
- [ ] 为 `powersync` 明确 app-local integration seam，避免继续膨胀成 app-owned business module
- [ ] 让 `dashboard` 在 API app 侧只保留 adapter edge
- [ ] 继续收瘦 `desktop` main-process container，并与 Batch 4 的 desktop auth/profile 解耦对齐
- [ ] 为 ai-service 切分 `app shell`、`service orchestration`、`eval harness` 的边界
- [ ] 为 app-layer 加治理规则：新 app 代码默认不能新增 domain/application implementation，除非是明确标记的 runtime integration module

**建议提交切片**

1. apps-as-containers matrix 文档化
2. `api` app-owned module 收边
3. `desktop` container 收边
4. `ai-service` app-family submodule seam 切分

**完成定义**

- 各 app runtime 的职责边界比当前更一致
- `web` / `mobile` 的 thin-shell 优势被固化，而不是仅靠现状维持
- `api` / `desktop` / `ai-service` 不再继续吸纳厚业务实现

## Batch 依赖关系

- Batch 1 是所有后续批次的前置条件；不先修治理真值，后续重构无法形成稳定 gate
- Batch 2.5 依赖 Batch 1，但可以在 Batch 2 完成第一版 client seam 后启动；这样 runtime startup plan 可以直接复用新的 composition language
- Batch 2 与 Batch 3 可以局部并行，但 Batch 3 里涉及 platform adapter 抽离的部分应以 Batch 2 的 client seam 为准
- Batch 3.5 应插在 Batch 3 和 Batch 4 之间，避免把重复实现一起带进更深的 module 抽象
- Batch 4 中的 desktop auth/profile lifecycle 解耦，应尽量复用 Batch 2.5 形成的 runtime lifecycle seam，而不是再造一套 startup/teardown 语言
- Batch 5 可以在 Batch 4 之前启动 tracer bullet，但正式推广到其他 server feature 应等待 Batch 1 的治理基线稳定
- Batch 5.5 适合在 Batch 1 后尽早启动文档和导出面治理，但真正的 transport seam 收敛应尽量复用 Batch 2 的 client composition language
- Batch 6 应在 Batch 2.5 和 Batch 4 之后推进核心 runtime 收边，因为它需要复用已经稳定下来的 startup seam 和 desktop container seam

## 建议 issue 切法

- 每个 batch 拆成 `3-5` 个 issue，不按目录机械切分，而按“形成一个新 seam”切分
- 每个 issue 应只允许一种主要结构变化，例如“抽 workflow module”或“删 singleton seam”，不要在一个 issue 里同时做 platform adapter 抽离和 UI 文案整理
- 每个 issue 都应带一条明确的删除目标，例如“删除 `window.electronAPI` 直接访问 3 处”或“删除 `TaskInstanceCard` 平行副本 1 份”
- 每个 issue 都应带最小验证面：lint、对应 package test、必要时单个 app smoke，而不是默认跑全仓

## 推荐 issue backlog

### Wave A: 治理与 seam 基线

**Issue A1: 对齐架构与测试真值文档**

- 目标
  - 对齐 architecture / testing / naming 真值文档，消除 ADR、README、真实命名之间的口径漂移
- 范围
  - [`docs/standards/architecture.md`](../../../docs/standards/architecture.md)
  - [`docs/test/README.md`](../../../docs/test/README.md)
  - [`docs/architecture/adr/ADR-013-standard-testing-strategy.md`](../../../docs/architecture/adr/ADR-013-standard-testing-strategy.md)
- 删除目标
  - 删除 `*.integration.ts` 这类已过期命名真值
- 最小验证
  - `pnpm docs:check`

**Issue A2: 修 lint boundary 与测试豁免模型**

- 目标
  - 让 lint depConstraints 与架构文档一致，并把测试层从“整体豁免”收紧到“受控豁免”
- 范围
  - [`eslint.config.ts`](../../../eslint.config.ts)
- 删除目标
  - 删除 domain 可以合法依赖 infra 的错误规则
- 最小验证
  - `pnpm lint`

**Issue A3: 为治理补 platform/singleton/test taxonomy audits**

- 目标
  - 把 `window.electronAPI`、`getInstance()`、测试 taxonomy 漂移纳入 `governance-check`
- 范围
  - [`project.json`](../../../project.json)
  - [`tools/governance/file-naming-audit.mjs`](../../../tools/governance/file-naming-audit.mjs)
  - 新增治理脚本
- 删除目标
  - 删除测试文件命名和 singleton 回流的治理盲区
- 最小验证
  - `pnpm governance:check`
  - `pnpm test:targets:check`

**Issue A4: 文档化 support package taxonomy 与 apps-as-containers matrix**

- 目标
  - 固化 support package family contract 和 app runtime contract，为后续重构提供唯一真值
- 范围
  - 本计划文档
  - 必要时补 ADR / standards
- 删除目标
  - 删除“某个包/某个 app 到底允许承载什么职责”这种口头规则
- 最小验证
  - `pnpm docs:check`

### Wave B: client seam 与 startup seam

**Issue B1: 抽 shared client creation language**

- 目标
  - 提取统一的 `runtime client registry` / `client module factory`
- 范围
  - [`packages/app-react/src/providers/app-client-registry-provider.tsx`](../../../packages/app-react/src/providers/app-client-registry-provider.tsx)
  - 新增 shared registry/factory module
- 删除目标
  - 删除 runtime 各自私有的 feature client 组装语言
- 最小验证
  - `pnpm nx run app-react:typecheck`

**Issue B2: React session/provider 接入统一 client seam**

- 目标
  - 让 [`app-session-provider.tsx`](../../../packages/app-react/src/providers/app-session-provider.tsx) 停止私有创建 auth graph
- 范围
  - [`packages/app-react/src/providers/app-session-provider.tsx`](../../../packages/app-react/src/providers/app-session-provider.tsx)
- 删除目标
  - 删除 provider 内部直接 `new AuthClientService(...)` 的私有装配
- 最小验证
  - `pnpm nx run app-react:typecheck`
  - `pnpm nx run app-react:lint`

**Issue B3: Web 与 Editor 接入统一 client seam**

- 目标
  - 让 Web `di-app` 和 Editor runtime 使用同一套 client creation language
- 范围
  - [`apps/web/src/platform/di-app.ts`](../../../apps/web/src/platform/di-app.ts)
  - [`packages/app-vue/src/modules/editor/services/editor-client-gateway.ts`](../../../packages/app-vue/src/modules/editor/services/editor-client-gateway.ts)
  - [`packages/app-vue/src/modules/editor/services/editor-service-runtime.ts`](../../../packages/app-vue/src/modules/editor/services/editor-service-runtime.ts)
- 删除目标
  - 删除 `getEditorRuntimeService()` style locator access
- 最小验证
  - `pnpm nx run web:typecheck`
  - `pnpm nx run web:lint`

**Issue B4: 定义 startup hook seam**

- 目标
  - 用显式 `startup hook` / `runtime lifecycle` interface 替代 feature 自注册 phase task
- 范围
  - [`packages/utils/src/initialization-manager.ts`](../../../packages/utils/src/initialization-manager.ts)
  - 新 lifecycle seam
- 删除目标
  - 删除“feature 通过 helper 自注册全局 phase manager”作为默认启动方式
- 最小验证
  - 对应 package `test`

**Issue B5: 迁出 notification / goal startup registry**

- 目标
  - 让 notification 和 goal 初始化从全局 phase registry 迁到显式 startup plan
- 范围
  - [`packages/notification/src/api/initialization.ts`](../../../packages/notification/src/api/initialization.ts)
  - [`packages/app-vue/src/modules/notification/initialization/index.ts`](../../../packages/app-vue/src/modules/notification/initialization/index.ts)
  - [`packages/goal/src/api/initialization.ts`](../../../packages/goal/src/api/initialization.ts)
  - [`packages/app-vue/src/modules/goal/initialization/index.ts`](../../../packages/app-vue/src/modules/goal/initialization/index.ts)
  - [`apps/web/src/bootstrap/app.ts`](../../../apps/web/src/bootstrap/app.ts)
- 删除目标
  - 删除 feature-local `registerXxxInitializationTasks()`
- 最小验证
  - `pnpm nx run web:test`

### Wave C: shared Vue 重构与去重

**Issue C1: 列出 goal interface inventory 并抽 workflow module**

- 目标
  - 把 `goal` 的 view state / workflow / store mutation / platform recovery 拆开
- 范围
  - [`packages/app-vue/src/modules/goal/composables/useGoal.ts`](../../../packages/app-vue/src/modules/goal/composables/useGoal.ts)
- 删除目标
  - 删除 `useGoal` 同时承载 workflow + transport + recovery 的现状
- 最小验证
  - `pnpm nx run web:test`

**Issue C2: 收口 goal composable/store**

- 目标
  - 让 `goal-store` 回到状态持有者角色，composable 只暴露页面真正消费的 interface
- 范围
  - [`packages/app-vue/src/modules/goal/stores/goal-store.ts`](../../../packages/app-vue/src/modules/goal/stores/goal-store.ts)
- 删除目标
  - 删除 store 内跨流程 orchestration
- 最小验证
  - `pnpm nx run web:lint`
  - `pnpm nx run web:test`

**Issue C3: 抽 repository workflow module**

- 目标
  - 用与 `goal` 相同的 shape 拆掉 `useRepository.ts`
- 范围
  - [`packages/app-vue/src/modules/repository/composables/useRepository.ts`](../../../packages/app-vue/src/modules/repository/composables/useRepository.ts)
- 删除目标
  - 删除 `useRepository` 内部并列职责堆叠
- 最小验证
  - `pnpm nx run web:test`

**Issue C4: 抽 shared desktop recovery adapter**

- 目标
  - 把 shared composable 的 desktop auth recovery 迁到 adapter seam
- 范围
  - [`packages/app-vue/src/shared/utils/desktop-auth-recovery.ts`](../../../packages/app-vue/src/shared/utils/desktop-auth-recovery.ts)
  - [`packages/app-vue/src/modules/authentication/composables/useAuth.ts`](../../../packages/app-vue/src/modules/authentication/composables/useAuth.ts)
- 删除目标
  - 删除 shared composable 直接感知 desktop runtime 的默认路径
- 最小验证
  - `pnpm nx run web:test`

**Issue C5: 合并 schedule / editor / task / auth 重复实现**

- 目标
  - 先删除真实复制实现，再继续 deeper module 抽象
- 范围
  - `schedule` 三张 tasks card
  - `editor` 两个 index utils
  - `task` 平行 card
  - `authentication` 双表单
- 删除目标
  - 删除 `TaskInstanceCard` 平行副本 1 份
  - 删除 triplicate card shell
- 最小验证
  - `pnpm nx run web:test`
  - `pnpm exec jscpd ...`

### Wave D: desktop / app runtime 收边

**Issue D1: 去掉 ProfileRegistry singleton**

- 目标
  - 把 profile registry 变成 runtime-owned module
- 范围
  - [`apps/desktop/src/main/profile/profile-registry.ts`](../../../apps/desktop/src/main/profile/profile-registry.ts)
- 删除目标
  - 删除 `ProfileRegistry.getInstance()`
- 最小验证
  - `pnpm nx run desktop:typecheck`

**Issue D2: 深化 DesktopProfileRuntimeManager**

- 目标
  - 拆 prepare/activate/deactivate orchestration
- 范围
  - [`apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts`](../../../apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts)
- 删除目标
  - 删除 runtime manager 同时碰 snapshot/db/auth/bootstrapper 的集中耦合
- 最小验证
  - `pnpm nx run desktop:lint`
  - 对应 module `test`

**Issue D3: 切 SessionManager 生命周期分段**

- 目标
  - 按 restore / refresh / timer / device identity / offline auth 拆 session lifecycle
- 范围
  - [`apps/desktop/src/main/modules/authentication/infrastructure/session-manager.ts`](../../../apps/desktop/src/main/modules/authentication/infrastructure/session-manager.ts)
- 删除目标
  - 删除 `SessionManager` monolith
- 最小验证
  - `pnpm nx run desktop:typecheck`
  - 对应 module `test`

**Issue D4: 收口 AuthDesktopApplicationService 与 main.ts**

- 目标
  - 让 application service 只保留 orchestration，让 `main.ts` 回到 runtime wiring
- 范围
  - [`apps/desktop/src/main/modules/authentication/application/auth-desktop-application-service.ts`](../../../apps/desktop/src/main/modules/authentication/application/auth-desktop-application-service.ts)
  - [`apps/desktop/src/main/main.ts`](../../../apps/desktop/src/main/main.ts)
- 删除目标
  - 删除 main-process container 中的厚业务 owner
- 最小验证
  - `pnpm nx run desktop:lint`
  - `pnpm nx run desktop:typecheck`

**Issue D5: app runtime contract 收边**

- 目标
  - 为 `api` / `desktop` / `ai-service` 明确 app-owned integration seam，固化 `web` / `mobile` thin-shell 模式
- 范围
  - [`apps/api/src/modules/powersync/module.ts`](../../../apps/api/src/modules/powersync/module.ts)
  - [`apps/api/src/modules/dashboard/module.ts`](../../../apps/api/src/modules/dashboard/module.ts)
  - [`apps/ai-service/src/ai_service/app.py`](../../../apps/ai-service/src/ai_service/app.py)
  - [`apps/ai-service/src/ai_service/services/goal_planning_service.py`](../../../apps/ai-service/src/ai_service/services/goal_planning_service.py)
  - [`apps/ai-service/src/ai_service/evals/runner.py`](../../../apps/ai-service/src/ai_service/evals/runner.py)
- 删除目标
  - 删除 app runtime 继续吸纳厚业务实现的默认路径
- 最小验证
  - `pnpm nx run api:test:smoke`
  - `pytest apps/ai-service/tests`

### Wave E: server shape 与 support family 收敛

**Issue E1: 升级 dashboard read-model module**

- 目标
  - 把 `dashboard` 从单文件 helper 升级为第一类 read-model module
- 范围
  - [`packages/dashboard/src/index.ts`](../../../packages/dashboard/src/index.ts)
  - [`apps/api/src/modules/dashboard/dashboard-read-service.ts`](../../../apps/api/src/modules/dashboard/dashboard-read-service.ts)
  - [`apps/api/src/modules/dashboard/module.ts`](../../../apps/api/src/modules/dashboard/module.ts)
- 删除目标
  - 删除 `dashboard` app-side half-extracted logic
- 最小验证
  - `pnpm nx run api:test:smoke`

**Issue E2: 文档化 server feature standard shape**

- 目标
  - 固化 `commands / queries / adapters / transport / module.ts` 语言
- 范围
  - 文档或 ADR
  - `schedule` / `reminder` 对照
- 删除目标
  - 删除“每个领域自创分层词汇”的状态
- 最小验证
  - `pnpm docs:check`

**Issue E3: 收敛 app-vue / app-react 根导出**

- 目标
  - 将 mega barrel 收敛到 curated entrypoints + subpath exports
- 范围
  - [`packages/app-vue/src/index.ts`](../../../packages/app-vue/src/index.ts)
  - [`packages/app-react/src/index.ts`](../../../packages/app-react/src/index.ts)
- 删除目标
  - 删除根入口同时暴露 shell + feature + util 的默认做法
- 最小验证
  - `pnpm nx run web:typecheck`
  - `pnpm nx run app-react:typecheck`

**Issue E4: 对齐 contracts / http-client / ipc-client seam**

- 目标
  - 让 protocol / transport seam 更显式，并禁止 support 默认碰 runtime global
- 范围
  - [`packages/contracts/src/index.ts`](../../../packages/contracts/src/index.ts)
  - [`packages/contracts/src/electron/ipc-channels.ts`](../../../packages/contracts/src/electron/ipc-channels.ts)
  - [`packages/contracts/src/mocks/goal.mock.ts`](../../../packages/contracts/src/mocks/goal.mock.ts)
  - [`packages/http-client/src/result-http-client.ts`](../../../packages/http-client/src/result-http-client.ts)
  - [`packages/ipc-client/src/types.ts`](../../../packages/ipc-client/src/types.ts)
- 删除目标
  - 删除 `ipc-client` 默认读取 `window.electronAPI`
- 最小验证
  - `pnpm nx run contracts:typecheck`

**Issue E5: 收缩 utils / patterns / test-utils catch-all surface**

- 目标
  - 为 kernel / pattern / test support 包建立明确 family contract 和受控子路径
- 范围
  - [`packages/utils/src/index.ts`](../../../packages/utils/src/index.ts)
  - [`packages/patterns/src/index.ts`](../../../packages/patterns/src/index.ts)
  - [`packages/test-utils/src/index.ts`](../../../packages/test-utils/src/index.ts)
- 删除目标
  - 删除 catch-all root export 继续无限扩张的默认路径
- 最小验证
  - 对应 package `typecheck`

## Master checklist

### Stage 1: 锁定真值和治理入口

- [x] `A1` 对齐架构与测试真值文档 — 已对齐（ADR-013、docs/test/README.md 命名一致）
- [x] `A2` 修 lint boundary 与测试豁免模型 — 已对齐（ESLint depConstraints 与 architecture.md 一致）
- [x] `A3` 为治理补 platform/singleton/test taxonomy audits — 审计脚本已创建并接入（platform-leakage-audit、singleton-audit），`governance:check` 通过
- [x] `A4` 文档化 support package taxonomy 与 apps-as-containers matrix — ADR-031/032 已新增，ADR 编号冲突已修复，`governance:check` 和 `docs:check` 均通过

**Stage 1 停顿点**

- 可以进入下一阶段的条件
  - `pnpm docs:check` 通过
  - `pnpm governance:check` 通过
  - ADR 编号、ADR README 索引、governance audit allowlist 与当前代码状态一致
  - 文档、lint、governance 三者不再互相矛盾

### Stage 2: 固化 runtime client seam 与 startup seam

- [x] `B1` 抽 shared client creation language — createXxxServiceFromHttpClient 约定已统一（9 个包）
- [x] `B2` React session/provider 接入统一 client seam — auth/governance/editor 已创建 createXxxServiceFromHttpClient 工厂，Web di-app 已统一
- [x] `B3` Web 与 Editor 接入统一 client seam — Web di-app 已接入统一 factory
- [x] `B4` 定义 startup hook seam — `createNotificationStartupHook()` / `createGoalStartupHook()` 已替代全局 phase registry，`InitializationManager` 已从所有生产启动路径移除
- [x] `B5` 迁出 notification / goal startup registry — `registerNotificationInitializationTasks()` / `registerGoalInitializationTasks()` 已从 app-vue 导出面删除，desktop renderer 和 API 不再调用 `InitializationManager.executePhase()`

**Stage 2 停顿点**

- 可以进入下一阶段的条件
  - Web / React / Editor 不再各自维护 client 装配语言
  - `apps/api`、`apps/web`、`apps/desktop` 的真实启动路径都不再执行 `InitializationManager.getInstance().executePhase(...)`
  - `registerNotificationInitializationTasks()` / `registerGoalInitializationTasks()` 不再属于公共导出面
  - runtime composition root 拥有显式 startup order，且 stop / cleanup 也有显式 owner

### Stage 3: shared Vue 深化与去重

- [x] `C1` 列出 goal interface inventory 并抽 workflow module — `useGoal.ts` 已改用 `goalOperations.ts` 的 `executeGoalOperation`/`executeGoalAction`/`createGoalErrorHandler`，移除了内联 `handleError`，行数从 410 降至 ~320
- [x] `C2` 收口 goal composable/store — store 已是纯状态容器（214 行，无编排逻辑），composable 接口已在 C1 中收窄
- [x] `C3` 抽 repository workflow module — `useRepository.ts` 已改用 `repositoryHelpers` 和 `repositoryUpload` 的提取函数，移除了内联重复代码和 `__test__` 导出，行数从 683 降至 479
- [x] `C4` 抽 shared desktop recovery adapter — `executeDesktopAuthenticatedResult` 现在通过 `desktopApi` 参数接收 auth API，不再回退到 `window.electronAPI`；desktop runtime 通过 `DESKTOP_AUTH_API_KEY` DI 注入；所有 composables 和 views 已更新为显式注入
- [x] `C5` 合并 schedule / editor / task / auth 重复实现 — schedule triplicate cards 已合并，editor index helpers 已去重，TaskInstanceCard 双副本已统一（修复 ALL_DAY→AllDay 枚举 bug），SMS countdown composable 已接入 LoginForm 和 RegisterForm

**Stage 3 停顿点**

- 可以进入下一阶段的条件
  - `useGoal` / `useRepository` interface 明显变窄，且行数下降不只是“搬运代码”
  - 重复组件/工具副本已清掉第一批
  - `AIChatView.vue` 与 `editor workspace` 已具备可复用的抽象母体，而不是继续堆在视图文件里

### Stage 4: desktop container 收边

- [x] `D1` 去掉 ProfileRegistry singleton — 类级 singleton 已移除，`ProfileRegistry` 由 `main.ts` 显式创建并传入 `DesktopProfileRuntimeManager`
- [x] `D2` 深化 DesktopProfileRuntimeManager — 提取 hydrateProfileSnapshot、openProfileResources、teardownAuthResources 三个聚焦 helper；deactivate 和 dispose 共享清理逻辑
- [x] `D3` 切 SessionManager 生命周期分段 — 类级 singleton 已移除，`SessionManager` 构造函数公开，通过 `setSessionManager/getSessionManager` context 访问；`NetworkStateManager`/`RememberedAccountsService`/`TokenManager` 的 `static getInstance()` 已移除，改为模块级单例
- [x] `D4` 收口 AuthDesktopApplicationService 与 main.ts — `main.ts` 显式创建 `RememberedAccountsService` 和 `NetworkStateManager` 并注入 `desktop-auth-shell`；`registerDesktopAuthShellHandlers` 现在接受 `deps` 参数而非调用 singleton getter

**Stage 4 停顿点**

- 可以进入下一阶段的条件
  - desktop main-process 更接近 runtime container，且非测试源码中不再新增 locator getter
  - profile/auth lifecycle seam 清晰，并由 runtime-owned object graph 直接持有
  - `main.ts` 与 `desktop-auth-shell` 只保留 wiring / transport / transition owner，不继续吸纳业务实现

### Stage 5: app runtime 与 server shape 收边

- [x] `D5` app runtime contract 收边 — 已创建 `docs/architecture/apps-as-containers-matrix.md`，明确各 app 允许/不允许承载的职责；迁移中的例外已列入文档
- [x] `E1` 升级 dashboard read-model module — index.ts 从 350 行重复代码改为 thin barrel，project tag 修正为 layer:domain
- [x] `E2` 文档化 server feature standard shape — ADR-031 已存在且已纳入 README 索引；已创建 `tools/governance/server-feature-shape-audit.mjs` 审计脚本；`schedule`/`reminder`/`ai` 均符合标准 shape；`authentication` 的 `domain-client` 缺口已记录为已知例外

**Stage 5 停顿点**

- 可以进入下一阶段的条件
  - `api` / `desktop` / `ai-service` 的 app-owned 厚逻辑已被压回 runtime edge 或独立 module
  - `dashboard` tracer bullet 已证明 server feature standard shape

### Stage 6: support family contract 收敛

- [x] `E3` 收敛 app-vue / app-react 根导出 — `app-react` 从 67 行 `export *` 收敛为 curated named exports（screens + providers + RootLayout）；`app-vue` 已是收敛状态
- [x] `E4` 对齐 contracts / http-client / ipc-client seam — `ResultIpcClient` 和 `IpcClientImpl` 不再隐式回退到 `window.electronAPI`，bridge 必须显式传入；desktop runtime 通过 `{ bridge: window.electronAPI }` 显式传入
- [x] `E5` 收缩 utils / patterns / test-utils catch-all surface — `patterns` 根导出从 `export *` 收敛为仅暴露 `AggregateRepositoryBase`/`createEventBusAdapter`/`publishAggregateEvents`/`IEventBus` 等实际使用的项；`scheduler` 通过子路径导入；`cache` 和 `goal` 模块确认为死代码

**Stage 6 完成条件**

- support 包家族拥有稳定主角色和导出策略
- transport seam 默认显式，不再靠 runtime global fallback
- 新代码不再自然回流到 mega barrel / catch-all package
- `governance-check` 能阻止新引入的 root-export 膨胀与 runtime-global fallback

**Stage 6 当前状态**

- 当前实现侧已经闭环：`app-react` / `patterns` / `ipc-client` 的收敛已落地，desktop renderer 对 router / dashboard adapter / store hook 的旧根入口消费已退出活跃路径，`governance-check` 也已覆盖 `desktop-runtime-locator-audit`。
- Stage 6 已完成，不再保留实现差额。

### Stage 7: 次级热点与回归审计

- [x] 分诊 `AIChatView.vue` — 主文件已降到 `221` 行，当前主要承担布局与组合；conversation/tool-mode/draft 等工作流已外提到局部模块
- [x] 分诊超大 aggregate / mega spec — `task-template.ts`(1692)、`goal.ts`(1589)、`reminder-template.ts`(852) 为领域聚合根，自然较大；`powersync-schema/index.ts`(1111) 为 schema 定义；暂无需拆分
- [x] 复扫 singleton / duplication / package drift — `app-react` / `patterns` / `ipc-client` 已收敛，`getDesktopProfileRuntimeManager()` 已退出活跃路径；desktop main 的 `getWindowManager()` / `getDesktopAuthService()` / 模块级 `runtimeManager` 也已退出生产运行路径，且 `desktop-runtime-locator-audit` 已接入 `governance-check`
- [x] 复跑验证矩阵中的关键命令 — `docs-check`、`governance-check`、`app-react:typecheck`、`desktop:typecheck`、`desktop:lint`、`api:test:smoke`、`web:lint`、`web:test`、`desktop:test`、`ai-service:test`、`ai-service:typecheck`、`ai-service:lint` 全部通过

**Stage 7 完成条件**

- 首批重构后的回流点被重新审计
- 低优先级观察项仍然成立，且没有升级成新的主阻塞

## 剩余任务完整优雅实施方案

下面这组内容不再描述“剩余必做任务”，而是记录 `2026-05-27` 当前工作树的终态审计结果，以及后续若继续打磨时可选的低优先级收尾项。

### 2026-05-27 四次执行审计结论（终态）

**关键 gate 已统一验证为绿**

- `pnpm nx run memoflow:docs-check --skipNxCache`
- `pnpm nx run memoflow:governance-check --skipNxCache`
- `pnpm nx run app-react:typecheck --skipNxCache`
- `pnpm nx run desktop:typecheck --skipNxCache`
- `pnpm nx run desktop:lint`
- `pnpm nx run desktop:test`
- `pnpm nx run api:test:smoke`
- `pnpm nx run web:lint`
- `pnpm nx run web:test`
- `pnpm nx run ai-service:test`
- `pnpm nx run ai-service:typecheck`
- `pnpm nx run ai-service:lint`

**结构与 seam 复扫结果**

- `rg "getDesktopProfileRuntimeManager\\(|setDesktopProfileRuntimeManager\\(|getDesktopAuthService\\(|getWindowManager\\(" apps/desktop/src/main`
  - 当前无生产路径命中。
- `rg "^export \\*" packages/app-react/src/index.ts packages/app-vue/src/index.ts packages/patterns/src/index.ts packages/test-utils/src/index.ts`
  - 当前无命中。
- `rg "window\\.electronAPI" packages/app-vue packages/app-react packages/contracts packages/utils packages/patterns packages/http-client packages/ipc-client`
  - 当前只命中 `packages/ipc-client/src/index.ts` 的注释示例，不是实现代码。
- `rg -n "@memoflow/app-vue" apps/desktop/src/renderer`
  - 当前以 `router`、`plugins/i18n`、`modules/*`、`di`、`desktop` 等明确子路径为主；根入口只剩 `App.vue` / `DesktopAuthApp.vue` 这类 shell surface。

**热点文件终态**

- [`packages/app-vue/src/modules/ai/views/AIChatView.vue`](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue) `221` 行
- [`packages/app-vue/src/modules/editor/stores/editor-workspace-store.ts`](../../../packages/app-vue/src/modules/editor/stores/editor-workspace-store.ts) `125` 行
- [`packages/app-vue/src/modules/repository/composables/useRepository.ts`](../../../packages/app-vue/src/modules/repository/composables/useRepository.ts) `202` 行
- [`packages/app-vue/src/modules/goal/composables/useGoal.ts`](../../../packages/app-vue/src/modules/goal/composables/useGoal.ts) `212` 行
- [`apps/ai-service/src/ai_service/services/goal_planning_service.py`](../../../apps/ai-service/src/ai_service/services/goal_planning_service.py) `359` 行
- [`apps/ai-service/src/ai_service/evals/runner.py`](../../../apps/ai-service/src/ai_service/evals/runner.py) `652` 行

### 当前结论

- 可以判定：**本轮计划要求的主线已经完成。**
- 原因：
  - 所有定义为关键 gate 的命令已统一通过。
  - desktop main 的 runtime locator seam 已退出生产路径，并已纳入治理脚本。
  - desktop renderer 的旧根入口语言已经退出 router / dashboard adapter / store hook 这类关键 consumer。
  - shared Vue 与 ai-service 的热点文件已经回落到可解释、可维护的规模，且 test / typecheck / lint 与运行路径证据一致。

### 后续只保留可选 polish

这些事项不再阻塞“优雅完整实现”的完成判定，但如果要继续打磨，可以作为单独低优先级 issue：

1. 清理 `desktop:lint` 的 `118` 个 warning
   - 主要是测试与基础设施文件中的 `no-explicit-any` / `unused vars`。
2. 处理 `database:build` 的 Nx flaky 提示
   - 当前不影响成功结果，但值得作为 CI 稳定性观察项记录。
3. 进一步收窄 shell surface
   - `App.vue` / `DesktopAuthApp.vue` 仍从 `@memoflow/app-vue` 根入口消费 UI shell 导出；当前可接受，但如需更极致收敛，可继续改成专用 surface。

### 可选 issue backlog

1. `Optional-DesktopWarnings`
   - 范围：desktop warning 清理
2. `Optional-NxFlaky`
   - 范围：`database:build` flaky 诊断
3. `Optional-ShellSurface`
   - 范围：app-vue shell 根导出进一步收窄

## 验证矩阵

### Batch 1 验证

- 证据
  - [`project.json`](../../../project.json) 的 `governance-check` 包含新增 audit
  - [`package.json`](../../../package.json) 暴露 `governance:check` / `docs:check`
  - ADR 编号、README 索引、审计 allowlist 与当前代码状态一致
- 最小命令
  - `pnpm docs:check`
  - `pnpm governance:check`
  - `pnpm test:targets:check`

### Batch 2 / 2.5 验证

- 证据
  - Web / React / Editor runtime 都消费同一种 client creation language
  - startup plan 不再依赖 feature 自注册全局 phase task
  - `apps/api` / `apps/desktop` / `apps/web` 的活跃启动路径不再执行 `InitializationManager`
  - desktop renderer 不再从 `@memoflow/app-vue` 根入口消费 router / dashboard adapter / store hook
  - 剩余根入口导入只允许是 UI shell / layout / desktop surface
- 最小命令
  - `pnpm nx run web:typecheck`
  - `pnpm nx run app-react:typecheck`
  - `pnpm nx run desktop:typecheck`
  - `rg "InitializationManager.getInstance\\(|registerNotificationInitializationTasks|registerGoalInitializationTasks" apps packages`
  - `rg "@memoflow/app-vue" apps/desktop/src/renderer`
  - 对应 package `test`

### Batch 3 / 3.5 验证

- 证据
  - `useGoal` / `useRepository` interface 变窄
  - 重复组件/工具副本减少
  - `AIChatView.vue` / `editor workspace` 不再承担多条独立 workflow
  - 当前热点行数已收敛到：
    - `AIChatView.vue` `221`
    - `editor-workspace-store.ts` `125`
    - `useRepository.ts` `202`
- 最小命令
  - `pnpm nx run web:lint`
  - `pnpm nx run web:test`
  - `pnpm exec jscpd ...` 对热点目录复扫

### Batch 4 / 6 验证

- 证据
  - `main.ts` / app bootstrap 只保留 runtime wiring
  - desktop profile/auth lifecycle 与 app runtime seam 清晰
  - app runtime contract 可解释 `web` / `mobile` / `api` / `desktop` / `ai-service`
  - `desktop:lint` 当前已是 `0` error、`118` warning
- 最小命令
  - `pnpm nx run desktop:typecheck`
  - `pnpm nx run desktop:lint`
  - `pnpm nx run desktop:test`
  - `rg "getSessionManager\\(|getDesktopProfileRuntimeManager\\(|getDesktopAuthService\\(|getWindowManager\\(|static getInstance\\(" apps/desktop/src/main`
  - 针对 desktop / api 的 smoke 或 module-level test

### Batch 5 / 5.5 验证

- 证据
  - `dashboard` 从 app helper 升级为第一类 module
  - support package root exports 收窄，transport seam 更显式
  - `ipc-client` 不再默认读取 `window.electronAPI`
- 最小命令
  - `pnpm nx run api:test:smoke`
  - `pnpm nx run app-react:typecheck`
  - `pnpm nx run contracts:typecheck`
  - `rg "window\\.electronAPI" packages/app-vue packages/app-react packages/contracts packages/utils packages/patterns packages/http-client packages/ipc-client`

### ai-service 验证

- 证据
  - `app.py` 继续只做 process wiring
  - `services` / `evals` 的大模块被切成更清楚的子系统 seam
  - `project.json` 的标准测试/类型检查入口继续成立
  - `ai-service:lint` 与 `test` / `typecheck` 同时为绿
  - `runner.py` 当前为 `652` 行；相较原始超大单文件状态已显著收敛，types/report builders 已提取到独立模块
  - `goal_planning_service.py` 当前为 `359` 行；策略实现已提取到 `goal_planning_strategies.py`
- 最小命令
  - `pnpm nx run ai-service:test` — 77 passed
  - `pnpm nx run ai-service:typecheck` — 0 errors
  - `pnpm nx run ai-service:lint` — All checks passed

## 预期结果

完成后，仓库应该呈现下面的特征：

- runtime container 真正变薄，业务逻辑集中在 `packages/*`
- 每个 feature 都有可预测的 module shape
- 前端 shared module 不再直接感知 Electron
- client wiring 只有一种语言
- server-side DI 只有一种语言
- legacy seam 被删除，而不是长期并存

## 不建议的做法

- 不建议继续“局部修一处大文件，但保留整体 seam 不变”
- 不建议新增第二套 composition 模式来兼容旧代码
- 不建议为了短期平滑，继续保留长期存在的 legacy container / singleton wrapper

在当前项目阶段，应该按 ADR-015 直接走目标态，而不是维持过渡态。
