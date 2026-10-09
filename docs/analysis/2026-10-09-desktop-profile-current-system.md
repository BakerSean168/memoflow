---
tags: [analysis, desktop, profile, authentication, data-portability]
description: 独立 Profile 和访客复制导入的当前代码证据、复用边界与缺口
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# Desktop Profile：当前实现与设计差距

## 研究范围与证据等级

本轮依据用户提供的账户体系讨论，对本地 checkout `f34eff34f4a5567c57181c4fc5ef0d357a0a8eb1` 做源码、契约和测试阅读。开始时 `main` 落后本地 `origin/main` 一个提交，工作区已有 Desktop PowerSync/Vault 性能改动；没有拉取、覆盖或把这些改动计入本轮交付。PowerSync 当前文件包含既有未提交修改，后续实施应重新核对生命周期实现。

本文的“已验证”表示静态源码证据，不表示本轮执行过 Desktop 运行时、真实账户登录、导入或 E2E。外部文档事实见[官方资料核验](./2026-10-09-profile-auth-primary-sources.md)。设计入口见[系列导航](../product/desktop-profiles/README.md)。附件中的产品类比和复杂度估计不直接视为实现事实。

本会话工具目录没有提供 CodeGraph / nx-mcp；使用定向源码/契约检索及 Nx CLI 查询当前 target，没有据此建立另一份代码或状态权威。

结论：Profile、认证、V3 owner capability 和同步基础设施可以复用，但跨 Profile 导入不是仅加弹窗。核心增量在身份路由、稳定快照、导入批次恢复、跨 owner 完整性和安全清理。

## 1. 身份与本地容器

| 位置 / 符号                                                                                                        | 已验证事实                                                                | 对方案的影响                                                    |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [ProfileRegistry](../../apps/desktop/src/main/profile/profile-registry.ts) `register`                              | 按 `cloudBinding.cloudAccountId` 查重；新云端 Profile 用该 ID 派生目录 ID | 可以复用云端 Profile 查询和注册；不应按邮箱/provider 去重       |
| 同文件 `ensureGuest`                                                                                               | 返回数组中第一个 guest，只有没有 guest 时才新建                           | 要分离“首次启动兜底”与“创建新访客”                              |
| 同文件 `save`                                                                                                      | 写同一个 `.tmp` 后 rename；加载有共享 promise                             | 原子替换文件不等于所有修改串行；多按钮/认证回调竞争需单写入序列 |
| [Profile Access IPC](../../apps/desktop/src/main/profile/profile-access-ipc.ts) `SELECT`                           | 校验选中 ID 和 PIN 后，guest 分支调用无 ID 的 `prepareGuestProfile()`     | 多访客下可能解锁一个、打开另一个；必须精确按 ID 打开            |
| [Runtime Manager](../../apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts) `activateStartupProfile` | 恢复 guest 时也走 `prepareGuestProfile()`                                 | 必须同时修正启动恢复，不能只改 SELECT                           |
| [Profile paths](../../apps/desktop/src/main/paths/profile-path-resolver.ts)                                        | 每 Profile 有 DB、storage、attachments、Vault binding、UI 路径            | 已有隔离容器；不能将 DB 复制等同于完整空间复制                  |

`ProfileDescriptor` 的 `pending/ready/error` 是准备状态，`guest/registered` 是身份种类；[Desktop access contract](../../packages/contracts/src/electron/profile-access.ts) 另有本地解锁状态与云端连接状态。新设计应继续分开表达，避免一个 `isAuthenticated` 承担全部含义。

当前 binding 只有 `cloudAccountId`，没有 server/issuer。V1 继续采用一个运行车道对应一个固定云端服务的范围；若未来支持切换自托管服务，需要明确 `(issuer, userId)` 作用域，不能跨服务复用同 ID 的本地 Profile/session。

## 2. 认证完成后的现有副作用

[DesktopCloudConnectionService.connect](../../apps/desktop/src/main/profile/desktop-cloud-connection-service.ts) 当前顺序：

```text
校验发起 Profile 仍活动
→ reconcileLocalProfileToCloud：读 /accounts/me，可能 PUT 昵称/头像/简介
→ bindCurrentProfile
→ 在发起 Profile 下保存 session
→ enableCloudSync
```

[bindCurrentProfile](../../apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts) 对 guest 调用 [LocalTenantAdoptionService.adopt](../../apps/desktop/src/main/profile/local-tenant-adoption-service.ts)，在本地事务中复制 Account、修改所有已知 identity-owned 表的 `identity_id`、删除旧 Account，然后改 registry。adoption journal 处理数据库已提交、registry 未完成的恢复。

这条路径会改变源 guest 的身份，与“复制后保留独立访客”直接冲突。新流程必须移除登录里的资料写入和原地 adoption，而不是沿用旧流程再复制一次。旧 journal 的恢复逻辑也要纳入退役清单，防止下次启动又执行旧绑定。遵守仓库无兼容迁移要求，不新增旧 registry/backup reader 或迁移框架。

### AccountView 契约错位：源码已确认，未做运行时复现

[AccountViewSchema](../../packages/contracts/src/modules/account/api/response-schemas.ts) 定义 `{ account, cloudIdentity }`，而连接服务将 HTTP `data` 当作 `AccountClientDTO`，访问 `cloud.profile.nickname`。匹配当前契约的响应应访问 `data.account.profile`。当前[连接服务测试](../../apps/desktop/src/main/profile/desktop-cloud-connection-service.spec.ts) 的 fixture 仍返回旧的 `data.profile`，未覆盖此问题。

后续切片应先用真实 `AccountViewSchema` 形状建立失败用例，再移除不再需要的 reconciliation；剩余账户读取统一通过契约解析。不能为同时接受两个响应形状增加兼容分支。

### 可复用的认证保护

- [DeviceAuthCoordinator](../../apps/desktop/src/main/profile/device-auth-coordinator.ts) 已有 attempt、取消、过期、发起 Profile 校验及迟到 token 撤销。新路由应保留这些约束，但区分 `originProfileId` 与认证后确定的 `targetProfileId`。
- [CloudSessionStore](../../apps/desktop/src/main/profile/cloud-session-store.ts) 按 Profile 保存安全存储加密的 `.bin`；无需 Multi Session 替换它。源码存在 key/PIN store，不据此声称全部 SQLite 数据已加密。
- [DesktopCloudConnectionManager](../../apps/desktop/src/main/profile/desktop-cloud-connection-manager.ts) 用 get-session 核对返回 user ID 与 binding；认证失败不应变成本地锁定。
- [Better Auth 配置](../../packages/cloud-auth/src/server/cloud-auth.ts) 已启用邮箱密码、可配置 GitHub、bearer、deviceAuthorization，并允许 external-agent 扩展插件。其 [package](../../packages/cloud-auth/package.json) 锁定 1.7.6；“只保留 bearer + deviceAuthorization”不能被解释为删掉 External Agent 已有插件。

## 3. Data Portability V3 的真实复用范围

[Desktop composition](../../apps/desktop/src/main/main.ts) 与 [API composition](../../apps/api/src/server.ts) 注册相同十个 capability：

| Capability                          | Owner 证据                                                                                                            | 可复用内容 / 限制                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `preferences`                       | [Preference portability](../../packages/setting/src/server/preferences/preference-portability.ts)                     | 用户偏好，namespace CAS；不是所有设备配置                                           |
| `account-profile`                   | [Account portability](../../packages/account/src/server/application/account-portability.ts)                           | 更新已存在目标 Account 的个人资料，依赖 preferences；不复制身份                     |
| `notification-delivery-preferences` | [Notification preferences](../../packages/notification/src/server/application/notification-preference-portability.ts) | 通知偏好；不等于 delivery 队列                                                      |
| `routines`                          | [Routine portability](../../packages/reminder/src/server/application/routine-portability.ts)                          | Routine 业务事实；runtime context / scheduler reliability state 排除                |
| `schedules`                         | [Schedule portability](../../packages/schedule/src/server/application/schedule-portability.ts)                        | Schedule owner 事实；不是整个 Scheduler 数据库                                      |
| `notifications`                     | [Notification portability](../../packages/notification/src/server/application/notification-portability.ts)            | 通知事实及支持的交互；delivery outbox/receipts/dead letters/audit/device state 排除 |
| `labels`                            | [Label portability](../../packages/label/src/application/label-portability.ts)                                        | owner 的名称规范化与导入引用                                                        |
| `goals`                             | [Goal portability](../../packages/goal/src/server/application/goal-portability.ts)                                    | Goal 与支持的子事实，依赖 labels；基于 identity/batch/ref 派生目标 ID               |
| `tasks`                             | [Task portability](../../packages/task/src/server/application/task-portability.ts)                                    | Plan、Occurrence、Checklist 等，依赖 labels/goals；确定性目标 ID                    |
| `ai-conversations`                  | [AI portability](../../packages/ai/src/server/application/ai-conversation-portability.ts)                             | 仅会话外壳：ref/name/status；不是聊天消息、附件、Mastra runtime 或 Provider 凭据    |

**没有注册 Knowledge/Vault 笔记内容 capability。** 附件中“笔记 16”的示例不能直接变成可导入承诺；AI“会话”也必须明确其外壳范围。

[V3 coordinator](../../packages/data-portability/src/server/application/portable-capability-coordinator.ts) 已负责 envelope/version/schema、依赖排序、预检、引用隔离和汇总回执。`apply` 会先验证全部 payload，再做全量预检，然后顺序调用各 owner 的 apply。它没有在这些调用外提供跨 owner 事务、持久作业或服务端完整性证明。

### 重试能力不能一概而论

1. Goal、Task、Routine、Notification 等已有批次确定性标识或重复检测，值得直接复用。
2. AI `apply` 每次调用 `AIConversation.create()`，没有用 batch/ref 查找已有导入对象；重放可能重复创建外壳。
3. 公共 [V3 import request](../../packages/contracts/src/modules/data-portability/api/portable-v3.dto.ts) 只接受 `content`，不接受 caller batch ID；coordinator 内部的可选 batchId 不能直接当作公开接口已具备幂等性。
4. `skipped` 既可能表示已存在相同对象，也可能表示不产生更新；`warnings` 只是文本。不能用 `created` 总数或 `warnings.length === 0` 判定全部业务资料已安全迁移。
5. 请求的 `max(10_000_000)` 限制的是 JS 字符串长度，不能宣称已经是严格的 10 MiB UTF-8 请求字节限制；入口与代理 body limit 需另验。

## 4. 同步、摘要和删除

[Desktop uploader](../../apps/desktop/src/main/database/powersync.ts) 按 CRUD transaction 调用 `/powersync/crud`，HTTP 成功后 complete 本地 transaction；[API CRUD executor](../../apps/api/src/modules/powersync/crud-executor.ts) 用 Prisma 事务应用批次。这是 CRUD 上传的基础，不是整个 V3 import 的批次核验协议。

现有 [ProfileSnapshotService](../../apps/desktop/src/main/profile/profile-snapshot-service.ts) 与 API snapshot 用于首次本地数据库水合，checksum 证明下载快照字节一致，不证明当前云端是空账户，也不证明某次导入已被服务端完整接收。未发现本方案所需的专用业务空摘要、profile-import operation、manifest verification API。

Runtime 的 `removeProfile` 会依次删 session、PIN、key、目录、registry；当前保护主要是不能删除 active/prepared Profile。它没有导入回执、源版本再校验、本地独有内容检查，且部分失败时可能已删密钥。因此可复用定位资源的方法，不能直接当作自动删除的安全事务。

## 5. UI 的现状

[DesktopProfileAccessView](../../packages/app-vue/src/views/DesktopProfileAccessView.vue) 已提供列表、PIN 解锁与删除，仍是本地访问界面，没有完整多 Profile 创建/重命名/导入管理。[CloudConnectionDialog](../../packages/app-vue/src/layouts/shell/CloudConnectionDialog.vue) 已使用 ProductDialogShell，负责设备授权状态和会话刷新，适合作为“添加云端账号”入口的基础。

新交互还要覆盖 Shell 身份展示、缓存/订阅清理、路由恢复和异步回调隔离。仅替换登录弹窗文案不会完成账户隔离。

## 6. 建议的实施难度排序

- 较小：创建 guest、精确 ID 选择、重命名及菜单投影，仍需并发/PIN/启动测试。
- 中等：认证目标路由、session commit、旧 adoption 退役、renderer 生命周期。
- 较大：源快照、全 owner 重试、空账户并发准入、服务端/本地 manifest 核验、崩溃安全删除。

详见[实施计划](../plan/active/2026-10-09-desktop-independent-profiles.md)。这些是风险和依赖判断，不是已估算工时或已通过验收。
