import { describe, expect, it, vi } from 'vitest';
import { GoalPortablePayloadV3Schema } from '@memoflow/contracts/goal';
import type {
  PortableCapabilityExecutionContext,
  PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import { ok } from '@memoflow/contracts/result';
import { Goal } from '../domain';
import { GoalPortableCapability } from './goal-portability';
import {
  createGoalPortabilitySnapshot,
  type GoalPortabilityRestoreInput,
} from './goal-portability.application.port';
import { analyzeGoalReviewSignals } from './services/goal-review-signal-analyzer';

describe('Review signals in source-neutral portability', () => {
  it('exports references, restores signal evidence unchanged with new KR IDs, and replays', async () => {
    const source = Goal.create({
      identityId: 'identity-1' as never,
      name: 'Review',
      start: null,
      target: null,
      reminderConfig: null,
    });
    const kr = source.createAndAddKeyResult({ title: 'Distance', targetValue: 100 });
    const facts = {
      windowStartAt: 1,
      windowEndAt: 2,
      overallProgress: { startPercentage: 20, endPercentage: 40, deltaPercentage: 20 },
      keyResults: [
        {
          keyResultId: kr.id,
          title: kr.title,
          unit: null,
          startPercentage: 20,
          endPercentage: 40,
          deltaPercentage: 20,
          trend: [],
        },
      ],
      summary: { recordCount: 2, manualRecordCount: 1, taskContributionCount: 1 },
    };
    source.createAndAddReview({
      reflection: 'Done',
      systemContext: { ...facts, signals: analyzeGoalReviewSignals(facts) },
    });
    const refs = new Map<string, PortableReferenceV3>();
    const context: PortableCapabilityExecutionContext = {
      identityId: 'identity-1',
      batchId: 'batch-1',
      references: {
        declareExportReference: (_capability, id) => {
          const ref = `goals:${refs.size + 1}` as PortableReferenceV3;
          refs.set(id, ref);
          return ref;
        },
        resolveExportReference: (_capability, id) => {
          const ref = refs.get(id);
          if (!ref) throw new Error('Missing ref');
          return ref;
        },
        bindImportedReference: vi.fn(),
        resolveImportedReference: vi.fn(),
      },
    };
    let restored: Goal | null = null;
    const restore = vi.fn(async (input: GoalPortabilityRestoreInput) => {
      restored = Goal.create({
        id: input.id,
        identityId: 'identity-1' as never,
        name: input.name,
        start: null,
        target: null,
        reminderConfig: null,
      });
      for (const item of input.initialKeyResults)
        restored.createAndAddKeyResult({ ...item, aggregationMethod: item.calculationMethod });
      for (const item of input.reviews) restored.restoreReview({ ...item, goalId: restored.id });
      return ok({
        goalId: restored.id,
        goalVersion: restored.version,
        readModel: restored.toClientDTO(),
      });
    });
    const capability = new GoalPortableCapability(
      {} as never,
      {
        listGoalSnapshots: vi.fn().mockResolvedValue([createGoalPortabilitySnapshot(source)]),
        getGoalSnapshot: async () => (restored ? createGoalPortabilitySnapshot(restored) : null),
        restoreGoalForPortability: restore,
      } as never,
    );
    const exported = GoalPortablePayloadV3Schema.parse(await capability.export(context));
    expect(JSON.stringify(exported)).not.toContain(String(kr.id));
    expect(JSON.stringify(exported)).not.toContain('keyResultId');
    await capability.apply(exported, context);
    const snapshot = restore.mock.calls[0][0].reviews[0].systemContext;
    const signal = snapshot.signals[1];
    expect(signal.kind).toBe('key-result-movement');
    if (signal.kind === 'key-result-movement') {
      expect(signal.evidence[0].keyResultId).toBe(snapshot.keyResults[0].keyResultId);
      expect(signal.evidence[0]).toMatchObject({
        title: kr.title,
        startPercentage: 20,
        endPercentage: 40,
        deltaPercentage: 20,
        direction: 'improved',
      });
    }
    expect(snapshot.signals[2]).toEqual(source.goalReviews[0].systemContext.signals[2]);
    await capability.apply(exported, context);
    expect(restore).toHaveBeenCalledTimes(1);
  });
});
