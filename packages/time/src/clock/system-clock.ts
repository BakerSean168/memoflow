import type { Instant } from '@memoflow/shared-primitives';
import type { Clock } from '../types';
import { asInstant } from '../codec/brand';

/** Wall-clock Clock: reads platform time once per now() call. */
export function createSystemClock(): Clock {
  return {
    now(): Instant {
      return asInstant(Date.now());
    },
  };
}
