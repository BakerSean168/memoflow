import { describe, expect, it, vi } from 'vitest';
import { GoalActivityReadService } from './goal-activity-read.service';

const IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440000';

describe('GoalActivityReadService', () => {
  it('projects bounded goal activity from identity-scoped facts', async () => {
    const goalRepository = {
      findByIdentityId: vi.fn(async () => [
        {
          id: 'goal-1',
          name: 'Ship vNext',
          updatedAt: 8_000,
          deletedAt: null,
        },
        {
          id: 'goal-old',
          name: 'Old goal',
          updatedAt: 1_000,
          deletedAt: null,
        },
        {
          id: 'goal-deleted',
          name: 'Deleted goal',
          updatedAt: 9_500,
          deletedAt: 9_600,
        },
      ]),
    };
    const service = new GoalActivityReadService({ goalRepository: goalRepository as never });

    await expect(
      service.listRecentActivity(IDENTITY_ID, { since: 5_000, limit: 10 }),
    ).resolves.toEqual([
      {
        id: 'goal-updated-goal-1',
        type: 'goal_updated',
        description: '更新了目标「Ship vNext」的进度',
        timestamp: 8_000,
      },
    ]);

    expect(goalRepository.findByIdentityId).toHaveBeenCalledWith(IDENTITY_ID, {
      includeChildren: false,
      systemView: 'active',
    });
  });

  it('clamps the consumer limit to ten', async () => {
    const goalRepository = {
      findByIdentityId: vi.fn(async () =>
        Array.from({ length: 12 }, (_, index) => ({
          id: `goal-${index}`,
          name: `Goal ${index}`,
          updatedAt: 100 + index,
          deletedAt: null,
        })),
      ),
    };
    const service = new GoalActivityReadService({ goalRepository: goalRepository as never });

    const result = await service.listRecentActivity(IDENTITY_ID, { since: 0, limit: 100 });
    expect(result).toHaveLength(10);
    expect(result[0]?.id).toBe('goal-updated-goal-11');
    expect(result[9]?.id).toBe('goal-updated-goal-2');
  });
});
