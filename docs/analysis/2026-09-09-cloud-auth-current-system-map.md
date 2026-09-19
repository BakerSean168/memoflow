---
tags: [analysis, authentication, better-auth, local-profile]
description: Cloud Auth / Authentication 当前系统与 Better Auth ownership 证据地图
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T00:31:00+08:00
---

# Cloud Auth / Authentication Current-System Map

## 1. Executive finding

`@memoflow/cloud-auth` 的总体方向已经正确：它应继续是 Better Auth 的 **host adapter / authentication capability boundary**，而不是 MemoFlow 自建 Authentication bounded context。

需要收敛的不是替换 Better Auth，而是去掉剩余的重复 product state，并让 access enforcement、Account lifecycle 与 Desktop Local Profile Access 的关系更加显式。

## 2. Current authority

Better Auth persistence owns:

```text
CloudAuthUser
CloudAuthSession
CloudAuthProviderAccount
CloudAuthVerification
CloudAuthDeviceCode
```

`createCloudAuth()` owns:

- email/password registration and sign-in;
- required email verification;
- reset/change password;
- GitHub social login when configured;
- bearer sessions;
- Desktop device authorization;
- session revocation;
- account-closure access gate;
- Account provisioner hooks.

Desktop Local Profile Access remains separate and must not depend on cloud session validity.

## 3. Protected assets

- Better Auth is the only cloud credential/session runtime.
- Business packages do not import Better Auth private types.
- renderer does not persist bearer credentials.
- device authorization is explicit and profile-scoped.
- GitHub identity OAuth and GitHub Knowledge App authorization remain separate.
- closure blocks new/continuing cloud access while local Profile remains independently accessible.

## 4. Verified gaps

### AUTH1 — `CloudAuthUser.status/disabledAt` and `Account.status` look like two lifecycles

In practice `CloudAuthUser.status/disabledAt` is used to enforce authentication access after closure, while Account has `Active/Suspended/Deactivated`. These should not evolve independently.

Target semantics:

```text
Account lifecycle = product business state
Auth disabledAt   = enforcement projection/credential gate
```

### AUTH2 — Account provisioning copies authentication email state into Account

The provisioning hook is valuable, but its target should not be a second mutable login-email value object. Product surfaces needing both profile and login email should compose them.

### AUTH3 — custom request-access logic is security-sensitive glue

`checkRequestAccess()` manually resolves existing sessions, reads email/identifier from auth request bodies and applies closure policies. This should remain a narrow policy adapter with characterization tests; it must not grow into a second auth router/state machine.

### AUTH4 — provider account fields are Better Auth internals

OAuth access/refresh/id tokens and password hash fields belong exclusively to Better Auth persistence. They must never enter Data Portability, Account DTOs, AI context or generic product events.

### AUTH5 — cloud capability vs local capability must remain explicit

A valid local Profile can be open while cloud is `REAUTH_REQUIRED` or offline. No new global `isAuthenticated` gate may re-couple them.

## 5. Target boundary

```text
Cloud Authentication Capability
├── Better Auth runtime
├── Credential / Provider bindings
├── Session authority
├── Verification / password flows
├── Device authorization
├── CloudPrincipal projection
└── AccessEnforcementPolicy

Desktop Profile Access
├── local Profile selection
├── unlock/key boundary
└── CloudBinding capability state

Account
└── product profile + lifecycle
```

No new Authentication Aggregate is required.
