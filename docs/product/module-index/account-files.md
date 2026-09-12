---
tags:
  - product
  - module-index
  - account
description: 账户模块相关文件索引
created: 2026-06-02T00:00:00
updated: 2026-08-03T00:00:00+08:00
---

# 账户模块文件索引

本索引用于连接账户模块的业务说明和真实代码。

## 前端页面与路由

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/modules/account/router/index.ts`](../../../packages/app-vue/src/modules/account/router/index.ts) | Vue 账户模块路由，定义账户中心入口 |
| [`packages/app-vue/src/modules/account/components/AccountProfileSection.vue`](../../../packages/app-vue/src/modules/account/components/AccountProfileSection.vue) | 账户中心页面 |

## 前端状态、组合函数与组件

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/modules/account/stores/account-store.ts`](../../../packages/app-vue/src/modules/account/stores/account-store.ts) | 账户 Pinia store |
| [`packages/app-vue/src/modules/account/composables/useAccount.ts`](../../../packages/app-vue/src/modules/account/composables/useAccount.ts) | 账户操作组合函数 |
| [`packages/app-vue/src/modules/account/components/ProfileCard.vue`](../../../packages/app-vue/src/modules/account/components/ProfileCard.vue) | 资料卡片组件 |
| [`packages/app-vue/src/modules/account/components/ProfileForm.vue`](../../../packages/app-vue/src/modules/account/components/ProfileForm.vue) | 资料编辑表单 |

## 移动端入口

| 文件 | 说明 |
| --- | --- |
| [`apps/mobile/src/app/explore/account.tsx`](../../../apps/mobile/src/app/explore/account.tsx) | 移动端账户入口 |
| [`packages/app-react/src/hooks/useAccountProfile.ts`](../../../packages/app-react/src/hooks/useAccountProfile.ts) | React Native 账户 hook |

## API、控制器与适配器

| 文件 | 说明 |
| --- | --- |
| [`packages/account/src/api/routes.ts`](../../../packages/account/src/api/routes.ts) | 账户 HTTP routes（6 个端点） |
| [`packages/account/src/api/module.ts`](../../../packages/account/src/api/module.ts) | 账户 API 模块定义 |
| [`packages/account/src/server/transport/account.controller.ts`](../../../packages/account/src/server/transport/account.controller.ts) | 账户控制器 |
| [`packages/account/src/infrastructure-client/adapters/http/account-http.adapter.ts`](../../../packages/account/src/infrastructure-client/adapters/http/account-http.adapter.ts) | 客户端 HTTP 适配器 |
| [`packages/account/src/infrastructure-client/adapters/ipc/account-ipc.adapter.ts`](../../../packages/account/src/infrastructure-client/adapters/ipc/account-ipc.adapter.ts) | 客户端 IPC 适配器 |

## 领域、用例与仓储

| 文件 | 说明 |
| --- | --- |
| [`packages/account/src/server/domain/aggregates/account.ts`](../../../packages/account/src/server/domain/aggregates/account.ts) | Account 聚合根 |
| [`packages/account/src/server/application/use-cases/commands/update-account-profile.use-case.ts`](../../../packages/account/src/server/application/use-cases/commands/update-account-profile.use-case.ts) | 更新资料用例 |
| [`packages/account/src/server/application/use-cases/commands/close-account.use-case.ts`](../../../packages/account/src/server/application/use-cases/commands/close-account.use-case.ts) | 关闭当前云端 Account；按 context identity 主键加载 |
| [`packages/account/src/server/application/use-cases/queries/get-account-profile.use-case.ts`](../../../packages/account/src/server/application/use-cases/queries/get-account-profile.use-case.ts) | 获取资料查询 |
| [`packages/account/src/server/infrastructure/account.module.ts`](../../../packages/account/src/server/infrastructure/account.module.ts) | 服务端账户模块组合根 |
| [`packages/account/src/server/infrastructure/cloud-account-provisioner.ts`](../../../packages/account/src/server/infrastructure/cloud-account-provisioner.ts) | Better Auth user 到同 ID Account 的幂等投影 |
| [`packages/account/src/electron/desktop-account-profile-sync.ts`](../../../packages/account/src/electron/desktop-account-profile-sync.ts) | Desktop 本地资料事务、revision outbox 与在线重试 |

## Contracts 与数据结构

| 文件 | 说明 |
| --- | --- |
| [`packages/contracts/src/modules/account/aggregates/account-server.ts`](../../../packages/contracts/src/modules/account/aggregates/account-server.ts) | Account 服务端 DTO |
| [`packages/contracts/src/modules/account/aggregates/account-client.ts`](../../../packages/contracts/src/modules/account/aggregates/account-client.ts) | Account 客户端 DTO |
| [`packages/contracts/src/modules/account/api/account-profile.dto.ts`](../../../packages/contracts/src/modules/account/api/account-profile.dto.ts) | 资料 API DTO |
| [`packages/contracts/src/modules/account/protocol/account-event-map.ts`](../../../packages/contracts/src/modules/account/protocol/account-event-map.ts) | 账户事件 map |
| [`packages/contracts/src/modules/account/protocol/account-rpc-map.ts`](../../../packages/contracts/src/modules/account/protocol/account-rpc-map.ts) | 账户 RPC map |
| [`packages/contracts/src/modules/account/value-objects/account-profile.ts`](../../../packages/contracts/src/modules/account/value-objects/account-profile.ts) | AccountProfile 值对象 |

## 测试入口

| 文件 | 说明 |
| --- | --- |
| [`packages/account/src/server/domain/aggregates/__tests__/Account.test.ts`](../../../packages/account/src/server/domain/aggregates/__tests__/Account.test.ts) | Account 聚合测试 |
| [`packages/account/src/server/application/use-cases/commands/__tests__/update-account-profile.test.ts`](../../../packages/account/src/server/application/use-cases/commands/__tests__/update-account-profile.test.ts) | 更新资料测试 |
| [`packages/account/src/electron/desktop-account-profile-sync.spec.ts`](../../../packages/account/src/electron/desktop-account-profile-sync.spec.ts) | guest、离线、失败重试和 revision-safe outbox 测试 |
| [`packages/account/src/server/infrastructure/cloud-account-provisioner.spec.ts`](../../../packages/account/src/server/infrastructure/cloud-account-provisioner.spec.ts) | Better Auth user 到 Account 的幂等 provisioning 测试 |
| [`packages/account/src/api/routes.spec.ts`](../../../packages/account/src/api/routes.spec.ts) | 账户 routes 测试 |
| [`packages/app-vue/src/modules/account/stores/accountStore.spec.ts`](../../../packages/app-vue/src/modules/account/stores/accountStore.spec.ts) | 账户 store 测试 |

## 需要重点关注的改动风险

- 账户资料和认证身份的关系。
- 邮箱唯一性检查的并发安全。
- HTTP、IPC、Prisma、PowerSync 多运行时适配器的一致性。
- 身份创建事件的处理可靠性。
