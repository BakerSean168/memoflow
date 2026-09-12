# `@memoflow/time`

MemoFlow Product Time owner package (ADR-037, ADR-100, ADR-101).

## Role

| Layer                        | Responsibility                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| **This package**             | explicit `TimeContext` · Clock · Codec · Format · Input · Calendar · Recurrence adapter |
| **Presentation**             | `TimePresentationStyle` only: locale/date/time/empty/relative/duration                  |
| **Engine** (`src/engine/**`) | only production location allowed to import `date-fns`                                   |
| **Contracts primitives**     | `Instant`, `Ymd`, `Hm`, branded `TimeZoneId`                                            |

There is no ambient/default Product Time facade. Calendar or wall-clock behavior always starts from an explicit `TimeContext`.

## Quick start

```ts
import { createFixedClock, createTimeContext, createTimeFacade } from '@memoflow/time';

const context = createTimeContext({
  timeZone: 'Asia/Tokyo',
  weekStartsOn: 1,
});

const time = createTimeFacade({
  context,
  clock: createFixedClock(Date.UTC(2026, 6, 26, 12, 0, 0)),
  presentation: {
    locale: 'zh-CN',
    empty: { display: '—' },
  },
});

time.calendar.toYmd(time.now());
time.format.hm(time.now());
time.codec.parseYmd('2026-07-26');
```

`createTimeFacade()` without `context`, mixed `TimeStyle`, `defaultTime`, `withStyle`, host-local Date→Ymd helpers and business `date-fns` imports were retired by TIME-1206.

## Boundaries

- Device timezone discovery is explicit (`createSystemTimeZoneSource`) and belongs at app/bootstrap boundaries.
- Signed-in user Product Time comes from Setting's `UserTimeContextPort` / canonical regional preferences.
- Persisted schedule timezone snapshots remain owned by their schedule/trigger contract and are not silently rewritten when user preferences change.
- `Ymd` is date-only. Do not encode it as an epoch midnight.
- Durations/rate limits/retention may use elapsed milliseconds when their product semantics are intentionally rolling durations.

## Docs

- Constitution: `docs/architecture/adr/ADR-037-product-time-system.md`
- Context/calendar ADR: `docs/architecture/adr/ADR-100-product-time-context-and-timezone-aware-calendar.md`
- Presentation/public-surface ADR: `docs/architecture/adr/ADR-101-product-time-presentation-and-compatibility-surface.md`
- Design: `docs/architecture/product-time-system.md`
- Presentation knobs: [`TIME_STYLE.md`](./TIME_STYLE.md)
- Registry: `tools/governance/time-registry.json`

## Verification

```bash
pnpm nx run time:test
pnpm nx run time:build
pnpm nx run time:typecheck
node tools/governance/product-time-surface-audit.mjs
node tools/governance/date-fns-import-audit.mjs
```
