---
tags: [analysis, desktop, profile, authentication, research]
description: Better Auth、PowerSync 和成熟产品的独立资料空间与复制导入一手资料核验
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# Desktop Profile、云端身份与复制导入：一手资料核验

日期：2026-10-09。本文列出的外部资料均于该日访问。状态：研究证据与设计建议，不代表相关功能已在 MemoFlow 实现，也不构成实施批准。

范围：核验“独立本地 Profile + 云端身份 + 可选本地数据复制导入”的产品类比、Better Auth 能力边界与 PowerSync 完成证据。仓库实现现状另见[代码盘点](./2026-10-09-desktop-profile-current-system.md)，不能由外部产品文档推断。

## 1. 核验结论

- 本地容器与云端身份分开，是有一手产品先例的设计方向；但各产品的 Profile、Workspace、Vault 对应不同对象，不能统称为完全相同的多账户架构。
- Better Auth 能证明云端认证身份，并提供会话与登录方式管理；它没有在本文查阅的插件契约中承担 Electron 本地 Profile 目录、数据库运行时或访客复制导入的职责。
- Better Auth 的 `user.id`、其 Account 表行 `id`、provider 分配的 `accountId` 和本地 `profileId` 是不同标识。MemoFlow 产品 `Account.id` 则按既有契约等于 Better Auth `user.id`。Profile 去重应使用服务端确认的用户身份；若支持多个认证服务，还必须包含认证服务的身份范围。
- 上传队列清空、HTTP 2xx、首次同步完成都不足以证明业务数据完整导入。PowerSync checkpoint 可提供同步进度证据，业务是否接受每项导入仍需业务回执与清单核验。

下文分别标明“官方事实”和“对 MemoFlow 的推论”。推论是本项目的设计判断，不是外部库提供的保证。

## 2. Better Auth：会话、用户与登录方式

### 2.1 身份标识不能混用

官方数据库定义中，`user.id` 是用户主键，`session.userId`、`account.userId` 指向用户；一个 Account 表示关联到用户的一种认证方法。Account 的 `id` 标识 Better Auth 数据库中的该行，`providerId + accountId` 表示 provider 侧身份。这些字段不能替换使用。[Better Auth：Database / Core Schema](https://better-auth.com/docs/concepts/database#core-schema)

**对 MemoFlow 的推论：**在同一认证服务范围内，邮箱和 GitHub 登录最后解析为同一个 `user.id` 时，应查找同一个云端 Profile；解析为两个不同用户时，应视为不同云端身份。不能按 provider 名称、邮箱显示值或 OAuth provider 用户 ID 直接复用 Profile。若将来支持自托管服务或多个环境，建议唯一键为“规范化的认证 authority + Better Auth user ID”，不能假设不同服务的用户 ID 全局唯一。这是项目应定义的身份边界，并非 Better Auth 自动创建的本地 Profile 索引。

### 2.2 Account Linking 关联认证方法，不自动合并本地数据库

官方提供自动和显式账号关联。自动关联受启用状态、邮箱匹配、provider 邮箱验证及 `trustedProviders` 等配置影响；显式关联可通过 `linkSocial()` 发起。关联的目标是既有用户的登录方法，不是通用业务数据迁移。[Better Auth：User & Accounts / Account Linking](https://better-auth.com/docs/concepts/users-accounts#account-linking)

**对 MemoFlow 的推论：**“同邮箱”不能成为客户端认定同用户的充分条件；必须接受服务端认证或关联之后返回的身份结果。两个已有 Better Auth 用户的业务数据合并、两个 Desktop Profile 的合并，也不应包装成 Account Linking。是否允许关联、关联失败怎样呈现，应沿用服务端策略，不能为减少本地 Profile 数量而放宽身份验证条件。

### 2.3 Multi Session 不是 Desktop Profile 管理器

官方说明 Multi Session 支持同一浏览器内不同账号的多个活动会话；每次登录增加用于会话管理的 Cookie，并提供列举、切换活动会话和撤销会话等接口。[Better Auth：Multi Session](https://better-auth.com/docs/plugins/multi-session)

**对 MemoFlow 的推论：**该插件可以服务于 Web 多账户交互，但不能据此认为它会切换 Electron SQLite、缓存、IPC scope 或文件目录。已有按 Profile 保存凭据的 Desktop，不必仅因需要多个 Profile 就增加 Multi Session。插件是否参与浏览器授权页的账号选择，是另一个独立问题，需要按实际 Web 需求决定。

### 2.4 Anonymous 不是完全离线的本地 Guest

`signIn.anonymous()` 会创建新用户并建立 session。`onLinkAccount` 交给应用处理匿名用户与新用户之间的数据关联；官方默认行为还包括关联后删除匿名用户，可通过配置关闭。[Better Auth：Anonymous](https://better-auth.com/docs/plugins/anonymous)

**对 MemoFlow 的推论：**Anonymous 依赖认证服务，不等于可在无网络、无服务器用户记录时创建的本地 Profile。它的回调也不自动提供跨本地数据库复制、断点恢复或源 Profile 保留能力。若产品要求“导入后仍可保留原离线 Profile”，应把本地复制导入作为明确操作，不能用 anonymous 关联的默认删除语义代替。

### 2.5 Bearer 和 Device Authorization 可继续承担认证传输

Bearer 插件支持在 `Authorization` header 中携带 token，并由 `auth.api.getSession` 解析认证会话；客户端也可按请求提供 token。这证明它可以适配非 Cookie 客户端，但没有证明操作系统安全存储、Profile 隔离或 token 生命周期已自动实现。[Better Auth：Bearer Token Authentication](https://better-auth.com/docs/plugins/bearer)

Device Authorization 文档区分两条路径：第一方 `/device/token` 返回 Better Auth session token；搭配 OAuth Provider 的 `/oauth2/token` 返回面向 OAuth 资源的访问令牌。响应字段都可能叫 `access_token`，字段名不能决定令牌类型。[Better Auth：Device Authorization](https://better-auth.com/docs/plugins/device-authorization)

这项区别也已在仓库依赖版本对应的一手源码中核验：Better Auth `v1.7.6` 的设备 token 路由创建 session，并返回 `access_token: session.token`。[Better Auth v1.7.6：device-authorization/routes.ts](https://github.com/better-auth/better-auth/blob/v1.7.6/packages/better-auth/src/plugins/device-authorization/routes.ts#L751)

**对 MemoFlow 的推论：**认证成功后的应用编排应先取得并验证云端用户，再选择或创建其本地 Profile，最后把相应 session 保存到正确的 Profile。拿到 Bearer token 不意味着当前正在打开的本地 Guest 已被授权改绑、导入或删除。设备授权页面仍负责表达正在授权哪个设备；Desktop 的 Profile 选择与源数据操作另有自己的明确上下文。

### 2.6 版本适用性

本次只读核对到 [cloud-auth/package.json](../../packages/cloud-auth/package.json) 固定 Better Auth `1.7.6`，访问时官网页面显示最新文档版本 `1.7.7`。以上 session token 语义已对照 `v1.7.6` 源码；其余新配置或管理 API 的具体参数，在进入实施时仍应对照锁定版本类型和实现，不能直接从官网最新示例复制。

## 3. PowerSync：“已经同步”到底证明什么

### 3.1 上传由应用后端处理，2xx 不保证业务接受

PowerSync 让应用自行定义 `uploadData()` 与后端写入 API。官方建议普通上传端点在源数据库写入处理完成后才返回；同时允许用 HTTP 2xx 携带校验拒绝或冲突信息，避免永久业务错误一直阻塞上传队列。[PowerSync：Writing Client Changes](https://docs.powersync.com/handling-writes/writing-client-changes)

官方进一步列出“已确认且应用”“已确认但拒绝”“已确认但部分应用或改写”等结果。客户端最终同步的是服务器接受的状态；被拒绝的乐观写入可能回退。[PowerSync：Handling Write / Validation Errors](https://docs.powersync.com/handling-writes/handling-write-validation-errors)

调用并等待 `CrudBatch` 或 `CrudTransaction` 的 `.complete()` 会移除已处理的队列记录。因此队列清空表示记录已经完成队列处理，不等于所有导入对象都已被服务器按原样持久化。[PowerSync：Client-Side Integration With Your Backend](https://docs.powersync.com/configuration/app-backend/client-side-integration)

### 3.2 Checkpoint 是一致性边界，不是业务验收回执

PowerSync 以包含完整提交事务的 checkpoint 应用服务端状态；客户端本地写入在上传队列中时，常规同步不会直接推进至新的 checkpoint，需等待写入处理及相应状态返回。官方另指出优先级 0 同步存在特殊情况，不能省略配置边界后宣称所有状态都遵循同一屏障。[PowerSync：Consistency](https://docs.powersync.com/architecture/consistency)

**对 MemoFlow 的推论：**即使目标 Profile 已经追上服务端，也只能确认“看到了服务端决定后的状态”。如果服务器拒绝了某条 Goal、改写了关系或省略了一个不属于同步范围的表，checkpoint 不会自动认定这次复制导入失败。用户要求的数据集合需要由本项目的业务清单描述，再由服务端或可核验回执判定是否完整接受。

### 3.3 首次同步、当前追平与 alpha API

官方区分 `waitForFirstSync()` 与 Checkpoint Requests：前者只等待首次完整同步；后者捕获服务端复制位置并等待本地应用覆盖该位置的 checkpoint。`hasSynced`、`downloading` 等状态不能单独证明此刻已追平。Checkpoint Requests 当前为 alpha，需 PowerSync Service `>=1.24.0`、Node SDK `>=1.0.0`，并显式设置 `checkpointMode: 'requests'`。[PowerSync：Sync Catch-Up / Checkpoint Requests](https://docs.powersync.com/client-sdks/advanced/checkpoint-requests)

该能力的官方介绍同时强调：上述上传后追平流程假设 `uploadData()` 在后端提交写入后才返回；异步排队后端需要额外的自定义 checkpoint 协调。它覆盖的是同步配置涉及的数据，不是服务器全部数据库或所有设备上的文件。[PowerSync：Introducing Checkpoint Requests](https://powersync.com/blog/checkpoint-requests-client-synced-now)

**本次版本核对：**[Desktop package.json](../../apps/desktop/package.json) 固定 `@powersync/node` 为 `1.1.0`、`@powersync/common` 为 `2.3.0`。Node 包版本满足文档列出的最低版本，但本研究未核实正在运行的 PowerSync Service 版本、是否启用 requests 模式和项目适配层是否暴露此 API。因此只能列为可评估的同步屏障，不能写成现有系统已具备的导入验收能力，也无需为本次文档研究升级依赖。

### 3.4 数据库同步不包含所有文件

官方附件模式将小型元数据通过 PowerSync 同步，实际文件放在对象存储，并由独立的附件队列上传、下载。数据库记录到达与文件字节到达是不同步骤。[PowerSync：Attachments / Files](https://docs.powersync.com/client-sdks/advanced/attachments)

**对 MemoFlow 的推论：**本地 Obsidian Vault、磁盘文件、设备凭据或任何不在导入与同步集合中的内容，都不能因数据库 checkpoint 完成而被视为已复制成功。若源 Profile 含有未覆盖内容，必须在源删除条件中单独处理；“忽略导入”不等于“可以无损删除”。

### 3.5 建议写入正式方案的证据层次

以下是结合上述保证得出的项目设计建议，不是 PowerSync 自带的导入协议：

| 证据                          | 可以证明                                       | 不能单独证明                     |
| ----------------------------- | ---------------------------------------------- | -------------------------------- |
| 导入前源清单与稳定快照        | 本次拟复制的对象、关系和内容范围               | 目标已收到数据                   |
| 目标本地应用回执              | 已完成本地导入处理及其结果分类                 | 后端已持久化                     |
| 业务上传确认                  | 后端对相应导入批次、对象的接受或拒绝结果       | 本地已收到服务器最终状态         |
| 与这批写入相关的同步屏障      | 本地已应用相应服务端状态                       | 被拒绝项不存在、范围外文件已保存 |
| manifest 与服务端业务回执核验 | 预期对象及关系满足业务验收条件                 | 删除瞬间源库没有新增数据         |
| 删除前源版本复核              | 源没有超出已验证快照的新内容，且删除条件仍成立 | 用户曾授权删除任意其他 Profile   |

建议将 `importId`、源 Profile/快照标识、目标云端身份、导入范围、接受/拒绝/跳过结果与最终核验状态关联起来；恢复时先查询这次导入的持久结果，不能盲目重复写入。勾选删除源 Profile 应只授权删除所选源和已说明范围，且仅在全部前置证据成立后执行。没有明确业务核验能力时，应保留源并呈现待验证状态。

## 4. 产品先例：可以借鉴什么，不能证明什么

| 产品           | 官方可验证事实                                                                                                                                                                                                                                                                                             | 对 MemoFlow 的参考及边界                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Chrome         | Profile 区分书签、历史、密码和设置；创建 Profile 后可选择登录 Google 账号。官方也提醒，能使用同一设备的人可能切换并查看其他 Profile。[官方帮助](https://support.google.com/chrome/answer/2364824?hl=en)                                                                                                    | 支持“本地容器可以先于云端登录”的交互类比；不构成操作系统级安全隔离或 PIN 加密保证。                          |
| VS Code        | Profile 是设置、扩展等自定义配置集合，可新建空 Profile 或复制既有配置，也可借助 Settings Sync 在设备间同步。[Profiles](https://code.visualstudio.com/docs/configure/profiles)                                                                                                                              | 适合参考创建、命名、切换与复制配置；不能把配置 Profile 等同于业务数据租户。                                  |
| Obsidian       | 本地 Vault 是文件系统目录；远程 Vault 是供本地 Vault 连接的中心存储。官方设置流程分别处理账号登录、创建/选择远程 Vault 与启动同步。[Vault 类型](https://obsidian.md/help/sync/vault-types)、[Sync 设置](https://obsidian.md/help/sync/setup)                                                               | 支持区分本地数据容器、云端账号与同步目标；它的连接既有 Vault 流程并非本提案的“创建独立目标后复制导入”。      |
| Standard Notes | 可无账号、无网络使用，未注册同步账号时数据留在本机；Workspace 切换可创建未登录的实例，再登录另一个账号。[离线使用](https://standardnotes.com/help/59/can-i-use-standard-notes-totally-offline)、[多账号与 Workspace](https://standardnotes.com/help/82/can-i-sign-into-multiple-accounts-at-the-same-time) | 是与本地优先、多账号容器较接近的先例；这些资料没有证明它采用与 MemoFlow 相同的复制导入、回执或自动删除机制。 |
| Notion         | Workspace switcher 支持添加另一个账号，并同时呈现账号与其 Workspace；可单独退出某账号，继续保留其他登录。[创建、加入与切换 Workspace](https://www.notion.com/help/create-delete-and-switch-workspaces)                                                                                                     | 适合参考轻量统一入口与“退出一个不影响其他账号”；Workspace 是云端业务空间，不是离线 Guest Profile。           |
| Joplin         | 可创建并切换 Profile；同步配置按 Profile 区分，但语言、字号、主题等部分设置共享。[Multiple profile support](https://joplinapp.org/help/apps/profiles/)                                                                                                                                                     | 支持将同步设置归属到 Profile；同时说明“多 Profile”不必意味着每一种设置都完全隔离，必须逐项定义边界。         |

VS Code 是一个需要特别约束的类比：其 Settings Sync 登录后会合并本地和云端配置；更换同步账号需先关闭同步再重新开启。这不能拿来证明“登录后总会创建一个不合并旧数据的独立 Profile”。[VS Code：Settings Sync](https://code.visualstudio.com/docs/configure/settings-sync)

**本项目选择：**可从这些产品分别借鉴本地容器、账号入口与显式复制交互，但“新云端 Profile 独立创建、可选复制本地 Guest、跳过导入不撤销登录、默认保留源、验证后才允许删除”仍应作为 MemoFlow 自己的产品规则记录与验收。

## 5. 证据完整性与访问限制

- 本文使用各产品官方网站、官方文档与 Better Auth 官方仓库的固定版本源码。搜索结果中的镜像站、论坛经验和第三方解释未作为结论依据。
- 最初尝试的 PowerSync 旧路径 `https://docs.powersync.com/client-sdks/writing-client-changes` 在网页读取工具中失败；随后通过官方文档索引定位到本文引用的 `/handling-writes/writing-client-changes` 并成功读取。该路径错误已解决，不是资料缺失。
- Obsidian 帮助页面返回包含 Wiki 链接语法的正文，能够核对本地/远程 Vault 定义和设置步骤；本次未据其页面渲染推断 UI 像素或实际运行表现。
- 没有进行上述产品的登录操作、数据迁移实测或服务端生产检查。产品行为证据来自官方说明；性能、隔离强度、导入完备性与 MemoFlow 当前运行状态需要各自的实现和测试证据。
- 外部文档可能更新。执行后续开发时需复核实际依赖、服务版本与配置，尤其是 alpha Checkpoint Requests；本文不将网页访问日期当作未来兼容保证。
