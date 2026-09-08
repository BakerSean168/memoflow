import { describe, expect, it, vi } from 'vitest';
import { calculateNextRun } from './calculate-next-run';

describe('calculateNextRun', () => {
  it('returns next run date for a valid cron expression', () => {
    const result = calculateNextRun('0 9 * * *', 'UTC');
    expect(result).toBeInstanceOf(Date);
  });

  it('returns null for an invalid cron expression', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = calculateNextRun('invalid-cron', 'UTC');

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});
