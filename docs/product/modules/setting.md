---
tags:
  - product
  - module
  - setting
description: 设置模块当前功能资产说明与 Setting vNext target-design 入口
created: 2026-06-02T00:00:00
updated: 2026-09-10T15:40:00+09:00
---

# 设置模块说明

> **vNext implementation notice（2026-09-10）**：`SETTING-9203~9209` 已完成 Setting vNext 主体 cutover。legacy `UserSetting` aggregate、`user_settings` Prisma/PowerSync table、category DTO/schema/mocks/events、旧 HTTP/IPC RPC 与前端 giant-tree store/composable 已删除。当前 cloud preference sole truth 是 namespace-scoped `presentation | regional` + real revision/CAS；Settings Hub 是 6-group owner capability composition；standalone portability 是 `preferences@3` V3-only。Data Portability V2 外层 full-backup envelope 暂时保留 `settings` singleton 以维持当前完整备份覆盖，但其 payload/读写已经完全由 canonical UserPreferenceProfile / `user_preference_records` 驱动，最终由 PORT-1603 删除 V2 envelope。

## 1. 当前功能定位

当前 Setting 只拥有两个 typed cloud preference namespace：

```text
UserPreferenceProfile
├── presentation
│   ├── theme
│   └── language
└── regional
    ├── timeZone
    ├── dateStyle
    ├── timeStyle
    └── weekStartsOn
```

Settings UI 本身不是一个“大设置聚合”，而是 owner capability composition：AI、Knowledge、Notification、Account、UserFiles 与 Data Portability 均由各自 owner 提供能力；Setting owner 只负责 `presentation/regional` 与 `preferences@3`。

## 2. 已退休的 UserSetting giant-tree

`SETTING-9209` 已直接删除：

```text
UserSetting aggregate
UserSetting.preferences JSON
user_settings table
PreferenceCategory
appearance/locale legacy category DTO/schema
legacy Setting GET/PATCH/RESET/default routes
setting:all / setting:defaults / setting:patch / setting:reset IPC
legacy UserSetting events/mocks/store/composable
```

不存在 legacy read fallback、dual-read、dual-write 或 appearance/locale remainder。历史设计仅保留在 ADR/current-system analysis 中，不再是 production surface。

## 3. 当前 Settings UI 分组

`SETTING-9207` 后 `UserSettingsView.vue` 只保留 6 个真实 owner group：

```text
appearance
repository
ai
notifications
account
data
```

对应：

| Group         | 当前主要 capability/owner |
| ------------- | ------------------------- |
| Appearance    | canonical `presentation` / `regional` User Preferences |
| Repository    | Repository/Knowledge |
| AI            | AI provider/onboarding |
| Notifications | NotificationPreference + Profile-scoped Desktop notification surface |
| Account       | Account/Profile + capability-gated Cloud Auth/Password |
| Data          | `preferences@3` import/export + Data Portability + Desktop UserFiles |

页面 root 只负责导航、响应式布局、`?tab=` 深链与 lazy section composition，不再持有跨 owner form shadow、backup/sync fake state 或全局 owner loading。

此前 `Advanced` tab 中没有真实 handler/owner 的 CSV export、local backup/restore、cloud sync、version history 已删除；preference reset 回到 User Preferences owner，数据导入导出回到 Data owner。未来 Diagnostics/Labs/DeviceKeymap 只有在真实 capability 存在时才重新进入 Settings Hub。

现有 `?tab=` / `settings-tab-{value}` contract 对 surviving 6 个 group 保持不变；旧 `advanced` 或未知 query value 回落到 `appearance`。

## 4. 当前持久化与同步

### 4.1 Canonical cloud preference persistence

Prisma 与 PowerSync 现在只保留：

```text
user_preference_records
├── identity_id
├── namespace = presentation | regional
├── payload
├── revision
└── timestamps
```

`(identity_id, namespace)` 唯一，每个 namespace 是独立 persistence/sync/CAS unit。首次写入 revision `1`；不存在 namespace 的读取使用 virtual revision `0` 且不 persistence-on-read；mutation 使用 expected revision 做真实 compare-and-swap，冲突不静默覆盖。

`user_settings` 已从 Prisma schema、PowerSync schema、API upload mapping、Desktop table registry 与 generated Prisma Client 中删除。ADR-111 下不做旧行 backfill，显式 migration 只负责 `DROP TABLE IF EXISTS "user_settings"`。

### 4.2 Desktop device-local notification preference

`SETTING-9206` 将 notification presentation/sound 的 device surface 放在 active Profile scope：

```text
profiles/<profileId>/ui/notification-preference.json
└── schemaVersion: 1
    └── preference
        ├── presentationMode: native | custom
        └── soundEnabled: boolean
```

它不进入 cloud UserPreference、PowerSync 或 portability payload；`main-window-state.json` 与 UserFiles `user-files-config.json` 也继续由各自 Desktop host owner 管理。

## 5. 当前 owner truth

Account/Notification shadow truth 已退出 Setting。Notification user-level delivery choice 由 `NotificationPreference` 管理；device sound/presentation 由 Desktop profile-local owner 管理；Account profile/security 由 Account/Auth 管理。Setting 不再存储这些事实。

## 6. Product Time

regional `timeZone/dateStyle/timeStyle/weekStartsOn` 由 canonical preference seam 提供。`@memoflow/time` 消费 owner-provided User Time Context；不存在 Account vs UserSetting timezone 双真值。

## 7. 当前导入/导出

Standalone Settings export 已切到 V3-only preference document：

```text
schemaVersion = 3
exportedAt
preferences.presentation
preferences.regional
```

明确不包含 `identityId`、persistence id/revision、device-local preference、NotificationPreference、AI/Knowledge 或 UserFiles path。Import 使用 strict V3 decoder + Setting-owned `PreferencePortableService`，通过当前 namespace revision/CAS 写入并返回 receipt；旧 v1/v2 Settings backup、`merge/overwrite` 选项均按 ADR-111 明确 unsupported。

Setting 同时提供 `preferences@3` 的 typed `PreferencePortableCapability`，供 system-wide Data Portability V3 registry 使用；full Data Portability 仍由跨 owner orchestrator 负责，当前完整 V3 cutover 要等其他 surviving owners 的 capability 到齐后再删除 V2 路径。

## 8. 当前 presentation bootstrap

`PresentationPreferenceStore` 本地持久化：

```text
locale
theme
```

用于远端 canonical preference 完成加载前快速恢复 presentation；`usePresentationBootstrap` 随后加载 `UserPreferenceProfile` 并同步。

这层 store 当前应理解为 presentation cache/bootstrap projection，不应演变为新的 canonical preference truth。

## 9. 当前正确保留的 owner 边界

以下当前做法符合 vNext 方向，应保护：

- AI provider/secret/default model 由 AI module 管理；
- Knowledge source binding 由 Repository/Knowledge 管理；
- Notification workflow/channel preference 已有 Notification owner；
- User files path 通过 Desktop local IPC 管理，不在 cloud UserPreference；
- Data Portability 负责跨模块 export/import orchestration；
- `@memoflow/time` 已有 TimeZoneId/TimeStyle/Recurrence 能力，不需要 Setting 自建时间库。

## 10. 已采纳的 Setting vNext 方向

目标将收敛为：

```text
Settings Hub
= capability composition

UserPreferenceProfile
├── presentation
│   ├── theme
│   └── language
└── regional
    ├── timeZone
    ├── dateStyle
    ├── timeStyle
    └── weekStartsOn
```

其他当前字段的目标 owner：

```text
Notification channel/QuietHours -> Notification
sound/custom notification       -> Device Surface
shortcuts                       -> future DeviceKeymap
local UI state                  -> presentation local state
AI                              -> AI
Knowledge                       -> Repository/Knowledge
Account security/profile        -> Account/Auth
feature/experiment              -> future Feature evaluator
usage analytics consent         -> future explicit Consent owner
```

详细 target 见 [Setting vNext Settings Hub](../setting-vnext-settings-hub.md)。

## 11. 已解决债务与剩余实施优先级

`SETTING-9203~9209` 已解决：Account/Notification shadow、fake categories、Desktop device-local ownership、Settings Hub composition、V3 preference portability，以及 legacy giant-tree persistence/protocol/client 的最终删除。

当前 Setting 自身只剩 `SETTING-9210` 的五层 review / exact-head CI / docs archive。跨模块 Data Portability 仍需继续注册其他 surviving owner capabilities；在 PORT-1603 前，V2 full-backup envelope 的 `settings` singleton 仍存在，但它现在只是 canonical `UserPreferenceProfile` adapter，读写 `user_preference_records`，不再依赖任何 legacy Setting model/table。

实施真值见 [Setting vNext active plan](../../plan/active/2026-09-08-setting-vnext-model-convergence.md)，并受 ADR-111 zero-legacy-data destructive cutover policy 约束。

## 12. 相关资料

- [Setting vNext current-system map](../../analysis/2026-09-08-setting-vnext-current-system-map.md)
- [Setting vNext reference study](../../analysis/2026-09-08-setting-vnext-reference-study.md)
- [Setting vNext Settings Hub](../setting-vnext-settings-hub.md)
- [ADR-092](../../architecture/adr/ADR-092-settings-hub-and-preference-ownership-boundary.md)
- [ADR-093](../../architecture/adr/ADR-093-user-preference-profile-and-product-time-context.md)
- [ADR-094](../../architecture/adr/ADR-094-device-preference-feature-policy-and-consent-boundary.md)
- [ADR-095](../../architecture/adr/ADR-095-preference-persistence-sync-migration-and-portability.md)
- [ADR-037 Product Time](../../architecture/adr/ADR-037-product-time-system.md)
- [ADR-088 Notification Preference](../../architecture/adr/ADR-088-notification-preference-quiet-hours-realtime-and-operations-boundary.md)
- [设置模块文件索引](../module-index/setting-files.md)
