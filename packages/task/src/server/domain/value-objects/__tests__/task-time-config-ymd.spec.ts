import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TaskTimeConfig } from '../task-time-config';

describe('TaskTimeConfig Instant-only compatibility state (TIME-1206)', () => {
  it('keeps startDate as an Instant without exposing an ambient calendar-day projection', () => {
    const start = Date.parse('2026-07-26T00:00:00.000Z');
    const config = TaskTimeConfig.createAllDay(start);

    expect(config.startDate).toBe(start);
    expect(config.isAllDay).toBe(true);
    expect('startDay' in config).toBe(false);
  });

  it('setStartDate stays Instant-only and cannot resurrect host-local startDay', () => {
    const start = Date.parse('2026-01-15T00:00:00.000Z');
    const config = TaskTimeConfig.createAllDay(start).setStartDate(start);

    expect(config.startDate).toBe(start);
    expect('startDay' in config).toBe(false);
  });

  it('source has no no-arg Product Time facade or startDay compatibility getter', () => {
    const source = readFileSync(resolve(__dirname, '../task-time-config.ts'), 'utf8');
    expect(source).not.toContain('createTimeFacade()');
    expect(source).not.toContain('get startDay');
  });
});
