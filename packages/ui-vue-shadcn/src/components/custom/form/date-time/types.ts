import type { Hm, Ymd } from '@memoflow/time';

export interface DateTimeFieldValue {
  readonly date: Ymd | null;
  readonly time: Hm | null;
  readonly allDay: boolean;
}
