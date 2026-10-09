---
tags:
  - product
  - module-index
  - authentication
  - desktop-profile
description: Better Auth Cloud Auth 与 Desktop Profile Access 当前文件索引
created: 2026-06-02T00:00:00
updated: 2026-08-03T00:00:00+08:00
---

# 云端认证与 Desktop Profile 文件索引

本索引只记录当前单轨实现。旧 `packages/authentication`、Desktop guest/offline session、记住密码和自研 JWT 代码已经删除。

## Cloud Auth

| 文件                                                                                                                                                          | 职责                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`packages/cloud-auth/src/server/cloud-auth.ts`](../../../packages/cloud-auth/src/server/cloud-auth.ts)                                                       | Better Auth 组合根、Prisma adapter、邮箱密码、GitHub、bearer plugin、`CloudPrincipal` |
| [`packages/cloud-auth/src/server/email-delivery.ts`](../../../packages/cloud-auth/src/server/email-delivery.ts)                                               | 验证/重置邮件交付与 E2E 链接捕获装饰器                                                |
| [`packages/cloud-auth/src/client/index.ts`](../../../packages/cloud-auth/src/client/index.ts)                                                                 | Web HTTP 与 Desktop IPC 的 MemoFlow client port                                       |
| [`packages/cloud-auth/src/index.ts`](../../../packages/cloud-auth/src/index.ts)                                                                               | 浏览器安全的包根，只导出 client；服务端代码必须使用 `/server` 子路径                  |
| [`packages/contracts/src/cloud-auth.ts`](../../../packages/contracts/src/cloud-auth.ts)                                                                       | 跨端最小 Cloud Auth contract                                                          |
| [`apps/api/src/main.ts`](../../../apps/api/src/main.ts)                                                                                                       | Better Auth 服务端装配和 Account provisioning                                         |
| [`apps/api/src/shared/infrastructure/http/middlewares/auth-middleware.ts`](../../../apps/api/src/shared/infrastructure/http/middlewares/auth-middleware.ts)   | 从 Better Auth session 构建 API execution context                                     |
| [`packages/account/src/server/infrastructure/cloud-account-provisioner.ts`](../../../packages/account/src/server/infrastructure/cloud-account-provisioner.ts) | Better Auth user 到 MemoFlow Account 投影                                             |

## Web Auth

| 文件                                                                                          | 职责                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`apps/web/src/auth/WebAuthView.vue`](../../../apps/web/src/auth/WebAuthView.vue)             | 登录、注册、忘记密码、重置、验证链接和 GitHub OAuth 页面 |
| [`apps/web/src/auth/service.ts`](../../../apps/web/src/auth/service.ts)                       | Web Cloud Auth service                                   |
| [`apps/web/src/auth/useWebAuth.ts`](../../../apps/web/src/auth/useWebAuth.ts)                 | Web 认证场景编排                                         |
| [`apps/web/e2e/helpers/auth-email-link.ts`](../../../apps/web/e2e/helpers/auth-email-link.ts) | E2E 获取真实 Better Auth 邮件链接                        |
| [`apps/web/src/bootstrap/app.ts`](../../../apps/web/src/bootstrap/app.ts)                     | cookie session 恢复和 Web 应用准入                       |

## Desktop Profile Access

| 文件                                                                                                                                              | 职责                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`apps/desktop/src/main/profile/profile-registry.ts`](../../../apps/desktop/src/main/profile/profile-registry.ts)                                 | Profile registry、guest identity、CloudBinding 和 metadata         |
| [`apps/desktop/src/main/profile/profile-key-store.ts`](../../../apps/desktop/src/main/profile/profile-key-store.ts)                               | OS credential-backed Profile key envelope                          |
| [`apps/desktop/src/main/profile/profile-pin-store.ts`](../../../apps/desktop/src/main/profile/profile-pin-store.ts)                               | 本地 PIN 验证和 key 解封                                           |
| [`apps/desktop/src/main/profile/profile-access-ipc.ts`](../../../apps/desktop/src/main/profile/profile-access-ipc.ts)                             | Profile create/rename/select/lock/PIN IPC                          |
| [`apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts`](../../../apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts)   | Profile 精确选择、PIN、串行激活/关闭与同步运行时                   |
| [`apps/desktop/src/main/profile/desktop-cloud-connection-service.ts`](../../../apps/desktop/src/main/profile/desktop-cloud-connection-service.ts) | 云端身份路由、独立 Profile session commit 和取消保护               |
| [`apps/desktop/src/main/profile/profile-access-context.ts`](../../../apps/desktop/src/main/profile/profile-access-context.ts)                     | 本地业务模块 execution context；不依赖 cloud session               |
| [`apps/desktop/src/main/profile/cloud-session-store.ts`](../../../apps/desktop/src/main/profile/cloud-session-store.ts)                           | main-process profile-scoped cloud credential 存储                  |
| [`apps/desktop/src/main/profile/desktop-cloud-connection-manager.ts`](../../../apps/desktop/src/main/profile/desktop-cloud-connection-manager.ts) | `ONLINE/OFFLINE/REAUTH_REQUIRED` 恢复和 sync enablement            |
| [`apps/desktop/src/main/profile/cloud-auth-ipc.ts`](../../../apps/desktop/src/main/profile/cloud-auth-ipc.ts)                                     | Desktop device authorization、当前 session 与独立云端退出          |
| [`packages/contracts/src/electron/profile-access.ts`](../../../packages/contracts/src/electron/profile-access.ts)                                 | Profile snapshot、unlock state、cloud state 和 capability contract |

## Shared UI

| 文件                                                                                                                                                              | 职责                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [`packages/app-vue/src/views/DesktopProfileAccessView.vue`](../../../packages/app-vue/src/views/DesktopProfileAccessView.vue)                                     | 本地 Profile 选择与可选 PIN 解锁                  |
| [`packages/app-vue/src/layouts/shell/AppShell.vue`](../../../packages/app-vue/src/layouts/shell/AppShell.vue)                                                     | 本地身份展示与 cloud session 独立状态             |
| [`packages/app-vue/src/layouts/shell/ConversationSidebar.vue`](../../../packages/app-vue/src/layouts/shell/ConversationSidebar.vue)                               | guest/registered-local/cloud 明确身份菜单         |
| [`packages/app-vue/src/modules/account/components/AccountProfileSection.vue`](../../../packages/app-vue/src/modules/account/components/AccountProfileSection.vue) | 本地资料编辑、Cloud Sign out 与 Profile Lock 分离 |
| [`packages/app-vue/src/router/guards.ts`](../../../packages/app-vue/src/router/guards.ts)                                                                         | 宿主提供的 `canAccessApp` 准入端口                |

## 关键测试

| 文件                                                                                                                                                                      | 证明内容                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`packages/cloud-auth/src/server/cloud-auth.spec.ts`](../../../packages/cloud-auth/src/server/cloud-auth.spec.ts)                                                         | Cloud principal 不包含 guest/local access                                   |
| [`packages/cloud-auth/src/index.spec.ts`](../../../packages/cloud-auth/src/index.spec.ts)                                                                                 | 包根不会把 Nodemailer/Better Auth server runtime 带入浏览器 bundle          |
| [`apps/desktop/src/main/profile/ProfileRegistry.spec.ts`](../../../apps/desktop/src/main/profile/ProfileRegistry.spec.ts)                                                 | 多个独立 guest、创建幂等、串行 Registry 持久化                              |
| [`apps/desktop/src/main/profile/profile-access-ipc.spec.ts`](../../../apps/desktop/src/main/profile/profile-access-ipc.spec.ts)                                           | Profile ID/PIN 输入校验和精确选择 IPC                                       |
| [`apps/desktop/src/main/profile/cloud-auth-ipc.spec.ts`](../../../apps/desktop/src/main/profile/cloud-auth-ipc.spec.ts)                                                   | 解锁 session、排队退出来源保护与认证意图校验                                |
| [`packages/app-vue/src/modules/account/components/AccountProfileSection.spec.ts`](../../../packages/app-vue/src/modules/account/components/AccountProfileSection.spec.ts) | guest 可编辑、本地锁定与云端退出分离                                        |
| [`apps/desktop/e2e/authentication/desktop-auth-flow.spec.mts`](../../../apps/desktop/e2e/authentication/desktop-auth-flow.spec.mts)                                         | Linux production Electron 离线 guest、多账号隔离、第二 guest PIN 与重启恢复 |
