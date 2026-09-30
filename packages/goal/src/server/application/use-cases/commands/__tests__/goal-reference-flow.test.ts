import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IdentityId } from '@memoflow/contracts/primitives';
import { createTimeContext } from '@memoflow/time';
import {
  Goal,
  GoalPolicy,
  type GoalRecord,
  type IGoalRepository,
  type IGoalRecordRepository,
} from '../../../../domain';
import { GoalReviewContextBuilder } from '../../../services/goal-review-context-builder';
import { AddGoalReviewUseCase } from '../add-goal-review.use-case';
import { CreateGoalRecordUseCase } from '../create-goal-record.use-case';
import { GetGoalReviewContextUseCase } from '../../queries/get-goal-review-context.use-case';
import { createInlineGoalWriteTransactionRunner } from '../goal-write-support';
import { InMemoryGoalReliableOperationAdapter } from '../../../../infrastructure/adapters/in-memory/in-memory-goal-reliable-operation.adapter';

// Production domain + application flow. Repository doubles replace persistence only;
// no AI provider, alternate calculator, or browser/backend E2E claim.
describe('PVC-GOAL-1601 reference flow', () => {
  afterEach(() => vi.useRealTimers());
  it.each(['Sum', 'Last', 'Max', 'Min', 'Average'] as const)(
    '%s: Goal → KR → Record → trajectory → first and subsequent Review without AI',
    async (aggregationMethod) => {
      vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
      const identity = 'identity-reference' as IdentityId;
      const goal = Goal.create({
        identityId: identity,
        name: 'Reference Goal',
        start: null,
        target: null,
        reminderConfig: null,
      });
      expect(goal.keyResults).toHaveLength(0);
      const kr = goal.createAndAddKeyResult({
        title: 'Measured outcome',
        aggregationMethod,
        initialValue: 0,
        currentValue: 0,
        targetValue: 10,
        unit: 'km',
        weight: 1,
      });
      const persisted: GoalRecord[] = [];
      const goalRepository = createMockRepo<IGoalRepository>({
        findByIdForIdentity: vi.fn(async () => goal),
        saveRootWithExpectedVersion: vi.fn(async () => undefined),
      });
      const goalRecordRepository = createMockRepo<IGoalRecordRepository>({
        findByKeyResultId: vi.fn(async () => [...persisted]),
        findByGoalId: vi.fn(async () => [...persisted]),
        findByKeyResultIds: vi.fn(async () => new Map([[String(kr.id), [...persisted]]])),
        countByKeyResultId: vi.fn(async () => persisted.length),
        save: vi.fn(async (record) => {
          persisted.push(record);
        }),
      });
      const recordCommand = new CreateGoalRecordUseCase(
        goalRepository,
        goalRecordRepository,
        createInlineGoalWriteTransactionRunner(
          { goalRepository, goalRecordRepository },
          new InMemoryGoalReliableOperationAdapter(),
        ),
      );
      const recorded = await recordCommand.execute(
        goal.id,
        kr.id,
        { value: 3, note: 'Observed', expectedVersion: goal.version },
        String(identity),
      );
      expect(recorded.ok).toBe(true);
      expect(persisted).toHaveLength(1);
      expect(kr.progress.currentValue).toBe(3);
      if (recorded.ok) expect(recorded.data.readModel.keyResults[0].progressPercentage).toBe(30);
      let now = Date.now() + 1000;
      const builder = new GoalReviewContextBuilder(goalRecordRepository);
      const timePort = {
        getUserTimeContext: async () =>
          createTimeContext({ timeZone: 'America/Los_Angeles', weekStartsOn: 1 }),
      };
      const query = new GetGoalReviewContextUseCase(goalRepository, builder, timePort, () => now);
      const reviewCommand = new AddGoalReviewUseCase(
        goalRepository,
        new GoalPolicy(),
        builder,
        timePort,
        () => now,
      );
      const firstPreview = await query.execute(String(goal.id), String(identity));
      expect(firstPreview.ok).toBe(true);
      const first = await reviewCommand.execute(String(goal.id), String(identity), {
        expectedVersion: goal.version,
        reflection: 'Measured progress',
      });
      expect(first.ok).toBe(true);
      const firstSnapshot = goal.goalReviews[0].systemContext;
      const savedFirstSnapshot = structuredClone(firstSnapshot);
      if (firstPreview.ok) expect(firstSnapshot).toEqual(firstPreview.data);
      expect(firstSnapshot.summary.recordCount).toBe(1);
      expect(firstSnapshot.signals.length).toBeGreaterThan(0);
      now += 1000;
      const nextPreview = await query.execute(String(goal.id), String(identity));
      expect(nextPreview.ok).toBe(true);
      const next = await reviewCommand.execute(String(goal.id), String(identity), {
        expectedVersion: goal.version,
        reflection: 'Continue observing',
      });
      expect(next.ok).toBe(true);
      const nextSnapshot = goal.goalReviews[1].systemContext;
      expect(nextSnapshot.windowStartAt).toBe(firstSnapshot.windowEndAt);
      if (nextPreview.ok) expect(nextSnapshot).toEqual(nextPreview.data);
      expect(nextSnapshot.summary.recordCount).toBe(0);
      expect(firstSnapshot.summary.recordCount).toBe(1);
      expect(goal.goalReviews[0].systemContext).toEqual(savedFirstSnapshot);
    },
  );
});
