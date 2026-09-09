---
tags:
  - plan
  - active
  - setting
  - preferences
  - refactor
description: Setting vNext — Settings Hub ownership、UserPreference、Product Time Context、Device/Feature/Consent、Persistence/PowerSync/Portability 单轨收敛实施计划
created: 2026-09-08T23:26:00+08:00
updated: 2026-09-08T23:26:00+08:00
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

**状态：ACTIVE / design frozen, implementation not started**
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
- canonical preference cloud uploads bypass the generic PowerSync last-write-wins `upsert/update` path: `PUT` only creates revision `1`, `PATCH` derives and enforces the previous revision through Prisma `updateMany(id + identityId + revision)`, create/update races surface explicit conflicts, and `/powersync/crud` returns HTTP `409` instead of silently overwriting. Current Desktop uploader leaves the conflicting transaction pending; conflict reload/reapply UX belongs to the immediate `SETTING-9203` consumer cutover, not this foundation ticket；
- both persistence adapters reject create revisions other than `1` and CAS documents that do not advance exactly one revision；
- current HTTP/IPC/UI module assembly still receives only the legacy `userSettingRepository`; the canonical repository is exposed as a separate host ingredient for `SETTING-9203`. There is no legacy backfill, fallback, mirroring or dual write in this checkpoint；
- focused verification: canonical contract suites `7/7` PASS; Setting `21 files / 138 tests` PASS; Time `10 files / 56 tests` PASS; PowerSync schema `5/5` PASS; canonical PowerSync cloud-upload/control-plane tests `4 files / 22 tests` PASS, and the PowerSync API module + CAS/control-plane rerun is `4 files / 20 tests` PASS; Setting/Time/PowerSync/API/Desktop typechecks all PASS after the upload-CAS patch; the final provider-neutral Prisma-error boundary repair then re-passed the PowerSync API `4 files / 20 tests`, API lint and full governance; API lint PASS with 0 warnings/errors, Desktop lint PASS with 3 inherited warnings / 0 errors, Setting lint PASS with 7 inherited warnings / 0 errors; API Setting composition `7/7` and Desktop composition surface `34/34` PASS; test inventory regenerated to `1202` files；
- full `contracts:test` still contains 11 inherited Task/Goal/docs-surface failures unrelated to this ticket; the new TimeZoneId/canonical-preference contract suites themselves are green.

#### Dependencies

`SETTING-9201`

### SETTING-9203 — Converge theme/language/timezone and retire `Account.settings` duplicate truth

**状态：PLANNED**

#### Goal

解决最危险的 user preference 双真值，尤其 timezone business divergence。

#### Scope

迁移 precedence：

```text
UserSetting valid value
  > Account.settings valid fallback
  > explicit product default/UTC policy
```

实现：

- backfill `presentation` / `regional`；
- `UserTimeContextPort`；
- Reminder/Routine/Task/Planner/Scheduler/Notification user-time consumers 改走 canonical context；
- Presentation bootstrap 改读 UserPreferenceProfile；
- Account UI 需要 theme/language/timezone 时通过 Settings Hub composition，不把值塞回 Account DTO；
- 完成读写 cutover 后删除 AccountSettings VO/API/DB JSON。

#### Protected contracts

- Account profile/auth 行为；
- schedule explicit timezone snapshot；
- server no ambient timezone；
- guest mode local TimeZoneSource。

#### Tests

- conflicting legacy timezone fixture：UserSetting wins；
- invalid UserSetting + valid Account fallback；
- both invalid -> explicit UTC + warning；
- host timezone changes but business results stable；
- theme/language mapping；
- Reminder server no longer imports/reads Account timezone；
- Account response schema no settings after cutover；
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

#### Dependencies

`SETTING-9202`

### SETTING-9204 — Converge Notification user/device preference ownership

**状态：PLANNED**

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

**状态：PLANNED**

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
- import returns explicit retired/re-consent warning；
- Wallet currency never changed by old locale.currency。

#### Acceptance

旧 fields 只允许出现在 migration fixture/历史 ADR/current-system evidence 中。

#### Dependencies

`SETTING-9202`

### SETTING-9206 — Establish device-local preference seams without creating a new God store

**状态：PLANNED**

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

#### Dependencies

`SETTING-9202`

### SETTING-9207 — Converge Settings Hub UI to owner composition

**状态：PLANNED**

#### Goal

让页面结构与 ownership 真正一致，并删除 root view 中跨 owner 的 local shadow refs。

#### Scope

- General -> UserPreference client；
- Knowledge -> Repository client；
- AI -> AI client；
- Notifications -> Notification + Device clients；
- Account -> Account/Auth；
- Data -> Preference portability + DataPortability + Desktop UserFiles；
- Advanced -> only real capabilities；
- section lazy loading / independent error states；
- owner-specific immediate-save receipt；
- reset scope 收缩；
- host capability gating；
- Web/Desktop/React/Mobile semantic parity。

#### Protected UI contract

```text
?tab=
settings-tab-{value}
```

在替代 deep-link/e2e contract 同时落地前保留。

#### Tests

- Vue unit/component；
- Settings E2E deep link；
- Account section no missing DI injection；
- AI/Knowledge section failure does not block General；
- device-only controls hidden on unsupported host；
- React/Mobile core presentation/regional parity。

#### Acceptance

Settings root 不再持有 privacy/experimental fake form shadow；每个 mutation 能追溯到唯一 owner port。

#### Dependencies

`SETTING-9203`, `SETTING-9204`, `SETTING-9205`, `SETTING-9206`

### SETTING-9208 — V3-only preference import/export + Data Portability owner contract

**状态：PLANNED**

#### Goal

把当前“版本字符串检查 + type cast”升级为 deterministic portability pipeline。

#### Scope

Preference-only format：

```text
schemaVersion: 3
preferences.presentation
preferences.regional
no identityId
```

Pipeline：

```text
strict decoder
-> v1/v2 migrator
-> canonical v3
-> owner apply
-> receipt/warnings
```

Data Portability：

- Preferences、Notification、Reminder、AI、Knowledge 等继续 owner-specific；
- legacy settings import 可以拆分旧字段给对应 owner migrator；
- retired/device/consent-like fields 有明确 warning 分类。

#### Tests

- v1 fixture；
- v2 fixture；
- v3 round-trip；
- injected/stolen identity rejected/ignored in favor of context；
- legacy notification owner precedence；
- legacy consent no auto-grant；
- retired field receipt；
- PowerSync/full export round-trip。

#### Acceptance

无 production `as Partial<UserSettingPreferences>` 作为 migration。

#### Dependencies

`SETTING-9203`, `SETTING-9204`, `SETTING-9205`, `SETTING-9206`

### SETTING-9209 — Direct persistence/sync cutover and legacy deletion

**状态：PLANNED**

#### Goal

把新模型从“新表可用”变成 production sole truth，彻底删除旧轨。

#### Scope

- all writers -> namespace records；
- all readers -> UserPreferenceProfile/owner ports；
- remove legacy compatibility reader；
- remove `user_settings` Prisma/PowerSync table；
- remove `accounts.settings`；
- remove old DTO/category schemas/mocks/events；
- remove Setting Desktop Notification event coupling；
- update data portability projection/importer names；
- schema generated artifacts regenerate；
- no stale docs/current wording。

#### Must-be-zero production truth

```text
UserSetting.preferences giant canonical model
user_settings table
Account.settings
AccountSettings
workflow preference category
privacy preference category
notification preference category in Setting
shortcuts cloud preference category
experimental preference category
ui cloud preference category
ai preference category
setting:user-setting-patched device-notification consumer
GetDefaultSettings fake identity
```

历史 ADR/current-system map/migration fixtures 可保留旧名。

#### Tests

- source surface lock；
- Prisma validate/generate；
- PowerSync schema mapping；
- full portability；
- Settings E2E；
- Account/Notification/Reminder focused regressions。

#### Acceptance

无永久 dual read/write；数据库和 contracts 只有单一 canonical preference truth。

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
SETTING-9203  PLANNED
SETTING-9204  PLANNED
SETTING-9205  PLANNED
SETTING-9206  PLANNED
SETTING-9207  PLANNED
SETTING-9208  PLANNED
SETTING-9209  PLANNED
SETTING-9210  PLANNED
```

SETTING-9202 已落地 production foundation，但当前 Settings HTTP/IPC/UI 仍未切到 canonical Preferences；`SETTING-9203` 才负责 consumer cutover 与旧 Account/Setting preference truth 删除。

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
