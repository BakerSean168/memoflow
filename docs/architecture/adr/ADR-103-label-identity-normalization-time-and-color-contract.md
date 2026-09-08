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

**状态：** 已采纳（待实施）
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

要求：DB migration/helper、server domain、PowerSync tests 共享同一 fixture，不各自复制轻微不同的 normalize 实现。

本轮不引入 slug 化，也不自动把空格替换为 `-`。

## 4. Batch name lookup

新增 registry capability：

```text
findByNormalizedNames(identityId, names[])
```

`resolveNames()` 不再先拉取最多 500 个 Label 再内存匹配。

并发创建仍依赖 unique constraint + re-read 保证 replay-safe。

## 5. Product Time

LabelService 当前直接使用 `Date.now()` 与裸 number。

目标：

```text
Clock.now() -> Instant
```

Label 不需要完整 TimeFacade，只依赖最窄 `Clock`/Instant seam，避免把 presentation/calendar 依赖带进 shared registry。

## 6. Color policy

实现前先按现有 UI真实需求选择一个明确策略：

### Option A — palette token（优先，如果 UI 使用受控 palette）

```text
gray | red | orange | yellow | green | blue | purple | pink
```

### Option B — custom RGB

严格：

```text
#RRGGBB
```

不能继续以“任意 <=32 字符”作为稳定产品语义。

如果当前产品证据不足以决定 A/B，实施 ticket 必须先 inventory 现有 label color values/UI picker；在此之前不做 destructive migration。

## 7. Client DTO

当前 current-user DTO 不返回 identityId，这是正确的；继续保护 host-owned identity。

`normalizedName` 主要是 server/index/query concern，不必默认作为 presentation DTO 暴露。

## 8. Acceptance

- normalization fixture跨 server/migration/Prisma/PowerSync 一致；
- Label timestamps是 branded Instant；
- no `Date.now()` in Label domain/application；
- resolveNames批量查询不受 500-row list 限制；
- color contract不接受任意 CSS-like string；
- rename 保持 LabelId/assignments稳定。
