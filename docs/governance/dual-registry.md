---
tags:
  - governance
  - dual-registry
description: Dual Registry — retired locks vs keep-boundary vs open dual debt
created: 2026-07-26T00:00:00
updated: 2026-10-03T10:30:00+09:00
---

# Dual Registry

机器可读账本：[`tools/governance/dual-registry.json`](../../tools/governance/dual-registry.json)。本页是人读投影；分类以 JSON 为准。

Product Governance Runtime 已由 ADR-113 退休，因此其已删除 dual/keep-boundary surfaces 不继续占用 registry。防止回流由 `vnext-retirement-manifest.json` 的负向锁负责。

## 当前度量

| 项 | 值 |
| --- | ---: |
| E0 baseline dual-surface | 237 |
| 当前 retired/dual locks | 64 |
| 当前 keep-boundary | 47 |
| 登记条目总数 | 111 |
| 相对 baseline 降幅 | 73% |
| 未分类 open debt | 0 |

## 分类

- `retired`：实现已单轨，测试只作为 anti-resurrection lock；
- `keep_boundary`：语义确实不同，禁止强行合并；
- `open_S/M/X`：当前为 0；新发现必须先登记 owner/原因再处理。

## 按 package

| package | retired | keep_boundary | other |
| --- | ---: | ---: | ---: |
| `apps/api` | 0 | 3 | 0 |
| `apps/desktop` | 3 | 0 | 0 |
| `apps/web` | 2 | 1 | 0 |
| `packages/account` | 1 | 1 | 0 |
| `packages/ai` | 4 | 7 | 0 |
| `packages/app-vue` | 6 | 20 | 0 |
| `packages/contracts` | 26 | 2 | 0 |
| `packages/data-portability` | 3 | 4 | 0 |
| `packages/goal` | 3 | 3 | 0 |
| `packages/notification` | 1 | 0 | 0 |
| `packages/patterns` | 1 | 0 | 0 |
| `packages/reminder` | 1 | 0 | 0 |
| `packages/repository` | 2 | 0 | 0 |
| `packages/schedule` | 2 | 1 | 0 |
| `packages/setting` | 1 | 0 | 0 |
| `packages/task` | 4 | 0 | 0 |
| `packages/utils` | 4 | 5 | 0 |

## 条目

| class | path |
| --- | --- |
| `keep_boundary` | `apps/api/src/modules/powersync/parse-json-like-string-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `apps/api/src/shared/infrastructure/config/get-cors-origins-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `apps/api/src/shared/infrastructure/load-workspace-env-keep-boundary.surface.spec.ts` |
| `retired` | `apps/desktop/src/main/desktop-shared-ipc-channels-dual.surface.spec.ts` |
| `retired` | `apps/desktop/src/renderer/custom-notification-electron-bridge-dual.surface.spec.ts` |
| `retired` | `apps/desktop/src/renderer/host-electron-bridge-helper-dual.surface.spec.ts` |
| `retired` | `apps/web/src/e2e-helpers/desktop-build-global-setup-dual.surface.spec.ts` |
| `retired` | `apps/web/src/e2e-helpers/normalize-origin-dual.surface.spec.ts` |
| `keep_boundary` | `apps/web/src/platform/read-json-keep-boundary.surface.spec.ts` |
| `retired` | `packages/account/src/application-client/services/account-client-port-mapping-dual.surface.spec.ts` |
| `keep_boundary` | `packages/account/src/server/infrastructure/adapters/powersync/mappers/account-powersync-parse-json-keep-boundary.surface.spec.ts` |
| `retired` | `packages/ai/src/application-client/ai-client-port-facade-dual.surface.spec.ts` |
| `keep_boundary` | `packages/ai/src/infrastructure-client/adapters/read-string-keep-boundary.surface.spec.ts` |
| `retired` | `packages/ai/src/server/infrastructure/adapters/dual-registry.surface.spec.ts` |
| `retired` | `packages/ai/src/server/infrastructure/adapters/prisma/to-prisma-json-dual.surface.spec.ts` |
| `keep_boundary` | `packages/ai/src/server/infrastructure/adapters/prisma/to-prisma-json-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/ai/src/server/infrastructure/adapters/to-string-array-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/ai/src/server/infrastructure/adapters/tokenize-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/ai/src/server/infrastructure/chat-execution/as-record-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/ai/src/server/infrastructure/chat-execution/optional-string-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/ai/src/server/infrastructure/chat-execution/to-number-keep-boundary.surface.spec.ts` |
| `retired` | `packages/ai/src/shared/dual-registry.surface.spec.ts` |
| `retired` | `packages/app-vue/src/di/desktop-auth-api-key-dual.surface.spec.ts` |
| `retired` | `packages/app-vue/src/di/desktop-bridge-electron-bridge-dual.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/di/service-client-port-facade-keep-boundary.surface.spec.ts` |
| `retired` | `packages/app-vue/src/layouts/shell/clamp-dual.surface.spec.ts` |
| `retired` | `packages/app-vue/src/modules/ai/composables/dual-registry.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/modules/authentication/composables/password-toast-only-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/modules/goal/composables/goal-operations-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/modules/goal/utils/clamp-percentage-keep-boundary.surface.spec.ts` |
| `retired` | `packages/app-vue/src/modules/reminder/composables/reminder-desktop-api-dual.surface.spec.ts` |
| `retired` | `packages/app-vue/src/modules/setting/composables/theme-sync-desktop-api-dual.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/calendar-event-layout-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/combine-date-and-time-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/describe-conflict-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/format-date-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/format-datetime-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/format-duration-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/format-event-time-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/format-message-time-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/format-time-range-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/format-timestamp-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/get-importance-label-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/get-status-label-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/ipc/is-plain-object-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/parse-date-input-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/to-date-input-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/to-time-input-keep-boundary.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/account/api/dual-registry.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/account/empty-dual-barrel.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/account/entities/account-entities-dual.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/ai/api/dual-registry.surface.spec.ts` |
| `keep_boundary` | `packages/contracts/src/modules/ai/configs/get-template-by-id-keep-boundary.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/goal/api/dual-registry.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/goal/value-objects/dual-registry.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/notification/aggregates/notification-client-dto-dual.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/notification/api/dual-registry.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/notification/protocol/asset-image-key-dual.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/notification/value-objects/dual-registry.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/reminder/api/dual-registry.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/reminder/entities/reminder-response-client-dto-dual.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/reminder/value-objects/reminder-metrics-vo-dto-dual.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/repository/aggregates/dual-registry.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/repository/api/dual-registry.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/schedule/aggregates/schedule-server-static-dual.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/schedule/api/dual-registry.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/schedule/value-objects/map-importance-to-task-priority-dual.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/setting/api/dual-registry.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/setting/dtos/setting-overview-dual.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/setting/value-objects/retired-dual-track-enums.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/task/aggregates/task-dependency-server-dual.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/task/api/dual-registry.surface.spec.ts` |
| `retired` | `packages/contracts/src/result/action-result-dual.surface.spec.ts` |
| `keep_boundary` | `packages/contracts/src/result/is-record-keep-boundary.surface.spec.ts` |
| `retired` | `packages/contracts/src/shared/dtos/shared-dtos-dual.surface.spec.ts` |
| `retired` | `packages/contracts/src/shared/dual-registry.surface.spec.ts` |
| `retired` | `packages/data-portability/src/application-client/data-portability-client-port-dual.surface.spec.ts` |
| `retired` | `packages/data-portability/src/server/application/use-cases/projections/goal-resolve-ref-dual.surface.spec.ts` |
| `keep_boundary` | `packages/data-portability/src/server/application/use-cases/projections/parse-json-field-keep-boundary.surface.spec.ts` |
| `retired` | `packages/data-portability/src/server/application/use-cases/projections/resolve-export-ref-dual.surface.spec.ts` |
| `keep_boundary` | `packages/data-portability/src/server/application/use-cases/projections/to-boolean-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/data-portability/src/server/application/use-cases/projections/to-date-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/data-portability/src/server/application/use-cases/projections/to-timestamp-keep-boundary.surface.spec.ts` |
| `retired` | `packages/goal/src/__tests__/dual-registry.surface.spec.ts` |
| `keep_boundary` | `packages/goal/src/api/routes/goal-parse-number-string-array-keep-boundary.surface.spec.ts` |
| `retired` | `packages/goal/src/api/routes/parse-boolean-dual.surface.spec.ts` |
| `retired` | `packages/goal/src/application-client/goal-client-port-facade-dual.surface.spec.ts` |
| `keep_boundary` | `packages/goal/src/server/domain/services/compare-priority-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/goal/src/server/infrastructure/build-task-name-keep-boundary.surface.spec.ts` |
| `retired` | `packages/notification/src/application-client/notification-client-port-dual.surface.spec.ts` |
| `retired` | `packages/patterns/src/events/create-event-bus-adapter-dual.surface.spec.ts` |
| `retired` | `packages/reminder/src/application-client/reminder-client-port-dual.surface.spec.ts` |
| `retired` | `packages/repository/src/application-client/repository-client-port-dual.surface.spec.ts` |
| `retired` | `packages/repository/src/electron/vault-fs-guards-dual.surface.spec.ts` |
| `keep_boundary` | `packages/schedule/src/api/schedule-route-parsers-keep-boundary.surface.spec.ts` |
| `retired` | `packages/schedule/src/application-client/schedule-client-port-facade-dual.surface.spec.ts` |
| `retired` | `packages/schedule/src/server/application/scheduler/patterns-scheduler-dual.surface.spec.ts` |
| `retired` | `packages/setting/src/application-client/setting-client-port-dual.surface.spec.ts` |
| `retired` | `packages/task/src/api/routes/get-first-query-value-dual.surface.spec.ts` |
| `retired` | `packages/task/src/application-client/task-client-port-facade-dual.surface.spec.ts` |
| `retired` | `packages/task/src/server/infrastructure/normalize-runtime-contributions-dual.surface.spec.ts` |
| `retired` | `packages/task/src/testing/an-identity-id-dual.surface.spec.ts` |
| `retired` | `packages/utils/src/frontend/delay-dual.surface.spec.ts` |
| `keep_boundary` | `packages/utils/src/frontend/format-file-size-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/utils/src/result/default-extract-context-keep-boundary.surface.spec.ts` |
| `retired` | `packages/utils/src/result/format-zod-errors-dual.surface.spec.ts` |
| `retired` | `packages/utils/src/result/openapi-response-helpers-dual.surface.spec.ts` |
| `retired` | `packages/utils/src/shared/dual-registry.surface.spec.ts` |
| `keep_boundary` | `packages/utils/src/shared/format-date-to-input-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/utils/src/shared/generate-uuid-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/utils/src/shared/new-id-keep-boundary.surface.spec.ts` |

## 维护

- 删除真实 surface 时，同一变更更新 JSON 与本投影；
- 已退休整个 bounded context 时，从 Dual Registry 删除其历史 surface，并转入 canonical retirement manifest；
- 不为了保留统计而继续维护已删除产品模块的测试文件。
