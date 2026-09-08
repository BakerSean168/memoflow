---
tags: [adr, authentication, better-auth, desktop-profile, security]
description: Better Auth 单一认证权威、Access Enforcement 与 Desktop Local Profile Access 边界
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T00:31:00+08:00
---

# ADR-105: Cloud Auth, Access Enforcement and Local Profile Boundary

**状态：** 已采纳，待实施  
**日期：** 2026-09-09  
**修订：** ADR-039 的第二轮收敛；不替换 Better Auth。

## Decision

### 1. `@memoflow/cloud-auth` is a capability adapter, not a business domain

Better Auth remains the only authority for:

```text
credentials
verification
provider bindings
password state
sessions
device authorization
```

MemoFlow 不建立平行 Authentication Aggregate/Session/Provider tables。

### 2. Explicit three-state ownership

```text
Account lifecycle
= product account Active/Closed

Cloud Auth access state
= whether credential/session may access cloud

Desktop Profile access
= local selected/unlocked container
```

三者不能用一个 `isAuthenticated`/status 表达。

### 3. `CloudAuthUser.status/disabledAt` is enforcement projection

关闭 Account 时 durable closure coordinator 更新 Account lifecycle 并撤销/禁用 cloud auth。`disabledAt` 只回答“是否允许认证访问”，不单独产生产品 lifecycle。

### 4. Narrow product seam

业务模块只消费：

```text
CloudPrincipal
CloudSessionCapability
CloudAccessPolicy / resolver
```

Better Auth private DTO/table/plugin types 不越过 host boundary。

### 5. Request policy must stay narrow

现有 closure `checkRequestAccess()` 的 manual session/body inspection 属安全边界；保留 characterization，但禁止继续吸收 profile、preference、authorization business rules。能由 Better Auth hook/plugin表达的逻辑优先留在 Better Auth extension seam；MemoFlow 只保留 account-closure 等 product-specific gate。

### 6. Secret and portability rules

CloudAuthSession tokens、OAuth access/refresh/id token、password、verification value、device code 不进入：

- Data Portability importable backup；
- Account DTO；
- AI Context/Memory；
- generic event payload；
- logs/traces。

Server-held disclosure 如法律要求列举时也必须使用 safe metadata/redaction policy。

## Non-goals

- 不替换 Better Auth；
- 不引入第二 auth provider abstraction layer；
- 不把 Desktop local Profile 变成 cloud user；
- 不因 cloud session 失效而锁本地业务数据。
