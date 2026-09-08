---
tags:
  - analysis
  - time
  - label
  - reuse
  - oss
description: Time/Label vNext 复用账本——直接复用、薄适配、领域所有权与禁止自研边界
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# Time / Label vNext Reference & Reuse Ledger

## 1. Rule

本轮遵循 ADR-058：标准能力优先复用成熟实现，MemoFlow 自己拥有产品语义与 adapter，不复制第三方实现，也不为“架构统一”重写已经验证的 foundation。

## 2. Time reuse ledger

| Capability                   | Decision                                                              | Boundary                                                       |
| ---------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| date arithmetic              | **REUSE date-fns**                                                    | 只通过 Time engine/adapter；业务不得 direct import             |
| locale/timezone presentation | **REUSE Intl.DateTimeFormat / RelativeTimeFormat**                    | Product Style/Context 由 MemoFlow 定义                         |
| UI calendar date values      | **REUSE `@internationalized/date` where current UI adapter needs it** | UI adapter boundary only                                       |
| recurrence                   | **REUSE rrule 2.8.1**                                                 | `RecurrenceEnginePort` terminates third-party types            |
| timezone registry            | **REUSE platform Intl IANA support**                                  | MemoFlow validates/brands `TimeZoneId`;不自建 tzdb             |
| product primitives           | **MEMOFLOW OWNED**                                                    | `Instant / Ymd / Hm / TimeZoneId`                              |
| DST business policy          | **MEMOFLOW OWNED**                                                    | reject/shift/ambiguity policy is product semantics             |
| Product Time Context         | **MEMOFLOW OWNED**                                                    | timezone/week-start resolution, injected from Preferences/host |
| display style                | **MEMOFLOW OWNED**                                                    | locale/date/time density/empty/relative preferences            |

### Do not build

- 不自研 tz database；
- 不自研 RRULE parser；
- 不把 date-fns re-export 当产品 API；
- 不引入 Moment/Day.js 与现有体系并行；
- 不要求 Temporal 才能完成本轮收敛。

## 3. Label reuse ledger

| Capability                  | Decision                                       | Boundary                                                   |
| --------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| label registry UX semantics | **LEARN from existing ADR-054 references**     | Vikunja/Tasks.org/Super Productivity 仅借鉴语义与交互      |
| normalization               | **MEMOFLOW OWNED small policy**                | trim + Unicode normalization + case-insensitive uniqueness |
| persistence                 | **REUSE Prisma / PowerSync existing adapters** | 不重写数据库框架                                           |
| assignment                  | **OWNER DOMAIN OWNED**                         | GoalLabel by Goal, TaskLabel by Task                       |
| AI human-name resolution    | **REUSE existing `resolveNames` pattern**      | 优化查询，不改变 replay/concurrency semantics              |
| color validation            | **MEMOFLOW OWNED tiny contract**               | palette token or strict hex；不引 CSS parser               |

### Do not build

- 不做 generic `LabelAssignment(targetType,targetId)`；
- 不把 System Views 做成 synthetic labels；
- 不建 folder/category/tag 三套平行 taxonomy；
- 不让 Label module import Goal/Task repositories；
- 不复制 AGPL/GPL 第三方实现代码。

## 4. Shared-foundation hierarchy

```text
Product Time
= lowest-level product semantic foundation

Shared Label Registry
= persistent shared user asset
= may itself consume Product Time (Instant/Clock)

Goal / Task / Routine / ...
= owner domains
= consume Time
= optionally reference Label Registry
```

这意味着 Time 与 Label 都可复用，但它们不是同一种“公共包”：Time 是无业务持久状态的 shared kernel；Label 是 identity-owned persistent shared domain capability。
