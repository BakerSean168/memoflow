import { describe, expect, it } from 'vitest';
import { Timezone } from '@memoflow/contracts/schedule';
import { ScheduleConfig } from '../schedule-config';

describe('ScheduleConfig', () => {
  it('creates the documented default schedule window', () => {
    const config = ScheduleConfig.createDefault(Timezone.Shanghai);

    expect(config.cronExpression).toBe('0 9 * * *');
    expect(config.timezone).toBe(Timezone.Shanghai);
    expect(config.hasExecutionLimit).toBe(false);
  });

  it('rejects empty schedule definitions and preserves valid updates', () => {
    expect(() =>
      ScheduleConfig.create({
        cronExpression: null,
        timezone: Timezone.Shanghai,
        startDate: null,
        endDate: null,
        maxExecutions: null,
      }),
    ).toThrow('Either cronExpression or startDate is required');

    const config = ScheduleConfig.createDefault(Timezone.Shanghai).with({
      maxExecutions: 5,
    });

    expect(config.maxExecutions).toBe(5);
  });

  it('returns null when the next cron occurrence would exceed the end date', () => {
    const config = ScheduleConfig.create({
      cronExpression: '0 9 * * *',
      timezone: Timezone.Shanghai,
      startDate: null,
      endDate: new Date('2025-12-31T16:30:00.000Z').toISOString(),
      maxExecutions: null,
    });

    expect(config.calculateNextRun(new Date('2026-01-01T00:00:00.000Z').getTime())).toBeNull();
  });

  it('uses startDate as a one-shot run and preserves DTO round-trip', () => {
    const startDate = new Date('2026-01-01T10:00:00.000Z').toISOString();
    const config = ScheduleConfig.fromDTO({
      cronExpression: null,
      timezone: Timezone.Shanghai,
      startDate,
      endDate: null,
      maxExecutions: 1,
    });

    expect(config.calculateNextRun(new Date('2026-01-01T09:00:00.000Z').getTime())).toBe(
      new Date(startDate).getTime(),
    );
    expect(config.toDTO()).toEqual({
      cronExpression: null,
      timezone: Timezone.Shanghai,
      startDate,
      endDate: null,
      maxExecutions: 1,
    });
  });
});
