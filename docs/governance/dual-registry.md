---
tags:
  - governance
  - dual-registry
description: Dual Registry — retired locks vs keep-boundary vs open dual debt
created: 2026-07-26T00:00:00
updated: 2026-08-22T15:38:00+08:00
---

# Dual Registry

机器可读账本：[`tools/governance/dual-registry.json`](../../tools/governance/dual-registry.json)。

本文件是人读摘要；**分类以 JSON 为准**。优雅化 plan：[`../plan/archive/2026-07-26-codebase-elegance-foundation.md`](../plan/archive/2026-07-26-codebase-elegance-foundation.md)。

## 度量（E2 / E3）

| 项 | 值 |
|----|----|
| 基线 dual-surface 文件 | 237 |
| 当前 dual-surface 文件 | 84 |
| E3b 降幅 | 64.6%（目标 ≥25%） |
| Registry suites | 25 |
| keep-boundary 文件 | 66 |
| 登记条目总数 | 150 |
| 未分类 | 0（覆盖率 100%） |

### 按 class

| class | count |
|-------|------:|
| `keep_boundary` | 66 |
| `retired` | 84 |

## 分类规则（摘要）

| class | 判定 | 后续 |
|-------|------|------|
| `retired` | dual-retired / sole 锁 / dual-registry suite | 可合并锁（E3b）；勿删未退休断言 |
| `keep_boundary` | 语义故意不同 | **禁止** force-merge |
| `open_S` | 死 re-export / 假 dual | 删实现或锁 |
| `open_M` | 两实现同语义 | sole + 改调用方 |
| `open_X` | Host/auth 跨切 | 转产品 plan |

当前快照：**open_S/M/X = 0**（E3a 亦满足）；税减负以 E3b 文件合并为主（同目录 `dual-registry.surface.spec.ts`）。

## 按 package 摘要

| package | retired | keep_boundary | other |
|---------|--------:|--------------:|------:|
| `apps/api` | 0 | 3 | 0 |
| `apps/desktop` | 6 | 7 | 0 |
| `apps/web` | 2 | 1 | 0 |
| `packages/account` | 1 | 1 | 0 |
| `packages/ai` | 4 | 7 | 0 |
| `packages/app-vue` | 10 | 25 | 0 |
| `packages/authentication` | 3 | 2 | 0 |
| `packages/contracts` | 32 | 5 | 0 |
| `packages/dashboard` | 1 | 1 | 0 |
| `packages/data-portability` | 3 | 4 | 0 |
| `packages/goal` | 3 | 3 | 0 |
| `packages/governance` | 3 | 1 | 0 |
| `packages/notification` | 1 | 0 | 0 |
| `packages/patterns` | 1 | 0 | 0 |
| `packages/reminder` | 1 | 0 | 0 |
| `packages/repository` | 2 | 0 | 0 |
| `packages/schedule` | 2 | 1 | 0 |
| `packages/setting` | 1 | 0 | 0 |
| `packages/task` | 4 | 0 | 0 |
| `packages/utils` | 4 | 5 | 0 |

## 条目（路径）

完整字段见 JSON。下列为 path → class：

| class | path |
|-------|------|
| `keep_boundary` | `apps/api/src/modules/powersync/parse-json-like-string-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `apps/api/src/shared/infrastructure/config/get-cors-origins-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `apps/api/src/shared/infrastructure/load-workspace-env-keep-boundary.surface.spec.ts` |
| `retired` | `apps/desktop/src/main/desktop-shared-ipc-channels-dual.surface.spec.ts` |
| `keep_boundary` | `apps/desktop/src/main/modules/ai/to-knowledge-note-ref-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `apps/desktop/src/main/modules/authentication/application/auto-login-result-extension-keep-boundary.surface.spec.ts` |
| `retired` | `apps/desktop/src/main/modules/authentication/application/dual-registry.surface.spec.ts` |
| `keep_boundary` | `apps/desktop/src/main/modules/authentication/application/refresh-result-layered-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `apps/desktop/src/main/modules/authentication/application/session-restore-result-extension-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `apps/desktop/src/main/modules/authentication/infrastructure/login-request-email-credentials-keep-boundary.surface.spec.ts` |
| `retired` | `apps/desktop/src/main/modules/authentication/infrastructure/session-helper-dual.surface.spec.ts` |
| `keep_boundary` | `apps/desktop/src/main/modules/authentication/infrastructure/session-status-extension-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `apps/desktop/src/main/modules/authentication/infrastructure/token-storage-save-request-keep-boundary.surface.spec.ts` |
| `retired` | `apps/desktop/src/main/utils/http-envelope-guards-dual.surface.spec.ts` |
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
| `keep_boundary` | `packages/app-vue/src/modules/authentication/composables/auto-login-desktop-keep-boundary.surface.spec.ts` |
| `retired` | `packages/app-vue/src/modules/authentication/composables/completeAuthSuccess-dual.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/modules/authentication/composables/handle-auth-success-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/modules/authentication/composables/password-toast-only-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/modules/authentication/composables/remove-remembered-toast-only-keep-boundary.surface.spec.ts` |
| `retired` | `packages/app-vue/src/modules/authentication/composables/reportAuthOperationFailure-dual.surface.spec.ts` |
| `retired` | `packages/app-vue/src/modules/dashboard/adapters/dashboard-transport-dual.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/modules/goal/composables/goal-operations-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/modules/goal/utils/clamp-percentage-keep-boundary.surface.spec.ts` |
| `retired` | `packages/app-vue/src/modules/reminder/composables/reminder-desktop-api-dual.surface.spec.ts` |
| `retired` | `packages/app-vue/src/modules/setting/composables/theme-sync-desktop-api-dual.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/calendar-event-layout-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/combine-date-and-time-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/app-vue/src/shared/utils/describe-conflict-keep-boundary.surface.spec.ts` |
| `retired` | `packages/app-vue/src/shared/utils/dual-registry.surface.spec.ts` |
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
| `keep_boundary` | `packages/authentication/src/api/normalize-path-keep-boundary.surface.spec.ts` |
| `retired` | `packages/authentication/src/application-client/auth-client-port-dual.surface.spec.ts` |
| `retired` | `packages/authentication/src/server/infrastructure/adapters/powersync/mappers/to-iso-dual.surface.spec.ts` |
| `keep_boundary` | `packages/authentication/src/server/infrastructure/adapters/powersync/mappers/to-millis-keep-boundary.surface.spec.ts` |
| `retired` | `packages/authentication/src/server/shared/dual-registry.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/account/api/dual-registry.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/account/empty-dual-barrel.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/account/entities/account-entities-dual.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/ai/api/dual-registry.surface.spec.ts` |
| `keep_boundary` | `packages/contracts/src/modules/ai/configs/get-template-by-id-keep-boundary.surface.spec.ts` |
| `keep_boundary` | `packages/contracts/src/modules/authentication/aggregates/client-server-shape-mismatch-keep-boundary.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/authentication/api/dual-registry.surface.spec.ts` |
| `keep_boundary` | `packages/contracts/src/modules/authentication/api/oauth-provider-transport-domain-keep-boundary.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/authentication/entities/dual-registry.surface.spec.ts` |
| `keep_boundary` | `packages/contracts/src/modules/authentication/protocol/device-info-client-keep-boundary.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/authentication/protocol/offline-login-response-dual.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/authentication/value-objects/dual-registry.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/goal/api/dual-registry.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/goal/value-objects/dual-registry.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/governance/aggregates/rule-server-dual.surface.spec.ts` |
| `retired` | `packages/contracts/src/modules/governance/api/dual-registry.surface.spec.ts` |
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
| `keep_boundary` | `packages/dashboard/src/start-of-day-keep-boundary.surface.spec.ts` |
| `retired` | `packages/dashboard/src/to-dashboard-task-instance-record-dual.surface.spec.ts` |
| `retired` | `packages/data-portability/src/application-client/data-portability-client-port-dual.surface.spec.ts` |
| `retired` | `packages/data-portability/src/server/application/use-cases/projections/goal-editor-resolve-ref-dual.surface.spec.ts` |
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
| `keep_boundary` | `packages/governance/src/api/routes/governance-parse-string-array-keep-boundary.surface.spec.ts` |
| `retired` | `packages/governance/src/api/routes/governance-response-schema-name-dual.surface.spec.ts` |
| `retired` | `packages/governance/src/client/governance-ipc-transport-dual.surface.spec.ts` |
| `retired` | `packages/governance/src/dual-registry-path.surface.spec.ts` |
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

