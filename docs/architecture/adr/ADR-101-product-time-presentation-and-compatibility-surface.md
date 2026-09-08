---
tags:
  - adr
  - time
  - presentation
  - compatibility
  - vnext
description: ADR-101 - Product Time presentation style、locale-aware formatting 与 Date/number compatibility surface 收敛
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# ADR-101: Product Time Presentation 与 Compatibility Surface

**状态：** 已采纳（待实施）
**日期：** 2026-09-09
**依赖：** ADR-100

## 1. Decision

将当前混合 `TimeStyle` 收敛为：

```text
TimeContext
= timeZone + weekStartsOn

TimePresentationStyle
= locale + date/time display + empty + relative + duration
```

同时逐步收窄 public compatibility surface：canonical business/product API 使用 branded primitives，裸 `number` / mutable `Date` 只留在明确 boundary adapter。

## 2. Presentation target

```text
TimePresentationStyle
├── locale
├── dateStyle
├── timeStyle
├── empty
├── relative
├── duration
└── optional named product display slots
```

产品 UI 不直接使用 date-fns pattern 作为 preference contract。

## 3. Locale-aware rendering

当前固定 pattern 与 `locale` 参数存在漂移。目标优先复用：

```text
Intl.DateTimeFormat
Intl.RelativeTimeFormat
```

完成：

- locale-aware date/dateTime；
- context timezone-aware presentation；
- 12/24-hour preference；
- localized month/day names。

`date-fns` 继续承担适合的 calendar arithmetic 和被登记的固定 export/chart pattern，不把 locale pattern burden 全部手工维护在 MemoFlow。

## 4. Canonical input types

长期 stable public API 首选：

```text
Instant
Ymd
Hm
Duration*
```

逐步退休/隔离：

```text
Instant | number
Date -> Ymd convenience
arbitrary string date input
```

Raw number / Date 的转换集中在 Codec/mapper/UI adapter。

## 5. Pattern escape hatch

当前 `format.pattern()` 暴露任意 date-fns-compatible token。长期规则：

- ordinary product UI 使用 named semantic formatter；
- fixed chart/export/interop format 可以用登记的 pattern slot；
- arbitrary pattern 不作为 UserPreference 持久化值；
- business modules 不通过 pattern API重新创造自己的产品时间风格。

## 6. Default context

`defaultTime` 作为便捷全局 facade 可以继续存在于纯 presentation/legacy surface，但：

- server business logic 不得依赖其 host-local default；
  -需要 timezone/day-boundary 的业务逻辑必须显式注入 context/facade；
- tests 必须使用 fixed Clock + fixed TimeContext。

## 7. Compatibility migration

按顺序：

1. 增加新 Context/Presentation contract；
2. 保留短期旧 `TimeStyle` adapter；
3. 迁移 user/business consumers；
4. 迁移 UI formatter；
5. 收窄 `Instant | number`；
6. 将 `Date` helper 降为 boundary-only export 或删除；
7. 更新 Time Registry/ESLint surface lock。

禁止长期双 API 都被文档称为 canonical。

## 8. Acceptance

- zh-CN / en-US fixture 真正影响 date/dateTime display；
- TimeContext.timeZone 真正影响 display date/time；
- ordinary module code 无 direct date-fns / toLocale product formatting；
- canonical calendar/business APIs 不再接受裸 number；
- legacy helpers 有明确 retire list。
