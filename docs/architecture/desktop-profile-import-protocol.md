---
tags: [architecture, desktop, profile, data-portability, protocol]
description: 已实现的访客复制导入、持久恢复、内容核验与本地清理协议
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# Desktop Profile 导入、核验与清理协议

**状态：V1 已实现并通过 Linux Electron、真实 PostgreSQL 与本地部署验证。** 决策见 [ADR-119](./adr/ADR-119-independent-desktop-profiles-and-guest-copy-import.md)，实际测试和未验证范围见[实施计划](../plan/active/2026-10-09-desktop-independent-profiles.md)。本文描述当前实现，不将测试替身当作生产云端或跨平台验收。

## 1. 责任与身份边界

| Owner                    | 负责                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| Cloud Auth / Better Auth | 认证 principal、session、provider binding 和撤销                       |
| Desktop Profile host     | Profile 选择/PIN、源只读快照、加密 journal、目标本地核验和本机资源清理 |
| Data Portability         | V3 解析、依赖排序、持久 operation、有效计划和 manifest 编排            |
| 真实业务 owner           | 空数据判定、payload 语义、事务写入、稳定引用映射和内容 readback        |
| API host                 | middleware principal、Prisma 事务和 owner composition                  |
| PowerSync                | 将服务端已提交事实下载到目标 Profile                                   |

进程只有一个活动业务 runtime。源导出不启动第二个 PowerSync、scheduler 或 IPC runtime。认证按云端 user ID 选择独立 Profile；不按邮箱/昵称合并，不修改 guest identity，不执行 tenant adoption。目标 session 原子保存是认证提交点；保存前取消撤销未采用 token，保存后 UI 切换失败仍保留 session。连接结果为 `active | pending | pin_required | sync_pending`，请求意图为 `add_account | reauthenticate`。重新认证必须匹配原 binding。

生命周期队列串行处理切换、PIN、移除、认证提交和导入步骤；请求排队前捕获 generation，轮到执行时再次检查。跨 Profile 切换销毁旧 renderer 并关闭旧数据库；目标有 PIN 时先解锁，再打开。

## 2. 云端摘要和一次性提示

`GET /api/v1/accounts/me/data-summary` 使用认证主体，唯一契约为 `BusinessDataSummarySchema`：`schemaVersion`、`state`、`observedAt`、逐 owner 状态。状态只有 `empty | non_empty | unknown`。任一 owner 有业务为非空；所有必需 owner 已知且为空才为空；缺失、失败或不能判定为 unknown。

九个 owner 为 Goal、Task、Label、Schedule、Routine、Repository、AI、Notification、Relation。判定包含归档/软删除事实、Knowledge/Repository 和 AI 消息/持久配置等不可导入资料。Account/Preferences 不作为业务非空条件，但另有目标值保护。摘要仅提供观察结果；提交事务会重新判空。

新建本机云端 Profile 的 `add_account` 成功后写入一次性机会记录。已有 Profile 和重新认证不创建机会。消费时先持久化 `consumed=true`，然后读取云端摘要；失败或非空不提示，也不影响登录。

自动候选最多检查前 20 个 guest，跳过 PIN 保护或无法只读访问的源；只做 owner export，不扫描附件。没有业务候选不提示，一个候选可预选，多个候选不预选。只含 Account/默认偏好不触发提示。手动入口仍可选择其他 guest，包括输入 PIN 后复制自定义资料/偏好。

## 3. 源快照和资料覆盖

源必须是 registry 中存在的非活动 guest，且不在 pending cleanup。主进程先验证 PIN，再用 `better-sqlite3` readonly、`query_only=ON` 和读取事务打开真实 PowerSync SQLite；读视图包含 WAL。adapter 拒绝 execute/writeTransaction。十 owner 的 repository-only composition 导出 V3，不初始化默认值或后台任务。

快照包含源 envelope、固定 exportedAt、source digest、源 lastActiveAt 和 inventory digest。源 inventory 对表内容与文件内容取 hash；不依靠大小/mtime。PowerSync 已知内部表明确列入白名单；底层 `ps_data__*` 由 logical view 检查，未知非空表和 `ps_untyped` 不被当作缓存跳过。

| 范围                                                                         | 当前行为                                                                                             |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Account、Preferences、Notification delivery preferences、Routine preferences | 仅补目标默认/缺失值；不同的目标自定义值保留，形成 `preserved_target` blocker                         |
| Goal、Task、Label、Schedule、Routine、Notification                           | 复制 V3 支持的业务事实和 portable refs，不重放历史业务事件/通知                                      |
| AI                                                                           | 仅 conversation shell；batch/ref 稳定映射，不能复活已软删除的目标 shell                              |
| Notification                                                                 | 不携带源实体 ID、导航/owner-command 链接；只保留可执行 archive action，历史交互作为事实保留          |
| 未覆盖资料                                                                   | Knowledge/Vault、附件、AI 消息/凭据、Routine protocol definitions/sessions、未知表/文件等阻止清理    |
| V3 未覆盖字段                                                                | soft-delete 事实、通知链接/额外 metadata/quiet hours、Goal 自定义排序和 record authorship 等阻止清理 |

`storage/mastra.db` 单独用只读事务检查：只有空表的 runtime 库允许清理，任意非空表阻止；其 WAL/SHM 不重复当作用户文件。遇到符号链接只读取链接目标字符串，不遍历外部 Vault；链接本身阻止自动清理。支持表集合和技术白名单由 Desktop inventory 显式维护，新增 owner/表必须审查覆盖，不能把未知事实自动归为可重建数据。

当前没有已持久化的昵称默认值来源证据，因此目标非空昵称一律保留；与源昵称不同会形成保留差异并阻止自动清理。

原始内容以 AES-256-GCM 加密存到 `shared/profiles/imports/<targetProfileId>/<requestId>.bin`，使用已解锁目标的 key。AAD 绑定目标 Profile/identity、源 Profile、requestId 和 source digest。JSON journal 只存状态、digest、bindings、manifest 和 blocker，不存 PIN/token/正文。确认服务端 committed 并持久化回执后删除 `.bin`；后续核验无需保留源正文快照。

## 4. HTTP 合约和有效计划

| 接口                                                     | 输入 / 输出                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `POST /api/v1/data-portability/profile-import/preflight` | `{requestId, content}` → `ProfileImportPlan`                                 |
| `POST /api/v1/data-portability/profile-import/commit`    | `{requestId, content, effectiveDigest}` → `ProfileImportCommitted`           |
| `GET /api/v1/data-portability/profile-import/:requestId` | 当前认证主体的 pending/committed operation；committed 会重新读服务端内容核验 |

请求/响应均有 Zod schema，使用既有 Result envelope。body 不接受 identityId；服务端从 middleware 取 principal。其他账户无法读取原 operation。服务器自行解析 V3、校验禁止字段和引用闭包、重算 source/effective digest。有效计划来自 owner 的目标保护策略；UI 数量来自这个计划。结构化 blocker 的 reason 为 `preserved_target | unsupported_user_data | unknown`，普通 warning 不授予删除权限。

preflight 持久化 pending operation，但不写入业务事实。同一 `(identityId, requestId)` 有唯一键，operationId/batchId 根据两者确定生成。相同 key 不同 source digest 返回 `IMPORT_REQUEST_CONFLICT`；相同已提交请求返回原结果，绝不重新 apply。

## 5. 并发准入和原子提交

V1 使用 PostgreSQL 真实写入 fence：按固定顺序对 `public`、`mastra` 全部持久业务表获取 `SHARE ROW EXCLUSIVE` 锁，并用 transaction advisory lock 串行化导入。普通 SQL writer 的 `ROW EXCLUSIVE` 与其冲突，因此 API、PowerSync CRUD、后台任务、通用导入、Agent 和 FK cascade 无需另接应用层账户锁。

**代价：预检和提交的短事务会暂停其他账户写入。** 锁等待最多 2 秒、单 SQL 最多 12 秒、整个 Prisma transaction 最多 15 秒；读请求继续。吞吐量需要更细粒度时，必须先证明所有写入口参与账户级 fence，不能只把当前锁换成单独 Account 行锁。

锁内依次确认 Active Account、九 owner 空摘要、目标字段策略和 effective digest，随后在同一个 transaction client 上执行十 owner apply、生成 bindings/manifests 并持久化 committed receipt。任一 owner 失败则全部回滚；事务内不发外部请求，不以反向删除补偿。源解析在锁外完成，必要最终验证在事务内完成。

其他设备先写业务返回 `TARGET_NOT_EMPTY`，摘要未知返回 `TARGET_UNKNOWN`；目标资料/偏好导致有效计划变化返回 `TARGET_CHANGED`。后者使 Desktop journal 回到 prepared，清除旧 plan 和删除勾选，要求重新预检并确认。排在导入提交后的普通写入按正常业务执行。

未来调度通过同事务内留下的 `schedulingReconciledAt=null` marker 恢复。worker 每 15 秒扫描最多 20 条 committed operation，用现有 Goal/Task/Routine projection sources 和稳定 scheduling keys 恢复未来 invocation；成功 CAS 标记完成，失败轮转重试。重启可继续，不重放历史通知。服务关闭先 stop，再 drain 在途恢复，随后才释放数据库。

## 6. 持久恢复与本地核验

服务端状态为 `pending | committed`。Desktop journal 状态为：

```text
prepared → preflight → committing → committed → verified
                                              verified → cleanup_pending → completed
```

- prepared：已保存加密快照，尚未获得有效预检结果；恢复重新 preflight。
- preflight：等待用户确认；恢复不会自动提交。
- committing：用户确认已落盘；先 GET 原 operation，只有仍 pending 才用原 requestId/content 提交。
- committed：服务端提交已确定，本机或服务端当前核验尚未全部通过；继续同步和恢复核验，不重新 apply。
- verified：本次有效计划在服务端和本机均通过。默认保留源；有 blocker 或源变化也保留。
- cleanup_pending/completed：已进入受控清理/清理完成。

错误保留在界面，持久阶段保持最后确定事实，不另造 rejected/blocked/cancelled 数据状态。HTTP 每步 25 秒超时，没有无限轮询；用户从导入记录恢复。关闭 UI 不撤销已提交操作，切换等待当前串行步骤结束后执行。

核验使用每 owner 的版本化内容 manifest 和 portable ref→目标键 bindings，覆盖支持的语义及关联，不以队列空、hasSynced、总行数或源文件 hash 代替。服务端 GET 用 RepeatableRead 读当前事实；本机直接只读目标 PowerSync SQLite，并比较相同映射的 manifest。缺少下载、目标修改/删除或读取失败均保持未通过，不能删除源。当前没有本机第二次 apply，也不依赖 alpha checkpoint requests。

## 7. 删除门禁和崩溃恢复

只有以下条件同时满足才进入清理：

1. 此 operation 的明确删除勾选已持久化（默认 false）。
2. 服务端回执与目标身份/原 source digest 对应，且当前 serverVerified 为 true。
3. 实际目标本地 owner manifest 匹配，localVerified 为 true。
4. 源仍是可访问的 inactive guest，PIN 校验通过。
5. 重新读取的 source digest、inventory digest、lastActiveAt 均与快照一致；源重新打开过也阻止清理。
6. 源和计划 blocker 均为零；删除前再次 GET 服务端核验通过。

最后核验不能与未来云端编辑组成全球事务；它证明此快照在核验时已经复制并在本机可用。用户随后修改或删除目标属于普通业务操作，不自动撤销。

清理复用 `ProfileCleanup`，手动本机移除也使用该实现：

1. 持久化 `shared/profiles/cleanup/<profileId>.json` tombstone（文件 fsync、rename、目录 fsync；Windows 不做目录 fsync）。Runtime 拒绝打开 tombstone 对应的 Profile。
2. 同盘原子 rename 到 `profiles/.deleting-<profileId>`，删除该受管理目录。不会沿符号链接递归外部 Vault，不执行云端业务 DELETE。
3. 目录删除成功后清理属于该目标 Profile 的导入 journal/快照及提示记录，再按 session → PIN → key → registry 顺序清理保护材料，最后移除 tombstone。
4. 启动恢复 pending tombstone；某个清理失败不妨碍其他 Profile 启动。导入 journal 为 cleanup_pending 但 tombstone 尚未创建时，必须重做源/PIN/服务端/本机核验，不能直接删除。

Profile ID 严格为 `p_` 加 24 位小写十六进制；IPC 不接受路径。物理删除开始后不承诺还原源。崩溃后按 tombstone/目录存在性继续，不能重建空源或先丢失唯一密钥。

## 8. 容量和验收边界

- V3 content 的 UTF-8 上限为 **100,000 bytes**，外层 JSON 字符串包装保守落在现有 256 KiB body limit 内；V1 无分块上传。
- 源 inventory 每表最多 10,000 行、目录最多 10,000 个条目、普通文件内容合计最多 512 MiB；超限失败保留源。
- 磁盘写入失败不会继续 preflight/commit 或清理；没有额外磁盘预留机制。
- 日志/renderer 不接收 token、密钥、完整 envelope；本机 journal 的诊断字段不上传源文件名或原始行。
- real-PG 已验证原子回滚、普通 SQL 并发 fence、幂等和未来调度恢复。真实 PowerSync 本地库可被只读 adapter 读取；所有 owner 的跨网络下载、真实多设备竞争、生产 OAuth、Windows/macOS 尚需独立验收。任何本机核验缺口都保留源，不能把 Linux fixture E2E 当作这些验收的替代。
