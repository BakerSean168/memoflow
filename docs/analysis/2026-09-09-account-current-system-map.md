---
tags: [analysis, account, vnext]
description: Account 当前系统、Cloud Auth 投影、Profile、Lifecycle 与 legacy settings 证据地图
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T00:31:00+08:00
---

# Account vNext Current-System Map

## 1. Executive finding

Account 仍然是有效的产品能力，但当前 Aggregate 同时承担了四类状态：

1. product profile；
2. Cloud Auth 登录邮箱/验证状态的本地投影；
3. theme/language/timezone/notification legacy settings；
4. Active/Suspended/Deactivated lifecycle。

其中只有 **product profile + product lifecycle** 应继续由 Account 持有。Setting vNext 已经决定 `Account.settings` 退出；ADR-039 已经决定登录邮箱/验证真值由 Better Auth 持有，因此 `ContactEmail` 只能是兼容投影，不能继续作为第二个可写真值。

## 2. Current state

```text
Account
├── id = cloud Better Auth user id / local owner id
├── profile
│   ├── nickname
│   ├── realName?
│   ├── avatarUrl?
│   ├── bio?
│   ├── gender
│   └── birthday?
├── email
│   ├── address
│   ├── isVerified
│   ├── verifiedAt
│   └── isPrimary
├── phone?
├── settings
│   ├── theme
│   ├── language
│   ├── timezone
│   └── notificationEnabled
├── status = Active | Suspended | Deactivated
├── version
└── timestamps
```

Cloud account provisioning uses Better Auth database hooks to create/update the same-id Account and calls `syncVerifiedEmail()` when the auth user is verified.

Desktop guest profiles also use Account semantics locally, but a guest does not have a Better Auth user/session. The UI already treats `@local.memoflow` addresses as guest implementation detail rather than a meaningful login address.

## 3. Proven strengths to preserve

- Better Auth user id and cloud Account id are the same identity; there is no parallel auth identity mapping.
- Local Profile access is independent from cloud session state.
- Account profile writes can be local-first on Desktop.
- Account closure has a durable coordinator, revocation adapter, operation state, retry/recovery and audit evidence.
- Birthday has already moved toward `Ymd` rather than mutable `Date` semantics.

## 4. Verified gaps

### A1 — `Account.settings` is duplicate truth

Setting vNext owns presentation/regional preferences and Notification owns delivery preferences. `Account.settings` still exposes `/me/settings`, emits `account:settings-updated`, persists a JSON column and is read by existing paths.

Impact: timezone/theme/language/notification can diverge across Account and UserPreference truth.

### A2 — login email exists in both Better Auth and Account

`CloudAuthUser.email/emailVerified` is authentication truth, while Account stores `emailAddress/emailIsVerified/emailVerifiedAt/emailIsPrimary` and exposes it in product DTOs.

Projection itself is not wrong, but the model currently makes it look like an independently mutable Account value object. Long-term it must either be read composition from Cloud Auth or an explicitly named read projection, never an Account business invariant.

### A3 — phone verification is modeled without a real product capability

`ContactPhone` has verification state and persistence, but no verified phone authentication/verification product path was found in the current primary UI/runtime. It is therefore speculative state.

### A4 — profile is broader than the primary Settings UI

The current Account settings surface actively edits nickname/avatar/bio. `realName`, gender and birthday remain in contracts and legacy/profile components, with limited current consumer value. They are not harmful enough for blind deletion, but must be classified as optional profile attributes rather than mandatory identity semantics.

### A5 — `Suspended` is not backed by a real product control plane

`AccountStatus.Suspended` exists and affects `close()`, but no production suspend command/admin workflow was found. Cloud access disablement exists separately in `CloudAuthUser.status/disabledAt`.

### A6 — Account `version` is not a real optimistic-concurrency control

The Aggregate exposes a version but normal profile/settings operations do not advance it; persistence saves the existing value. It should not be presented as a concurrency guarantee.

### A7 — direct `Date.now()` remains inside Account domain operations

`Account.create`, profile update, email projection and contact verification still obtain time directly rather than receiving an injected `Clock` / canonical Instant boundary.

## 5. Target boundary

```text
AccountProfile
├── accountId / owner identity
├── nickname
├── avatarUrl?
├── bio?
├── optional profile attributes
└── timestamps

AccountLifecycle
├── state: Active | Closed
└── closedAt?

CloudIdentitySummary (read composition, not Account truth)
├── email
├── emailVerified
└── provider/session capability summary
```

`Account.settings`, speculative phone verification and unsupported lifecycle states are retirement candidates.

## 6. Dependencies

- ADR-039 — Cloud Auth vs Local Profile Access
- ADR-092/093 — Settings ownership and Product Time Context
- ADR-104 — Account Profile/Lifecycle target
- ADR-105 — Cloud Auth authority target
