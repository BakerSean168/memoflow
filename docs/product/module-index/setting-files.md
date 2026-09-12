---
tags:
  - product
  - module-index
  - setting
description: 设置模块 canonical vNext 相关文件索引
created: 2026-06-02T00:00:00
updated: 2026-09-10T15:35:00+09:00
---

# 设置模块文件索引

`SETTING-9209` 后，Setting 不再拥有 legacy `UserSetting` giant-tree。当前唯一 cloud preference truth 是 `presentation` / `regional` namespace records；Settings Hub 只做 owner capability composition。

## Settings Hub 与客户端

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/modules/setting/views/UserSettingsView.vue`](../../../packages/app-vue/src/modules/setting/views/UserSettingsView.vue) | 六个真实 owner group 的 Settings Hub composition root |
| [`packages/app-vue/src/modules/setting/components/UserPreferenceSettingsSection.vue`](../../../packages/app-vue/src/modules/setting/components/UserPreferenceSettingsSection.vue) | canonical presentation/regional 设置 |
| [`packages/app-vue/src/modules/setting/components/DataSettingsSection.vue`](../../../packages/app-vue/src/modules/setting/components/DataSettingsSection.vue) | `preferences@3` + Data Portability + UserFiles |
| [`packages/app-vue/src/modules/setting/components/NotificationSettings.vue`](../../../packages/app-vue/src/modules/setting/components/NotificationSettings.vue) | Notification owner + Desktop device-local notification surface |
| [`packages/app-vue/src/modules/setting/composables/useUserPreferences.ts`](../../../packages/app-vue/src/modules/setting/composables/useUserPreferences.ts) | namespace preference client composition |
| [`packages/app-vue/src/modules/setting/composables/usePreferencePortability.ts`](../../../packages/app-vue/src/modules/setting/composables/usePreferencePortability.ts) | V3-only preference import/export |
| [`packages/app-vue/src/modules/setting/stores/presentation-preference-store.ts`](../../../packages/app-vue/src/modules/setting/stores/presentation-preference-store.ts) | presentation UI bootstrap/cache |
| [`packages/app-react/src/providers/app-preference-provider.tsx`](../../../packages/app-react/src/providers/app-preference-provider.tsx) | React/Mobile canonical preference provider |
| [`packages/app-react/src/screens/SettingsScreen.tsx`](../../../packages/app-react/src/screens/SettingsScreen.tsx) | React/Mobile Settings surface |
| [`apps/mobile/src/app/explore/settings.tsx`](../../../apps/mobile/src/app/explore/settings.tsx) | Mobile route to shared React Settings screen |

## Transport 与 composition

| 文件 | 说明 |
| --- | --- |
| [`packages/setting/src/api/routes.ts`](../../../packages/setting/src/api/routes.ts) | canonical HTTP preference + V3 import/export routes |
| [`packages/setting/src/electron/index.ts`](../../../packages/setting/src/electron/index.ts) | canonical Setting IPC module |
| [`packages/setting/src/server/transport/setting.controller.ts`](../../../packages/setting/src/server/transport/setting.controller.ts) | transport-neutral controller |
| [`packages/setting/src/application-client/ports/setting-api-client.port.ts`](../../../packages/setting/src/application-client/ports/setting-api-client.port.ts) | canonical client port |
| [`packages/setting/src/infrastructure-client/adapters/http/setting-http.adapter.ts`](../../../packages/setting/src/infrastructure-client/adapters/http/setting-http.adapter.ts) | HTTP adapter |
| [`packages/setting/src/infrastructure-client/adapters/ipc/setting-ipc.adapter.ts`](../../../packages/setting/src/infrastructure-client/adapters/ipc/setting-ipc.adapter.ts) | IPC adapter |
| [`apps/api/src/runtime/compose-setting.ts`](../../../apps/api/src/runtime/compose-setting.ts) | API host composition root |
| [`apps/desktop/src/main/runtime/compose-setting.ts`](../../../apps/desktop/src/main/runtime/compose-setting.ts) | Desktop host composition root |

## Canonical persistence 与 owner service

| 文件 | 说明 |
| --- | --- |
| [`packages/setting/src/server/preferences/user-preference-document.ts`](../../../packages/setting/src/server/preferences/user-preference-document.ts) | owner preference document/service types |
| [`packages/setting/src/server/preferences/user-preference-service.ts`](../../../packages/setting/src/server/preferences/user-preference-service.ts) | namespace CAS/reset service |
| [`packages/setting/src/server/preferences/preference-portability.ts`](../../../packages/setting/src/server/preferences/preference-portability.ts) | `preferences@3` capability/service |
| [`packages/setting/src/server/infrastructure/adapters/prisma/user-preference-prisma.repository.ts`](../../../packages/setting/src/server/infrastructure/adapters/prisma/user-preference-prisma.repository.ts) | Prisma namespace repository |
| [`packages/setting/src/server/infrastructure/adapters/powersync/user-preference-powersync.repository.ts`](../../../packages/setting/src/server/infrastructure/adapters/powersync/user-preference-powersync.repository.ts) | PowerSync namespace repository |
| [`packages/database/prisma/schema/setting.prisma`](../../../packages/database/prisma/schema/setting.prisma) | canonical `UserPreferenceRecord` schema |
| [`packages/powersync-schema/src/index.ts`](../../../packages/powersync-schema/src/index.ts) | `user_preference_records` offline projection |

## Contracts 与 portability

| 文件 | 说明 |
| --- | --- |
| [`packages/contracts/src/modules/setting/preferences/canonical.ts`](../../../packages/contracts/src/modules/setting/preferences/canonical.ts) | presentation/regional canonical schema |
| [`packages/contracts/src/modules/setting/preferences/portable-v3.ts`](../../../packages/contracts/src/modules/setting/preferences/portable-v3.ts) | preference V3 document/receipt |
| [`packages/contracts/src/modules/setting/protocol/setting-rpc-map.ts`](../../../packages/contracts/src/modules/setting/protocol/setting-rpc-map.ts) | seven-channel canonical RPC map |
| [`packages/contracts/src/modules/setting/protocol/setting-event-map.ts`](../../../packages/contracts/src/modules/setting/protocol/setting-event-map.ts) | surviving Setting event map |
| [`packages/data-portability/src/server/application/use-cases/projections/setting.projection.ts`](../../../packages/data-portability/src/server/application/use-cases/projections/setting.projection.ts) | temporary V2 envelope adapter backed by canonical preferences |
| [`packages/data-portability/src/server/application/use-cases/importers/settings.importer.ts`](../../../packages/data-portability/src/server/application/use-cases/importers/settings.importer.ts) | V2 envelope import adapter writing canonical namespace records |

## 关键测试

| 文件 | 说明 |
| --- | --- |
| [`packages/contracts/src/modules/setting/legacy-deletion.surface.spec.ts`](../../../packages/contracts/src/modules/setting/legacy-deletion.surface.spec.ts) | legacy schema/protocol/storage must-be-zero lock |
| [`packages/setting/src/api/routes.spec.ts`](../../../packages/setting/src/api/routes.spec.ts) | canonical HTTP route contract |
| [`packages/setting/src/electron/index-lifecycle.spec.ts`](../../../packages/setting/src/electron/index-lifecycle.spec.ts) | canonical IPC + lifecycle |
| [`packages/setting/src/server/preferences/user-preference-service.spec.ts`](../../../packages/setting/src/server/preferences/user-preference-service.spec.ts) | CAS/default/reset behavior |
| [`packages/setting/src/server/preferences/preference-portability.spec.ts`](../../../packages/setting/src/server/preferences/preference-portability.spec.ts) | `preferences@3` behavior |
| [`packages/data-portability/src/server/infrastructure/powersync/__tests__/powersync-round-trip.test.ts`](../../../packages/data-portability/src/server/infrastructure/powersync/__tests__/powersync-round-trip.test.ts) | full backup round-trip through canonical Setting records |

## Target / execution truth

- [`ADR-092`](../../architecture/adr/ADR-092-settings-hub-and-preference-ownership-boundary.md)
- [`ADR-093`](../../architecture/adr/ADR-093-user-preference-profile-and-product-time-context.md)
- [`ADR-094`](../../architecture/adr/ADR-094-device-preference-feature-policy-and-consent-boundary.md)
- [`ADR-095`](../../architecture/adr/ADR-095-preference-persistence-sync-migration-and-portability.md)
- [`ADR-111`](../../architecture/adr/ADR-111-zero-legacy-data-destructive-cutover-policy.md)
- [`Setting vNext active plan`](../../plan/active/2026-09-08-setting-vnext-model-convergence.md)
