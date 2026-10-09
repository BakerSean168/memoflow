---
tags: [plan, active, desktop, profile, data-portability]
description: 独立 Profile 和访客复制导入的实施切片、验收矩阵与发布条件
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# 独立 Desktop Profile 实施与验收计划

2026-10-09 续办：用户已要求继续实施剩余功能。DP-1401～1901 进入实施；继续使用本隔离工作区，以第 4 节验收矩阵逐项收口。上一阶段证据保留在第 11 节，不作为新增导入路径的验证结果。

**当前状态：DP-1001～1801 源码已实现；DP-1901 的 Linux 自动化、本地部署与本轮文档验证已完成。** 隔离工作区 `memoflow-profiles` / 分支 `feat/desktop-independent-profiles`，不修改主工作区的性能任务。跨平台、真实生产 OAuth、全 owner 网络同步和主工作区集成尚未验收，不能据源码完成宣布全部 AC 通过。设计依据为 [ADR-119](../../architecture/adr/ADR-119-independent-desktop-profiles-and-guest-copy-import.md)。

## 1. 产品结果和验收来源

交付多个 guest/云端 Profile 的独立创建与快速切换；新增云端身份进入独立容器；空云端账户可选择复制一个 guest；源默认保留，可选清理仅在完整核验后执行。

- [产品交互](../../product/desktop-profiles/product-and-interaction.md)：用户可见行为。
- [导入协议](../../architecture/desktop-profile-import-protocol.md)：身份、持久批次、事务、同步和删除条件。
- [代码现状](../../analysis/2026-10-09-desktop-profile-current-system.md)：复用入口及真实缺陷。
- [官方资料](../../analysis/2026-10-09-profile-auth-primary-sources.md)：外部能力边界。

## 2. 切片和依赖

按以下顺序推进，各切片先建立行为测试再修改实现。生命周期和同步模块与当前 Desktop 性能优化有重叠，实施前先核对实际 main/工作区，避免复写其他工作。

| ID      | 可验收增量                                   | 主要落点                                                                       | 依赖 / 出口                                                              |
| ------- | -------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| DP-1001 | 现状 characterization、目标契约失败用例      | ProfileRegistry/Runtime/IPC/ConnectionService 与对应测试                       | AccountView 真实结构、多 guest 精确选择、PIN/取消语义明确                |
| DP-1101 | 新建 guest、按 ID 打开、重命名、串行生命周期 | `apps/desktop/src/main/profile/`、contracts/electron、preload bridge           | 依赖 1001；两个 guest 数据/目录/密钥独立，重启恢复指定 ID                |
| DP-1201 | 认证目标路由和 session commit                | DeviceAuthCoordinator、ConnectionService、ConnectionManager、CloudSessionStore | 依赖 1101；两个云端账户不串数据；删除旧 reconciliation/adoption 登录路径 |
| DP-1301 | Profile 菜单与管理入口                       | app-vue Profile Access、CloudConnectionDialog、AppShell、认证 store            | 依赖 1201；快速切换、PIN、离线、重新认证和旧缓存清理闭环                 |
| DP-1401 | 空摘要与稳定只读源快照                       | Account/API composition、各 owner summary、Desktop snapshot/export composition | 依赖 1201；unknown 不误判空，源 snapshot 不启动后台副作用                |
| DP-1501 | Goal 导入纵切                                | Goal owner、Data Portability API、事务作用域、operation receipt                | 依赖 1401；同 request 响应丢失可恢复、源不变、目标本地核验成功           |
| DP-1502 | Task + Goal + Label 第二 owner 验证          | Task/Label owner、portable refs、目标关联核验                                  | 依赖 1501；父子关系完整，随后才固定共享 manifest/operation 接缝          |
| DP-1601 | 十个 capability 全覆盖及并发准入             | API owner/PowerSync/后台/Agent 写入口，剩余 portability owner                  | 依赖 1502；全部参与事务和空账户锁；AI 重试不重复；真实同步覆盖明确       |
| DP-1701 | 一次性弹窗与恢复结果页                       | app-vue、Profile metadata、本机 journal、typed IPC                             | 依赖 1401/1601；刷新/重启不重弹，跳过不退出登录，重试复用 operation      |
| DP-1801 | 核验后源清理                                 | Runtime remove、Profile paths、key/PIN/session stores、cleanup journal         | 依赖 1701；崩溃矩阵和外部路径保护通过，源变化阻止自动删除                |
| DP-1901 | 集成、本地部署和桌面验收                     | API real-PG、PowerSync、Desktop E2E、文档/治理                                 | 依赖全部；代码、产物和验收证据闭环后更新 ADR 状态                        |

进度：DP-1001～1301 的第一阶段证据保留在第 11 节；DP-1401～1801 的实现和本轮证据见第 12 节。DP-1901 的发布/跨平台边界仍需单独记录。

## 3. 每个切片的关键工作

### DP-1001～1301：先固定容器和认证

- 用 `AccountViewSchema` 的真实 envelope 替换旧 fixture，确认错误来自契约边界；目标流程删除自动 reconciliation 后，也保留剩余 Account 读取的正确 schema。
- 拆分 createGuest 与 ensureGuest；统一 `prepareProfileById` 一类精确选择入口，覆盖 SELECT、启动恢复和 PIN unlock，不仅改按钮。
- 将 lifecycle mutation 串行，创建/添加请求防重复；绑定 descriptor 和 session 的结果必须可恢复。
- 保留 device attempt 的取消/过期/迟到撤销；增加 origin 与 target 区分，旧 attempt 无权覆盖新 Profile。
- 切换时 flush owner、停止调度和订阅、关闭数据库、清理 renderer Query/Pinia/AI stream 等引用；回调用 Profile generation 防止旧数据回流。
- 退役旧 `reconcileLocalProfileToCloud`、登录调用的 `bindCurrentProfile`、`rebindIdentityOwnership` 和 `LocalTenantAdoptionService`。先检索所有调用者和 journal/schema/test 依赖，再删生产路径；不保留旧迁移兼容层。
- 检查 inactive/pending Profile 的移除和创建失败恢复。云端退出、锁定、移除和 Account closure 各自测试。

### DP-1401～1601：先证明事实，再构造导入

- 空摘要按 owner 组合；包含 V3 尚未支持但云端实际持有的用户内容。默认值来源不明确时不能猜空。
- 快照导出有 PIN 授权、稳定事务读视图和明确资源释放；只读 export 若触发默认数据初始化，先修对应 owner。
- Goal → Task 试点证明同事务写入、持久 receipt、关联映射、batch 重放、提交后副作用和同步下载。
- 使用 PostgreSQL 全表写入 fence 覆盖账户写入集合，补真实 PostgreSQL 双连接测试，不能只 mock 锁成功。
- 逐 owner 审查 retry、默认资料保护、scope coverage、manifest 规范化和本地 readback；AI shell 固定 batch/ref 身份，完整消息明确排除。
- 公开 API 接受稳定 request ID，服务器重算 digest，使用当前 principal；post 响应丢失能找到原结果。
- 验证 HTTP body/反向代理/运行时字节大小和事务时限一致；不扩大现有默认限额而不测。

### DP-1701～1901：最后开放删除

- 状态在主进程/服务端持久化，Vue 仅渲染；自动询问消费和提交 key 不依赖组件是否 mounted。
- typed IPC 返回真实分类计数和结构化不能删除原因；不向 renderer 发送 token、密钥、文件正文。
- 服务端 receipt 与目标本地 manifest 相符后，才允许判断清理；部分支持内容始终显式列出。
- 源独占再扫描、外部 Vault 路径保护、同盘暂存 rename、目录与密钥清理顺序可恢复；手动移除复用资源代码但保留独立确认。
- 运行本地 prod-like API/PowerSync + Desktop 用户旅程；确认快照首次水合和导入后同步均不会上传默认值覆盖云端资料。

## 4. 行为验收矩阵

所有场景均要求记录实际 Profile ID、operation/batch 关联和脱敏结果；不能只凭截图判断数据库隔离。

| ID    | 场景                                                  | 必须观察到的结果                                        | 层级                     |
| ----- | ----------------------------------------------------- | ------------------------------------------------------- | ------------------------ |
| AC-01 | 新建两个 guest，分别创建任务后反复切换                | 精确打开选中 ID，数据/目录/key 独立                     | Registry + Desktop 集成  |
| AC-02 | 第二个 guest 有 PIN，输入错误/正确 PIN 并重启         | 错误不读数据；正确只开第二个；重启不回第一个            | IPC + Desktop E2E        |
| AC-03 | 双击创建或并发 SELECT/LOCK                            | 同请求不重复创建，无双活动 runtime/泄漏                 | 并发集成                 |
| AC-04 | 从有数据 guest 添加新云端账号                         | 新建独立容器，源身份/内容不变                           | Desktop + API            |
| AC-05 | 同一用户分别用邮箱和 GitHub 登录                      | 若服务器解析为同 user ID，复用一个 Profile              | Auth contract + E2E      |
| AC-06 | 添加第二个云端用户，含相同昵称/相似邮箱               | 两个 Profile 独立，不按显示值合并                       | E2E                      |
| AC-07 | 重新认证时浏览器返回不同用户                          | 拒绝改绑，原本地数据继续可用                            | DeviceAuth + E2E         |
| AC-08 | 授权中切换/锁定；旧 token 迟到                        | 旧 attempt 不写入当前 Profile；仅撤销未采用新 session   | fault injection          |
| AC-09 | session 保存失败或同步启动失败                        | 源不变；区分认证恢复与同步等待，不误删目标              | unit + 集成              |
| AC-10 | 云端有 Goal、归档内容或不可导入 Knowledge             | 判定非空，不主动弹简易导入                              | real-PG + UI             |
| AC-11 | 云端仅系统默认资料 / 摘要部分失败                     | 前者可判空，后者 unknown 且保留正常登录                 | owner contract           |
| AC-12 | 多 guest、全部 PIN 锁定或只有默认数据                 | 不泄漏摘要，不误触发导入；手动解锁路径可用              | UI + IPC                 |
| AC-13 | 跳过/关闭导入、重新认证、重启应用                     | 登录保留，已消费提示不再自动出现                        | E2E                      |
| AC-14 | 预检后第二设备先创建数据或改偏好                      | 提交拒绝失效计划，零本批次业务写入                      | 双连接 real-PG           |
| AC-15 | 同 key 同 payload 并发/重试；同 key 异 payload        | 前者唯一结果，后者冲突；AI/Goal/Task 不重复             | owner + API              |
| AC-16 | 第 N 个 owner 报错、事务中进程退出                    | 无部分业务提交/提前外部投递，可用原 key 重试            | real-PG fault injection  |
| AC-17 | 已提交但响应丢失，客户端重启                          | 找回原 receipt，不重新 apply                            | API + Desktop 集成       |
| AC-18 | Goal/Task 关联与所有支持事实导入                      | 服务端和本地 manifest 匹配，ID 映射正确                 | real-PG + PowerSync      |
| AC-19 | queue 空/hasSynced=true，但目标缺一项或有冲突         | 不标记本地完成，不删除源                                | 同步故障注入             |
| AC-20 | 含 Vault、附件、AI 消息/凭据或未知文件                | 说明未覆盖范围，保留源；不读取/删除外部目录             | 文件系统 + UI            |
| AC-21 | 云端已有自定义昵称/偏好，业务为空                     | 自定义值保留，源差异计为未迁移并禁止清理                | owner + API              |
| AC-22 | 验证后源新增任务/文件，或重新打开源                   | 源复核失败或活动锁阻止清理                              | 并发集成                 |
| AC-23 | 勾选删除后，在 rename/目录删除/key/registry 各步崩溃  | 重启按 journal 恢复，不能先丢 key、删除错目录或重复导入 | 文件系统 fault injection |
| AC-24 | 不勾选删除且导入成功                                  | 两个空间持续独立，之后各自修改不相互污染                | Desktop E2E              |
| AC-25 | 另一个账户读取/重试 import operation，或 IPC 伪造路径 | 拒绝越权，错误不泄漏内容                                | auth/IPC boundary        |
| AC-26 | 切换时存在 AI stream、缓存请求、Routine 定时器        | 旧回调不污染目标，无丢失 flush 或重复调度               | runtime 集成             |
| AC-27 | 删除 Profile 与退出登录、关闭账户分别操作             | 清理不产生云端业务删除；其他 Profile 不受影响           | E2E + 网络断言           |
| AC-28 | 大内容、磁盘满、PIN 不可用、导入等待超时              | 有界失败/等待，源保留；无无限重试或假进度               | 容量/错误测试            |

## 5. 验证命令与证据要求

本轮通过 `pnpm nx show project <name> --json` 核实 desktop、app-vue、api、contracts、data-portability 均有 `test/lint/typecheck` target。实施时从受影响的文件/项目开始，所需全项目命令例如：

```bash
pnpm nx run desktop:test
pnpm nx run app-vue:test
pnpm nx run data-portability:test
pnpm nx run api:test
pnpm nx run contracts:test
pnpm nx run-many --targets=lint,typecheck --projects=desktop,app-vue,data-portability,api,contracts
pnpm nx run memoflow:governance-check
```

修改到其他 owner 时追加对应 owner 最近的 target。以上是各阶段的标准验证入口，实际已运行范围和结果见第 11 节，不代表后续导入验收已完成。真实 PG/PowerSync 用隔离测试账户与临时 Profile 目录，禁止把开发者现有资料当测试数据。

涉及运行时/部署链路后遵循[本地 Docker](../../guides/development/local.docker.md)和[运行车道](../../guides/development/runtime-lanes.md)：`pnpm docker:local:up`，使用仓库 validate-local-deploy skill，保存 source revision 与本地镜像/测试证据。Desktop 安全开发入口为 `pnpm nx run desktop:serve-safe`；E2E 使用项目 `desktop:e2e` 的现有配置和隔离目录。

Windows、Linux 是必须明确记录的目标；macOS 若无实机则标未验证，不用 Linux 结果代替。平台 PIN、安全存储、路径和清理行为需要对应证据。

## 6. 已落实的决策和剩余实证

| 决策             | 当前实现                                                                 | 证据 / 边界                                                    |
| ---------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 服务端唯一 apply | 十 owner 共用 Prisma transaction，PowerSync 下载                         | real-PG 原子/回滚/关联测试；真实全 owner 网络同步待验收        |
| 空账户写入 fence | public/mastra 全表 SHARE ROW EXCLUSIVE，最长 15 秒                       | 普通 SQL 双连接竞争测试；期间其他账户写入也会等待              |
| 默认资料保护     | owner 区分默认/缺失和自定义目标值                                        | Account、Preference、Notification、Routine policy 测试         |
| 只读快照         | SQLite readonly + query_only + 事务，含 WAL                              | 真实 PowerSync 持久库 readback 与只读拒写测试                  |
| manifest         | 稳定 bindings、owner/schema 和规范化语义摘要                             | Goal/Task/Label 和全 capability real-PG 测试；缺本地事实不通过 |
| 未来调度         | 同事务 pending marker，worker 幂等恢复                                   | real-PG 重建 worker 后恢复未来 invocation，不投递历史通知      |
| 容量             | 100,000 UTF-8 bytes；inventory 每表 10,000 行、10,000 条目、512 MiB 文件 | 契约限制和内容变化测试；没有磁盘预留，大容量压力测试未执行     |
| 平台             | 当前 Linux 原生 SQLite、Electron、Secret Service                         | Windows/macOS 及生产 OAuth 不以 fixture 结果替代               |

## 7. 发布与文档收口

- 未满足 DP-1601 的原子写入、并发准入和全范围核验前，不开放简易导入；独立 Profile 管理可独立验收。
- 自动删除默认关闭。只有 DP-1801 的全部门禁和故障恢复测试通过才允许用户勾选；不能以“通常同步成功”豁免。
- 先本地 prod-like，后 PR 与 CI，按仓库标准发布主线。无直接生产试验和手工改 tag。
- 本计划 DP 全部完成后迁入 archive，更新 ADR-119 及 ADR-039/104 的修订说明，保留完整证据。没有必要引入旧系统兼容迁移。

## 8. 前期文档验证（实施前）

- 交付：现状分析、官方资料、ADR、产品交互、导入协议、实施/验收计划与系列导航。
- 业务源码：本轮未修改；既有未提交 Desktop 性能改动保留。
- `pnpm nx run memoflow:docs-check`：通过。
- `pnpm nx run memoflow:governance-check --excludeTaskDependencies`：治理主检查通过；此结果明确不包含依赖测试清单 gate。
- 完整 `pnpm nx run memoflow:governance-check`：未通过。依赖 `test-system-v2:test:governance` 报 generated inventory stale；只读比较确认唯一新增清单项为本轮开始前已存在的 `apps/desktop/src/main/database/__tests__/powersync-lifecycle.spec.ts`（1332 → 1333），missing/duplicate/unexpected 均为零。本轮保留已有代码与生成清单，不用跳过依赖的结果冒充全链路通过。
- 本系列本地链接存在性、28 个 AC 编号唯一性、Prettier 格式及 `git diff --check`：通过。
- 未执行：真实账户登录、业务测试、Desktop E2E、Docker 部署、实际导入或删除。

## 9. 基础闭环实施约束

- Profile Registry 是本机容器真源；Better Auth user ID 是云端身份真源；session 按目标 Profile 保存。
- IPC/认证响应由运行时 schema 校验；Profile ID 来自 registry，禁止任意路径。
- 生命周期操作串行，PIN 在准备数据库前验证；切换失败不宣称成功。
- 登录不写源 Account、不执行 tenant adoption；账户锁定/退出/切换保持独立。
- 先落多 guest、认证路由和 PIN/取消的失败测试，再实现 UI，并执行邻近测试、lint/typecheck 和本地验证。
- 当前基线为 f34eff34f4a；主工作区既有性能优化不在本分支中，集成时需合并其生命周期修复并重跑相关测试。

## 10. 基础闭环的实际实现

- Registry 的创建、重命名与选择写入串行化；写入失败不发布缓存。createGuest 的稳定 request ID 防止重复创建；ensureGuest 只用于启动兜底。
- 打开 Profile 按确切 ID，PIN 校验早于目标数据库准备。切换、锁定、PIN 设置、移除和 session commit 共用生命周期队列；Account 回调固定所属 Profile，避免旧回调获取新 Profile 的 token。
- 云端认证按 Better Auth user ID 查找或创建独立 Profile。目标 session 原子保存是提交点；提交前取消会撤销新 token，提交后保留已采用 session。重新认证返回其他身份则拒绝。
- 登录不再读写源 Account，也不执行 tenant adoption；删除 adoption service、恢复调用与本地 journal schema。云端 Account 昵称不再自动重命名本机 Profile。
- 云端连接结果明确目标和 active/pending/pin_required/sync_pending。跨 Profile 激活由窗口流程完成：先销毁旧 renderer，再打开目标；PIN 目标进入选择页。新主窗口使用目标独立 partition，旧 Query、Pinia、流组件随旧 renderer 释放。
- 菜单支持多个 Profile、管理入口、已登录时添加账号和原账号重新认证；选择页可创建、重命名、移除和 PIN 解锁。

本节是第一阶段历史记录：当时不包含访客复制导入、云端空摘要和自动删除入口；当前实现见第 12 节。尚未与主工作区 Desktop 性能改动合并，不能据此宣布整个 ADR 或全部 AC 已完成。

## 11. 基础闭环验收证据与边界

隔离分支：`feat/desktop-independent-profiles`，工作区 `/home/dev/projects/memoflow-profiles`。未改写主工作区既有性能优化；尚未提交、创建 PR 或合并。

| 范围                      | 已取得证据                                                                                                                           | 实证边界                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 多 guest / 精确选择 / PIN | Registry、Runtime、IPC 行为测试；Linux E2E 新建第二个 guest，错误 PIN 拒绝、正确解锁，重启恢复同一 ID                                | Windows/macOS 未执行；AC-01 的任务级跨 Profile readback 尚未补充        |
| 独立云端 Profile          | Linux E2E 连续添加两个云端身份，独立目录/session；源 guest 保持身份和文件内容                                                        | E2E 使用本地认证 HTTP fixture，不等同真实 GitHub/邮箱 OAuth 平台验收    |
| 认证取消 / 并发           | 稳定创建请求、串行切换/锁定、迟到 device-code、session resolution 中取消、错误身份重新认证、失败存储不删除旧 session 的测试          | 未做进程强杀、磁盘满、真实多设备竞争故障注入                            |
| 生命周期资源              | PowerSync 关闭调用释放 DB/worker 的测试；Runtime 关闭失败锁定并在下一次打开前重试；旧 renderer 在切换中销毁，原 Profile 回调固定来源 | AC-26 的真实长 AI stream 和全部 owner 故障矩阵未执行                    |
| 管理入口                  | Vue 创建并打开、重命名、PIN 表单和跨 Profile 认证跳转测试；主菜单提供创建、添加账号和管理入口                                        | PIN 设置继续复用打开后“账户与隐私”页；管理页未提供未实现的导入/清理入口 |
| 清理与 Account lifecycle  | 保留既有手动移除、云端退出、本地锁定和 Account closure 的边界；相关受影响回归执行                                                    | 自动删除与持久 cleanup journal 不属于本切片，AC-23 等待 DP-1801         |

验证入口：

- `pnpm nx run desktop:test`（受影响全量）、Profile 邻近测试。
- `pnpm nx run desktop:test:ipc -- profile/profile-access-ipc.spec.ts profile/cloud-auth-ipc.spec.ts`：2 个文件、12 项测试通过。
- `pnpm nx run desktop:test:main -- database/__tests__/powersync-public-surface.spec.ts lifecycle/window-manager.surface.spec.ts`：冻结源码后 2 个文件、4 项测试通过。
- `pnpm nx run app-vue:test`（受影响全量）；Profile Access / CloudConnectionDialog / Sidebar 邻近测试另行确认 3 个文件、10 项通过。
- `pnpm nx run contracts:test`：93 个文件、559 项测试通过。
- `bash apps/desktop/scripts/run-linux-electron-e2e-with-keyring.sh authentication/desktop-auth-flow.spec.ts`：冻结源码后的 production build 和 3 项 E2E 全部通过；真实 Linux Secret Service、隔离临时用户目录。覆盖离线 guest 恢复、连续添加两个独立云端身份，以及第二 guest 的 PIN/重启恢复。
- `pnpm nx run memoflow:governance-check`：完整检查通过；已重新生成 inventory，移除 retired adoption spec。
- 仓库 `validate-local-deploy` runner：执行 affected lint/typecheck/test 和 `pnpm docker:local:up`；本地机器上的报告路径为 `reports/local-deploy-validation/latest.json` / `latest.md`，不纳入版本控制。

最终部署报告生成于 `2026-10-09T10:41:59.846Z`，`verdict=pass`、`readyForPr=true`、阻塞项为零。37 个项目 lint、34 个项目 typecheck、34 个项目 test 和 `pnpm docker:local:up` 全部退出 0；复用了 Nx 的匹配缓存，其中 Desktop 与 app-vue 全量测试在末轮实际重新执行。API、Web、PowerSync、PostgreSQL、Redis 均 healthy；Web/API 端口映射和运行时 revision 均匹配。构建源码指纹及 API/Web 镜像 revision 均为 `f34eff34f4a5567c57181c4fc5ef0d357a0a8eb1-dirty-36dd2192a34c`。这是本分支本地验证结论，不代表已合并、已发布或已覆盖上表全部验收边界。

首轮宽范围验证发现的过期 adoption 文档/测试引用已修复；曾因并发构建发生的治理测试超时在复跑后通过。末轮桌面构建曾出现依赖 chunk 缺失，错开同工作区构建后 production build 与 E2E 均通过。Nx 日志仍将 `desktop:build:production`、`desktop:test`、`contracts:test`、`app-vue:test` 标为 flaky；本轮命令全部成功，保留为警告，不将其当作失败。共享 `memoflow-prod-like` 服务的另一工作区验证结束后，本分支才执行部署并取得上述源码指纹证据。

## 12. 复制导入与清理的本轮实现和证据

### 已实现

- DP-1401：九 owner 空摘要；十 owner repository-only 只读 composition；真实 SQLite/WAL 快照；PIN 先于源读取。
- DP-1501/1502：服务端持久 operation，稳定 request/batch/ref；Goal → Task → Label 原子导入与关联验证；已提交响应丢失可 GET 恢复。
- DP-1601：十 capability 共享外层事务；默认/自定义目标策略；全表写入 fence；Notification V3 禁止源链接；AI 软删除 shell 不复活；持久未来调度恢复 marker。
- DP-1701：云端菜单入口、一次性提示、多 guest 明确选择、PIN、有效计划预览、默认不删除、分类 blocker、历史记录和恢复核验。目标变化后立即刷新到 prepared，重新预检确认。
- DP-1801：加密快照和耐久 JSON journal；服务器/目标本地内容核验；源 semantic/inventory/lastActiveAt 复核；tombstone、同盘 rename、目录先于保护材料清理；启动恢复，外部 Vault 链接保护。

### 本轮已取得的定向证据

- Desktop 安全批次：4 文件、25 项通过，含删除正向、源修改/重新打开、cleanup_pending 无 tombstone、6 个清理故障阶段、外部 symlink、空/非空 Mastra/WAL、内容同大小同 mtime 变化、提示消费和 PIN 候选过滤。
- Profile Runtime/Registry：2 文件、32 项通过。新建 guest/cloud ID 统一为 24 位 hex；无旧版本迁移要求。
- API 三接口认证隔离、严格 body 和 GET 恢复测试通过。
- real-PG：operation 5 项、capability policy 4 项、summary 3 项已通过，含普通 SQL fence、事务 rollback、重复请求、目标资料保护、未来调度重启恢复和 AI deleted shell。
- 真实 PowerSync 持久库 → readonly adapter 通过；多 owner 本地 manifest 核验在服务测试中用实际 SQLite 数据证明，网络下载由测试显式模拟。
- Vue 多 guest 选择的前一批 3 项通过；新增目标计划失效恢复测试及最终全量以末轮报告为准。
- Data Portability transport/module 生命周期 14 项通过，含 shutdown stop 后等待在途恢复 drain。

本轮最终定向验证：

- `bash apps/desktop/scripts/run-linux-electron-e2e-with-keyring.sh authentication/desktop-auth-flow.spec.mts`：**4 项通过（57.9 秒）**。前三项覆盖离线持久 guest、独立云端账号和第二 guest PIN；新增项覆盖真实 SQLite 标签源、一次性提示、预检、提交、缺本地数据时保留源、重启后记录恢复且不重复提交。认证/API 为 HTTP fixture，没有真实 PowerSync 网络下载。
- `pnpm nx run api:test:integration -- profile-import-operation.integration.test.ts profile-import-capabilities.integration.test.ts profile-import-owners.integration.test.ts business-data-summary.integration.test.ts`：隔离 PostgreSQL `memoflow-profiles-test-db:5435`，**4 文件、13 项通过**。
- 最新 Desktop 清理/服务/inventory：**3 文件、21 项通过**；Vue 导入对话框：**4 项通过**，包括目标变更后立即显示新持久状态。
- 宽范围 lint 的 40 个其他项目通过；修复 E2E 动态 import 导致的 Nx lazy-library 误判后，Desktop lint 另行通过。最终总报告仍会重新核对全部 affected checks。
- Electron 首次窗口失败发现共享事务辅助函数错误触发 Prisma singleton 初始化；改用无连接副作用的 `@memoflow/database/transaction` 公共入口。E2E 改用原生 `.mts` 并正确等待正式 Shell 窗口，ownership 和硬验收引用同步更新。
- 治理负向锁已区分退役 `/profile` 页面和合法 `/profile-import` API，仍拒绝旧页面及其 query/子路由。inventory 已重建为 1,346 个测试文件，无 missing/duplicate/unexpected。

本轮宽范围检查和部署报告生成入口为 `tools/agent-skills/validate-local-deploy/scripts/run-validation.mjs`；本机报告保存在 `reports/local-deploy-validation/latest.md` / `latest.json`。第 11 节 `dirty-36dd2192a34c` 仅覆盖第一阶段，不能用于本轮验收。

### 尚未证明的验收范围

AC-01 完整任务级跨 Profile 旅程、AC-05 真实邮箱/GitHub 同身份、AC-16 进程强杀、AC-18 全 owner 真实网络下载、AC-26 长 AI stream 全 owner 故障矩阵、AC-28 磁盘满/大容量压力以及 Windows/macOS 不在当前已通过范围。SQLite/HTTP fixture/故障注入的证据必须注明层级，不能扩大成生产端到端证明。

主工作区性能改动尚未集成；未提交、未建 PR、未合并、未发布。计划继续保留 active，直到剩余集成和平台验收完成。

## 13. 本轮最终本地验证结论

2026-10-09T16:14:18.963Z 生成的仓库 `validate-local-deploy` 报告为 **pass**，`readyForPr=true`，阻塞项为零。41 项目 lint、37 项目 typecheck、36 项目 test 和 `pnpm docker:local:up` 全部退出 0。末轮复用与当前输入匹配的 Nx 缓存；实际执行的结果来自本轮前序回归，不代表每个测试都在末轮重新执行。

API、Web、PowerSync、PostgreSQL、Redis 均 healthy。API/Web 镜像 revision 与构建时工作区指纹一致：`f34eff34f4a5567c57181c4fc5ef0d357a0a8eb1-dirty-d50ecea593f5`。对应本机报告为 `reports/local-deploy-validation/2026-10-09T16-14-18.963Z.json` / `.md`，以及 `latest.json` / `latest.md`；报告不提交进仓库。该指纹对应运行时代码冻结点，之后仅同步验收文档并运行文档/治理检查。

最终源码的 Linux Electron E2E 再次 **4 项通过（约 1.2 分钟）**。PostgreSQL 集成测试 **13 项通过**。桌面全量测试在单独运行时 **97 文件、546 项通过（约 34 秒）**；先前并行全量负载下三项真实 PIN 哈希测试超过 5 秒，独立复跑通过，原始 Nx 日志仍标记 `desktop:test` 为 flaky。本轮没有降低 PIN 算法强度或移除测试断言；此波动应在后续 CI 中继续观察。

宽范围验收发现并修复了无副作用事务入口的源码/产物类型映射不一致、已不再需要的 Goal transaction cast 白名单和 API composition 旧断言。前两份失败报告保留为历史，不代替上述最终通过报告。

本轮授权的功能实现及 Linux 本地验证已交付。计划保留 active，仅因第 12 节列出的真实网络、跨平台和主工作区集成验收尚未完成；不因此把所有 28 个 AC 标为已通过。未提交、未创建 PR、未合并或发布。
