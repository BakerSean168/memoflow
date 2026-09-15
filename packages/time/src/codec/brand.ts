import type { Hm, Instant, TransferDate, Ymd } from '@memoflow/contracts/primitives';

export function isFiniteInstantMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Codec / test helper — brand a validated finite ms number as Instant. */
export function asInstant(ms: number): Instant {
  return ms as Instant;
}

/** Codec helper — TransferDate ≡ Instant. */
export function asTransferDate(ms: number): TransferDate {
  return ms as TransferDate;
}

export function asYmd(value: string): Ymd {
  return value as Ymd;
}

export function asHm(value: string): Hm {
  return value as Hm;
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isYmdShape(value: string): boolean {
  const m = YMD_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  // Reject impossible calendar days via a UTC round-trip; Ymd has no host zone.
  const probe = new Date(0);
  probe.setUTCFullYear(y, mo - 1, d);
  probe.setUTCHours(0, 0, 0, 0);
  return (
    probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d
  );
}

export function isHmShape(value: string): boolean {
  return HM_RE.test(value);
}

export { YMD_RE, HM_RE };
