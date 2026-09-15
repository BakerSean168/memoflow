# TimeContext and TimePresentationStyle

Product Time has two separate owners. They must not be merged back into one style bag.

```text
TimeContext                         TimePresentationStyle
├── timeZone: branded TimeZoneId    ├── locale
└── weekStartsOn                    ├── dateStyle: short | medium | long
                                    ├── timeStyle: 12h | 24h
                                    ├── empty
                                    ├── relative
                                    └── duration
```

`TimeContext` changes calendar/wall-clock meaning. `TimePresentationStyle` changes only human-visible rendering.

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

`context` is required. There is no `defaultTime`, no mixed `TimeStyle`, no `withStyle`, and no host-local fallback.

## Presentation fields

| Path                | Effect                                                   |
| ------------------- | -------------------------------------------------------- |
| `locale`            | `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` locale |
| `dateStyle`         | semantic date density: `short` / `medium` / `long`       |
| `timeStyle`         | explicit `12h` / `24h`                                   |
| `empty.display`     | empty list/read presentation                             |
| `empty.input`       | empty form date/time value                               |
| `empty.unknown`     | unknown/unparseable display                              |
| `relative.maxAgeMs` | elapsed-duration threshold before absolute display       |
| `duration`          | duration-only presentation preferences                   |

Use `withContext(...)` for an explicitly resolved timezone/week-start change and `withPresentation(...)` for display changes. Domain code does not use locale as a business rule.

## Where context comes from

- **Signed-in server/application:** `UserTimeContextPort`, implemented by canonical Setting preferences.
- **Signed-in UI:** session Product Time bootstrapped from canonical `UserPreferenceProfile`.
- **Guest/device bootstrap:** an explicit validated IANA device timezone source.
- **Persisted schedule trigger:** the timezone snapshot owned by that trigger/schedule when the contract calls for one.

No layer may silently fall back to the server or browser timezone for business semantics.

## Third-party boundaries

- Product vocabulary is `Instant / Ymd / Hm / TimeContext`.
- UI calendar libraries are adapter-only (`CalendarDate ↔ Ymd`, `Time ↔ Hm`).
- Recurrence uses MemoFlow-owned `RecurrenceSchedule / RecurrenceEnginePort`; `rrule` types stay behind the adapter.
- `date-fns` production imports are confined to `packages/time/src/engine/**`.
- Fixed chart/export patterns may use the engine escape hatch; ordinary product UI uses semantic formatters.

## Anti-resurrection gates

TIME-1206 permanently retired ambient/mixed compatibility surfaces. CI enforces this with:

```text
tools/governance/product-time-surface-audit.mjs
tools/governance/date-fns-import-audit.mjs
eslint.config.ts date-fns engine-only restriction
tools/governance/time-registry.json canonical-only registry
```

The conformance suite includes Tokyo plus New York spring/fall DST transitions.
