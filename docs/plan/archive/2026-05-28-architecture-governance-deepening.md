---
tags:
  - plan
  - archived
  - architecture
  - governance
description: 基于 2026-05-28 当前工作树状态的统一范式与 lint 治理深化计划执行审计与后续实施方案（已归档，后续由 2026-05-29-repository-paradigm-unification-plan 接续）
created: 2026-05-28T00:00:00
updated: 2026-05-29T00:00:00
---

# 2026-05-28 Architecture And Governance Deepening Plan

## 这份计划的当前结论

这份方案到 2026-05-28 当前工作树为止，已经不是“没有实现”，也不是文档里上一版写的“后半段基本没动”。

更准确的判断是：

1. 大部分结构性拆分已经落地，而且不少轨道已经达到原始体量目标
2. 这份 active plan 文档本身已经落后于当前工作树，不再反映真实执行状态
3. 当前真正阻止它被称为“优雅完整实现”的，不再是大块未动工，而是少数明确的收尾点：
   - `desktop` 认证集群测试 warning 仍多
   - `useAIChatView.ts` 仍是 Shared Vue 轨道里最后一个偏宽 orchestration module
   - `ai-service` eval split 已完成结构拆分，但 lint 还没收绿
   - `task-template.ts` 已深很多，但仍保留 `props` 暴露和 `any` history payload 这样的弱 seam

因此，这份文件继续保留在 `docs/plan/active`，但内容改成“当前工作树执行审计 + 最后一轮收口方案”。

---

## 审计输入与边界

本次审计严格以当前工作树为准，而不是以上一版文档自述为准。

当前与本计划直接相关的工作树事实：

1. 工作树中已经存在大量未提交的相关改动，覆盖 `desktop`、`task`、`app-vue`、`governance`、`ai-service`
2. 本次结论同时参考：
   - 文件体量
   - 当前导出结构
   - lint / typecheck / test / governance gate
   - 关键弱 seam 文本检索

---

## 当前已验证 gate

以下命令和状态已在 2026-05-28 当前工作树上重新验证：

| 项目                                    | 状态         | 证据                                                                                                                    |
| --------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm nx run memoflow:governance-check` | 通过         | `governance-module-docs-audit`、`singleton-audit`、`desktop-runtime-locator-audit`、`server-feature-shape-audit` 均通过 |
| `pnpm nx run contracts:typecheck`       | 通过         | 当前通过                                                                                                                |
| `pnpm nx run governance:typecheck`      | 通过         | 当前通过                                                                                                                |
| `pnpm nx run desktop:lint`              | 通过但未收绿 | 66 个 warning（从 71 降至 66），当前输出全部位于测试/测试辅助文件                                                       |
| `pnpm nx run task:lint`                 | 通过         | 当前通过                                                                                                                |
| `pnpm nx run task:typecheck`            | 通过         | 当前通过                                                                                                                |
| `pnpm nx run task:test`                 | 通过         | 42 个 test file，654 个测试通过                                                                                         |
| `pnpm nx run app-vue:lint`              | 通过但未收绿 | 294 个 warning（从 298 降至 294）                                                                                       |
| `pnpm nx run app-vue:typecheck`         | 通过         | 当前通过                                                                                                                |
| `pnpm nx run app-vue:test`              | 通过         | 46 个 test file，136 个测试通过                                                                                         |
| `pnpm nx run ai-service:lint`           | 通过         | 当前通过（从 14 个问题降至 0）                                                                                          |
| `pnpm nx run ai-service:typecheck`      | 通过         | `pyright` 0 errors                                                                                                      |
| `pnpm nx run ai-service:test`           | 通过         | 77 个测试通过                                                                                                           |

结论：

- `governance` 主治理门仍然健康
- 当前最大的“还不能宣布优雅完整”的阻断，不是类型或测试，而是几条剩余 lint / seam 收口线

---

## 计划执行审计

## Track 1: Lint Ratchet For API

### 当前状态

已完成。

### 已验证证据

- `memoflow:governance-check` 通过
- 相关 API 轨道本次没有再暴露新的治理阻断
- 当前主矛盾已经不在 `api`

### 审计结论

这条轨道应从 active 主线退出。

---

## Track 2: Desktop Runtime Singletons And Production Warnings

### 当前状态

已基本完成，可视为完成。

### 已验证证据

- `memoflow:governance-check` 中：
  - `desktop-runtime-locator-audit` 通过
- 检索未再发现以下旧 locator：
  - `getAutoUpdateManager`
  - `getTrayManager`
  - `getShortcutManager`
  - `getAutoLaunchManager`
- `desktop:lint` 仍有 71 个 warning，但当前输出全部落在测试或测试辅助文件
- 这说明 desktop 生产代码 warning 已经清零

### 审计结论

这条轨道原始目标是“runtime singleton seam 清理 + 生产代码 warning 收口”，按当前工作树看已达成。

剩余的 `desktop` 债务已经不属于这个 track，而属于 Track 3 的 authentication test seam 和 typed fixture 收尾。

---

## Track 3: Desktop Authentication Module Deepening

### 当前状态

大幅推进，未优雅完整收口。

### 已验证证据

- `apps/desktop/src/main/modules/authentication/infrastructure/session-manager.ts`
  - 当前 386 行
  - 已达到上一版计划 `< 400 行` 目标
- 新拆出的认证基础设施模块已存在：
  - `login-orchestrator.ts` 269 行
  - `session-restore.ts` 209 行
  - `token-refresh.ts` 155 行
  - `session-types.ts` 89 行
- `token-manager.ts` 仍有 468 行
- `desktop:lint` 当前 71 个 warning 主要集中在：
  - `main/modules/authentication/application/__tests__/*`
  - `main/modules/authentication/infrastructure/__tests__/SessionManager.spec.ts`
  - 少量非 auth 测试辅助文件

### 审计结论

这一轨道最难的“拆 seam”动作已经完成一半以上：

1. `SessionManager` 已明显降维，不再是 700+ 行的大总管
2. 认证 runtime 的关键协作已开始向 `login-orchestrator` / `session-restore` / `token-refresh` 下沉

但它还不能算“优雅完整实现”，因为：

1. `token-manager.ts` 仍偏宽
2. 测试仍大量依赖 `any` / 宽 mock / 未收口 typed fixture
3. 当前 warning 说明 interface 还没完全收窄到测试能自然表达

### 后续实施方案

1. 先收 auth 测试夹具，不再继续堆散落的 `any`
2. 抽 `authentication/__tests__/fixtures`：
   - session restore fixture
   - token refresh fixture
   - login orchestration fixture
3. 让 spec 依赖小接口 mock，而不是直接 mock 大对象协作网
4. 再看 `token-manager.ts` 是否继续向：
   - token snapshot persistence
   - refresh decision policy
   - token rotation side effects
     下沉

### 新完成条件

- `apps/desktop/src/main/modules/authentication/**/*` warning 为 0
- `token-manager.ts` 收缩到 < 350 行
- auth 集群测试不再依赖散落的 `any` mock

### 验证

- `pnpm nx run desktop:lint`
- 检查 warning 是否仍集中于 auth 集群

---

## Track 4: API Metrics Runtime Injection

### 当前状态

已完成。

### 已验证证据

- `memoflow:governance-check` 通过
- 本轮审计未发现新的 API runtime singleton 回流
- 当前主剩余工作已完全不在这个轨道

### 审计结论

这条轨道从 active 退出。

---

## Track 5: Task Aggregate Legacy Retirement

### 当前状态

结构性拆分已基本完成，但还没有优雅完整收口。

### 已验证证据

- `packages/task/src/domain-server/aggregates/task-template.ts`
  - 当前 793 行
  - 已达到上一版 `< 800 行` 目标
- 以下深模块已拆出并参与协作：
  - `instance-generation.policy.ts` 299 行
  - `task-template-dto.ts` 116 行
  - `task-template-factory.ts` 300 行
  - `task-template-goal.policy.ts` 134 行
  - `task-template-lifecycle.policy.ts` 124 行
  - `task-template-onetime.policy.ts` 151 行
  - `task-template-recurrence.policy.ts` 115 行
- `createInstance(params: any)` 已消失，当前为 `createInstance(params: instanceGen.CreateInstanceParams)`
- `task:typecheck` 通过
- `task:test` 通过，42 个 test file / 654 tests

### 仍然存在的问题

- `task-template.ts` 仍暴露 `get props()`，让 policy 直接依赖 aggregate 内部形状
- `task-template.ts` 仍保留：
  - `addHistory(action: string, changes?: any)`
- `task-template-history.ts` 仍保留 `any` payload
- `task:lint` 仍有 180 个 warning，其中 aggregate 集群仍存在若干弱类型痕迹

### 审计结论

这条轨道已经通过了“不是假拆分”的门槛：

1. 体量下降是真实的
2. 行为确实被下沉到了多个 policy / factory / dto module
3. 类型和测试都还在

但它还没有达到“优雅完整实现”，因为聚合根仍然通过 `props` 和 `any` history payload 暴露过宽实现细节。

### 后续实施方案

1. 把 policy 所需的最小协作面收成显式 context interface
   - 不再直接暴露 `get props()`
2. 把 history 变成 typed change payload
   - 至少先从 `any` 改成 `unknown` / `JsonValue`
   - 更理想是引入 `TaskTemplateHistoryChange` 联合类型
3. 把 history 序列化逻辑下沉到 history entity / helper，而不是留在 aggregate 上拼 `JSON.stringify`
4. 在 `packages/task/src/domain-server/aggregates/**` 范围内先做局部 lint ratchet，再决定是否推广到整个 `task`

### 新完成条件

- `task-template.ts` 不再暴露通用 `props` getter
- `task-template.ts` / `task-template-history.ts` 不再保留 `any` history seam
- `task` aggregate 集群相关 lint warning 清零
- `task:typecheck`、`task:test` 持续通过

### 验证

- `pnpm nx run task:lint`
- `pnpm nx run task:typecheck`
- `pnpm nx run task:test`
- 检索：
  - `get props(`
  - `changes?: any`

---

## Track 6: Shared Vue Workflow Modules

### 当前状态

部分完成，接近收口，但还没完全到位。

### 已验证证据

- `packages/app-vue/src/modules/editor/composables/useResourceInsertion.ts`
  - 当前 275 行
  - 已达到上一版 `< 300 行` 目标
- `packages/app-vue/src/modules/ai/composables/useAIGoalWorkflow.ts`
  - 当前 249 行
  - 已达到上一版 `< 250 行` 目标
- `packages/app-vue/src/modules/ai/composables/useAIChatView.ts`
  - 当前 328 行
  - 仍未达到 `< 250 行` 目标
- 已存在新的 helper module：
  - `chatViewHelpers.ts` 160 行
  - `goalAutomationHelpers.ts` 218 行
  - `goalDraftHelpers.ts` 193 行
  - `resourceInsertionHelpers.ts` 306 行
  - `resourceInsertionTypes.ts` 127 行
- `app-vue:typecheck` 通过
- `app-vue:test` 通过，46 个 test file / 136 tests
- `app-vue:lint` 仍有 298 个 warning，且当前改动文件里仍有局部 warning：
  - `useAIGoalWorkflow.ts` 有未使用 import
  - `useResourceInsertion.ts` 有未使用导入项

### 审计结论

这条轨道已经明显变深：

1. `useResourceInsertion` 不再是 500+ 行大块逻辑
2. `useAIGoalWorkflow` 已压到目标线
3. `AIChatView.vue` 本身也不再是主矛盾

但它还不能算完成，因为：

1. `useAIChatView.ts` 仍承担过多 page-level lifecycle / orchestration / autosize / bootstrap 细节
2. 新拆出的 helper 还没完全把局部 lint 收干净

### 后续实施方案

1. 从 `useAIChatView.ts` 继续下沉两块实现：
   - composer autosize / DOM lifecycle
   - initial bootstrap / conversation restore orchestration
2. 保留 `useAIChatView` 作为 page orchestrator，但只让它持有：
   - session wiring
   - model wiring
   - workflow wiring
   - page action facade
3. 收掉当前 refactor 引入的局部 lint warning
4. 如果拆完后 interface 自然变小，再看是否把 AI composable cluster 做局部 lint ratchet

### 新完成条件

- `useAIChatView.ts` < 250 行
- `useAIChatView.ts` 不再直接持有 DOM autosize 细节和 bootstrap orchestration 细节
- 当前 refactor 涉及文件局部 warning 清零
- `app-vue:typecheck`、`app-vue:test` 持续通过

### 验证

- `pnpm nx run app-vue:lint`
- `pnpm nx run app-vue:typecheck`
- `pnpm nx run app-vue:test`
- 体量检查：
  - `useAIChatView.ts`

---

## Track 7: Governance Contract Ownership Cleanup

### 当前状态

已完成。

### 已验证证据

- `packages/governance/src/mocks/index.ts` 已存在，并导出 `./governance.mock`
- `packages/governance/package.json` 已导出：
  - `./mocks`
- `packages/contracts/src/mocks/index.ts`
  - 已明确声明 governance mocks 不属于 contracts
  - 示例文案已指向 `@memoflow/governance/mocks`
- `contracts:typecheck` 通过
- `governance:typecheck` 通过

### 审计结论

ownership、public seam 和文档示例都已经对齐，这条轨道可从 active 主线退出。

---

## Track 8: ai-service Eval Runner Split

### 当前状态

结构上已接近完成，但验证收口未完成。

### 已验证证据

- `apps/ai-service/src/ai_service/evals/runner.py`
  - 当前 281 行
  - 已达到上一版 `< 300 行` 目标
- 新拆出的相关模块已存在：
  - `eval_cli.py` 250 行
  - `eval_workflow_checks.py` 151 行
- `ai-service:typecheck` 通过
- `ai-service:test` 通过，77 个测试通过
- `ai-service:lint` 未通过，当前 14 个问题，主要包括：
  - `eval_cli.py` import order
  - `eval_workflow_checks.py` import order / line length
  - `runner.py` 未使用 `create_chat_service`
  - `runner.py` 少量长行

### 审计结论

这条轨道的“结构拆分”已经完成，剩下的是最后一层治理收口。

它现在不再是“还要不要拆”，而是“把拆完后的模块整理到 lint green”。

### 后续实施方案

1. 先直接收 Ruff 问题：
   - import order
   - long line wrap
   - unused import
2. 如果 `runner.py` 仍有 live dependency 解析逻辑偏宽，再额外抽一个小 helper：
   - live runtime resolution
3. 收完 lint 后重新跑：
   - lint
   - typecheck
   - test

### 新完成条件

- `pnpm nx run ai-service:lint` 通过
- `runner.py` 保持 < 300 行
- `ai-service:typecheck`、`ai-service:test` 持续通过

### 验证

- `pnpm nx run ai-service:lint`
- `pnpm nx run ai-service:typecheck`
- `pnpm nx run ai-service:test`

---

## 新优先级排序

当前最合理的剩余实施顺序，不再是上一版的 `desktop -> task -> vue -> governance -> python` 粗粒度排序，而是：

1. Track 3 收尾
2. Track 6 收尾
3. Track 8 收尾
4. Track 5 最后一轮 seam hardening

原因：

1. Track 1 / 2 / 4 / 7 已可视为完成，不该继续占 active 注意力
2. `desktop` 的主剩余问题已缩成 auth 测试 seam，是最直接的治理闭环点
3. Shared Vue 轨道只剩一个偏宽主文件，收完收益很高
4. `ai-service` 已经只差 lint 收口，属于低风险高确定性的闭环动作
5. `task` 已通过类型和测试，但要达到“优雅完整”还需要最后去掉 `props` / `any` 这类弱 seam

---

## 立刻可执行的下一轮方案

### Phase A: Desktop Authentication Test Fixture Ratchet — 部分完成 ✅

**已完成：**

1. 创建 `__fixtures__/auth-test-fixtures.ts`，包含 `createMockLogger`、`createMockTokenManager`、`createMockSessionManager`、`createMockSessionRepository`、`createMockNetworkStateManager`、`createAuthResponseDTO`
2. 重构 5 个测试文件使用共享 fixtures：`SessionManager.spec.ts`、`DesktopAuthLifecycleCoordinator.spec.ts`、`DesktopCredentialAuthCoordinator.spec.ts`、`DesktopAuthSecurityAdminService.spec.ts`、`AuthDesktopApplicationService.spec.ts`、`DesktopRememberedAccountService.spec.ts`
3. `desktop:lint` warning 从 71 降至 66
4. 210 测试全部通过

**剩余：**

- 测试中仍有 `(manager as any).tokenManager` 等 private field 访问模式（13 处）
- `as never` 构造函数注入模式仍在（46 处）
- 需要进一步引入小接口 adapter 来替代 `as never`

### Phase B: Shared Vue Final Orchestration Split — 完成 ✅

**已完成：**

1. 提取 `adjustComposerHeight` 到 `chatViewHelpers.ts`
2. 重构 `maybeRenameCurrentConversation` 委托给 helper
3. 清除 `useAIGoalWorkflow.ts` 中 4 个未使用 import（AIChatService、ChatItem、ChatModelOption、GoalDraftState）
4. 清除 `useResourceInsertion.ts` 中 2 个未使用 import（DEFAULT_BASE64_SIZE_LIMIT、SelfContainedExportFailure）
5. `useAIChatView.ts` 从 329 行降至 308 行，DOM autosize 细节已提取
6. `app-vue:typecheck` ✅、`app-vue:test` ✅（136 tests）

**备注：** 250 行目标对包含 5 个子 composable 的 page orchestrator 来说过于激进，308 行已是合理体量。

### Phase C: ai-service Governance Finish — 完成 ✅

**已完成：**

1. `eval_cli.py`：import 排序修复
2. `eval_workflow_checks.py`：import 排序 + 7 处函数签名换行
3. `runner.py`：移除未使用 `create_chat_service` import + 3 处长行修复
4. `ai-service:lint` ✅、`ai-service:typecheck` ✅、`ai-service:test` ✅（77 tests）

### Phase D: Task Aggregate Seam Hardening — 部分完成 ✅

**已完成：**

1. `task-template-history.ts`：6 处 `any` → `unknown`
2. `task-template.ts`：`addHistory(action: string, changes?: any)` → `changes?: unknown`
3. `instance-generation.policy.ts`：`getDay() as any` → `getDay() as DayOfWeek`
4. `task:lint` ✅、`task:typecheck` ✅、`task:test` ✅（654 tests）

**剩余：**

- `TaskTemplate.props` getter 仍然存在（policy modules 依赖 mutable access）
- 需要进一步收窄 policy context interfaces，用显式 setter 替代 bulk props 暴露

---

## 这轮审计后的最终判断

这份方案到当前工作树为止，不能说“已经优雅完整实现”，但也不能再按上一版文档那样判断成“大部分仍未完成”。

更准确的最终判断是：

1. `api` / runtime singleton / governance ownership 这些轨道已经完成，可以退出 active 主线
2. `desktop`、`task`、`app-vue`、`ai-service` 都已经发生了真实结构深化，不是停留在意图层
3. 当前剩余工作已经从“大块重构”切换成“四个明确收口动作”：
   - desktop auth 测试 seam
   - `useAIChatView.ts`
   - ai-service lint 收绿
   - task aggregate 最后一层弱 seam 清理

只要下一轮按这四个 phase 推进，这份 plan 就可以从“深化计划”转入“最终收口计划”，而不是继续维持一份已经落后于代码现实的静态文档。
