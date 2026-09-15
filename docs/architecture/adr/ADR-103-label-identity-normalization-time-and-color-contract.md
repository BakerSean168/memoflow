---
tags:
  - adr
  - label
  - identity
  - normalization
  - time
  - color
  - vnext
description: ADR-103 - Label identity/normalization、Product Time timestamp 与 typed color contract
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# ADR-103: Label Identity、Normalization、Time 与 Color Contract

**状态：** 已采纳（已实施，LABEL-1302/1305）
**日期：** 2026-09-09
**依赖：** ADR-102、ADR-037/100

## 1. Decision

保留 Label 作为稳定 identity-scoped 用户资产，并进一步收紧三个 foundation contract：

1. normalization 唯一实现/唯一测试 fixture；
2. timestamps 使用 Product Time `Instant` + injected Clock；
3. color 从任意 string 收敛为明确 typed policy。

## 2. Label identity

```text
LabelId
identityId
name
normalizedName
color?
createdAt: Instant
updatedAt: Instant
```

Label rename 不改变 LabelId；Goal/Task assignment 指 LabelId，所以 rename 不破坏分类关系。

## 3. Normalization

canonical algorithm继续：

```text
trim
Unicode NFKC
case-insensitive normalization
```

唯一性：

```text
unique(identityId, normalizedName)
```

要求：所有**会产生 normalizedName** 的路径共享同一 fixture，不各自复制轻微不同的 normalize 语义。当前 server domain 与 legacy Task migration helper 均消费 `tools/test/fixtures/label-normalization.json`；Prisma/PowerSync repository 只消费已 canonicalize 的 `normalizedName`，不重新实现 normalize。Nx unit/coverage cache input 也显式包含该 fixture。

本轮不引入 slug 化，也不自动把空格替换为 `-`。

## 4. Batch name lookup

新增 registry capability：

```text
findByNormalizedNames(identityId, names[])
```

`resolveNames()` 不再先拉取最多 500 个 Label 再内存匹配。

并发创建仍依赖 unique constraint + re-read 保证 replay-safe。

## 5. Product Time

实现后：

```text
Clock.now() -> Instant
```

`LabelService` 构造必须注入 `Clock`；API/Desktop host 使用 `createSystemClock()`，测试使用 fixed Clock。create 只采样一次并同时写 `createdAt/updatedAt`；update 把同一个 injected Clock 产生的 Instant 显式传入 repository。Label application/domain 不再调用 `Date.now()` 或 ambient `new Date()`。

Label 不需要完整 TimeFacade，只依赖最窄 `Clock`/Instant seam，避免把 presentation/calendar 依赖带进 shared registry。

## 6. Color policy

实现 inventory 后选择 **Option B — custom RGB**：

```text
LabelColor = #RRGGBB | null
```

运行时使用唯一 `LabelColorSchema`：

- 只接受 6 位 RGB hex；
- 输入大小写均可，持久化/DTO canonicalize 为 lowercase `#rrggbb`；
- 拒绝 `#fff`、named color、`rgb(...)`、`var(...)` 等 arbitrary CSS-like string；
- Label/Goal/Task 的 persistence projection 都必须经过同一个 schema。

选择依据：当前 Label 创建 UI 没有 palette-token picker，production Label color 使用点只需要 `null` 或 RGB hex；未发现需保留的非 6 位 hex Label 数据。ADR-111 destructive cutover 下本轮不增加无依据的 legacy color migration。

## 7. Client DTO

当前 current-user DTO 不返回 identityId，这是正确的；继续保护 host-owned identity。

`normalizedName` 主要是 server/index/query concern，不必默认作为 presentation DTO 暴露。

## 8. Acceptance

- normalization-producing paths共享 canonical fixture，repositories不重新 normalize；
- Label timestamps使用 canonical `Instant` type + injected Clock；
- no `Date.now()` in Label domain/application；
- resolveNames批量查询不受 500-row list 限制；
- color contract不接受任意 CSS-like string，所有 owner projection复用同一 schema；
- rename 保持 LabelId/assignments稳定；
- root governance阻止 ownership/time/color surface resurrection。
