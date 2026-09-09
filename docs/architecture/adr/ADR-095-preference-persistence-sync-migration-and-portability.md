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
updated: 2026-09-09T12:00:00+08:00
---

# ADR-095: Preference Persistence、Sync、Migration 与 Portability

**状态：** 已采纳（SETTING-9202 foundation 已实施；consumer cutover 待 SETTING-9203）
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

## 12. Import pipeline

当前实现只是：

```text
version in [1.0.0, 2.0.0]
-> cast data.settings as Partial<UserSettingPreferences>
```

目标：

```text
raw JSON
  ↓
version discriminator
  ↓
version-specific strict decoder
  ↓
deterministic migrator
  ↓
Canonical PreferenceImportV3
  ↓
validate owner boundaries
  ↓
apply canonical namespace mutations
  ↓
ImportReceipt + warnings
```

不允许 `as Partial<...>` 代替 migration。

## 13. Legacy v1/v2 migration policy

### 13.1 User preference values

迁移到 canonical：

```text
appearance.theme -> presentation.theme
locale.language -> presentation.language
locale.timezone -> regional.timeZone
locale.dateFormat -> regional.dateStyle when known
locale.timeFormat -> regional.timeStyle
locale.weekStartsOn -> regional.weekStartsOn
```

### 13.2 Retired fields

以下不进入 UserPreferenceProfile：

```text
locale.currency
workflow.*
privacy social fields
notification.*
shortcuts.*
experimental.*
ui.*
ai.*
```

Importer 必须分类：

```text
migrated-to-owner
retired-ignored-with-warning
requires-explicit-device-import
requires-new-consent
```

不得静默丢弃又报告“全部成功”。

### 13.3 Notification legacy values

Notification 由 ADR-088 owner。

迁移优先级：

```text
existing NotificationPreference explicit value
  > legacy UserSetting notification channel flag
  > legacy Account.notificationEnabled fallback
  > Notification canonical default
```

仅在 NotificationPreference 相应值缺失时才 seed legacy value；不得覆盖已经存在的 owner truth。

`notification.sound/useCustomNotification` 不迁入 NotificationPreference，按 ADR-094 作为 device-only migration candidate。

### 13.4 Currency

`locale.currency` 不用于修改已有 WalletAccount.currency。

Importer 只记录 legacy retired warning。未来如 Wallet 引入 `defaultCurrency`，必须由 Wallet 自己的 migration 决定。

### 13.5 Experimental

legacy `experimental.features[]` 不转换为 FeatureAssignment/entitlement。

Importer 记录 retired warning，不开启任何 feature。

### 13.6 Consent

legacy `privacy.shareUsageData=true` 不自动生成新的 `UsageAnalyticsConsent=Granted`。

Importer 最多记录：

```text
legacy consent-like flag observed; explicit re-consent required
```

## 14. Existing cloud-data migration

数据库 migration 使用与 import 相同的 canonical mapping functions，避免：

```text
DB migration 一套规则
JSON import 另一套规则
```

建议顺序：

```text
1. create user_preference_records
2. backfill presentation/regional from UserSetting + Account fallback
3. deploy readers that read new canonical profile
4. switch writers to new rows
5. migrate Notification/device ownership
6. remove legacy readers
7. delete user_settings
8. remove accounts.settings
9. add anti-resurrection schema/surface tests
```

不长期 dual-write。

## 15. Read cutover

迁移期允许**一次性 backfill + bounded compatibility reader**，但必须有明确删除点。

禁止稳定态：

```text
read new
if missing read UserSetting
if missing read Account.settings
forever
```

最终任何 runtime grep 应无法找到 production path 读取：

```text
Account.settings.theme
Account.settings.language
Account.settings.timezone
Account.settings.notificationEnabled
UserSetting.preferences.workflow
UserSetting.preferences.privacy
UserSetting.preferences.experimental
UserSetting.preferences.ai
```

## 16. Event model

当前 Setting event map：

```text
setting:user-setting-created
setting:user-setting-patched
setting:user-setting-reset
setting:setting-imported
```

目标不为了形式保留全部 event。

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

在 migration 删除旧表之前：

- backfill 可重跑且 deterministic；
- 新表可从旧 canonical source 重建；
- writer cutover 以 feature/deployment step 控制；
- 不允许双写成为长期 rollback 机制。

一旦旧字段删除，rollback 依赖数据库备份/版本回滚 migration，而不是在生产代码里永久留 shadow model。

## 19. Verification matrix

必须至少有：

| Invariant                                  | Evidence                             |
| ------------------------------------------ | ------------------------------------ |
| theme 不覆盖 timezone                      | concurrent namespace fixture         |
| stale revision 不静默覆盖                  | Prisma CAS integration               |
| Prisma/PowerSync payload 等价              | round-trip fixture                   |
| unknown namespace/key 被拒绝               | contract tests                       |
| v1/v2 import deterministic                 | migration fixtures                   |
| import 不信任 identityId                   | security/portability test            |
| legacy consent 不升级 Grant                | migration regression                 |
| Notification existing owner truth 不被覆盖 | cross-module migration fixture       |
| Account.settings 完全退出                  | source/schema surface lock           |
| old `user_settings` 完全退出               | Prisma/PowerSync/schema surface lock |

## 20. Final state

完成后：

```text
User Preferences
= small typed profile
= namespace-scoped persistence
= real revision semantics
= deterministic portable migration

Settings Hub
= owner capability composition

No giant settings JSON
No Account preference shadow
No fake feature/privacy/device cloud truth
```
