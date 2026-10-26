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

**状态：** 已采纳（已实施，TIME-1202～1206）
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

## 6. Context-required facade

TIME-1206 已删除 `defaultTime` 与无参 `createTimeFacade()`。当前规则：

- 任何 Calendar / wall-clock / timezone-aware Format 行为必须显式持有 `TimeContext`；
- device timezone 只能在 app/bootstrap boundary 通过 `TimeZoneSource` 解析成显式 context；
- signed-in user context 来自 canonical Preference `UserTimeContextPort`；
- tests 使用 fixed Clock + fixed TimeContext，不允许依赖执行宿主 timezone。

## 7. Compatibility retirement result

TIME-1202～1206 已完成直接切换：

1. `TimeContext` 与 `TimePresentationStyle` 成为独立 canonical contract；
2. mixed `TimeStyle/PartialTimeStyle`、`withStyle`、`DEFAULT_TIME_STYLE` 删除；
3. user/business/UI current consumers 已迁到 explicit context；
4. ambient `defaultTime`、Date→Ymd/HH:mm convenience 与 deprecated Format wrappers 删除；
5. boundary/persistence 需要的 raw conversion 保留在 Codec/mapper/UI adapter，并要求明确语义；
6. Time Registry/ESLint/date-fns audit 与 Product Time surface audit 阻止旧 API 复活。

ADR-111 下不保留旧客户端/旧数据 compatibility promise。

## 8. Acceptance

- zh-CN / en-US fixture 真正影响 date/dateTime display；
- TimeContext.timeZone 真正影响 display date/time；
- ordinary module code 无 direct date-fns / toLocale product formatting；
- canonical calendar/business APIs 不再接受裸 number；
- retired ambient/mixed helpers 在 production source 中为 0，并由 anti-resurrection governance gate 持续约束。
