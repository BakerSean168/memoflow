import { describe, expect, it, vi } from 'vitest';
import { GoalReviewClientDTOSchema, GoalReviewSystemContextSchema } from '@memoflow/contracts/goal';
import { Goal, GoalReview } from '../../../../domain';
import { GoalReview as ClientReview } from '../../../../../domain-client/entities/goal-review';
import { GoalPrismaRepository } from '../goal-prisma.repository';
import { PrismaGoalMapper } from './prisma-goal-mapper';
import { PowerSyncGoalMapper } from '../../powersync/mappers/powersync-goal.mapper';
import { analyzeGoalReviewSignals } from '../../../../application/services/goal-review-signal-analyzer';

const facts = {
  windowStartAt: 1,
  windowEndAt: 2,
  overallProgress: { startPercentage: 20, endPercentage: 40, deltaPercentage: 20 },
  keyResults: [
    {
      keyResultId: 'IKeyResultId_11111111-1111-4111-8111-111111111111' as never,
      title: 'Distance',
      unit: null,
      startPercentage: 20,
      endPercentage: 40,
      deltaPercentage: 20,
      trend: [],
    },
  ],
  summary: { recordCount: 3, manualRecordCount: 2, taskContributionCount: 1 },
};
describe('Review snapshot persistence and client parity', () => {
  it('uses the real repository JSON write and both real storage mappers, then client decode', async () => {
    const context = { ...facts, signals: analyzeGoalReviewSignals(facts) };
    const goal = Goal.create({
      identityId: 'identity-1' as never,
      name: 'Review',
      start: null,
      target: null,
      reminderConfig: null,
    });
    const review = goal.createAndAddReview({ reflection: 'Done', systemContext: context });
    const tx = {
      goal: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), upsert: vi.fn() },
      keyResult: { deleteMany: vi.fn() },
      goalReview: { deleteMany: vi.fn(), upsert: vi.fn() },
    };
    const repository = new GoalPrismaRepository(tx as never, { publish: vi.fn() } as never, true);
    await repository.saveRootWithExpectedVersion(goal, 1);
    const written = tx.goalReview.upsert.mock.calls[0][0];
    expect(JSON.parse(written.create.systemContext)).toEqual(context);
    expect(written.update.systemContext).toBe(written.create.systemContext);
    const prisma = PrismaGoalMapper.mapGoalReview({
      ...written.create,
      createdAt: new Date(2),
      updatedAt: new Date(2),
    } as never);
    const powersync = PowerSyncGoalMapper.mapGoalReviewRow({
      id: review.id,
      goal_id: goal.id,
      reflection: 'Done',
      system_context: written.create.systemContext,
      reviewed_at: new Date(2).toISOString(),
      created_at: new Date(2).toISOString(),
      updated_at: new Date(2).toISOString(),
    });
    for (const raw of [prisma, powersync]) {
      expect(raw.systemContext).toEqual(context);
      const restored = GoalReview.load({ ...raw, id: review.id, goalId: goal.id });
      const dto = GoalReviewClientDTOSchema.parse(
        JSON.parse(JSON.stringify(restored.toClientDTO())),
      );
      const client = ClientReview.load({
        ...dto,
        id: review.id as never,
        goalId: goal.id as never,
      });
      expect(client.toDTO().systemContext).toEqual(context);
    }
    const exposed = review.systemContext;
    const signal = exposed.signals[1];
    if (signal.kind === 'key-result-movement') signal.evidence[0].title = 'mutated';
    expect(review.systemContext).toEqual(context);
  });
  it('restores legacy JSON with empty signals in Prisma, PowerSync and the domain', () => {
    const prisma = PrismaGoalMapper.parseReviewSystemContext(JSON.stringify(facts));
    const powersync = PowerSyncGoalMapper.mapGoalReviewRow({
      id: 'r',
      goal_id: 'g',
      reflection: 'Done',
      system_context: JSON.stringify(facts),
    });
    for (const context of [prisma, powersync.systemContext]) {
      expect(context).toEqual({ ...facts, signals: [] });
      expect(GoalReviewSystemContextSchema.parse(context).signals).toEqual([]);
    }
    const review = GoalReview.load({
      id: 'r' as never,
      goalId: 'g' as never,
      reflection: 'Done',
      challenges: null,
      adjustments: null,
      systemContext: facts as never,
      reviewedAt: 2,
      createdAt: 2,
      updatedAt: 2,
    });
    expect(review.toServerDTO().systemContext.signals).toEqual([]);
  });
});
