---
tags:
  - product
  - module-index
  - setting
description: 设置模块相关文件索引
created: 2026-06-02T00:00:00
updated: 2026-09-08T23:26:00+08:00
---

# 设置模块文件索引

本索引用于连接设置模块的业务说明和真实代码。

## 前端页面与路由

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/modules/setting/router/index.ts`](../../../packages/app-vue/src/modules/setting/router/index.ts) | Vue 设置模块路由 |
| [`packages/app-vue/src/modules/setting/views/UserSettingsView.vue`](../../../packages/app-vue/src/modules/setting/views/UserSettingsView.vue) | 设置主页面（9 个 Tab 分区） |

## 前端状态、组合函数与组件

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/modules/setting/stores/user-setting-store.ts`](../../../packages/app-vue/src/modules/setting/stores/user-setting-store.ts) | 用户设置 Pinia store |
| [`packages/app-vue/src/modules/setting/stores/presentation-preference-store.ts`](../../../packages/app-vue/src/modules/setting/stores/presentation-preference-store.ts) | 展示偏好 store（主题/语言） |
| [`packages/app-vue/src/modules/setting/composables/useUserSetting.ts`](../../../packages/app-vue/src/modules/setting/composables/useUserSetting.ts) | 设置操作组合函数 |
| [`packages/app-vue/src/modules/setting/composables/useThemeSync.ts`](../../../packages/app-vue/src/modules/setting/composables/useThemeSync.ts) | 主题同步组合函数 |
| [`packages/app-vue/src/modules/setting/composables/useLocaleSync.ts`](../../../packages/app-vue/src/modules/setting/composables/useLocaleSync.ts) | 语言同步组合函数 |
| [`packages/app-vue/src/modules/setting/composables/usePresentationBootstrap.ts`](../../../packages/app-vue/src/modules/setting/composables/usePresentationBootstrap.ts) | 展示层引导组合函数 |
| [`packages/app-vue/src/modules/setting/components/AppearanceSettings.vue`](../../../packages/app-vue/src/modules/setting/components/AppearanceSettings.vue) | 外观设置组件 |
| [`packages/app-vue/src/modules/setting/components/LocaleSettings.vue`](../../../packages/app-vue/src/modules/setting/components/LocaleSettings.vue) | 语言设置组件 |
| [`packages/app-vue/src/modules/setting/components/AISettings.vue`](../../../packages/app-vue/src/modules/setting/components/AISettings.vue) | AI 设置组件 |
| [`packages/app-vue/src/modules/setting/components/PrivacySettings.vue`](../../../packages/app-vue/src/modules/setting/components/PrivacySettings.vue) | 隐私设置组件 |
| [`packages/app-vue/src/modules/setting/components/NotificationSettings.vue`](../../../packages/app-vue/src/modules/setting/components/NotificationSettings.vue) | 通知设置组件 |
| [`packages/app-vue/src/modules/setting/components/ShortcutSettings.vue`](../../../packages/app-vue/src/modules/setting/components/ShortcutSettings.vue) | 快捷键设置组件 |
| [`packages/app-vue/src/modules/setting/components/ExperimentalSettings.vue`](../../../packages/app-vue/src/modules/setting/components/ExperimentalSettings.vue) | 实验功能设置组件 |
| [`packages/app-vue/src/modules/setting/components/SettingAdvancedActions.vue`](../../../packages/app-vue/src/modules/setting/components/SettingAdvancedActions.vue) | 高级操作组件（导出/导入） |

## 移动端入口

| 文件 | 说明 |
| --- | --- |
| [`apps/mobile/src/app/explore/settings.tsx`](../../../apps/mobile/src/app/explore/settings.tsx) | 移动端设置入口 |
| [`packages/app-react/src/screens/SettingsScreen.tsx`](../../../packages/app-react/src/screens/SettingsScreen.tsx) | React Native 设置屏幕 |

## API、控制器与适配器

| 文件 | 说明 |
| --- | --- |
| [`packages/setting/src/api/routes.ts`](../../../packages/setting/src/api/routes.ts) | 设置 HTTP routes（6 个端点） |
| [`packages/setting/src/api/module.ts`](../../../packages/setting/src/api/module.ts) | 设置 API 模块定义 |
| [`packages/setting/src/server/transport/setting.controller.ts`](../../../packages/setting/src/server/transport/setting.controller.ts) | 设置控制器 |
| [`packages/setting/src/infrastructure-client/adapters/http/setting-http.adapter.ts`](../../../packages/setting/src/infrastructure-client/adapters/http/setting-http.adapter.ts) | 客户端 HTTP 适配器 |
| [`packages/setting/src/infrastructure-client/adapters/ipc/setting-ipc.adapter.ts`](../../../packages/setting/src/infrastructure-client/adapters/ipc/setting-ipc.adapter.ts) | 客户端 IPC 适配器 |

## 领域、用例与仓储

| 文件 | 说明 |
| --- | --- |
| [`packages/setting/src/server/domain/aggregates/user-setting.ts`](../../../packages/setting/src/server/domain/aggregates/user-setting.ts) | UserSetting 聚合根 |
| [`packages/setting/src/server/application/use-cases/commands/patch-user-setting.ts`](../../../packages/setting/src/server/application/use-cases/commands/patch-user-setting.ts) | Patch 设置用例 |
| [`packages/setting/src/server/application/use-cases/commands/reset-user-setting.ts`](../../../packages/setting/src/server/application/use-cases/commands/reset-user-setting.ts) | 重置设置用例 |
| [`packages/setting/src/server/application/use-cases/commands/import-settings.ts`](../../../packages/setting/src/server/application/use-cases/commands/import-settings.ts) | 导入设置用例 |
| [`packages/setting/src/server/application/use-cases/queries/get-user-setting.ts`](../../../packages/setting/src/server/application/use-cases/queries/get-user-setting.ts) | 获取设置查询 |
| [`packages/setting/src/server/application/use-cases/queries/export-settings.ts`](../../../packages/setting/src/server/application/use-cases/queries/export-settings.ts) | 导出设置查询 |
| [`packages/setting/src/server/infrastructure/setting.module.ts`](../../../packages/setting/src/server/infrastructure/setting.module.ts) | 服务端设置模块组合根 |

## Contracts 与数据结构

| 文件 | 说明 |
| --- | --- |
| [`packages/contracts/src/modules/setting/aggregates/user-setting-server.ts`](../../../packages/contracts/src/modules/setting/aggregates/user-setting-server.ts) | UserSetting 服务端 DTO |
| [`packages/contracts/src/modules/setting/preferences/schemas/index.ts`](../../../packages/contracts/src/modules/setting/preferences/schemas/index.ts) | UserPreferences Zod schema（当前 9 个 category） |
| [`packages/contracts/src/modules/setting/preferences/defaults.ts`](../../../packages/contracts/src/modules/setting/preferences/defaults.ts) | 默认偏好值 |
| [`packages/contracts/src/modules/setting/api/user-setting.dto.ts`](../../../packages/contracts/src/modules/setting/api/user-setting.dto.ts) | 设置 API DTO |
| [`packages/contracts/src/modules/setting/protocol/setting-event-map.ts`](../../../packages/contracts/src/modules/setting/protocol/setting-event-map.ts) | 设置事件 map |
| [`packages/contracts/src/modules/setting/protocol/setting-rpc-map.ts`](../../../packages/contracts/src/modules/setting/protocol/setting-rpc-map.ts) | 设置 RPC map |

## 测试入口

| 文件 | 说明 |
| --- | --- |
| [`packages/setting/src/server/domain/aggregates/__tests__/user-setting.spec.ts`](../../../packages/setting/src/server/domain/aggregates/__tests__/user-setting.spec.ts) | UserSetting 聚合测试 |
| [`packages/setting/src/server/application/use-cases/commands/__tests__/patch-user-setting.test.ts`](../../../packages/setting/src/server/application/use-cases/commands/__tests__/patch-user-setting.test.ts) | Patch 设置测试 |
| [`packages/setting/src/api/routes.spec.ts`](../../../packages/setting/src/api/routes.spec.ts) | 设置 routes 测试 |
| [`packages/app-vue/src/modules/setting/stores/userSettingStore.spec.ts`](../../../packages/app-vue/src/modules/setting/stores/userSettingStore.spec.ts) | 设置 store 测试 |

## 需要重点关注的改动风险

- 设置项生效时机和持久化路径。
- 平台差异设置（桌面路径、快捷键、通知权限）。
- 设置与其他模块运行时配置的边界。
- JSONB 存储的查询性能和索引策略。

## Target-design 文档（2026-09-08）

| 文件 | 说明 |
| --- | --- |
| [`ADR-092`](../../architecture/adr/ADR-092-settings-hub-and-preference-ownership-boundary.md) | Settings Hub 与 preference ownership 边界 |
| [`ADR-093`](../../architecture/adr/ADR-093-user-preference-profile-and-product-time-context.md) | UserPreferenceProfile 与 Product Time Context |
| [`ADR-094`](../../architecture/adr/ADR-094-device-preference-feature-policy-and-consent-boundary.md) | Device/Feature/Consent 边界 |
| [`ADR-095`](../../architecture/adr/ADR-095-preference-persistence-sync-migration-and-portability.md) | namespace persistence、PowerSync、migration、portability |
| [`Setting current-system map`](../../analysis/2026-09-08-setting-vnext-current-system-map.md) | 当前源码事实、双真值与迁移基线 |
| [`Setting reference study`](../../analysis/2026-09-08-setting-vnext-reference-study.md) | VS Code scope/sync 与 Feature Flag 参考 |
| [`Setting vNext Settings Hub`](../setting-vnext-settings-hub.md) | 目标产品 UI / interaction / host scope |
| [`Setting vNext active plan`](../../plan/active/2026-09-08-setting-vnext-model-convergence.md) | 实施 ticket、依赖、测试与 DoD |
