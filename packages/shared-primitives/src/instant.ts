/**
 * Instant — UTC timeline point as epoch **milliseconds**.
 *
 * **≡ TransferDate** (ADR-037). Wire/DTO/JSON continue to use number ms.
 *
 * Construction discipline: prefer `@memoflow/time` Codec (`fromTransfer`,
 * `fromJsDate`, `combineYmdHm`, …). Do not use bare numbers for *calendar days*
 * — those are `Ymd`. Do not mix seconds vs ms.
 *
 * Note: Instant is intentionally a number alias at the type layer so OpenAPI
 * and existing DTO fields stay assignable; nominal protection for calendar
 * days is on `Ymd` / `Hm`. Runtime validation lives in Codec (`isInstant`,
 * `assertInstant`, finite checks).
 */
export type Instant = number;

/**
 * @deprecated Use Instant. Alias retained for docs migration only.
 */
export type InstantMs = Instant;
