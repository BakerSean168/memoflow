import type { Hm, Ymd } from '@memoflow/time';

export interface DateTimeFieldValue {
  readonly date: Ymd | null;
  readonly time: Hm | null;
  readonly allDay: boolean;
}

export type TimeSegment = 'hour' | 'minute' | 'second';

export interface SegmentedTimeDraft {
  readonly hour: string;
  readonly minute: string;
  readonly second: string;
  readonly valid: boolean;
  readonly value: string | null;
}
