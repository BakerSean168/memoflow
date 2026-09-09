# TimeContext and TimePresentationStyle

Product Time now separates **calendar/wall-clock semantics** from **human-visible presentation**.

```text
TimeContext
├── timeZone: branded TimeZoneId
└── weekStartsOn

TimePresentationStyle
├── locale
├── dateStyle: short | medium | long
├── timeStyle: 12h | 24h
├── empty
├── relative
└── duration
```

The old mixed `TimeStyle` remains only as deletion debt while TIME-1205/1206 switch current callers and remove the legacy surface. ADR-111 does not require old-client or old-data compatibility.

## Canonical construction

```ts
const context = createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 });
const time = createTimeFacade({
  context,
  presentation: {
    locale: 'en-US',
    dateStyle: 'medium',
    timeStyle: '24h',
    empty: { display: 'N/A' },
  },
});
```

Untrusted time-zone strings cross the boundary through `parseTimeZoneId`, `requireTimeZoneId`, or `createTimeContext`. Canonical `TimeContext` never stores raw unvalidated strings.

## Presentation fields

| Path                | Effect                                                                |
| ------------------- | --------------------------------------------------------------------- |
| `locale`            | `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` locale              |
| `dateStyle`         | semantic date density: `short` / `medium` / `long`                    |
| `timeStyle`         | explicit `12h` / `24h`; 24-hour presentation uses `h23`               |
| `empty.display`     | `format.hm/date/dateTime/relative(null)` and list empty-time cells    |
| `empty.input`       | Form date/time empty string                                           |
| `empty.unknown`     | Unknown / unparseable display                                         |
| `relative.maxAgeMs` | Beyond → the same locale/timezone-aware absolute `dateTime` formatter |

## Semantic priority

```text
canonical TimeContext
  + TimePresentationStyle override
    > legacy TimeStyle adapter
      > DEFAULT_TIME_PRESENTATION_STYLE / DEFAULT_TIME_STYLE compatibility defaults
```

Use `withContext(...)` for product timezone/week-start changes and `withPresentation(...)` for locale/date/time display changes. `withStyle(...)` is legacy deletion debt for TIME-1206.

Domain code must **not** read UI locale for business rules. TIME-1203 made Calendar/Input timezone-aware; TIME-1204 made human presentation locale/timezone-aware. TIME-1205/1206 finish current-consumer cutover and delete the remaining legacy surface.

## Third-party conversion boundaries

`Instant / Ymd / Hm` remain the only product time vocabulary. Third-party date types are adapter-only:

- the internal UI adapter converts `Ymd/Hm` to and from `@internationalized/date` `CalendarDate/Time` values;
- recurrence consumers use MemoFlow-owned `RecurrenceSchedule` / `RecurrenceEnginePort`; `rrule` types stop inside the recurrence adapter;
- fixed chart/export patterns stay inside the date-fns engine and use official `@date-fns/tz` `TZDateMini` for explicit-zone formatting;
- ordinary product UI uses semantic Intl formatters and does not persist date-fns pattern tokens;
- feature contracts under `@memoflow/contracts` must not import `rrule`, `ical.js`, `@internationalized/date`, or `@date-fns/tz`;
- recurrence receives a branded, resolved IANA zone through the Time boundary;
- the package does not import Setting: Setting will supply `TimeContext` through an application adapter.

The conformance suite includes Tokyo plus New York spring/fall DST transitions. Temporal is not a second product time model; if adopted later, it belongs at a dedicated adapter edge only.
