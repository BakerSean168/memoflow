---
tags:
  - plan
  - active
  - setting
  - preferences
  - refactor
description: Setting vNext — Settings Hub ownership、UserPreference、Product Time Context、Device/Feature/Consent、Persistence/PowerSync/Portability 单轨收敛实施计划
created: 2026-09-08T23:26:00+08:00
updated: 2026-09-10T03:20:00Z
---

# Setting vNext Model Convergence

> **System-wide execution-order notice (2026-09-09):** 本文继续作为模块内部 ticket/验收细节真值；跨模块执行顺序、共享 schema 单写者与 destructive cutover gate 由 [`2026-09-09-system-wide-vnext-model-convergence-implementation.md`](./2026-09-09-system-wide-vnext-model-convergence-implementation.md) 统一协调。
>
> **ADR-111 zero-legacy-data override:** 本文中所有仅用于保存当前旧数据/旧备份/旧客户端的 migration、backfill、compatibility reader/adapter、dual-read/write、redirect window、before/after old-data parity 要求均已被 ADR-111 supersede。领域目标与行为验收继续有效；实施时直接切 current consumers、删除旧 surface、reset/reseed persistence。

## ADR-111 execution rewrite

The preference ownership model remains valid, but all legacy-data precedence/backfill work is removed:

- `SETTING-9203`: create canonical presentation/regional preferences directly and delete `Account.settings` / old giant-tree truth; no timezone/value precedence backfill;
- `SETTING-9204`: move current code to Notification/device owners without seeding values from legacy flags;
- `SETTING-9208`: V3-only strict import/export; delete v1/v2 migrator/warnings instead of maintaining them;
- `SETTING-9209`: direct Prisma/PowerSync cutover and old-field deletion; no compatibility reader;
- consent remains fail-closed by target semantics, but no old consent flag needs migration reporting.

Migration-oriented subsections below are retained only as historical reasoning and are superseded for execution by this block and the system-wide plan.

**状态：ACTIVE / staged implementation in progress — SETTING-9202/9203 DONE**
**设计分支：** `docs/setting-vnext-model`
**当前源码 truth：** `packages/setting` + `packages/account` + `packages/notification` + Desktop/PowerSync 现状
**目标 ADR：** ADR-092～095
**关联 ADR：** ADR-037、ADR-039、ADR-063、ADR-088、ADR-089～091

## 1. Objective

一次性把 Setting 从：

```text
Settings page
≈ UserSetting giant JSON owner
```

收敛为：

```text
Settings Hub
= capability composition surface

User Preferences
= small cross-device typed profile

Module Preferences
= owner module truth

Device Preferences
= host/local truth

Feature / Consent / System Policy
= dedicated policy truth
```

最终消灭：

```text
Account.settings vs UserSetting duplicate truth
UserSetting.notification vs NotificationPreference duplicate truth
giant user_settings.preferences JSON
fake optimistic version
fake privacy controls
fake experimental string flags
unused workflow/ui/ai categories
```

## 2. Accepted design package

### ADR-092

Settings Hub / ownership boundary：

```text
Settings UI location != persistence/domain owner
```

### ADR-093

Canonical UserPreferenceProfile：

```text
presentation(theme, language)
regional(timeZone, dateStyle, timeStyle, weekStartsOn)
```

并建立 `UserTimeContextPort`。

### ADR-094

Device preference / Feature policy / Consent 分离：

```text
sound/custom notification -> device
shortcut -> device keymap
experimental -> real feature evaluator only
fake social privacy -> retire
usage analytics -> future explicit consent only
```

### ADR-095

Persistence / sync / migration：

```text
one row per preference namespace
real revision/CAS
Prisma + PowerSync parity
strict versioned migration
Data Portability owner orchestration
```

## 3. Baseline facts / why now

当前已确认：

1. Settings 页面已经组合 AI、Knowledge、Notification、Account、DataPortability、Desktop capabilities；
2. Account 仍保存 theme/language/timezone/notificationEnabled；
3. UserSetting 同时保存同类值；
4. Reminder server 仍从 Account 取 timezone，而 Settings 页面写 UserSetting；
5. NotificationPreference 已存在，但 UserSetting.notification 仍保留 shadow fields；
6. UserSetting 以整条 JSON row 保存，`version` 没有 CAS；
7. Privacy/Experimental/Shortcut/Workflow 多项是没有完整 runtime behavior 的残留；
8. `AISchema = {}`，真正 AI config 已经由 AI owner 管理；
9. Data Portability 已经按 owner 分开 settings/notification/reminder preference，目标方向有基础。

详细证据：

- `docs/analysis/2026-09-08-setting-vnext-current-system-map.md`
- `docs/analysis/2026-09-08-setting-vnext-reference-study.md`

## 4. Protected contracts

整个实施必须保护：

1. Settings route 与 `?tab=` deep-link；
2. `settings-tab-{value}` 当前测试 anchors，直到替代测试在同一提交上线；
3. Account/Auth profile/password/session/closure 行为；
4. ADR-039 cloud auth / guest local profile boundary；
5. ADR-037 `@memoflow/time` 唯一产品时间语义；
6. explicit schedule timezone snapshot 语义；
7. ADR-088 NotificationPreference / Device Surface ownership；
8. AI provider secret/onboarding 继续 AI-owned；
9. Repository/Knowledge connection 继续 Repository-owned；
10. Desktop local files path 不上传 cloud；
11. Data Portability identity 只由 ExecutionContext 注入；
12. HTTP/IPC contract parity；
13. Prisma/PowerSync parity；
14. 不保留永久 legacy/new 双读双写；
15. consent 不由 legacy bool 自动升级；
16. arbitrary feature strings 不能开启 system feature。

## 5. Non-goals

本轮不做：

- 自建完整 feature management SaaS；
- 引入 OpenFeature/Unleash 依赖作为前置；
- 新增好友/Presence/Search-by-email 社交系统；
- 新建 telemetry pipeline；
- 为所有 local UI state 建统一数据库；
- 强制 rename `@memoflow/setting` -> `@memoflow/preferences`；
- 无产品需求地扩展 accessibility/settings categories；
- 改写 Task/Routine/Scheduler 已冻结的业务 timezone snapshot 语义。

## 6. Work items

### SETTING-9201 — Freeze Setting vNext design/current map/reference/product package

**状态：DONE（docs only）**

#### Goal

把本轮审查事实、目标 ownership、UI、迁移与实施顺序冻结成可执行文档，防止后续 Worker 一边写代码一边重新发明 Setting 模型。

#### Scope

- ADR-092～095；
- current-system map；
- external reference study；
- Settings Hub product doc；
- 本 active plan；
- ADR/active-plan indexes；
- legacy Setting product doc target notice。

#### Out of scope

- production code；
- Prisma migration；
- UI behavior change。

#### Acceptance

- [x] ownership matrix 明确；
- [x] timezone migration precedence 明确；
- [x] Notification/device split 明确；
- [x] fake/dead categories retirement 明确；
- [x] persistence/concurrency target 明确；
- [x] import/export migration policy 明确；
- [x] UI target/host-specific scope 明确。

### SETTING-9202 — Introduce canonical strict UserPreference contracts + namespace foundation

**状态：DONE — 2026-09-09 canonical foundation checkpoint**

#### Goal

先建立新 canonical contract/persistence seam，不立即删除旧读路径，为后续迁移提供单一目标。

#### Scope

Contracts：

```text
PreferenceNamespace = presentation | regional
PresentationPreferences
RegionalPreferences
UserPreferenceProfile
PreferenceNamespaceResponse
PreferenceMutationReceipt
PreferenceRevisionConflict
```

规则：

- strict Zod schemas；
- unknown key/namespace reject；
- portable `TimeZoneId` + IANA validator/schema canonicalized in `@memoflow/contracts/primitives`; `@memoflow/time` consumes/re-exports it so contracts never depend back on Time；
- date/time style 使用受控 enum，不接受 arbitrary format token；
- defaults 是 pure value，不 fake UserSetting DTO；
- repository/application port 面向 namespace/profile。

Persistence foundation：

```text
user_preference_records
unique(identityId, namespace)
revision
```

#### Out of scope

- Account legacy deletion；
- Notification migration；
- Settings UI rewrite。

#### Tests

- contract strictness；
- default factory；
- namespace registry；
- timezone validity；
- Prisma mapper round-trip；
- PowerSync mapper/schema round-trip；
- creation race fixture；
- expectedRevision CAS fixture。

#### Acceptance

- 新 canonical contract 不包含 legacy workflow/privacy/notification/etc；
- no fake identity defaults；
- presentation/regional rows 可独立保存；
- stale expectedRevision 不静默覆盖。

#### Closure evidence

- `PreferenceNamespace` closed registry only permits `presentation | regional`; both namespace payloads and patches are strict Zod contracts, with pure UTC-backed defaults and no fake identity/entity construction path；
- portable `TimeZoneId` + IANA validation moved to `@memoflow/contracts/primitives`, while `@memoflow/time` keeps `TimeContext`/Clock/Calendar/Format behavior and re-exports the primitive; package dependency remains one-way `time -> contracts`；
- `UserPreferenceDocument + UserPreferenceService + IUserPreferenceRepository` form the new lightweight canonical seam; reads of absent namespaces are virtual revision `0`, while every write materializes revision `1`；
- canonical mutation receipts/conflicts are parsed through their runtime schemas; review fixed the missing-reset edge so no revision-0 mutation receipt can escape；
- Prisma adds `user_preference_records` with `unique(identityId, namespace)` and real `updateMany(identityId + namespace + revision)` CAS; `P2002` create races re-read the unique winner instead of overwriting it；
- PowerSync has the same per-namespace row and `UPDATE ... WHERE identity_id + namespace + revision` fence; zero affected rows re-read latest, and insert races only resolve as `exists` when a canonical winner can actually be read；server sync rules、API CRUD normalization/table mapping 与 Desktop pre-hydration bootstrap 也已登记 `user_preference_records`；
- canonical preference cloud uploads bypass the generic PowerSync last-write-wins `upsert/update` path: `PUT` only creates revision `1`, `PATCH` derives and enforces the previous revision through Prisma `updateMany(id + identityId + revision)`, create/update races surface explicit conflicts, and `/powersync/crud` returns HTTP `409` instead of silently overwriting；
- both persistence adapters reject create revisions other than `1` and CAS documents that do not advance exactly one revision；
- `SETTING-9203` completed the canonical presentation/regional HTTP/IPC/UI and Product Time cutover and retired `Account.settings`; no legacy backfill, fallback, mirroring, or dual write remains for those owners；
- focused verification: canonical contract suites `7/7` PASS; Setting `21 files / 138 tests` PASS; Time `10 files / 56 tests` PASS; PowerSync schema `5/5` PASS; canonical PowerSync cloud-upload/control-plane tests `4 files / 22 tests` PASS, and the PowerSync API module + CAS/control-plane rerun is `4 files / 20 tests` PASS; Setting/Time/PowerSync/API/Desktop typechecks all PASS after the upload-CAS patch; the final provider-neutral Prisma-error boundary repair then re-passed the PowerSync API `4 files / 20 tests`, API lint and full governance; API lint PASS with 0 warnings/errors, Desktop lint PASS with 3 inherited warnings / 0 errors, Setting lint PASS with 7 inherited warnings / 0 errors; API Setting composition `7/7` and Desktop composition surface `34/34` PASS; test inventory regenerated to `1202` files；
- full `contracts:test` still contains 11 inherited Task/Goal/docs-surface failures unrelated to this ticket; the new TimeZoneId/canonical-preference contract suites themselves are green.

#### Dependencies

`SETTING-9201`

### SETTING-9203 — Converge theme/language/timezone and retire `Account.settings` duplicate truth

**状态：DONE — 2026-09-09**

#### Goal

解决最危险的 user preference 双真值，尤其 timezone business divergence。

#### Scope

按 ADR-111 执行 direct destructive cutover，不做 legacy value backfill、precedence fallback、dual-read 或 dual-write：

- canonical `presentation | regional` namespace 成为 theme/language/timezone/dateStyle/timeStyle/weekStartsOn sole truth；
- `PreferenceUserTimeContextAdapter` 实现 `UserTimeContextPort`；
- Reminder/Routine/Task/Planner/Scheduler/Notification/AI user-time consumers 与 `TIME-1205` 同批切到 canonical context；
- Presentation bootstrap 与 Settings General UI 只读写 `UserPreferenceProfile` / namespace CAS API，canonical load 失败时不回退 legacy preference；
- Account UI 不再承载 theme/language/timezone；
- 删除 `AccountSettings` VO、API、event、DTO、Prisma/PowerSync persistence field 与 Web mock route；PowerSync CRUD normalization 不再接受 `accounts.settings` 作为 JSON field。

#### Protected contracts

- Account profile/auth 行为；
- schedule explicit timezone snapshot；
- server no ambient timezone；
- guest/device presentation defaults只作为未加载 canonical profile 时的本地显示默认，不成为 cloud business truth。

#### Tests

- host timezone / DST changes but business results stable；
- theme/language/timezone mapping from canonical profile；
- canonical preference load failure does not fall back to legacy settings；
- Reminder/Task/Goal/Planner/Notification/AI server consumers use explicit identity context；
- Account response/domain/persistence no settings after cutover；
- anti-resurrection grep/surface lock。

#### Acceptance

Production path 中为 0：

```text
Account.settings.theme
Account.settings.language
Account.settings.timezone
Account.settings.notificationEnabled
AccountSettings
AccountApplicationTimezoneAdapter
```

#### Closure evidence

- final production grep for the acceptance symbols is empty；Prisma `Account` schema、generated client、PowerSync local `accounts` table 均无 `settings`；
- Account PowerSync mapper 的旧 `row.settings` source lock 已反转为 anti-resurrection；API PowerSync JSON registry 仅保留 `accounts.profile`，旧 `settings` payload 不再被 normalization 当作可写 JSON；
- canonical `/settings/preferences` HTTP/IPC + namespace CAS、`useUserPreferences`、`usePresentationBootstrap`、`UserSettingsView` 均走 canonical preference；
- verification：Setting `22 files / 142 tests` + typecheck PASS；Account `26 / 189` + typecheck PASS；Account contracts `1 / 6` PASS；PowerSync API focused `3 / 15` PASS；App Vue canonical Settings `3 / 7` PASS；
- App Vue/Web package-wide typecheck仍有与本 ticket 无关的 workspace declaration baseline（`@memoflow/app-vue/web-*`、`ai/label/schedule client`），不影响上述 focused cutover gates；
- legacy giant-tree `UserSetting` 中 privacy/experimental/device/notification 等非 presentation/regional owner 仍由 SETTING-9205/9206/9209 后续 destructive convergence 处理，不重新成为 Product Time fallback。

#### Dependencies

`SETTING-9202`；与 `TIME-1205` coordinated cutover 同批完成。

### SETTING-9204 — Converge Notification user/device preference ownership

**状态：DONE — 2026-09-10**

**Evidence:** canonical presentation/regional HTTP/IPC/UI and Product Time cutover plus `Account.settings` retirement are complete. Remaining non-presentation convergence is SETTING-9205/9206/9209. ADR-088/094 remain partially implemented; device persistence/scope remains pending in SETTING-9206. Final focused repair gates: contracts 3 files/10 tests; setting 1/21; app-vue 3/12; Desktop service/store 2/17; Desktop IPC 1/13; contracts, setting, and app-vue typechecks PASS; Desktop filtered typecheck has 0 errors in all four 9204 paths (1 unrelated baseline error elsewhere); app-vue build refreshed `dist/di/keys.d.ts`; `git diff --check` and targeted residual scans PASS.

#### Goal

让 ADR-088 成为唯一 Notification preference truth。

#### Scope

User-level：

```text
email/push/inApp or equivalent canonical channel flags
-> NotificationPreference
```

Device-level：

```text
sound
useCustomNotification
-> Desktop/Mobile device surface preference
```

Migration precedence：

```text
existing NotificationPreference explicit value
  > legacy UserSetting notification flag
  > Account.notificationEnabled fallback
  > canonical Notification default
```

同时：

- Desktop NotificationService 不再监听 Setting cloud event；
- Settings UI 明确 Delivery/QuietHours vs On this device；
- OS permission/capability 继续 device observed state。

#### Tests

- existing NotificationPreference 不被 legacy 覆盖；
- legacy seed fixture；
- desktop presentation change does not mutate cloud NotificationPreference；
- device reset only affects current device；
- Notification ADR-088 focused suite。

#### Acceptance

UserSetting 不再含 notification category；Notification 与 Device Surface 各自单一 owner。

#### Dependencies

`SETTING-9202`

### SETTING-9205 — Retire dead/fake UserSetting categories and misleading UI

**状态：DONE — 2026-09-10**

#### Goal

删除“看起来可配置、实际没有 canonical behavior”的产品残留，而不是为它们补造系统。

#### Scope

从 User Preferences 删除：

```text
workflow.*
locale.currency
privacy.profileVisibility
privacy.showOnlineStatus
privacy.allowSearchByEmail
privacy.allowSearchByPhone
privacy.shareUsageData generic bool
experimental.*
ui.startPage
ui.sidebarCollapsed cloud field
ai: {}
shortcuts cloud category
```

UI：

- 删除 fake social privacy controls；
- 删除 fake experimental/Labs controls；
- shortcut editor 未有 CommandRegistry 前不作为稳定设置；
- Workflow 老 UI/i18n/mocks/contracts 一并清理；
- `defaultGoalView=TREE` 等 legacy vocabulary 消失。

#### Privacy invariant

```text
legacy shareUsageData=true
```

不得自动转换成 future Consent Granted。

#### Tests

- contracts/mocks no retired category；
- UI no fake controls；
- no unknown old key accepted；
- import fail-closes retired/unknown categories；`privacy.shareUsageData=true` returns an explicit re-consent-required rejection；
- Wallet currency never changed by old locale.currency。

#### Acceptance

旧 fields 只允许出现在 explicit rejection guards/tests、历史 ADR/current-system evidence 中；production UserSetting/UI 不再把它们作为可配置 truth。

#### Closure evidence

- `UserPreferencesSchema` 已 strict 收缩到 legacy remainder `appearance + locale`；`locale.currency` 与 workflow/privacy/shortcuts/experimental/ui/ai categories 已退出 live contract；
- `ImportSettings` 对 retired/unknown category、`locale.currency` fail closed；`privacy.shareUsageData=true` 明确要求 future re-consent，绝不自动转换；
- Vue Settings 删除 fake Privacy/Experimental/Shortcut editors 及 local shadow refs；原 Help -> cloud shortcut 假入口同步删除；
- reviewer focused gates：contracts 2 files / 10 tests、Setting 2 / 39、App Vue 4 / 19 PASS；production residue scan 与 `git diff --check` PASS。

#### Dependencies

`SETTING-9202`

### SETTING-9206 — Establish device-local preference seams without creating a new God store

**状态：DONE — 2026-09-10**

#### Goal

为真实 device-specific behavior 建窄 owner seam，同时保护现有 local profile/host capability。

#### Scope

- Desktop notification presentation preference；
- local notification sound preference；
- local presentation state（sidebar/window）继续 presentation owned；
- UserFiles path 继续 dedicated Desktop IPC；
- 定义 future `CommandRegistry` / `DeviceKeymap` contract boundary，但不强制开放编辑 UI；
- local persistence scope 与 account binding behavior 明确。

#### Out of scope

- cloud keymap sync；
- unified device settings JSON；
- mobile/Desktop 共享绝对路径。

#### Tests

- logout/account switch 不串 device-profile scoped state；
- user files path never appears in cloud export/prefs；
- Desktop notification runtime reads local canonical preference；
- unsupported host section not mounted/mutated。

#### Acceptance

没有因为移除 cloud UserSetting fields 而重新建一个 arbitrary `deviceSettings: Record<string,unknown>`。

#### Closure evidence

- Desktop notification presentation/sound now persists in one narrow, versioned file at `profiles/<profileId>/ui/notification-preference.json`; the store follows the active Profile path dynamically and clears cached values on scope change.
- Profile A/B isolation, corrupt-file fallback, inactive-profile rejection and active-profile-only reset are executable; no global device settings JSON was introduced.
- Production `NotificationService` receives the active Profile path resolver through App Lifecycle -> Desktop Features -> Electron capability factory -> `DesktopNotificationPreferenceStore`.
- Window state remains separately owned by `main-window-state.json`; UserFiles remains the dedicated Desktop host `user-files-config.json` path and does not enter cloud Setting/Data Portability surfaces.
- The future `CommandRegistry` / `DeviceKeymap` boundary remains the ADR-094 design seam only; no fake editable shortcut surface or generic keymap store was created.
- Focused reviewer gates: Desktop path/store/service/wiring 32 tests PASS; Desktop IPC 14/14 PASS; Vue Notification Settings 5/5 PASS; focused ESLint 0 errors; ownership residue scan and `git diff --check` PASS. Full Desktop typecheck is still blocked by unrelated existing Governance/database declaration baseline, with no reported error in the SETTING-9206 changed paths.

#### Dependencies

`SETTING-9202`

### SETTING-9207 — Converge Settings Hub UI to owner composition

**状态：DONE — 2026-09-10**

#### Goal

让页面结构与 ownership 真正一致，并删除 root view 中跨 owner 的 local shadow refs。

#### Implemented scope

Settings Hub 现在只保留 6 个真实 owner group：

```text
appearance     -> UserPreference presentation/regional
repository     -> Repository/Knowledge
ai             -> AI
notifications  -> NotificationPreference + Desktop device-local notification preference
account        -> Account/Auth
Data           -> preferences@3 + Data Portability + Desktop UserFiles
```

`Advanced` group 已删除。此前只有 UI shell、没有真实 handler/owner 的 CSV export、local backup/restore、cloud sync、version history 一并移除；不为了保留一个 tab 去制造 fake capability。未来 Diagnostics/Labs/DeviceKeymap 只有在真实 owner/runtime 存在时才重新进入 Settings Hub。

Root `UserSettingsView` 现在只负责：

```text
navigation
?tab= deep-link normalization
responsive tabs/sidebar layout
lazy owner-section composition
```

它不再调用 `useUserSetting` / `useUserPreferences` / `useDataPortability`，也不持有 backups/sync status、preference form shadow 或页面级全局 loading。

Owner sections：

- `UserPreferenceSettingsSection`：独立 load/error/mutation/reset，presentation/regional 为唯一 General truth；
- `KnowledgeRepositorySettings` / `AISettings` / `NotificationSettings`：按 tab lazy mount，某 owner failure 不阻断 General；
- `AccountSettingsSection`：Account profile 始终按 owner mount，Cloud Password 按 `AUTH_SERVICE_KEY` capability gating；
- `DataSettingsSection`：V3 preference import/export、full Data Portability、server-held disclosure 与 Desktop UserFiles；
- `SettingsResetSection`：只发出 `presentation | regional | all` canonical reset scope，不再读取/重置 legacy giant-tree。

React/Mobile shared Settings 也已从 legacy `useSettings().preferences.notification` 切到 Notification owner `getPreferences/updatePreferences`。共享端只暴露 user-level `Email / Push / InApp`；Desktop-only sound/presentation 不进入 React/Mobile cloud preference surface。

#### Protected UI contract

```text
?tab=
settings-tab-{value}
```

现有 `appearance / repository / ai / notifications / account / data` query values 保留；已有 appearance/notifications/account E2E anchor 未改。已退休的 `advanced` 不再是可导航 group，未知/旧值回落到 `appearance`。

#### Evidence

- App Vue focused owner-composition matrix：8 files / 27 tests PASS；
- App Vue full Setting module specs：19 files / 74 tests PASS；
- Account capability-gating component tests PASS；
- Notification unsupported-device-host tests PASS；
- React/Mobile Settings source parity lock PASS；
- `packages/app-react` direct strict typecheck PASS；
- focused ESLint 0 errors；
- changed-path Vue typecheck 无 9207 自身错误；isolated worktree 全包 Vue typecheck 仍受 workspace `dist` 缺失/既有 unrelated baseline 干扰；
- fake Advanced / legacy notification residue scan PASS；
- `git diff --check` PASS。

#### Acceptance

- Settings root 不再持有跨 owner local shadow state；
- 每个 mutation 能追溯到唯一 owner port；
- General 不依赖 legacy giant-tree request；
- unsupported host capability 不 mount 对应 control；
- React/Mobile 不再把 Notification 当 UserSetting category；
- fake Advanced actions 为零。

#### Dependencies

`SETTING-9203`, `SETTING-9204`, `SETTING-9205`, `SETTING-9206`

### SETTING-9208 — V3-only preference import/export + Data Portability owner contract

**状态：DONE — 2026-09-10**

#### Goal

把旧的“版本字符串检查 + type cast + merge/overwrite”导入路径替换为 canonical V3-only portability。

#### Implemented scope

Preference-only format：

```text
schemaVersion: 3
exportedAt
preferences.presentation
preferences.regional
no identityId
no persistence revision/id
```

Pipeline：

```text
strict V3 decoder
-> Setting-owned PreferencePortableService
-> namespace CAS apply
-> import receipt
```

ADR-111 已 supersede 旧 migration clause，因此：

- v1/v2 Settings backup 明确 unsupported；
- 不存在 v1/v2 migrator、legacy category seeding、merge/overwrite compatibility option；
- device notification preference、NotificationPreference、AI、Knowledge、UserFiles path 不进入 `preferences@3`；
- import identity 始终来自 host ExecutionContext，portable payload 不接受 `identityId`。

Setting 现在提供 typed `PreferencePortableCapability` (`preferences@3`)；API/Electron host-facing Setting module handle 显式暴露该 capability，供 system-wide Data Portability V3 registry 在后续 PORT cutover 中注册。Data Portability 仍负责跨 owner orchestration，不读取 Setting repository/domain internals。

#### Evidence

- contracts V3/response focused: 3 files / 17 tests PASS；
- Setting owner/use-case/transport/lifecycle focused: 7 files / 52 tests PASS；
- App Vue Setting focused: 3 files / 12 tests PASS (export/import composable + canonical hydration/UI)；
- contracts direct strict typecheck PASS；
- Setting direct typecheck has no 9208-path errors（isolated worktree only lacks unrelated workspace package resolution for `@memoflow/ipc-client`）；
- `git diff --check` PASS。

#### Acceptance

- production Settings import/export 中无 `as Partial<UserSettingPreferences>` migration；
- production Settings import/export 中无 `merge/overwrite` legacy semantics；
- V3 portable preference data only contains presentation/regional owner facts；
- old V1/V2 backups fail closed under ADR-111。

#### Dependencies

`SETTING-9203`, `SETTING-9204`, `SETTING-9205`, `SETTING-9206`

### SETTING-9209 — Direct persistence/sync cutover and legacy deletion

**状态：DONE — 2026-09-10**

#### Goal

把 canonical namespace model 从“新表可用”切成 production sole truth，并按 ADR-111 destructive cutover 删除 legacy `UserSetting` 全轨。

#### Implemented scope

Persistence：

```text
Prisma        -> only UserPreferenceRecord
PowerSync     -> only user_preference_records
API upload    -> dedicated preference revision-CAS executor
Desktop watch -> only shared PowerSync schema tables
```

已删除：

- Prisma `UserSetting` model / Account `userSettings` relation；
- PowerSync `user_settings` table 与 API/Desktop table mapping；
- legacy UserSetting aggregate/repository/mappers/use-cases；
- `UserSettingPreferences` / `PreferenceCategory` / old DTO/category schemas/mocks/events；
- HTTP root GET/category PATCH/legacy reset/default routes；
- IPC `setting:all`, `setting:defaults`, `setting:patch`, `setting:reset`；
- Vue legacy `useUserSetting` + Pinia UserSetting store；
- unused React `useSettings`；
- Desktop `user_settings` renderer invalidation coupling。

Current Setting RPC surface is exactly seven channels:

```text
setting:import
setting:export
setting:preferences:profile
setting:preferences:reset
setting:preference:get
setting:preference:patch
setting:preference:reset
```

Standalone Setting import/export remains strict `preferences@3` V3-only.

#### Data Portability containment

PORT-1603 尚未完成，因此 current full-backup V2 **outer envelope** 暂时仍有 `settings` singleton，避免本票删除 legacy table 时减少 Goal/Task 等现有备份覆盖。但该 singleton 已不再承载 legacy Setting shape：

```text
settings.preferences
= strict UserPreferenceProfile
= presentation + regional only

export -> userPreferenceRepository.list(identity)
import -> transaction upsert presentation/regional user_preference_records
```

Prisma 与 PowerSync import 都直接写 canonical namespace rows，并推进 revision。V2 envelope 的最终删除仍由 PORT-1603 负责；这不是 legacy Setting persistence compatibility。

#### Schema cutover

- Prisma source schema 删除 `UserSetting`；
- generated Prisma Client 已 regenerate，`UserSetting` generated model 为零；
- explicit/manual destructive migration：`drop-legacy-user-settings.sql`；
- ADR-111 下不 backfill 当前旧行，部署/rollback 使用 reset/reseed 或 source rollback。

#### Must-be-zero evidence

Production source scan 为零：

```text
user_settings
UserSettingPreferences
PreferenceCategory
UserSettingClientDTO / UserSettingServerDTO
IUserSettingRepository
UserSettingPrismaRepository / UserSettingPowerSyncRepository
createSettingPrismaRepository
userSettingRepository
legacy get/patch/reset/default Setting application API
legacy Setting IPC channels
legacy UserSetting cloud events
```

历史分析/ADR 与 must-be-zero tests 可以提及旧名；production surface 不允许重新出现。

#### Verification evidence

- Setting full test suite: 16 files / 91 tests PASS；
- Data Portability full test suite: 34 files / 151 tests PASS；
- App Vue Setting module: 18 files / 68 tests PASS；
- App React strict typecheck PASS；
- API compose-setting: 2 files / 7 tests PASS；
- PowerSync shared schema: 5/5 PASS；
- API PowerSync preference/upload: 19/19 PASS；
- Desktop main PowerSync focused: 6/6 PASS；
- focused Setting/Data Portability contracts: 6 files / 45 tests PASS；
- Prisma `validate` PASS and Prisma Client `generate` PASS；
- PowerSync schema direct typecheck PASS；
- contracts direct typecheck PASS；
- V2 full-backup PowerSync round-trip remains green while using canonical preference rows；
- `git diff --check` PASS。

#### Acceptance

- database/contracts/client/transport have one canonical cloud preference truth；
- no permanent dual read/write or legacy fallback；
- deleting `user_settings` does not reduce current full-backup coverage；
- React/Vue/Desktop/Web no longer depend on legacy UserSetting model；
- next Setting-only ticket is SETTING-9210 review/archive。

#### Dependencies

`SETTING-9207`, `SETTING-9208`

### SETTING-9210 — Five-layer review / exact-head CI / docs truth / archive

**状态：PLANNED**

#### Goal

按 Core vNext 质量标准做完整 closure，而不是“能编译就归档”。

#### Layer 1 — Contract correctness

审：

- ownership；
- namespace strictness；
- timezone；
- revision；
- import/export；
- device/consent/feature boundary。

#### Layer 2 — Vertical completeness

每条 vertical 检查：

```text
contracts
application/domain
Prisma
PowerSync
HTTP
IPC
Vue
React/Mobile where applicable
DataPortability
runtime consumer
```

#### Layer 3 — Behavioral completeness

重点 fixture：

- timezone change cross-module consistency；
- multi-device unrelated preference update；
- stale revision；
- notification legacy migration；
- device-only isolation；
- fake controls absent；
- import migration warnings；
- consent fail-closed。

#### Layer 4 — Engineering quality

- no generic unknown settings bag；
- no hidden dual owner；
- no direct cross-module repositories；
- no ambient timezone；
- no decorative events；
- no dead compatibility code；
- no new god component/store。

#### Layer 5 — Plan/docs integrity

- ADR target == code truth；
- current product docs updated from “target” to “implemented”；
- module index updated；
- active plan has evidence per ticket；
- no P0/P1 unresolved。

#### Final gates

```text
focused contracts tests
setting/preferences tests
account regression
notification ADR-088 regression
reminder/routine/timezone regression
DataPortability tests
Prisma validate/generate
PowerSync parity
Vue/React typecheck
lint
build
docs:check
governance:check
full required CI on exact head
```

#### Archive rule

只有：

```text
no P0/P1
required CI green on exact merge head
legacy surface locks green
docs current truth updated
merge/delivery evidence captured
```

才把本 plan 移入 archived。

## 7. Dependency graph

```text
SETTING-9201  Design freeze/current map
      │
      ▼
SETTING-9202  Canonical contracts + namespace foundation
      │
      ├─────────────┬─────────────┬─────────────┐
      ▼             ▼             ▼             ▼
SETTING-9203   SETTING-9204  SETTING-9205  SETTING-9206
Account/Time   Notification  dead/fake      Device/local
convergence    convergence   retirement     seams
      │             │             │             │
      └─────────────┴──────┬──────┴─────────────┘
                           ▼
               ┌──────────────────────┐
               ▼                      ▼
          SETTING-9207            SETTING-9208
          Settings Hub UI         Migration/Portability
               └──────────┬───────────┘
                          ▼
                     SETTING-9209
                     legacy deletion
                          │
                          ▼
                     SETTING-9210
                     review/archive
```

## 8. Safe parallelism

在 `SETTING-9202` contract/schema foundation 冻结后：

```text
Lane A: SETTING-9203 Account + Product Time
Lane B: SETTING-9204 Notification + Device notification
Lane C: SETTING-9205 dead/fake category retirement
Lane D: SETTING-9206 device/local seams
```

可以并行，但必须满足：

- 每个 writer 有明确 worktree/file ownership；
- 不能两个 Worker 同时改 preference core contract/schema migration；
- Lane B 不重写 ADR-088 Notification core；
- Lane C 不删除 Lane A/B 尚未迁走的 compatibility field；
- `SETTING-9209` 只能在 owner migrations 全部 green 后执行。

## 9. Current status

```text
SETTING-9201  DONE — docs/design package only
SETTING-9202  DONE — canonical contracts + namespace persistence/CAS foundation
SETTING-9203  DONE — 2026-09-09
SETTING-9204  DONE — 2026-09-10
SETTING-9205  DONE — 2026-09-10
SETTING-9206  DONE — 2026-09-10
SETTING-9207  DONE — 2026-09-10
SETTING-9208  DONE — 2026-09-10
SETTING-9209  DONE — 2026-09-10
SETTING-9210  PLANNED
```

SETTING-9202/9203 已完成 canonical presentation/regional HTTP/IPC/UI 与 Product Time cutover，并完成 `Account.settings` retirement；fake/dead legacy categories 已由 `SETTING-9205` 退休；device/local profile scope 与 persistence 已由 `SETTING-9206` 收敛；Settings Hub owner composition 与 React/Mobile Notification owner parity 已由 `SETTING-9207` 收敛；Preferences V3-only portability 已由 `SETTING-9208` 收敛；legacy persistence/protocol/client hard deletion 已由 `SETTING-9209` 完成。Setting 主体实现只剩 `SETTING-9210` 五层 review/exact-head closure。

## 10. Definition of Done

最终仓库必须满足：

```text
Settings Hub = UI composition
User Preferences = presentation + regional only
Account no settings shadow
Notification no Setting shadow
Device state local
Feature/Consent not generic setting
User timezone single canonical resolution
per-namespace persistence + real revision
strict migration + portability
Prisma/PowerSync/HTTP/IPC/UI parity
no legacy dual track
```
