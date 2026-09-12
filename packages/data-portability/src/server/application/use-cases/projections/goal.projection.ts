/** Goal Module — Core vNext export projections. */
import type { ExportContext } from '../../portable-runtime';
import type {
  PortableGoal,
  PortableGoalRecord,
  PortableKeyResult,
  PortableGoalReview,
  PortableGoalReviewSystemContext,
} from '@memoflow/contracts/data-portability';
import {
  parseJsonField,
  toDateString,
  toRecord,
  resolveExportRefOrThrow,
} from './projection-helpers';
import { GoalTimeframeKindSchema, goalTimeframeFromEndBoundary } from '@memoflow/contracts/goal';
import { requireYmd } from '@memoflow/contracts/primitives';

export function projectGoals(goals: unknown[], ctx: ExportContext): PortableGoal[] {
  return goals.map((g) => {
    const goal = g as Record<string, unknown>;
    const ref = ctx.refAllocator.allocate('goal');
    ctx.refToIdMap.set(String(goal.id), ref);

    const keyResults = ((goal.keyResults as unknown[] | undefined) ?? []).map((kr) =>
      projectKeyResult(kr, ctx),
    );
    const goalReviews = ((goal.goalReviews as unknown[] | undefined) ?? []).map((review) =>
      projectGoalReview(review, ctx),
    );

    return {
      _ref: ref,
      name: String(goal.name ?? ''),
      summary: goal.summary as string | null | undefined,
      status: String(goal.status ?? 'Planned') as PortableGoal['status'],
      startDate: goal.startDate == null ? null : requireYmd(String(goal.startDate)),
      target: projectGoalTarget(goal),
      completedAt: toDateString(goal.completedAt),
      archivedAt: toDateString(goal.archivedAt),
      sortOrder: Number(goal.sortOrder ?? 0),
      reminderConfig: parseJsonField(goal.reminderConfig),
      keyResults,
      goalReviews,
      createdAt: toDateString(goal.createdAt),
      updatedAt: toDateString(goal.updatedAt),
    };
  });
}

function projectGoalTarget(goal: Record<string, unknown>): PortableGoal['target'] {
  const kind = goal.targetKind ?? goal.target_kind;
  const endDate = goal.targetEndDate ?? goal.target_end_date;
  if (kind == null && endDate == null) return null;
  if (kind == null || endDate == null) {
    throw new TypeError('Portable Goal export requires a complete target persistence pair');
  }
  return goalTimeframeFromEndBoundary(
    GoalTimeframeKindSchema.parse(String(kind)),
    requireYmd(String(endDate)),
  );
}

function projectKeyResult(kr: unknown, ctx: ExportContext): PortableKeyResult {
  const entity = kr as Record<string, unknown>;
  const ref = ctx.refAllocator.allocate('keyResult');
  ctx.refToIdMap.set(String(entity.id), ref);
  const progress = toRecord(entity.progress) ?? entity;
  return {
    _ref: ref,
    title: String(entity.title ?? ''),
    description: entity.description as string | null | undefined,
    calculationMethod: String(
      progress.aggregationMethod ?? 'Last',
    ) as PortableKeyResult['calculationMethod'],
    initialValue: Number(progress.initialValue ?? 0),
    trackingBaseValue: Number(progress.trackingBaseValue ?? progress.currentValue ?? 0),
    targetValue: Number(progress.targetValue ?? 0),
    currentValue: Number(progress.currentValue ?? 0),
    target: projectKeyResultTarget(entity),
    unit: progress.unit as string | null | undefined,
    weight: Number(entity.weight ?? 1),
    sortOrder: Number(entity.sortOrder ?? entity.order ?? 0),
    createdAt: toDateString(entity.createdAt),
    updatedAt: toDateString(entity.updatedAt),
  };
}

function projectKeyResultTarget(entity: Record<string, unknown>): PortableKeyResult['target'] {
  if (entity.target != null) return entity.target as PortableKeyResult['target'];
  const kind = entity.targetKind ?? entity.target_kind;
  const endDate = entity.targetEndDate ?? entity.target_end_date;
  if (kind == null && endDate == null) return null;
  if (kind == null || endDate == null) {
    throw new TypeError('Portable Key Result export requires a complete target persistence pair');
  }
  return goalTimeframeFromEndBoundary(
    GoalTimeframeKindSchema.parse(String(kind)),
    requireYmd(String(endDate)),
  );
}

function projectGoalReview(review: unknown, ctx: ExportContext): PortableGoalReview {
  const entity = review as Record<string, unknown>;
  const ref = ctx.refAllocator.allocate('goalReview');
  ctx.refToIdMap.set(String(entity.id), ref);
  const rawContext = toRecord(parseJsonField(entity.systemContext, {})) ?? {};
  const rawKeyResults = Array.isArray(rawContext.keyResults) ? rawContext.keyResults : [];
  const systemContext: PortableGoalReviewSystemContext = {
    windowStartAt: Number(rawContext.windowStartAt ?? 0),
    windowEndAt: Number(rawContext.windowEndAt ?? 0),
    overallProgress: (rawContext.overallProgress ?? {
      startPercentage: 0,
      endPercentage: 0,
      deltaPercentage: 0,
    }) as PortableGoalReviewSystemContext['overallProgress'],
    keyResults: rawKeyResults.map((item) => {
      const kr = item as Record<string, unknown>;
      return {
        keyResultRef: resolveExportRefOrThrow(String(kr.keyResultId), ctx, 'goal review'),
        title: String(kr.title ?? ''),
        unit: kr.unit == null ? null : String(kr.unit),
        startPercentage: Number(kr.startPercentage ?? 0),
        endPercentage: Number(kr.endPercentage ?? 0),
        deltaPercentage: Number(kr.deltaPercentage ?? 0),
        trend: Array.isArray(kr.trend)
          ? kr.trend.map((point) => ({
              at: Number((point as Record<string, unknown>).at ?? 0),
              progressPercentage: Number(
                (point as Record<string, unknown>).progressPercentage ?? 0,
              ),
            }))
          : [],
      };
    }),
    summary: (rawContext.summary ?? {
      recordCount: 0,
      manualRecordCount: 0,
      taskContributionCount: 0,
    }) as PortableGoalReviewSystemContext['summary'],
  };

  return {
    _ref: ref,
    reflection: String(entity.reflection ?? ''),
    challenges: entity.challenges as string | null | undefined,
    adjustments: entity.adjustments as string | null | undefined,
    systemContext,
    reviewedAt:
      toDateString(entity.reviewedAt) ??
      toDateString(entity.createdAt) ??
      new Date(0).toISOString(),
    createdAt: toDateString(entity.createdAt),
    updatedAt: toDateString(entity.updatedAt),
  };
}

export function projectGoalRecords(records: unknown[], ctx: ExportContext): PortableGoalRecord[] {
  return records.map((r) => {
    const entity = r as Record<string, unknown>;
    const ref = ctx.refAllocator.allocate('goalRecord');
    ctx.refToIdMap.set(String(entity.id), ref);
    return {
      _ref: ref,
      keyResultRef: resolveExportRefOrThrow(String(entity.keyResultId), ctx, 'goal record'),
      value: Number(entity.value),
      note: entity.note as string | null | undefined,
      sourceType: entity.sourceType as string | null | undefined,
      recordedAt: toDateString(entity.recordedAt) ?? new Date(0).toISOString(),
      createdAt: toDateString(entity.createdAt),
      updatedAt: toDateString(entity.updatedAt),
    };
  });
}
