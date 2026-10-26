import type { Instant } from '@memoflow/shared-primitives';
import type { Clock } from '../types';
import { asInstant, isFiniteInstantMs } from '../codec/brand';

/**
 * Deterministic Clock for tests and replay.
 * Freezes "now" to the given Instant (or epoch ms number).
 */
export function createFixedClock(instant: Instant | number): Clock {
  if (!isFiniteInstantMs(instant)) {
    throw new TypeError('createFixedClock requires a finite epoch millisecond value');
  }
  const frozen = asInstant(instant);
  return {
    now(): Instant {
      return frozen;
    },
  };
}
