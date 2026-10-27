import { describe, expect, it, vi } from 'vitest';
import { ScheduleActivityReadService } from './schedule-activity-read.service';

const IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440000';

describe('ScheduleActivityReadService', () => {
  it('projects bounded schedule activity from identity-scoped facts', async () => {
    const scheduleRepository = {
      findByIdentityId: vi.fn(async () => [
        { id: 'schedule-1', title: 'Focus block', createdAt: new Date(9_000) },
        { id: 'schedule-old', title: 'Old block', createdAt: new Date(1_000) },
      ]),
    };
    const service = new ScheduleActivityReadService({
      scheduleRepository: scheduleRepository as never,
    });

    await expect(
      service.listRecentActivity(IDENTITY_ID, { since: 5_000, limit: 10 }),
    ).resolves.toEqual([
      {
        id: 'schedule-created-schedule-1',
        type: 'schedule_created',
        description: '创建了日程「Focus block」',
        timestamp: 9_000,
      },
    ]);

    expect(scheduleRepository.findByIdentityId).toHaveBeenCalledWith(IDENTITY_ID);
  });

  it('clamps the consumer limit to ten', async () => {
    const scheduleRepository = {
      findByIdentityId: vi.fn(async () =>
        Array.from({ length: 12 }, (_, index) => ({
          id: `schedule-${index}`,
          title: `Schedule ${index}`,
          createdAt: new Date(100 + index),
        })),
      ),
    };
    const service = new ScheduleActivityReadService({
      scheduleRepository: scheduleRepository as never,
    });

    const result = await service.listRecentActivity(IDENTITY_ID, { since: 0, limit: 100 });
    expect(result).toHaveLength(10);
    expect(result[0]?.id).toBe('schedule-created-schedule-11');
    expect(result[9]?.id).toBe('schedule-created-schedule-2');
  });
});
