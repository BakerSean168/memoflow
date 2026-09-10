import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReminderTemplateServerDTO } from '@memoflow/contracts/reminder';
import {
  NotificationChannel,
  ReminderStatus,
  ReminderType,
  TriggerType,
} from '@memoflow/contracts/reminder';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { UpcomingReminderCalculationService } from '../upcoming-reminder-calculation-service';

function createReminder(
  overrides: Partial<ReminderTemplateServerDTO>,
): ReminderTemplateServerDTO {
  return {
    id: 'reminder-template-id' as ReminderTemplateServerDTO['id'],
    identityId: 'identity-id',
    name: '提醒',
    description: null,
    type: ReminderType.Recurring,
    trigger: {
      type: TriggerType.FixedTime,
      fixedTime: { time: '09:00', timezone: null },
      interval: null,
    },
    activeTime: {
      activatedAt: Date.parse('2026-03-01T00:00:00.000Z'),
    },
    activeHours: null,
    notificationConfig: {
      channels: [NotificationChannel.InApp],
      title: null,
      body: null,
      sound: null,
      vibration: null,
      actions: null,
    },
    selfEnabled: true,
    status: ReminderStatus.Active,
    groupId: null,
    importanceLevel: ImportanceLevel.Moderate,
    tags: [],
    color: '#16A34A',
    icon: 'figure-walking',
    nextTriggerAt: null,
    version: 1,
    createdAt: Date.parse('2026-03-01T00:00:00.000Z'),
    updatedAt: Date.parse('2026-03-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('UpcomingReminderCalculationService.calculateTodaySchedule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns every trigger point for today and keeps them ordered', () => {
    vi.setSystemTime(new Date('2026-03-29T00:00:00.000Z'));

    const schedule = UpcomingReminderCalculationService.calculateTodaySchedule(
      [
        createReminder({
          id: 'walk-template' as ReminderTemplateServerDTO['id'],
          name: '起来走走',
          trigger: {
            type: TriggerType.Interval,
            fixedTime: null,
            interval: {
              minutes: 280,
              startTime: null,
            },
          },
          activeTime: {
            activatedAt: Date.parse('2026-03-29T01:40:00.000Z'),
          },
        }),
        createReminder({
          id: 'lunch-template' as ReminderTemplateServerDTO['id'],
          name: '吃午饭',
          trigger: {
            type: TriggerType.FixedTime,
            fixedTime: { time: '11:40', timezone: 'Asia/Shanghai' },
            interval: null,
          },
        }),
      ],
      { includeExpired: true, timezone: 'UTC' },
    );

    expect(schedule.map((item) => item.title)).toEqual([
      '起来走走',
      '吃午饭',
      '起来走走',
      '起来走走',
      '起来走走',
      '起来走走',
    ]);
    expect(schedule.map((item) => item.nextTriggerAt)).toEqual([
      Date.parse('2026-03-29T01:40:00.000Z'),
      Date.parse('2026-03-29T03:40:00.000Z'),
      Date.parse('2026-03-29T06:20:00.000Z'),
      Date.parse('2026-03-29T11:00:00.000Z'),
      Date.parse('2026-03-29T15:40:00.000Z'),
      Date.parse('2026-03-29T20:20:00.000Z'),
    ]);
  });

  it('filters out past trigger points by default', () => {
    vi.setSystemTime(new Date('2026-03-29T04:00:00.000Z'));

    const schedule = UpcomingReminderCalculationService.calculateTodaySchedule(
      [
        createReminder({
          id: 'walk-template' as ReminderTemplateServerDTO['id'],
          name: '起来走走',
          trigger: {
            type: TriggerType.Interval,
            fixedTime: null,
            interval: {
              minutes: 280,
              startTime: null,
            },
          },
          activeTime: {
            activatedAt: Date.parse('2026-03-29T01:40:00.000Z'),
          },
        }),
        createReminder({
          id: 'lunch-template' as ReminderTemplateServerDTO['id'],
          name: '吃午饭',
          trigger: {
            type: TriggerType.FixedTime,
            fixedTime: { time: '11:40', timezone: 'Asia/Shanghai' },
            interval: null,
          },
        }),
      ],
      { timezone: 'UTC' },
    );

    expect(schedule.map((item) => item.title)).toEqual([
      '起来走走',
      '起来走走',
      '起来走走',
      '起来走走',
    ]);
    expect(schedule.map((item) => item.nextTriggerAt)).toEqual([
      Date.parse('2026-03-29T06:20:00.000Z'),
      Date.parse('2026-03-29T11:00:00.000Z'),
      Date.parse('2026-03-29T15:40:00.000Z'),
      Date.parse('2026-03-29T20:20:00.000Z'),
    ]);
  });

  it('moves a recurring fixed-time reminder to the next cycle when today\'s time has passed', () => {
    const afterTime = Date.parse('2026-03-29T10:00:00.000Z');

    const nextTrigger = UpcomingReminderCalculationService.calculateNextTriggerTime(
      createReminder({
        trigger: {
          type: TriggerType.FixedTime,
          fixedTime: { time: '09:00', timezone: null },
          interval: null,
        },
      }),
      afterTime,
    );

    expect(nextTrigger).toBe(Date.parse('2026-03-30T09:00:00.000Z'));
  });

  it('correctly converts fixed-time triggers across timezone boundary (e.g., Asia/Tokyo UTC+9)', () => {
    const afterTime = Date.parse('2026-08-09T08:00:00.000Z');
    const nextTrigger = UpcomingReminderCalculationService.calculateNextTriggerTime(
      createReminder({
        trigger: {
          type: TriggerType.FixedTime,
          fixedTime: { time: '09:00', timezone: 'Asia/Tokyo' },
          interval: null,
        },
      }),
      afterTime,
    );

    expect(nextTrigger).not.toBeNull();
    const dateUtc = new Date(nextTrigger!);
    expect(dateUtc.getUTCHours()).toBe(0);
    expect(dateUtc.getUTCMinutes()).toBe(0);
  });

  it('throws fail-fast error when invalid timezone is specified in calculateNextTriggerTime', () => {
    const afterTime = Date.parse('2026-08-09T08:00:00.000Z');
    expect(() =>
      UpcomingReminderCalculationService.calculateNextTriggerTime(
        createReminder({
          trigger: {
            type: TriggerType.FixedTime,
            fixedTime: { time: '09:00', timezone: 'Invalid/Unknown_Timezone' },
            interval: null,
          },
        }),
        afterTime,
      ),
    ).toThrow(/Invalid or unknown timezone/);
  });

  it('calculateTodaySchedule calculates correct trigger timestamp for non-UTC+8 timezone (Asia/Tokyo UTC+9)', () => {
    vi.setSystemTime(new Date('2026-08-10T00:00:00.000Z'));
    const schedule = UpcomingReminderCalculationService.calculateTodaySchedule(
      [
        createReminder({
          id: 'tokyo-lunch' as ReminderTemplateServerDTO['id'],
          name: 'Tokyo Lunch',
          trigger: {
            type: TriggerType.FixedTime,
            fixedTime: { time: '12:00', timezone: 'Asia/Tokyo' },
            interval: null,
          },
          activeTime: { activatedAt: Date.parse('2026-08-01T00:00:00.000Z') },
        }),
      ],
      { includeExpired: true, timezone: 'Asia/Tokyo', now: Date.parse('2026-08-10T00:00:00.000Z') },
    );

    expect(schedule).toHaveLength(1);
    // 12:00 Tokyo (UTC+9) on 2026-08-10 is 03:00 UTC on 2026-08-10
    expect(schedule[0].nextTriggerAt).toBe(Date.parse('2026-08-10T03:00:00.000Z'));
  });

  it('calculateTodaySchedule throws fail-fast error when invalid timezone is specified in template or options', () => {
    vi.setSystemTime(new Date('2026-08-10T00:00:00.000Z'));
    expect(() =>
      UpcomingReminderCalculationService.calculateTodaySchedule(
        [
          createReminder({
            id: 'invalid-tz-template' as ReminderTemplateServerDTO['id'],
            name: 'Invalid TZ',
            trigger: {
              type: TriggerType.FixedTime,
              fixedTime: { time: '09:00', timezone: 'Invalid/Unknown_Timezone' },
              interval: null,
            },
          }),
        ],
        { includeExpired: true },
      ),
    ).toThrow(/Invalid or unknown timezone/);

    expect(() =>
      UpcomingReminderCalculationService.calculateTodaySchedule(
        [
          createReminder({
            id: 'valid-template' as ReminderTemplateServerDTO['id'],
            name: 'Valid Template',
            trigger: {
              type: TriggerType.FixedTime,
              fixedTime: { time: '09:00', timezone: null },
              interval: null,
            },
          }),
        ],
        { includeExpired: true, timezone: 'Bad/Timezone' },
      ),
    ).toThrow(/Invalid or unknown timezone/);
  });

  it('ensures dual-path consistency between calculateTodaySchedule and calculateNextTriggerTime when template.timezone is null', () => {
    const baseTime = Date.parse('2026-08-10T00:00:00.000Z');
    vi.setSystemTime(new Date(baseTime));

    const nullTzReminder = createReminder({
      id: 'null-tz-template' as ReminderTemplateServerDTO['id'],
      name: 'Null Timezone Template',
      trigger: {
        type: TriggerType.FixedTime,
        fixedTime: { time: '09:00', timezone: null },
        interval: null,
      },
      activeTime: { activatedAt: Date.parse('2026-08-01T00:00:00.000Z') },
    });

    const tokYoReminder = createReminder({
      id: 'tokyo-template' as ReminderTemplateServerDTO['id'],
      name: 'Tokyo Template',
      trigger: {
        type: TriggerType.FixedTime,
        fixedTime: { time: '12:00', timezone: 'Asia/Tokyo' },
        interval: null,
      },
      activeTime: { activatedAt: Date.parse('2026-08-01T00:00:00.000Z') },
    });

    // Path A: Scheduler trigger calculation for null timezone template
    const pathATriggerAt = UpcomingReminderCalculationService.calculateNextTriggerTime(nullTzReminder, baseTime);

    // Path B: Today Schedule calculation (mixed templates, with query timezone options)
    const scheduleB = UpcomingReminderCalculationService.calculateTodaySchedule(
      [nullTzReminder, tokYoReminder],
      { includeExpired: true, timezone: 'Asia/Tokyo', now: baseTime },
    );

    const pathBItem = scheduleB.find((item) => item.templateId === nullTzReminder.id);

    expect(pathATriggerAt).toBe(Date.parse('2026-08-10T09:00:00.000Z'));
    expect(pathBItem).toBeDefined();
    expect(pathBItem?.nextTriggerAt).toBe(pathATriggerAt);
  });

  it('uses a Product Time calendar-day horizon across spring-forward DST', () => {
    const afterTime = Date.parse('2026-03-07T14:30:00.000Z'); // 09:30 America/New_York
    const beforeBoundary = Date.parse('2026-03-08T13:15:00.000Z'); // 09:15 EDT, 22h45m later
    const afterBoundary = Date.parse('2026-03-08T13:45:00.000Z'); // 09:45 EDT, 23h15m later
    const intervalTrigger = {
      type: TriggerType.Interval,
      fixedTime: null,
      interval: { minutes: 60, startTime: null },
    } as const;

    const upcoming = UpcomingReminderCalculationService.calculateUpcomingReminders(
      [
        createReminder({
          id: 'before-boundary' as ReminderTemplateServerDTO['id'],
          trigger: intervalTrigger,
          activeTime: { activatedAt: beforeBoundary },
          nextTriggerAt: beforeBoundary,
        }),
        createReminder({
          id: 'after-boundary' as ReminderTemplateServerDTO['id'],
          trigger: intervalTrigger,
          activeTime: { activatedAt: afterBoundary },
          nextTriggerAt: afterBoundary,
        }),
      ],
      { days: 1, afterTime, timezone: 'America/New_York' },
    );

    expect(upcoming.map((item) => item.templateId)).toEqual(['before-boundary']);
    expect(upcoming[0]?.daysUntilTrigger).toBe(1);
  });

  it('reports a later trigger on the same Product Time date as zero days away', () => {
    const afterTime = Date.parse('2026-03-08T14:00:00.000Z'); // 10:00 EDT
    const triggerAt = Date.parse('2026-03-08T20:00:00.000Z'); // 16:00 EDT
    const upcoming = UpcomingReminderCalculationService.calculateUpcomingReminders(
      [
        createReminder({
          id: 'same-day' as ReminderTemplateServerDTO['id'],
          trigger: {
            type: TriggerType.Interval,
            fixedTime: null,
            interval: { minutes: 60, startTime: null },
          },
          activeTime: { activatedAt: Date.parse('2026-03-01T00:00:00.000Z') },
          nextTriggerAt: triggerAt,
        }),
      ],
      { days: 1, afterTime, timezone: 'America/New_York' },
    );

    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]?.daysUntilTrigger).toBe(0);
  });

});
