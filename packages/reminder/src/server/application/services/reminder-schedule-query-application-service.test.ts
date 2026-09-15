import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { ReminderTemplateServerDTO } from '@memoflow/contracts/reminder';
import {
  NotificationChannel,
  ReminderStatus,
  ReminderType,
  TriggerType,
} from '@memoflow/contracts/reminder';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import type { IReminderTemplateRepository } from '../../domain/repositories/i-reminder-template-repository';
import { createTimeContext, type UserTimeContextPort } from '@memoflow/time';
import { ReminderScheduleQueryApplicationService } from './reminder-schedule-query-application-service';

const IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440001';

function createReminder(overrides: Partial<ReminderTemplateServerDTO>): ReminderTemplateServerDTO {
  const now = Date.parse('2026-03-29T00:00:00.000Z');

  return {
    id: 'reminder-template-id' as ReminderTemplateServerDTO['id'],
    identityId: IDENTITY_ID as ReminderTemplateServerDTO['identityId'],
    name: '提醒',
    description: null,
    type: ReminderType.Recurring,
    trigger: {
      type: TriggerType.FixedTime,
      fixedTime: { time: '09:00', timezone: null },
      interval: null,
    },
    activeTime: {
      activatedAt: now,
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
    nextTriggerAt: now + 60 * 60 * 1000,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

describe('ReminderScheduleQueryApplicationService', () => {
  let reminderTemplateRepository: ReturnType<typeof createMockRepo<IReminderTemplateRepository>>;
  let service: ReminderScheduleQueryApplicationService;
  let userTimeContextPort: UserTimeContextPort;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T00:00:00.000Z'));

    reminderTemplateRepository = createMockRepo<IReminderTemplateRepository>({
      findByIdentityId: vi.fn().mockResolvedValue([]),
    });
    userTimeContextPort = {
      getUserTimeContext: vi.fn().mockResolvedValue(
        createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      ),
    };
    service = new ReminderScheduleQueryApplicationService({
      reminderTemplateRepository,
      userTimeContextPort,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('filters upcoming reminders before calculation and respects limit', async () => {
    const recurring = {
      toServerDTO: vi.fn().mockReturnValue(
        createReminder({
          id: 'recurring-1' as ReminderTemplateServerDTO['id'],
          name: 'Recurring',
          nextTriggerAt: Date.parse('2026-03-29T01:00:00.000Z'),
        }),
      ),
    };
    const otherRecurring = {
      toServerDTO: vi.fn().mockReturnValue(
        createReminder({
          id: 'recurring-2' as ReminderTemplateServerDTO['id'],
          name: 'Recurring Later',
          nextTriggerAt: Date.parse('2026-03-29T02:00:00.000Z'),
        }),
      ),
    };
    const oneTime = {
      toServerDTO: vi.fn().mockReturnValue(
        createReminder({
          id: 'one-time-1' as ReminderTemplateServerDTO['id'],
          name: 'One Time',
          type: ReminderType.OneTime,
          nextTriggerAt: Date.parse('2026-03-29T00:30:00.000Z'),
        }),
      ),
    };
    (reminderTemplateRepository.findByIdentityId as ReturnType<typeof vi.fn>).mockResolvedValue([
      recurring,
      otherRecurring,
      oneTime,
    ]);

    const result = await service.getUpcomingReminders(
      { type: ReminderType.Recurring, limit: 1 },
      { identityId: IDENTITY_ID },
    );

    expect(result).toEqual({
      ok: true,
      data: {
        data: [
          expect.objectContaining({
            templateId: 'recurring-1',
            title: 'Recurring',
          }),
        ],
        total: 2,
      },
    });
  });

  describe('Canonical timezone resolution (Request -> UserTimeContext)', () => {
    it('uses canonical user time context when request timezone is missing', async () => {
      // Set canonical user timezone to Asia/Tokyo (UTC+9).
      (userTimeContextPort.getUserTimeContext as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 }),
      );

      // 2026-08-10T00:00:00.000Z is 09:00:00 Tokyo time on 2026-08-10.
      const nowMs = Date.parse('2026-08-10T00:00:00.000Z');
      vi.setSystemTime(new Date(nowMs));

      const template = {
        toServerDTO: vi.fn().mockReturnValue(
          createReminder({
            id: 'tokyo-item' as ReminderTemplateServerDTO['id'],
            name: 'Tokyo Schedule Item',
            trigger: {
              type: TriggerType.FixedTime,
              fixedTime: { time: '12:00', timezone: 'Asia/Tokyo' },
              interval: null,
            },
            activeTime: { activatedAt: Date.parse('2026-08-01T00:00:00.000Z') },
          }),
        ),
      };
      (reminderTemplateRepository.findByIdentityId as ReturnType<typeof vi.fn>).mockResolvedValue([template]);

      // Call getTodaySchedule without timezone in params
      const res = await service.getTodaySchedule(
        { includeExpired: true },
        { identityId: IDENTITY_ID },
      );

      expect(res.ok).toBe(true);
      expect(userTimeContextPort.getUserTimeContext).toHaveBeenCalledWith(IDENTITY_ID);
      // In Tokyo (UTC+9), 12:00 corresponds to 03:00 UTC (2026-08-10T03:00:00.000Z).
      expect(res.data?.data).toHaveLength(1);
      expect(res.data?.data[0].nextTriggerAt).toBe(Date.parse('2026-08-10T03:00:00.000Z'));
      // Assert display string is calculated according to Asia/Tokyo timezone
      expect(res.data?.data[0].nextTriggerAt).not.toBe(Date.parse('2026-08-10T12:00:00.000Z'));
    });

    it('uses canonical virtual UTC default supplied by UserTimeContext', async () => {
      const nowMs = Date.parse('2026-08-10T00:00:00.000Z');
      vi.setSystemTime(new Date(nowMs));

      const template = {
        toServerDTO: vi.fn().mockReturnValue(
          createReminder({
            id: 'utc-item' as ReminderTemplateServerDTO['id'],
            name: 'UTC Schedule Item',
            trigger: {
              type: TriggerType.FixedTime,
              fixedTime: { time: '12:00', timezone: 'UTC' },
              interval: null,
            },
            activeTime: { activatedAt: Date.parse('2026-08-01T00:00:00.000Z') },
          }),
        ),
      };
      (reminderTemplateRepository.findByIdentityId as ReturnType<typeof vi.fn>).mockResolvedValue([template]);

      const res = await service.getTodaySchedule(
        { includeExpired: true },
        { identityId: IDENTITY_ID },
      );

      expect(res.ok).toBe(true);
      expect(res.data?.data).toHaveLength(1);
      expect(res.data?.data[0].nextTriggerAt).toBe(Date.parse('2026-08-10T12:00:00.000Z'));
    });

    it('prioritizes explicit request timezone over canonical user time context', async () => {
      (userTimeContextPort.getUserTimeContext as ReturnType<typeof vi.fn>).mockResolvedValue(
        createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 }),
      );

      const nowMs = Date.parse('2026-08-10T00:00:00.000Z');
      vi.setSystemTime(new Date(nowMs));

      const template = {
        toServerDTO: vi.fn().mockReturnValue(
          createReminder({
            id: 'req-tz-item' as ReminderTemplateServerDTO['id'],
            name: 'Request Timezone Item',
            trigger: {
              type: TriggerType.FixedTime,
              fixedTime: { time: '12:00', timezone: 'UTC' },
              interval: null,
            },
            activeTime: { activatedAt: Date.parse('2026-08-01T00:00:00.000Z') },
          }),
        ),
      };
      (reminderTemplateRepository.findByIdentityId as ReturnType<typeof vi.fn>).mockResolvedValue([template]);

      // Request explicitly specifies UTC timezone
      const res = await service.getTodaySchedule(
        { includeExpired: true, timezone: 'UTC' },
        { identityId: IDENTITY_ID },
      );

      expect(res.ok).toBe(true);
      // Explicit request timezone is a snapshot override; canonical context is not consulted.
      expect(userTimeContextPort.getUserTimeContext).not.toHaveBeenCalled();
      expect(res.data?.data[0].nextTriggerAt).toBe(Date.parse('2026-08-10T12:00:00.000Z'));
    });

    it('fails closed when canonical user time context cannot be resolved', async () => {
      (userTimeContextPort.getUserTimeContext as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('preference store unavailable'),
      );

      await expect(
        service.getTodaySchedule({ includeExpired: true }, { identityId: IDENTITY_ID }),
      ).rejects.toThrow('preference store unavailable');
    });
  });
});