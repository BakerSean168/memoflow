# #865 Mastra 权威消息迁移设计

状态：设计定案中（只做设计，不含实施）

基线：`main` @ `6a0e06412`

关联：#868（窄修复，已合并）、#855（导入入口迁移）、#762（设计定案线做法）、ADR-096 §13、ADR-106 §5/§7。

## 0. 结论摘要

| # | 问题 | 结论 |
| - | ---- | ---- |
| 1 | 导出/可移植契约 | 新增 AI owner 能力 `ai-conversation-messages@1`，依赖 `ai-conversations@3`；envelope 仍为 `schemaVersion: 3`。payload 只放**可重算的 manifest**（每会话条数与摘要 + 归档摘要），消息正文走**同一次导入的 sidecar 归档**，不进 JSON 信封。 |
| 2 | 服务端导入落地 | 归档先分块暂存并在锁外解析校验；commit 时在**现有 Profile 导入的同一个 Prisma 事务**内，通过 tx 作用域的 AI 消息写入端口写 `mastra.mastra_threads` / `mastra.mastra_messages`，并以 `resourceId = 目标 identityId`、`threadId = 目标会话 id` 落位。 |
| 3 | 完整性核验 | 三层：分块/归档摘要 → 声明 manifest 与服务端从归档重算的 manifest 相等 → commit 内逐条读回、按 `(ordinal, role, type, content)` 重算摘要与声明相等。任一不等即整体回滚并按失败契约返回稳定 code。 |
| 4 | 幂等与可恢复 | 导入 apply 是单事务，天然无半成品；幂等键为 `(identityId, requestId)` + `(operationId, chunkIndex)` + `sha256(identityId, sourceMessageId)` 派生的目标消息 id，写入沿用 `ON CONFLICT(id)` 的既有语义；重跑只收敛，不新增。 |
| 5 | workflow / suspension | **开放决策，本设计不定案**。给出纳入 / 只读快照 / 明确排除三案及后果，并列出需用户拍板的问题。 |

贯穿原则：Mastra Memory 仍是唯一 transcript authority（`docs/internals/product/modules/ai.md`），不新增 Prisma 消息表、不做双写、不复制 workflow 状态机（ADR-096 §13/§15、ADR-106 §5）。

## 1. 现状事实（设计依据，非推测）

| 事实 | 真实位置 |
| ---- | -------- |
| 可移植信封只有编排元数据，能力 payload 由 owner 校验，能力自带 `schemaVersion` | `packages/data-portability-contracts/src/dtos/portable-v3.dto.ts:21-38`、`packages/data-portability-contracts/src/portable-capability.ts:39-59` |
| AI 现有可移植能力只有会话壳（`ref/name/status`，`.strict()`） | `packages/ai-contracts/src/portable-v3.ts:11-26` |
| 协调器负责依赖排序、预检 dry-run、apply、以及 apply 后逐能力重导出并比对摘要 | `packages/data-portability/src/server/application/portable-capability-coordinator.ts:125-160`、`:163-202`、`:204-293` |
| 服务端导入在单个 Prisma 事务内对 `public` + `mastra` 全部表取 `SHARE ROW EXCLUSIVE`，并设 `lock_timeout=2s`/`statement_timeout=12s`/事务 15s | `packages/data-portability/src/server/infrastructure/prisma-profile-import.ts:33-50`、`:153`、`:201` |
| 提交后 `verify()` 用 committed bindings 重新导出 manifest，只有摘要一致才给 `serverVerified=true` | `packages/data-portability/src/server/infrastructure/prisma-profile-import.ts:87-106` |
| 导入请求正文上限 100,000 UTF-8 bytes（更早的历史外层上限 256 KiB） | `packages/data-portability-contracts/src/profile-import.ts:6-7`；`apps/api/src/shared/infrastructure/middleware/global.ts:139-151` 的通用 parser 现为 2 MB |
| 消息写入真源是 `OrderedMemoryPostgres.saveMessages`：校验 thread/resource 归属、按 id `ON CONFLICT DO UPDATE` 且禁止改作用域、`createdAt` 只增不减 | `packages/ai/src/server/mastra/runtime/ordered-memory.postgres.ts:20-95`（作用域 `:33-56`，时钟 `:58-66`）；libsql 对等实现 `ordered-memory.libsql.ts:12-83`；时钟 `packages/ai/src/shared/history-order.ts:1-10` |
| 产品读回路径 `AssistantHistoryService.listMessages` 只把 user/assistant/system（及 `signal.type=user`）投影为消息，其它 signal 保留在库但不展示 | `packages/ai/src/server/mastra/runtime/assistant-history.service.ts:210-266`、`:45-66` |
| 会话壳标题即 `mastra_threads.title`；线程 id 等于会话 id | `assistant-history.service.ts:265-283`；`packages/ai/src/server/infrastructure/migrations/conversation-shell.source.ts:14-24` |
| 桌面 sidecar 导出只读 PowerSync SQLite，Mastra 库另开只读快照；`mastra.db` 任意非空表当前阻止清理 | `apps/desktop/src/main/profile/desktop-profile-import-service.ts:78-93`；`apps/desktop/src/main/profile/profile-source-inventory.ts:183-235` |
| 桌面本地核验只用本地 PowerSync 库的 owner manifest | `desktop-profile-import-service.ts:260-275`；`apps/desktop/src/main/profile/compose-profile-portability.ts`（无 mastra 读端口） |
| 桌面 AI 运行时始终是**本机 libsql**；Web 才经 HTTP 打服务端 Mastra | `apps/desktop/src/main/main.ts:684-687`；`apps/api/src/server.ts:380`；`apps/web/src/platform/di-app.ts` |
| 服务端「账户是否为空」把 `mastra_threads` / `mastra_messages` / `mastra_workflow_snapshot` 计入 AI 非空 | `packages/ai/src/server/infrastructure/business-data-presence.ts:43-56` |
| 表结构：threads(`id, resourceId, title, metadata, createdAt, updatedAt`)、messages(`id, thread_id, content text, role, type, createdAt, resourceId`) | `node_modules/@mastra/core/dist/constants-oyy31hJQ.js:3110-3173`（`TABLE_SCHEMAS`） |

两个必须正视的后果，后文直接依赖：

1. **100 KB 装不下真实聊天档案**，所以消息不能搭 `content` 字段，必须有独立传输通道。
2. 桌面云端 Profile 的 transcript 只在本机 libsql；服务端 Mastra 是 Web 的权威。导入的目标端是「云端 Profile 的 Memory」= 服务端 Postgres，桌面本机不会因导入自动获得消息副本（见 §7 D2）。

## 2. 导出/可移植契约

### 2.1 结论

- 新增能力 `ai-conversation-messages`，`schemaVersion = 1`，`dependsOn = ['ai-conversations']`。
- **不扩 `ai-conversations@3`**：它是 strict shell，扩字段会破坏 #868 之后「壳就是壳」的判定，也会让旧读取方把消息当壳的一部分静默丢弃。
- **不升 envelope 到 4**：V3 信封本来就是 owner 能力注册表，`schemaVersion` 是逐能力的；新增能力是既定扩展方式（ADR-106 §2/§7）。旧读取方遇到未注册 key 会抛 `Portable capability is not registered`（`packages/data-portability/src/server/application/portable-capability.ts:137`），即**失败关闭**，不会静默丢消息。这条代价必须接受并写进发布说明。
- 消息正文不进信封：信封只携带可重算的 manifest；正文作为**同一 `requestId` 的 sidecar 归档**，经分块暂存接口传输（§2.6）。

### 2.2 payload 契约（`ai-conversation-messages@1`，`.strict()`）

```ts
{
  archive: {
    digest: string;            // 归档摘要，定义见 2.4
    threads: number;           // 会话数（= threads.length）
    messages: number;          // 消息总条数
  };
  threads: [{
    conversationRef: string;   // 必须是本批 bindings 中的 ai-conversations ref
    messageCount: number;      // 该会话消息条数
    digest: string;            // 该会话有序消息摘要
  }];
}
```

约束：

- 每个 `conversationRef` 必须能在 `context.references` 中解析，且来自 `ai-conversations` 能力（与其它 owner 一致，`portable-capability.ts:4-17`）。
- `threads` 与 `archive.threads` 必须自洽；`messages` 必须等于各 `messageCount` 之和。校验在 `payloadSchema.superRefine` 内完成，错误不许进入 apply。
- 没有消息时 `export()` 返回 `null`，信封中不出现该能力（与其它 owner 一致）。
- 不携带来源 identity、来源 thread id、来源消息 id、provider、模型、密钥、`mastra_resources`、workflow、trace、向量索引。

### 2.3 会话与身份映射

| 源事实 | 目标事实 |
| ------ | -------- |
| `mastra_threads.resourceId` = 源 identity | 丢弃；目标 `resourceId` = 目标 `identityId`（host 注入，`profile-import` 不接受 body 里的 identity） |
| 源 thread id = 源会话 id | 目标 thread id = `ai-conversations` 能力为同一 ref 生成的确定性 id（`packages/ai/src/server/application/ai-conversation-portability.ts:44-49` 的 `targetId`），apply 时由 `context.references.bindImportedReference` 绑定 |
| `mastra_threads.title` = 会话名 | 目标 = 已导入会话的 `name`；断言相等，不另存标题 |
| `threads.metadata` | 必须为空对象 `{}`；非空即视为未覆盖事实 → blocker（见 §2.7），不猜测语义 |
| `mastra_resources` | 不迁移。存在非空 working memory/metadata 时按未覆盖事实 block，保证源不被删 |
| 消息 id | 不直接复用；目标 id = `imp-<sha256(identityId + '\0' + sourceMessageId) 前 40 hex>`。理由：`mastra_messages.id` 是全局主键，同一源档案导入两个不同云端账户时复用过 id 会触发 `Message scope cannot change`（`ordered-memory.postgres.ts:33-52`），派生 id 才不会跨账户撞作用域 |

### 2.4 归档格式与摘要定义

归档是**行式文本**（NDJSON，逐块 gzip 可选），内容只有两类行：

```jsonc
{"k":"thread","v":1,"ref":"ai-conversations:3","createdAt":1699999999000,"updatedAt":1699999999000}
{"k":"message","v":1,"ref":"ai-conversations:3","ordinal":17,"sid":"<源消息 id>","role":"assistant","type":"text","content":"<原始 content 列文本>","createdAt":1699999999123}
```

- `content` 原样保留库里的字符串（可能是 `{"format":2,"parts":[...]}`），不做解析后重排，避免任何规范化造成的语义漂移；上限 1 MiB/条。
- `ordinal` 是会话内位置（0 起），不是时间戳顺序的替代物；导出时按 `createdAt, id` 排序后编号。
- `sid` 只用于目标端派生幂等 id（§2.3），**不参与摘要、不进入 payload**：目标库里没有源消息 id，任何含 `sid` 的摘要都无法在目标端复算。
- 字节数与压缩只属于传输事实（`uncompressedBytes` 在 `prepare` 请求里），不进入 payload 与摘要，理由同上：读回端不能复现源文件的精确字节。
- 摘要定义（源导出与目标读回**共用同一个 canonicalizer**，不得各写一份）：

```text
messageDigest_i = sha256(JSON([ordinal, role, type, sha256(content)]))
threadDigest     = sha256(join(messageDigest_0..n-1))        // 按 ordinal
archiveDigest    = sha256(JSON(sortedByRef([ref, messageCount, threadDigest])))
```

摘要刻意**不包含**消息 id 与 `createdAt`：id 是目标端派生值，`createdAt` 可能被 `nextHistoryTimestamp` 在等值时 +1ms（`history-order.ts:2-4`、`ordered-memory.postgres.ts:58-64`）。顺序由 ordinal 表达，读回时按 `createdAt` 排序即可恢复同一 ordinal 序列。

导出实现细节（设计约束，非代码）：

- 桌面导出必须用 `readProfileSqliteSnapshot(mastraPath)` 只读快照 + 原生 `SELECT` 读 `mastra_threads/mastra_messages`，不得在快照上启动第二个 Mastra Memory 实例（会尝试迁移/写入）。
- 服务端导出用导入同一个 Prisma tx 的 raw SQL 读 `mastra.*`；与 `business-data-presence.ts` 的 schema 前缀一致。
- 只导出「有存活会话壳」的线程；有消息但无壳的线程属于孤儿，按 blocker 处理（§2.7）。
- ref 必须复用注册表：源导出时 `ai-conversations` 先声明 ref，消息导出用 `resolveExportReference`（缺失即孤儿）；目标读回时 registry 由 committed bindings 预置（`portable-reference-registry.ts:21-31`），因此用目标会话 id 再声明会得到**原 ref**，摘要才可比。不要自己按序号重排 ref。
- 导出只投影 `LIST` 内的列，不 `SELECT *`，避免把 Mastra 未来新增列当产品事实带走。

### 2.5 与现有 V3 面的关系

| 面 | 行为 |
| -- | ---- |
| `POST /data-portability/export`（Web 导出） | 信封仍是单个 JSON；新增 `ai-conversation-messages` 后必须**同时**产出 sidecar 归档文件（并给出 `archiveDigest`）。只返回信封而不给归档 = 不可恢复的半成品，禁止。归档字节由 AI owner 的独立读端口在同一个一致性读快照内产出，`PortableCapability.export()` 只返回 manifest（接口本身没有「导出二进制」的位置，不要硬塞进 payload）。 |
| `POST /data-portability/dry-run` / `apply`（通用 V3） | 不接归档传输。遇到 `ai-conversation-messages` 必须**显式拒绝**并返回 `IMPORT_ARCHIVE_REQUIRED`，不得当成「0 条消息」通过。 |
| Profile 导入（preflight/commit） | 唯一支持消息恢复的通道，见 §3。 |
| `server-held-data-disclosure` | 文案与口径需同步：消息从「不可导入」改为「可经 Profile 导入恢复」，但 attachments/provider secret/workflow 仍属不可导入。 |

### 2.6 传输与容量

- 新接口（同一 `/data-portability/profile-import` 资源族）：
  - `POST /profile-import/:requestId/archive/prepare`：`{ archiveDigest, codec: 'ndjson' | 'ndjson+gzip', chunkCount, uncompressedBytes }` → 返回已存在的分块状态（幂等）；同 requestId 换 codec 或摘要即为冲突。
  - `POST /profile-import/:requestId/archive/chunk`：`{ index, digest, data(base64) }`，单块解码后 ≤ 96 KiB，复用现有 2 MB JSON parser 与 Result envelope。
  - `POST /profile-import/:requestId/archive/complete`：服务端校验全部块与归档摘要，解析 NDJSON 并在**锁外**重算 manifest，持久化 `archiveState=complete` 与 `computedManifest`。
- 这三步**不写任何业务事实**，与 preflight 的「pending 不落业务数据」一致；preflight 只比对 `computedManifest` 与信封内声明的 manifest。
- 上限（定案值，写入 contract 常量）：解压后 ≤ 64 MiB、消息 ≤ 100,000 条、单会话 ≤ 50,000 条、content 单条 ≤ 1 MiB。超限返回 `IMPORT_LIMIT_EXCEEDED`，**不截断**。
- 分块幂等：同 `(operationId, index)` 且 digest 相同 → 覆盖写同字节并返回成功；digest 不同 → `IMPORT_ARCHIVE_MISMATCH`。
- 暂存数据与 pending operation 同生命周期；committed 或超过 72h 未完成即清理（后台清扫，非导入事务内）。

### 2.7 源清单覆盖规则（决定 deleteSource 能否成立）

`profile-source-inventory.ts:183-235` 目前对 `mastra.db` **任意非空表**一律 `block('storage/mastra.db')`。本设计要求改为按表判定，且必须与本次实际导出的 manifest 对账：

| 表 | 判定 |
| -- | ---- |
| `mastra_threads` / `mastra_messages` | 仅当该库的会话/消息集合与 `ai-conversation-messages` manifest 逐项一致（条数 + 摘要）时视为已覆盖；不一致 → `storage/mastra.db:messages-uncovered` |
| `memoflow_goal_event_meta` 单行 epoch | 维持 #868 的现有豁免 |
| `mastra_resources` | 空表忽略；非空 → `storage/mastra.db:resources` |
| `mastra_workflow_snapshot` | 按 §5 的开放决策处理；决策前保持阻止 |
| 其它任何非空表 | 保持阻止（不新增白名单） |
| 有消息但无存活壳的线程 | `storage/mastra.db:orphan-thread` |
| 附件文件（`file` part 指向的本地文件） | 仍按普通文件 block：附件二进制不在本设计范围内 |

同时把归档摘要并入 `inventory.digest`，使「导出后又聊了新消息」在删除前复核时必然失败（`desktop-profile-import-service.ts:276-283` 的 `sourceUnchanged`）。

## 3. 服务端导入落地

### 3.1 结论

消息由**服务端**写入目标云端 Profile 的 Memory，且必须写进**现有 Profile 导入事务**：

```text
暂存/校验(无锁) → preflight(锁内，仅比对摘要) → commit(锁内，单事务)
  → ai-conversations.apply 绑定目标会话 id
  → ai-conversation-messages.apply：INSERT mastra_threads + mastra_messages（tx）
  → 逐条读回并比对 manifest（同 tx）
  → committed + serverVerified
```

### 3.2 为什么必须在同一个事务里、而不能调 `AssistantHistoryService`

`prisma-profile-import.ts:33-50` 在事务内对 `public`、`mastra` 的所有表加了 `SHARE ROW EXCLUSIVE`。Mastra 运行时用的是**另一条连接池**（`PostgresStore` 自建连接，`packages/ai/src/server/mastra/runtime/storage.ts:17-19`），其写入需要对同一批表拿 `ROW EXCLUSIVE`，必然与导入锁冲突；而事务里 `lock_timeout=2s`、`statement_timeout=12s`，结果只会是超时失败，且失败形态不可解释。

因此：**不得**在导入事务内调用 `AssistantHistoryService.appendUserTurn` / `Memory.saveMessages` / `createThread`。正确做法是新增一个 tx 作用域的 AI 消息端口，把 `OrderedMemoryPostgres.saveMessages` 的三条不变量用同一份共享实现表达：

1. 作用域检查：thread 存在且 `thread.resourceId === message.resourceId`，既有消息不得改 `thread_id` / `resourceId`；
2. 幂等写入：`INSERT ... ON CONFLICT(id) DO UPDATE SET content, role, type`（不动 `createdAt`）；
3. 逻辑时钟：`createdAt = max(requested, threadLatest + 1)`，只在首次插入时分配。

实现形态（供实施线）：把上述 SQL/时钟抽成 `@memoflow/ai` 内一个共享函数，`OrderedMemoryPostgres` 与 `createAiMessageImportPort(tx)` 都调用它，避免两份 SQL 漂移。导入侧用批量 `INSERT ... SELECT FROM unnest(...)`，一次语句写完一个会话的消息，控制 15s 预算。

### 3.3 落地步骤（设计级）

1. `preflight`：解析信封、比对 `computedManifest` 与 payload（O(threads)），`planProfileCopy` 走既有 dry-run；此时 `ai-conversation-messages.dryRun` 只回 `created = messages`，不写库。`validateImport` 必须确认：归档已 `complete`（否则 `IMPORT_ARCHIVE_UNAVAILABLE`）、每个 `conversationRef` 都出现在同批 `ai-conversations` payload 中、且目标端不存在同 id 或同名的会话冲突（目标账户必须为空）。
2. `commit`：既有 `applyProfileCopy` 顺序不变，`ai-conversations` 先 apply 并绑定 ref→targetId。
3. 消息 apply：
   - 逐个 thread：按 ref 解析目标会话 id；断言目标 thread 不存在（目标账户为空，防止意外覆盖）；`INSERT` thread 行（`title` = 会话名，`metadata = '{}'`）。
   - 按 ordinal 升序批量 `INSERT` 消息行，`resourceId = identityId`，`thread_id = targetConversationId`，`content` 原样，`createdAt` 走逻辑时钟。
   - `UPDATE mastra_threads SET "updatedAt"` 与既有写入语义一致。
4. 失败：任何一步抛错 → 整个 Prisma 事务回滚，`profile_import_operations` 仍为 `pending`，暂存归档保留，`committed` 不会产生。**没有部分导入状态**。
5. 事务外后置：不清 `mastra_resources`、不跑 workflow 恢复、不发通知。
### 3.4 失败形态

新增 `ProfileImportErrorCode`（`profile-import-error.ts:3-19` 的既有集合上追加），沿用 Result envelope 与「UI 只认 code」的失败契约（`docs/internals/standards/failure-and-outcome-contracts.md` §3–§4）：

| code | HTTP | 触发 | 产品行为 |
| ---- | ---- | ---- | -------- |
| `IMPORT_ARCHIVE_REQUIRED` | 409 | 通用 apply/dry-run 遇到消息能力但无归档 | 阻止，引导使用 Profile 导入 |
| `IMPORT_ARCHIVE_MISMATCH` | 409 | 分块/归档摘要不符，或声明 manifest ≠ 服务端重算 | 阻止，保留源，可重传 |
| `IMPORT_ARCHIVE_UNAVAILABLE` | 409 | commit 时暂存缺失/未完成 | 阻止，要求重传归档后重新预检 |
| `IMPORT_VERIFICATION_FAILED` | 409 | 目标读回条数/摘要不一致 | 事务回滚；不回执 committed |
| `IMPORT_LIMIT_EXCEEDED` | 413 | 超过 §2.6 上限 | 阻止；明确告知超限，不截断 |

UI 只按 code 映射本地化文案（`packages/app-vue/src/locales/{zh-CN,en-US}/shell.ts` 的 `profileImport.errors`），不得直出服务端 message 或 Mastra/Prisma 原文。

### 3.5 为什么这能证明「目标端 Memory 真的拿到了消息」

- 写入的表、schema、列与 `OrderedMemoryPostgres` / `AssistantHistoryService.listMessages` 读的是同一组（`assistant-history.service.ts:210-266`，`business-data-presence.ts:43-56`）。
- 写入的作用域是目标 `identityId`，与 `getThreadById({threadId, resourceId})` 的归属检查一致（`assistant-history.service.ts:265-283`）：读不到即归属错，读得到即归属对。
- 提交后用**产品读回路径**取证（验收）：服务端 `listMessages` 返回条数 = manifest，Web 打开会话可读。这不是「文件已在服务端」的间接证明，而是同一运行时同一表的读回。
- 反向证明：目标账户判空在 commit 内重新执行（`prisma-profile-import.ts:77-86`），导入后摘要必为 non_empty，说明写入的确实是业务事实而非旁路缓存。

## 4. 完整性核验

### 4.1 manifest 与计数

- 每个会话一条 `{conversationRef, messageCount, digest}`；总条数在 `archive.messages`。
- 计数**不**塞进 `ProfileImportManifestSchema`（`packages/data-portability-contracts/src/profile-import.ts:37-43` 是 strict 且已持久化在旧 resultJson 中，扩字段会让历史 operation 解析失败）。计数以两种方式可见：
  - 能力 receipt：`created = 写入消息条数`，`skipped = 0`（目标为空账户）；
  - committed receipt 的 `manifests[]` 摘要相等即证明计数与内容整体相等（摘要输入含 `messageCount`）。
- 这是刻意的取舍：新增字段的兼容成本高于把计数放进 payload + receipt 的信息损失。

### 4.2 三层核验

| 层 | 时机 | 内容 | 失败 |
| -- | ---- | ---- | ---- |
| L1 归档完整性 | 上传/complete，锁外 | 每块摘要、`archiveDigest`、解压后字节数 | `IMPORT_ARCHIVE_MISMATCH` |
| L2 声明对归档 | preflight，锁内 O(threads) | 信封 payload manifest == 服务端从归档重算的 manifest（含条数/摘要/线程数） | `IMPORT_ARCHIVE_MISMATCH` |
| L3 目标对声明 | commit，事务内 | 逐 thread：`SELECT role, type, content, "createdAt" FROM mastra.mastra_messages WHERE thread_id=$1 ORDER BY "createdAt"`，按 ordinal 重算 `messageDigest/threadDigest`；再算 `archiveDigest` 与 payload 比较；同时断言该 identity 下的 thread 集合恰好等于本次导入的会话集合（无多、无少） | `IMPORT_VERIFICATION_FAILED`，事务回滚 |

L3 的读回必须用**同一 tx**：`applyProfileCopy` 的 readback 走 `owner.exportValidated({identityId, references})`（`portable-capability-coordinator.ts:163-202`），而 tx 作用域的 capability 天然读到未提交行；若改成走 Mastra 运行时连接池，则读不到未提交行、也拿不到一致性。读回按 thread 一次 `SELECT` 取回全量行后在内存流式计算摘要，不逐条查库；这是为了守住 `statement_timeout=12s` / 事务 15s 的预算。

「一条不缺」的证明链：L2 保证归档没被裁剪/替换，L3 保证库里的行与归档逐条对应；两者都通过才 `serverVerified = true`（`prisma-profile-import.ts:96-105`），而 `serverVerified` 是删除源的必要条件（`desktop-profile-import-service.ts:274-276`、`291-296`）。

### 4.3 本机核验的边界（重要）

桌面 `readProfileManifests` 只读目标本地 PowerSync SQLite（`desktop-profile-import-service.ts:260-275`），而云端 Profile 的消息在服务端，桌面本机 `mastra.db` 里没有。若沿用现状，`ai-conversation-messages` 会在本地被重算为「空」→ 摘要不等 → `localVerified` 永假 → 永远不能清理源。

本设计的处理（推荐，但需拍板，见 §7 D2）：把该能力标记为 **server-scoped**：

- 桌面本地 manifest 比对前先按 `serverScopedCapabilities` 过滤 `result.manifests` 的 key（否则 `resolveDependencyOrder` 会因本地未注册该能力而抛错，`portable-capability-coordinator.ts:191-193`）；
- server-scoped 能力的最终依据是 `serverVerified=true`，而 GET 会重新读取目标端事实（`prisma-profile-import.ts:87-106`），删除前还会再 GET 一次（`desktop-profile-import-service.ts:286-296`）；
- 不因此在目标桌面再写一份 mastra 副本（会形成第二份 transcript authority，违反 ADR-096 §15）。

### 4.4 核验不通过的产品行为

- 一律**阻断**：事务回滚、operation 保持 pending、源保留、删除勾选失效。
- 错误只以稳定 code 呈现；UI 显示「导入校验未通过，请重试或联系支持」，附带 `requestId` 供排障（不显示条数差异以外的内部细节，更不显示消息内容）。
- 不允许「部分成功」文案，不允许自动降级为「只导入会话壳」——那正是 #865 要消灭的静默丢消息。

## 5. 幂等与可恢复

### 5.1 幂等键

| 层级 | 键 | 语义 |
| ---- | -- | ---- |
| 导入请求 | `(identityId, requestId)`（既有唯一键 `@@unique([identityId, requestId])`） | 同 key 同 `sourceDigest` 返回原计划/原结果；不同 digest → `IMPORT_REQUEST_CONFLICT` |
| 归档分块 | `(operationId, chunkIndex)` + `chunkDigest` | 同字节重传成功；不同字节冲突 |
| 目标会话 | `sha256(identityId, requestId, conversationRef)`（既有 `targetId`） | 同一次导入重跑得到同一会话 id |
| 目标消息 | `sha256(identityId, sourceMessageId)`（不含 requestId，见 §2.3） | 同账户重跑得到同一消息 id；不同账户天然不同 |
| 消息写入 | `ON CONFLICT(id) DO UPDATE` + 作用域守卫（既有） | 即便出现重复提交，内容收敛而非新增 |

### 5.2 各中断点

| 中断点 | 服务端状态 | 重跑行为 |
| ------ | ---------- | -------- |
| 归档上传中途 | `archiveState=partial`，无业务写入 | 重传缺块；`prepare` 返回已有块索引；不重复解析 |
| complete 后 preflight 前 | `computedManifest` 已存 | 直接进 preflight |
| preflight 后 commit 前 | `pending` + plan | 桌面「committing」态按原 requestId 重提；先 GET 确认仍 pending |
| commit 事务中途崩溃 | 事务回滚，`pending`，归档仍在 | 重跑 apply 一次，写入从零开始，结果与首次相同 |
| commit 已提交、回执未落盘 | `committed` + resultJson | GET 返回 committed 并重算 `serverVerified`，**不再 apply**（`prisma-profile-import.ts:169-170`） |
| 桌面本地核验前崩溃 | `committed` | 只补读回与删除门禁，不重传归档（committed 后快照可丢弃，`desktop-profile-import-service.ts:255-256`） |

### 5.3 收敛语义

- 任意次数重跑后：目标 `mastra_messages` 中属于本批的集合 = 源归档集合，逐条内容一致、顺序一致、无重复 id、无跨会话串位。
- 不收敛的唯一情形是「源在导出后变化」：`sourceDigest` / `inventoryDigest` 不一致 → 冲突或 `TARGET_CHANGED`，要求重新预检；这是正确行为，不自动合并。
- 归档解析失败不入库；已解析的 `computedManifest` 不能被后续分块覆盖（complete 之后 chunk 接口返回 409）。

### 5.4 暂存清理

- committed 后立即删分块（与删除加密快照同一时机）。
- pending 超过 72h 由后台任务清理；清理只删暂存，不动业务表，也不改 operation 状态。
- 暂存表属于技术数据，不参与 `BusinessDataSummary` 判空；但它挂在 `Account` 上并随账户级联删除。

## 6. workflow / suspension 数据（开放决策）

**本设计明确不定案此点，不替用户决定。** 现状事实：

- suspended run 的状态在 `mastra_workflow_snapshot`（含 `run_id`、`snapshot`、`resourceId`），assistant 的 ask-user/approval 挂起由运行时 `listSuspendedRuns` 读取（`mastra-ai.runtime.ts:492-520`、`:759-768`）。
- ADR-106 §5 明确把「AI execution logs / vector index / **runtime checkpoints**」排除在 V3 能力之外；ADR-096 §15 明确拒绝复制 workflow 状态机与「用 localStorage 恢复整个 durable workflow」。
- ADR-096 §14 保护契约要求 workflow suspend/resume/cancel/retry 行为不退化。
- 现状 inventory 对 `mastra_workflow_snapshot` 非空一律 block（`profile-source-inventory.ts:213`）。

### 方案 A：明确排除（保持阻止）

- 内容：`mastra_workflow_snapshot` 不进入可移植契约；只要非空就保留 blocker，源不可删。
- 后果：含挂起审批/中途 workflow 的档案仍无法「完整导入 + 删除源」，但这部分数据本来就没有可恢复语义；用户会看到明确的 blocker 而不是静默丢失。实现最小、风险最低、与 ADR-106/096 一致。
- 代价：Issue 验收里「deleteSource 可用」只对「没有 workflow 行」的档案成立，需要在验收中显式构造该前提。

### 方案 B：仅迁移终态快照为只读历史

- 内容：只导出 `status=success/failed/canceled` 的 snapshot，作为只读历史挂到会话上，不可 resume。
- 后果：需要新的只读产品面（否则数据不可见，等于白迁）；需要定义跨 identity 的 `runId` 语义；无法 resume 的 snapshot 仍是「看起来能恢复」的诱饵，UI 必须强约束。收益低、表面成本高。

### 方案 C：纳入并恢复可挂起状态

- 内容：迁移 snapshot 并重建 suspend/resume 能力。
- 后果：直接违反 ADR-096 §14/§15 与 ADR-106 §5；`runId`/`toolCallId` 与源 identity 的 approval receipt 绑定，跨账户恢复等于把源账户的授权决定带进目标账户（安全问题）；需要证明 provider 侧状态可重建，而 Mastra 不承诺这一点。**本设计不推荐**。

### 需要用户拍板的问题

1. 采用 A / B / C 哪一案？若选 A，是否接受「含 workflow 行的档案不可删源」作为长期产品边界？
2. 若选 A，`mastra_workflow_snapshot` 的 blocker 文案是否要拆成独立 reason（如 `unsupported_runtime_state`），以区别于「未知数据」？
3. `assistant_approval receipt` / `runOutcome` 已内嵌在消息 `content.metadata.memoflow-runtime` 中，属于消息正文，**本次随消息迁移**。这是否符合预期？（本设计按「随消息迁移」处理，因为它不涉及 resume 能力。）
4. 是否存在「必须迁移挂起会话」的真实用户场景？若有，请给出一条可验收的产品行为（例如「挂起会话迁移后显示为只读并提示需重新发起」），否则 A 案即可收口。

## 7. 待决事项（设计外的拍板点，含推荐）

| ID | 问题 | 推荐 | 影响 |
| -- | ---- | ---- | ---- |
| D1 | 是否接受新增 capability 使**旧版本客户端**无法导入新导出文件（失败关闭） | 接受。V3 的扩展机制就是能力注册表；失败关闭优于静默丢消息。发布说明写明「先升级再导入」 | 兼容性 |
| D2 | 云端 Profile 的 transcript 在桌面上读不到（本机 libsql 与服务端 Mastra 是两套存储）。删除门禁是否接受 `ai-conversation-messages` 为 server-scoped | 接受，并在 §4.3 的规则下放行删除；**不**在目标桌面写第二份 mastra 副本。跨端 transcript 读取另开单 | 删除门禁语义、验收口径 |
| D3 | 通用 `/apply` 是否也要支持消息归档 | 本期不支持，返回 `IMPORT_ARCHIVE_REQUIRED`。通用 V3 是「小体量 owner 事实」通道，分块传输只服务 Profile 导入 | 传输面 |
| D4 | 附件（`file` part）是否随消息迁移 | 不迁移二进制，仅保留 content 中的引用；引用文件存在时 inventory 继续 block，源保留 | 「完整导入」的边界 |
| D5 | Local Agent（`ai_local_conversation_items`）transcript 是否纳入 | 不纳入。它是另一个 runtimeKind 的独立存储，#865 只覆盖正常 Assistant；另行立单 | 验收范围 |
| D6 | 100k messages / 64 MiB 上限是否合适 | 作为首版定值，超限显式失败；若真实档案普遍超限，再开分片 apply（那会牺牲单事务原子性，必须重新设计） | 容量 |

## 8. 实施边界（供后续实施线，不含代码）

必须改动的契约与 owner 面（仅列举，不在本单实施）：

- `@memoflow/ai-contracts`：新增 `ai-conversation-messages@1` payload schema；`portable-v3.ts` 保持 `ai-conversations@3` 不变。
- `@memoflow/ai`：新增 tx 作用域的消息导入端口与 manifest 计算（与 `ordered-memory.postgres.ts` 共用时钟/幂等实现）；`ai-profile-import.ts` 组合出第二个能力。
- `@memoflow/data-portability`：归档暂存仓储（新 Prisma 模型 + 清理任务）、三个 archive 路由、`profile-import-error.ts` 新 code、preflight 的 L2 比对、committed 后清理暂存。
- `@memoflow/data-portability-contracts`：archive 请求/响应 DTO、上限常量、`ProfileImportErrorCode` 扩展。
- Desktop：`profile-source-inventory.ts` 的表级覆盖判定与归档摘要入 inventory digest；`desktop-profile-import-service.ts` 的归档导出/上传/重传与 server-scoped manifest 过滤；`compose-profile-portability.ts` 注册导出侧只读消息能力（仅导出，不导入）。
- 文档：`docs/internals/desktop-profile-import-protocol.md`（容量/接口/核对口径）、`docs/internals/product/modules/ai.md`（可移植边界从「仅壳」改为「壳 + 消息」）、`server-held-data-disclosure` 文案。
- 明确不做：Prisma 消息表、双写、workflow 迁移、附件迁移、通用 apply 分块、`AiMessage` 回退。

## 9. 验收映射（Issue 验收如何被证明）

| Issue 验收 | 证明方式 |
| ---------- | -------- |
| 带真实多轮对话的本地 Profile 导入到 completed | 构造含 ≥2 会话、≥20 条消息（含 tool 调用与 runtime receipt）的源；preflight→commit 全绿；`serverVerified=true` |
| 目标端打开会话能读到全部消息、与 manifest 计数一致 | 服务端 `AssistantHistoryService.listMessages` 逐会话读回，条数 == payload `messageCount`，首末条内容与源一致；Web 会话页可见（Playwright 取证） |
| deleteSource 可用 | 导入后源 inventory blockers 为 0（消息已覆盖、无 workflow 行、无附件），服务端 GET 复核 `serverVerified` 通过，源 digest 未变 |
| 中断重跑一次不产生重复 | 在 commit 事务内注入失败后重跑：`mastra_messages` 在该 thread 下 id 唯一、条数不变；再断在 committed 前重跑：GET 直接返回 committed，不触发第二次 apply |
| 一条不缺 | L2 + L3 摘要相等；人工抽查任一 thread 的 ordinal 序列与源一致 |
