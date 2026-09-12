import type { Hm, Instant, Ymd } from '@memoflow/contracts/primitives';
import type { TimeCodec } from '../codec/codec';
import type { TimeContext, TimePresentationStyle } from '../types';
import { asInstant } from '../codec/brand';
import { instantToHmInTimeZone } from '../timezone/wall-clock';

export interface InputApi {
  dateValue(instantOrYmd: Instant | number | Ymd | string | null | undefined): string;
  timeValue(instant: Instant | number | null | undefined): string;
  parseDateValue(raw: string): Ymd | null;
  parseTimeValue(raw: string): Hm | null;
  combine(ymd: Ymd | string, hm: Hm | string): Instant | null;
}

export function createInput(
  presentation: TimePresentationStyle,
  context: TimeContext,
  codec: TimeCodec,
): InputApi {
  return {
    dateValue(instantOrYmd) {
      if (instantOrYmd == null || instantOrYmd === '') return presentation.empty.input;
      if (typeof instantOrYmd === 'string') {
        return codec.parseYmd(instantOrYmd) ?? presentation.empty.input;
      }
      if (typeof instantOrYmd === 'number') {
        const instant = codec.fromTransfer(instantOrYmd);
        if (instant == null) return presentation.empty.input;
        return codec.toYmd(instant);
      }
      return presentation.empty.input;
    },

    timeValue(instant) {
      if (instant == null) return presentation.empty.input;
      const parsed = codec.fromTransfer(instant as number);
      if (parsed == null) return presentation.empty.input;
      return instantToHmInTimeZone(parsed, context.timeZone);
    },

    parseDateValue(raw) {
      return codec.parseYmd(raw);
    },

    parseTimeValue(raw) {
      return codec.parseHm(raw);
    },

    combine(ymd, hm) {
      const y = typeof ymd === 'string' ? codec.parseYmd(ymd) : ymd;
      const h = typeof hm === 'string' ? codec.parseHm(hm) : hm;
      if (y == null || h == null) return null;
      return codec.combineYmdHm(y, h);
    },
  };
}

/** @internal re-export for tree */
export { asInstant };
