# 2026-05-27 架构深化二次执行审计

## 审计结论

### Gate 状态总览

| Gate                | 状态  | 说明                                                     |
| ------------------- | ----- | -------------------------------------------------------- |
| Auth 状态机         | 🟢 绿 | `safeTransition` 在 3 个协调器中一致使用，210 测试全通过 |
| Utils barrel        | 🟢 绿 | 显式命名导出，零文件从根 barrel 导入                     |
| Cron 工厂           | 🟢 绿 | `CronSchedulerManager` 是类，调用方持有生命周期          |
| PowerSync 模块      | 🟢 绿 | 拆分为 token-issuer / crud-executor / snapshot-*         |
| API 容器            | 🟢 绿 | `ApiBootstrapper` 模式，无业务单例                       |
| Desktop 两阶段启动  | 🟢 绿 | `DesktopProfileRuntimeManager` 构造注入，无服务定位器    |
| 服务器特性形态      | 🟢 绿 | 12 个包全部符合 ADR-031                                  |
| Vue composable 拆分 | 🟢 绿 | 4 个巨型 composable 已分解为编排层 + 子 composable       |
| Desktop renderer DI | 🟢 绿 | 全部通过 `app.provide()`，无单例                         |
| 通知启动钩子        | 🟢 绿 | 显式组合，无全局阶段注册                                 |
| ai-service 架构     | 🟢 绿 | 成熟的分层架构，HMAC 安全，评估框架                      |

### 表面绿但覆盖不足

| Gate                  | 状态  | 差距                                                                                                                 |
| --------------------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| 治理执行              | 🟡 黄 | `server-feature-shape-audit.mjs` 未接入 `governance-check`；根 project.json 和 nx-test-system 缺少 `layer:` tag      |
| Utils 导入限制        | 🟡 黄 | ESLint `no-restricted-imports` 级别为 `warn`，非 `error`，CI 不阻断                                                  |
| Desktop main 残留单例 | 🟡 黄 | `desktop-features/` 有 3 个模块级单例（tray/shortcut/autoLaunch），`auto-update` 有懒加载单例                        |
| Repository composable | 🟡 黄 | `useRepository.ts` 仍有 462 行；barrel 只导出 1/9 个 composable                                                      |
| Editor 大文件         | 🟡 黄 | `useResourceInsertion.ts`（663 行）、`editor-workspace-store.ts`（344 行）、`useEditorDocumentRegistry.ts`（310 行） |
| AI Chat 视图          | 🟡 黄 | `AIChatView.vue`（1184 行）承担过多，应拆分面板为子组件                                                              |
| API metricsStore      | 🟢 绿 | 已闭环（RefArch Phase 6）：`performance.middleware.ts` 已退役，metrics 改为注入式 `HttpRequestMetricsRecorder`       |
| ai-service 大文件     | 🟡 黄 | `goal_planning_service.py`（~1200 行）、`evals/runner.py`（~1200 行）                                                |

---

## 7 轨并行实施方案

### Track 1: 治理加固

**目标**: 治理脚本全覆盖 + 层标签完整 + 导入限制升级

**只改这些文件**:

- `project.json`（根）— 添加 `tags: ["scope:meta"]`
- `tools/nx-test-system/project.json` — 添加 `layer:shared` tag
- `project.json`（根）— `governance-check` target 命令链追加 `node tools/governance/server-feature-shape-audit.mjs`
- `eslint.config.ts` — `@memoflow/utils` 的 `no-restricted-imports` 从 `warn` 升级为 `error`

**不改**: 任何业务代码

**依赖**: 无

**完成条件**: `pnpm nx run memoflow:governance-check` 全部通过；ESLint 零 warning

---

### Track 2: Desktop Renderer 清理

**目标**: 消除类型强制转换，提取 composable

**只改这些文件**:

- `apps/desktop/src/renderer/views/CustomNotificationView.vue` — 提取 `useCustomNotification.ts` composable，用 `inject(DESKTOP_BRIDGE_KEY)` 替换 7 处 `(window as any).electronAPI`
- `apps/desktop/src/renderer/useDesktopWindowControls.ts` — 可能的小调整

**不改**: `platform/di-app.ts`、`bootstrap/`、`main.ts`

**依赖**: 无

**完成条件**: `CustomNotificationView.vue` < 150 行；零处 `(window as any).electronAPI`

---

### Track 3: Desktop Main Runtime 清理

**目标**: 消除 `desktop-features/` 和 `auto-update` 的模块级单例

**只改这些文件**:

- `apps/desktop/src/main/desktop-features/index.ts` — 将 `trayManager`、`shortcutManager`、`autoLaunchManager` 改为由 `DesktopProfileRuntimeManager` 持有或构造注入
- `apps/desktop/src/main/modules/auto-update/auto-update-manager.ts` — 移除 `getAutoUpdateManager()` 懒加载单例，改为注入
- `apps/desktop/src/main/main.ts` — 移除 `getBootstrapper()` 导出（确认无消费者后）

**不改**: `lifecycle/`、`modules/authentication/`、`profile/`

**依赖**: 无

**完成条件**: `pnpm nx run desktop:test` 全通过；`grep -r "getAutoUpdateManager\|getTrayManager\|getShortcutManager\|getAutoLaunchManager" apps/desktop/src/main/` 零匹配

---

### Track 4: Shared Vue — Repository / Editor 深度拆分

**目标**: 大 composable 进一步分解，barrel 对齐

**只改这些文件**:

- `packages/app-vue/src/modules/repository/composables/useRepository.ts`（462 行）— 提取 `useRepositorySearch`（search 逻辑）、`useRepositoryUpload`（upload 编排）
- `packages/app-vue/src/modules/repository/composables/index.ts` — barrel 导出所有 9 个 composable
- `packages/app-vue/src/modules/editor/composables/useResourceInsertion.ts`（663 行）— 拆分为 `useResourceInsertion` + `useInsertionValidation` + `useInsertionPreview`
- `packages/app-vue/src/modules/editor/composables/useEditorDocumentRegistry.ts`（310 行）— 提取注册/查询逻辑
- `packages/app-vue/src/modules/editor/stores/editor-workspace-store.ts`（344 行）— 提取 tab 生命周期操作到 `useTabLifecycle.ts` composable

**不改**: `editor/views/`、`editor/components/`、路由

**依赖**: 无

**完成条件**: 所有 composable < 250 行；barrel 导出完整

---

### Track 5: Shared Vue — AI Chat 拆分

**目标**: `AIChatView.vue` 从 1184 行降到 < 300 行

**只改这些文件**:

- `packages/app-vue/src/modules/ai/views/AIChatView.vue` — 提取面板为子组件
- 新建 `packages/app-vue/src/modules/ai/components/AIGoalWorkflowPanel.vue` — 目标工作流面板
- 新建 `packages/app-vue/src/modules/ai/components/AIKnowledgeNotePanel.vue` — 知识笔记面板
- 新建 `packages/app-vue/src/modules/ai/components/AIConversationSidebar.vue` — 会话列表侧栏
- `packages/app-vue/src/modules/ai/composables/useAIGoalWorkflow.ts`（447 行）— 拆分 automation plan/execute 逻辑

**不改**: `packages/ai/`（domain 包）、`services/`、路由

**依赖**: 无

**完成条件**: `AIChatView.vue` < 300 行；`useAIGoalWorkflow` < 250 行

---

### Track 6: API Runtime 清理

**状态**: ✅ 已闭环（RefArch Phase 6）——`performance.middleware.ts` 已退役（随 `X-Response-Time`），`metricsStore` 模块级单例由按实例构造并注入的 `HttpRequestMetricsRecorder` 取代，完成条件已验证。

**目标**: 消除 `metricsStore` 单例

**只改这些文件**（原计划）:

- `apps/api/src/shared/infrastructure/http/middlewares/performance.middleware.ts` — 将 `metricsStore` 从模块级单例改为通过 `ApiBootstrapper` context 注入的工厂模式
- `apps/api/src/bootstrap.ts` — 在 context 中持有 metricsStore 实例
- `apps/api/src/main.ts` — 传递 metricsStore 到需要的中间件

**不改**: 其他中间件、路由、模块

**依赖**: 无

**完成条件**: `grep -r "export const metricsStore" apps/api/src/` 零匹配

---

### Track 7: ai-service Python 大文件拆分

**目标**: 两个 ~1200 行文件降到 < 400 行

**只改这些文件**:

- `apps/ai-service/src/ai_service/services/goal_planning_service.py`（~1200 行）— 拆分为 `goal_planning_service.py`（编排）+ `goal_planning_strategies.py`（策略逻辑）+ `goal_planning_parsers.py`（已存在，确认完整）
- `apps/ai-service/src/ai_service/evals/runner.py`（~1200 行）— 拆分为 `runner.py`（主循环）+ `eval_reporter.py`（报告生成）+ `eval_case_loader.py`（用例加载）

**不改**: `app.py`、`main.py`、`config/`、`providers/`、API 路由

**依赖**: 无

**完成条件**: 两个文件均 < 400 行；`pytest` 全通过

---

## 依赖关系

```
Track 1 (治理) ──→ 独立
Track 2 (Desktop renderer) ──→ 独立
Track 3 (Desktop main) ──→ 独立
Track 4 (Repo/Editor) ──→ 独立
Track 5 (AI Chat) ──→ 独立
Track 6 (API runtime) ──→ 独立
Track 7 (ai-service) ──→ 独立
```

**7 条轨道完全独立，可并行执行，无交叉依赖。**

## 里程碑

- **M1**: Track 1 完成 → 治理全绿
- **M2**: Track 2-3 完成 → Desktop 全绿
- **M3**: Track 4-5 完成 → Shared Vue 全绿
- **M4**: Track 6-7 完成 → API + Python 全绿
- **M5**: 全部完成 → 二次审计，所有 gate 真绿
