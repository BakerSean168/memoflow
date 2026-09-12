---
tags:
  - adr
  - setting
  - preferences
  - persistence
  - powersync
  - portability
  - migration
  - vnext
description: ADR-095 - User Preferences 按 namespace 持久化、revision/CAS、PowerSync parity、versioned migration 与 Data Portability 边界
created: 2026-09-08T23:26:00+08:00
updated: 2026-09-10T15:45:00+09:00
---

# ADR-095: Preference Persistence、Sync、Migration 与 Portability

**状态：** 已采纳并完成 Setting 主体实施（SETTING-9202~9209；PORT-1603 负责跨模块 V2 envelope 最终退休）
**日期：** 2026-09-08
**影响范围：** Setting/Preferences、Database、PowerSync、HTTP/IPC、Data Portability、Account、Notification、Desktop

## 1. 决策摘要

MemoFlow 退休当前单行 giant JSON：

```text
user_settings(identityId, preferences JSON, version)
```

改为**按 canonical preference namespace 分行**：

```text
UserPreferenceRecord
├── id
├── identityId
├── namespace
│   ├── presentation
│   └── regional
├── payload
├── revision
├── createdAt
└── updatedAt

unique(identityId, namespace)
```

目标：

1. Setting ownership 收缩后，存储形态与真实 namespace 一致；
2. theme 变更不再覆盖 timezone namespace；
3. revision 变成真实并发 contract，而不是只自增不校验的装饰字段；
4. Prisma/PowerSync 以相同 namespace row 为同步粒度；
5. import/export 使用严格 versioned schema + deterministic migrator；
6. Data Portability 继续是跨模块 orchestrator；
7. migration 完成后删除 `user_settings.preferences`、`Account.settings` 等 shadow truth，不长期双写。

## 2. 当前 persistence 缺陷

当前 Aggregate patch：

```text
patchCategory
  -> version += 1
```

但 Prisma 保存：

```text
upsert by identityId
  -> update entire preferences JSON
```

没有：

```text
WHERE version = expectedVersion
```

因此当前 `version` 不是 optimistic concurrency control。

两个设备可能：

```text
A reads {theme:auto, timezone:Shanghai}
B reads {theme:auto, timezone:Shanghai}

A writes theme=dark
B writes timezone=Tokyo from stale full JSON

=> B can overwrite A's unrelated theme change
```

这就是 giant singleton JSON 的实际并发风险。

## 3. Persistence target

建议 Prisma target：

```prisma
model UserPreferenceRecord {
  id         String   @id
  identityId String   @map("identity_id")
  namespace  String
  payload    Json
  revision   Int      @default(1)
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  account Account @relation(fields: [identityId], references: [id], onDelete: Cascade)

  @@unique([identityId, namespace])
  @@index([identityId])
  @@map("user_preference_records")
}
```

`namespace` 不是开放字符串 registry；application/contracts 只允许 closed enum：

```text
presentation
regional
```

未来新增 namespace 必须：

- 有真实产品 owner；
- 有 strict schema；
- 有 defaults/migration；
- 有 portability policy；
- 更新 registry tests。

## 4. Namespace atomicity

每个 namespace 是最小 cloud synchronization unit。

因此：

```text
presentation.theme update
```

永远不会 rewrite：

```text
regional.timeZone
```

这是本轮必须保证的并发改进。

同一 namespace 内的并发 mutation 视为同一 preference document revision；不承诺自动做任意 JSON field CRDT merge。

## 5. Revision / optimistic concurrency

### 5.1 Online command

目标 mutation：

```text
PatchPreferenceNamespace
├── namespace
├── patch
└── expectedRevision?
```

若提供 `expectedRevision`：

```text
UPDATE ...
WHERE identityId = ?
  AND namespace = ?
  AND revision = expectedRevision
```

成功：

```text
revision = revision + 1
```

失败：

```text
PreferenceRevisionConflict
```

返回 latest read model/revision，客户端选择：

```text
reload -> reapply user intent
```

而不是静默覆盖。

### 5.2 Creation race

首次创建 namespace 由 unique `(identityId, namespace)` 做原子 fence；并发 create 最终收敛到一个 row，第二个 writer 重新读取后按 patch/revision 路径处理。

## 6. PowerSync parity

PowerSync schema 必须与 canonical row 对齐：

```text
user_preference_records
├── identity_id
├── namespace
├── payload
├── revision
├── created_at
└── updated_at
```

最低验收：

1. Prisma round-trip 与 PowerSync round-trip 对同一 payload/revision 等价；
2. presentation/regional 两个 row 可独立 offline mutation；
3. 一个 namespace 的 sync 不重写另一个 namespace；
4. profile/identity scope 不串号；
5. unknown namespace 拒绝进入 domain/client read model；
6. conflict/reload 行为有 fixture，不依赖“理论上 PowerSync 会处理”。

本 ADR 不要求本轮引入通用 CRDT。

## 7. Domain model simplification

当前 `UserSetting extends AggregateRoot` 承担：

```text
JSON
Zod validation
patch/reset
version
import/export
```

目标可以收敛为：

```text
UserPreferenceDocument(namespace)
+ strict schema
+ PreferenceApplicationService
+ repository
```

是否继续继承 `AggregateRoot` 不是业务目标。

若没有需要 domain event/invariant coordination 的行为，可以退化为 typed state/document；不得为了 DDD 形式保留无价值 ceremony。

## 8. Typed mutation only

退休长期公共接口：

```text
get(key: string)
set(key: string, unknown)
```

目标：

```text
getPreferenceProfile()
getPreferenceNamespace(namespace)
patchPreferenceNamespace(namespace, typed patch)
resetPreferenceNamespace(namespace)
resetUserPreferences()
```

Transport schema 也必须 discriminated/registry-backed，不接受 arbitrary category name + arbitrary record。

## 9. Strict Zod behavior

当前 `validateCategoryPatch` 对 `.partial()` object schema 做 parse；Zod object 默认可能 strip unknown keys。

这会造成：

```text
client sends typo key
-> payload appears accepted
-> unknown key disappears
```

甚至 event 仍可能记录原 patch，使“审计变化”和实际持久化变化不一致。

目标所有 preference schema：

```text
.strict()
```

并验证 merged result，而不是只验证输入 patch 的局部形状。

## 10. Reset semantics

Reset 必须针对 canonical owner：

```text
Reset presentation
Reset regional
Reset all User Preferences
```

Settings Hub 的“重置所有设置”不得偷偷：

- 删除 AI provider；
- reset Notification owner；
- reset local Vault；
- reset account password；
- reset device keymap；

除非 UI 明确做一个跨模块 destructive orchestration，并逐项说明 scope。

因此目标文案应区分：

```text
重置外观与区域偏好
```

和：

```text
重置整个应用数据
```

后者属于 Data Portability/Account lifecycle，不属于 Preference reset。

## 11. Export target

Preference-only export：

```json
{
  "schemaVersion": 3,
  "exportedAt": "2026-09-08T...Z",
  "preferences": {
    "presentation": {
      "theme": "dark",
      "language": "zh-CN"
    },
    "regional": {
      "timeZone": "Asia/Shanghai",
      "dateStyle": "medium",
      "timeStyle": "24h",
      "weekStartsOn": 1
    }
  }
}
```

明确不包含：

```text
identityId
SettingId
revision as portable user meaning
AI secret
NotificationPreference
Account profile
Knowledge binding
local absolute path
```

`identityId` 来自 import ExecutionContext，不从用户文件信任。

## 12. Import pipeline — ADR-111 destructive-cutover truth

旧设计中的 v1/v2 migrator、existing-row backfill 与 compatibility reader 已被 ADR-111 supersede。本轮当前实现为：

```text
raw JSON
  ↓
strict PreferencePortableDocumentV3 decoder
  ↓
preferences@3 owner schema
  ↓
PreferencePortableService dry-run/apply semantics
  ↓
presentation/regional namespace CAS
  ↓
ImportReceipt
```

明确规则：

- 只接受 `schemaVersion: 3`；
- legacy `{ version: 1.x/2.x, settings: ... }` 明确拒绝；
- 不接受 `merge` / `overwrite` compatibility switch；
- `identityId` 不属于 portable payload，始终来自 host execution context；
- device-local、Notification、AI、Knowledge、Account、UserFiles path 不得混入 preference payload；
- owner payload strict schema 在 mutation 前完成校验。

## 13. Data Portability owner capability

Setting owner 提供：

```text
PreferencePortableCapability
key = preferences
schemaVersion = 3
payload = UserPreferenceProfile
```

该 capability 通过 API/Electron Setting host handle 暴露给 Data Portability composition root。Data Portability 只负责编排、版本检查、引用映射与 receipt 聚合，不读取 Setting repository 内部模型。

完整 Data Portability V3 cutover 仍需其他 surviving owner capabilities；在此之前不得为了提前删除 V2 而减少当前 full-backup 的业务覆盖。最终 V2 删除点由 PORT-1603 管理。

## 14. Existing data policy

本轮无生产旧数据保留要求。`SETTING-9209` 已直接删除 `user_settings` / Account relation shadow 与整套 legacy Setting aggregate/protocol/client，不做 backfill；显式 migration 仅执行 destructive drop，环境通过 reset/reseed 或 source rollback 恢复。

## 15. Read cutover

最终稳定态禁止：

```text
read new
if missing read UserSetting
if missing read Account.settings
```

`SETTING-9209` 后 production read/write 只经过 namespace records；`UserSetting` fallback、appearance/locale remainder 与 giant-tree persistence 均已不存在。

## 16. Event model

`SETTING-9209` 已删除 legacy UserSetting aggregate events。当前 Setting event map 只保留实际仍存在的 `setting:setting-imported`；不为了 DDD 形式保留 created/patched/reset decorative events。

如果 runtime 确有跨边界消费者，只保留窄事件：

```ts
interface UserPreferenceChanged {
  identityId: IdentityId;
  namespace: PreferenceNamespace;
  revision: number;
  changedKeys: string[];
}
```

事件 payload 不带 secret/device path，不承担 persistence replication。

Device Notification 不再通过这个 cloud event 更新本地样式。

## 17. Data Portability boundary

当前 PortableUserData 已经把：

```text
settings
notificationPreference
userReminderPreference
...
```

分开，这个方向保留并强化。

目标 Data Portability：

```text
ExportUserData
  -> Preference owner projection
  -> Notification owner projection
  -> Account owner projection
  -> Knowledge owner projection
  -> ...
```

Import 也调用 owner importer，不让 Setting importer 代写别的模块表。

## 18. Rollback / containment

ADR-111 下 rollback 是 source/deployment rollback + development/test database reset/reseed，不通过 production compatibility reader、backfill 或 dual-write 保留旧模型。

Preference-only V3 import 的失败 containment 为：

- strict document/schema validation before mutation；
- namespace CAS + bounded retry；
- imported identity 始终由 host context 提供；
- 任何 legacy V1/V2 document fail closed。

## 19. Verification matrix

必须至少有：

| Invariant                                  | Evidence                                      |
| ------------------------------------------ | --------------------------------------------- |
| theme 不覆盖 timezone                      | concurrent namespace fixture                  |
| stale revision 不静默覆盖                  | Prisma CAS integration                        |
| Prisma/PowerSync payload 等价              | round-trip fixture                            |
| unknown namespace/key 被拒绝               | contract tests                                |
| V3 preference import/export strict         | V3 contract + use-case fixtures               |
| V1/V2 preference backup 被拒绝             | destructive-cutover regression                |
| import 不信任 identityId                   | security/portability test                     |
| device/Notification/AI/Knowledge 不混入    | strict owner payload schema tests             |
| Account.settings 完全退出                  | source/schema surface lock                    |
| old `user_settings` 完全退出               | SETTING-9209 canonical-only architecture lock |

## 20. Final state

完成后：

```text
User Preferences
= small typed profile
= namespace-scoped persistence
= real revision semantics
= V3-only strict portable owner capability

Settings Hub
= owner capability composition

No giant settings JSON
No Account preference shadow
No fake feature/privacy/device cloud truth
No V1/V2 preference compatibility reader
```
