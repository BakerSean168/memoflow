import type { Hm, Instant, TransferDate, Ymd } from '@memoflow/contracts/primitives';
import type { OnInvalid, TimeEngine, TimeZonePolicy } from '../types';
import {
  asHm,
  asInstant,
  asTransferDate,
  asYmd,
  isFiniteInstantMs,
  isHmShape,
  isYmdShape,
} from './brand';
import { combineYmdHmWithTimeZone } from '../engine/date-fns-engine';

export interface CodecOptions {
  onInvalid?: OnInvalid;
  /** Override style timeZone for this call */
  timeZone?: TimeZonePolicy;
}

export interface TimeCodec {
  isInstant(value: unknown): value is Instant;
  assertInstant(value: unknown): asserts value is Instant;
  fromTransfer(t: TransferDate | number, options?: CodecOptions): Instant | null;
  toTransfer(i: Instant): TransferDate;
  /** Infra edge: JS Date → Instant. Never substitutes now on invalid. */
  fromJsDate(d: Date, options?: CodecOptions): Instant | null;
  /** Infra edge only — domain/UI use Instant. */
  toJsDate(i: Instant): Date;
  parseYmd(raw: string | null | undefined, options?: CodecOptions): Ymd | null;
  toYmd(instant: Instant): Ymd;
  parseHm(raw: string | null | undefined, options?: CodecOptions): Hm | null;
  combineYmdHm(ymd: Ymd, hm: Hm, options?: CodecOptions): Instant | null;
  startOfYmd(ymd: Ymd, options?: CodecOptions): Instant;
}

function resolveInvalid<T>(options: CodecOptions | undefined, message: string): T | null {
  const policy = options?.onInvalid ?? 'null';
  if (policy === 'throw') {
    throw new TypeError(message);
  }
  return null;
}

export function createCodec(engine: TimeEngine, defaultZone: TimeZonePolicy = 'local'): TimeCodec {
  return {
    isInstant(value: unknown): value is Instant {
      return isFiniteInstantMs(value);
    },

    assertInstant(value: unknown): asserts value is Instant {
      if (!isFiniteInstantMs(value)) {
        throw new TypeError(`Expected finite Instant (epoch ms), got ${String(value)}`);
      }
    },

    fromTransfer(t: TransferDate | number, options?: CodecOptions): Instant | null {
      if (!isFiniteInstantMs(t)) {
        return resolveInvalid(options, `Invalid TransferDate / Instant: ${String(t)}`);
      }
      return asInstant(t);
    },

    toTransfer(i: Instant): TransferDate {
      return asTransferDate(i);
    },

    fromJsDate(d: Date, options?: CodecOptions): Instant | null {
      if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
        return resolveInvalid(options, `Invalid JS Date: ${String(d)}`);
      }
      return asInstant(d.getTime());
    },

    toJsDate(i: Instant): Date {
      return new Date(i);
    },

    parseYmd(raw: string | null | undefined, options?: CodecOptions): Ymd | null {
      if (raw == null || raw === '') {
        return resolveInvalid(options, 'Empty Ymd string');
      }
      if (!isYmdShape(raw)) {
        return resolveInvalid(options, `Invalid Ymd: ${raw}`);
      }
      return asYmd(raw);
    },

    toYmd(instant: Instant): Ymd {
      return engine.toYmd(instant);
    },

    parseHm(raw: string | null | undefined, options?: CodecOptions): Hm | null {
      if (raw == null || raw === '') {
        return resolveInvalid(options, 'Empty Hm string');
      }
      if (!isHmShape(raw)) {
        return resolveInvalid(options, `Invalid Hm: ${raw}`);
      }
      return asHm(raw);
    },

    combineYmdHm(ymd: Ymd, hm: Hm, options?: CodecOptions): Instant | null {
      const zone = options?.timeZone ?? defaultZone;
      const combined = combineYmdHmWithTimeZone(ymd, hm, zone);
      if (combined == null) {
        return resolveInvalid(options, `Cannot combine Ymd=${ymd} Hm=${hm} zone=${zone}`);
      }
      return combined;
    },

    startOfYmd(ymd: Ymd, options?: CodecOptions): Instant {
      const zone = options?.timeZone ?? defaultZone;
      const combined = combineYmdHmWithTimeZone(ymd, asHm('00:00'), zone);
      if (combined != null) return combined;
      return engine.fromYmdStart(ymd);
    },
  };
}
