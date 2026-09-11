/** Goal vNext importer — Goal + KR + Review facts + GoalRecord. */
import type { ImportContext } from '../../portable-runtime';
import type { PortableGoalData, PortableGoalReviewSystemContext } from '@memoflow/contracts/data-portability';
import type { GoalReviewSystemContext } from '@memoflow/contracts/goal';
import type { TxClient } from './import-helpers';
import { allocateId, resolveRef, jsonStringify, inc, rec, timestamps } from './import-helpers';

export async function importGoals(tx: TxClient, ctx: ImportContext, data: PortableGoalData): Promise<void> {
  for (const goal of data.items) {
    const g = rec(goal);
    const goalId = allocateId(ctx, g._ref as string);
    await tx.createGoal({
      id: goalId,
      identityId: ctx.identityId,
      name: String(g.name),
      summary: (g.summary as string | null | undefined) ?? null,
      status: String(g.status ?? 'Planned'),
      startDate: g.startDate ? String(g.startDate) : null,
      dueDate: g.dueDate ? String(g.dueDate) : null,
      completedAt: g.completedAt ? String(g.completedAt) : null,
      archivedAt: g.archivedAt ? String(g.archivedAt) : null,
      sortOrder: Number(g.sortOrder ?? 0),
      reminderConfig: g.reminderConfig ? jsonStringify(g.reminderConfig) : null,
      ...timestamps(g),
    });

    for (const kr of (g.keyResults as unknown[] ?? [])) {
      const k = rec(kr);
      const krId = allocateId(ctx, k._ref as string);
      await tx.createKeyResult({
        id: krId,
        identityId: ctx.identityId,
        goalId,
        title: String(k.title),
        description: (k.description as string | null | undefined) ?? null,
        aggregationMethod: String(k.calculationMethod ?? 'Last'),
        startingValue: Number(k.startingValue ?? 0),
        progressBaselineValue: k.progressBaselineValue == null ? null : Number(k.progressBaselineValue),
        targetValue: Number(k.targetValue ?? 0),
        currentValue: Number(k.currentValue ?? k.startingValue ?? 0),
        unit: (k.unit as string | null | undefined) ?? null,
        weight: Number(k.weight ?? 1),
        order: Number(k.sortOrder ?? 0),
        ...timestamps(k),
      });
    }

    for (const review of (g.goalReviews as unknown[] ?? [])) {
      const r = rec(review);
      const portableContext = r.systemContext as PortableGoalReviewSystemContext;
      const systemContext: GoalReviewSystemContext = {
        ...portableContext,
        keyResults: portableContext.keyResults.map((item) => ({
          ...item,
          keyResultId: resolveRef(item.keyResultRef, ctx) as GoalReviewSystemContext['keyResults'][number]['keyResultId'],
        })),
      };
      await tx.createGoalReview({
        id: allocateId(ctx, r._ref as string),
        identityId: ctx.identityId,
        goalId,
        reflection: String(r.reflection ?? ''),
        challenges: (r.challenges as string | null | undefined) ?? null,
        adjustments: (r.adjustments as string | null | undefined) ?? null,
        systemContext: jsonStringify(systemContext),
        reviewedAt: String(r.reviewedAt),
        ...timestamps(r),
      });
    }
    inc(ctx, 'goals');
  }

  for (const record of data.records) {
    const r = rec(record);
    await tx.createGoalRecord({
      id: allocateId(ctx, r._ref as string),
      identityId: ctx.identityId,
      keyResultId: resolveRef(r.keyResultRef as string, ctx),
      value: Number(r.value),
      note: (r.note as string | null | undefined) ?? null,
      sourceType: (r.sourceType as string | null | undefined) ?? null,
      sourceId: null,
      recordedAt: String(r.recordedAt),
      ...timestamps(r),
    });
    inc(ctx, 'goalRecords');
  }
}
