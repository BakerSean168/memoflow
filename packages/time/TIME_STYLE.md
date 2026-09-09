# TimeContext and TimePresentationStyle

Product Time now separates **calendar/wall-clock semantics** from **human-visible presentation**.

```text
TimeContext
├── timeZone: branded TimeZoneId
└── weekStartsOn

TimePresentationStyle
├── locale
├── empty
├── display
├── relative
└── duration
```

The old mixed `TimeStyle` remains only as a bounded compatibility projection while TIME-1203..1206 migrate existing callers.

## Canonical construction

```ts
const context = createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 });
const time = createTimeFacade({
  context,
  presentation: { locale: 'en-US', empty: { display: 'N/A' } },
});
```

Untrusted time-zone strings cross the boundary through `parseTimeZoneId`, `requireTimeZoneId`, or `createTimeContext`. Canonical `TimeContext` never stores raw unvalidated strings.

## Presentation fields

| Path                        | Effect                                                             |
| --------------------------- | ------------------------------------------------------------------ |
| `empty.display`             | `format.hm/date/dateTime/relative(null)` and list empty-time cells |
| `empty.input`               | Form date/time empty string                                        |
| `empty.unknown`             | Unparseable display                                                |
| `display.hm`                | `format.hm` pattern (default `HH:mm`)                              |
| `display.date` / `dateTime` | Density: short / medium / long                                     |
| `locale`                    | Intl + relative                                                    |
| `relative.maxAgeMs`         | Beyond → absolute `dateTime`                                       |

## Semantic priority

```text
canonical TimeContext
  + TimePresentationStyle override
    > legacy TimeStyle adapter
      > DEFAULT_TIME_PRESENTATION_STYLE / DEFAULT_TIME_STYLE compatibility defaults
```

Use `withContext(...)` for product timezone/week-start changes and `withPresentation(...)` for locale/display changes. `withStyle(...)` exists only for migration compatibility.

Domain code must **not** read UI locale for business rules. Calendar timezone behavior is migrated in TIME-1203 and Format timezone/locale behavior in TIME-1204; TIME-1202 establishes the ownership split without silently changing existing host-local calendar behavior.

## Third-party conversion boundaries

`Instant / Ymd / Hm` remain the only product time vocabulary. Third-party date types are adapter-only:

- the internal UI adapter converts `Ymd/Hm` to and from `@internationalized/date` `CalendarDate/Time` values;
- recurrence consumers use MemoFlow-owned `RecurrenceSchedule` / `RecurrenceEnginePort`; `rrule` types stop inside the recurrence adapter;
- feature contracts under `@memoflow/contracts` must not import `rrule`, `ical.js`, or `@internationalized/date`;
- recurrence receives a branded, resolved IANA zone through the Time boundary;
- the package does not import Setting: Setting will supply `TimeContext` through an application adapter.

The conformance suite includes Tokyo plus New York spring/fall DST transitions. Temporal is not a second product time model; if adopted later, it belongs at a dedicated adapter edge only.
