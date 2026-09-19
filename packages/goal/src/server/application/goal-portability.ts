import { createHash } from 'node:crypto';
import type {
  GoalMutationReceipt,
  GoalPortableDefinitionV3,
  GoalPortablePayloadV3,
} from '@memoflow/contracts/goal';
import { GoalPortablePayloadV3Schema, GoalStatus } from '@memoflow/contracts/goal';
import { LabelPortablePayloadV3Schema } from '@memoflow/contracts/label';
import type {
  PortableCapability,
  PortableCapabilityExecutionContext,
  PortableCapabilityReceipt,
  PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import type { Result } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { GoalApplicationPort } from './goal.application.port';
import type {
  GoalPortabilityApplicationPort,
  GoalPortabilityRestoreInput,
  GoalPortabilitySnapshot,
} from './goal-portability.application.port';

function stableUuid(seed: string): string {
  const hex = createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  const variant = Number.parseInt(hex[16]!, 16);
  hex[16] = ((variant & 0x3) | 0x8).toString(16);
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function deterministicGoalId(
  identityId: string,
  batchId: string,
  ref: PortableReferenceV3,
): string {
  return `IGoalId_${stableUuid(`portable:${identityId}:${batchId}:goal:${ref}`)}`;
}

function deterministicKeyResultId(
  identityId: string,
  batchId: string,
  ref: PortableReferenceV3,
): string {
  return `IKeyResultId_${stableUuid(`portable:${identityId}:${batchId}:key-result:${ref}`)}`;
}

function deterministicRecordId(
  identityId: string,
  batchId: string,
  ref: PortableReferenceV3,
): string {
  return `IGoalRecordId_${stableUuid(`portable:${identityId}:${batchId}:goal-record:${ref}`)}`;
}

function deterministicReviewId(
  identityId: string,
  batchId: string,
  ref: PortableReferenceV3,
): string {
  return `IGoalReviewId_${stableUuid(`portable:${identityId}:${batchId}:goal-review:${ref}`)}`;
}

function requireBatchId(context: PortableCapabilityExecutionContext): string {
  if (!context.batchId) throw new Error('goals@3 requires a portability batch id');
  return context.batchId;
}

function systemContext(
  context: PortableCapabilityExecutionContext,
  goalRef: PortableReferenceV3,
): ExecutionContext {
  return {
    identityId: context.identityId,
    requestId: `portable:${context.batchId}:${goalRef}`,
    traceId: `portable:${context.batchId}:${goalRef}`,
    startedAt: Date.now(),
    source: 'system',
  };
}

function requireResult<T>(result: Result<T>, operation: string): T {
  if (result.ok) return result.data;
  throw new Error(`${operation}: ${result.error.code}: ${result.error.message}`);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function assertLabelRefsArePresent(
  payload: GoalPortablePayloadV3,
  context: PortableCapabilityExecutionContext,
): void {
  const labelsPayload = LabelPortablePayloadV3Schema.safeParse(
    context.importedCapabilityPayloads?.get('labels'),
  );
  if (!labelsPayload.success) {
    throw new Error('goals@3 requires a valid labels@3 payload for label references');
  }
  const labelRefs = new Set(labelsPayload.data.labels.map((label) => label.ref));
  for (const goal of payload.goals) {
    for (const labelRef of goal.labelRefs) {
      if (!labelRefs.has(labelRef)) {
        throw new Error(`goals@3 label reference is missing from labels@3 payload: ${labelRef}`);
      }
    }
  }
}

function resolveDryRunLabelIds(
  goal: GoalPortableDefinitionV3,
  context: PortableCapabilityExecutionContext,
): string[] {
  return goal.labelRefs.map((ref) => context.references.resolveImportedReference(ref));
}

function assertExistingGoalMatchesPortableDefinition(
  existing: GoalPortabilitySnapshot,
  goal: GoalPortableDefinitionV3,
  batchId: string,
  resolvedLabelIds: readonly string[],
): void {
  assertLifecycleCanConverge(existing, goal);
  const conflict = (field: string): never => {
    throw new Error(
      `goals@3 deterministic target conflicts with portable definition ${goal.ref}: ${field}`,
    );
  };

  if (existing.name !== goal.name) conflict('name');
  if (existing.summary !== goal.summary) conflict('summary');
  if (existing.startDate !== goal.startDate) conflict('startDate');
  if (stableJson(existing.target) !== stableJson(goal.target)) conflict('target');
  if (stableJson(existing.reminderConfig) !== stableJson(goal.reminderConfig)) {
    conflict('reminderConfig');
  }
  if (
    !sameStringSet(
      existing.labels.map((label) => label.id),
      resolvedLabelIds,
    )
  ) {
    conflict('labels');
  }

  const existingKeyResults = [...existing.keyResults].sort((a, b) => a.sortOrder - b.sortOrder);
  if (existingKeyResults.length !== goal.keyResults.length) conflict('keyResults.length');

  for (const [index, portableKeyResult] of goal.keyResults.entries()) {
    const current = existingKeyResults[index];
    if (!current) conflict(`keyResults[${index}]`);
    if (
      current.id !== deterministicKeyResultId(existing.identityId, batchId, portableKeyResult.ref)
    ) {
      conflict(`keyResults[${index}].id`);
    }
    if (current.title !== portableKeyResult.title) conflict(`keyResults[${index}].title`);
    if (current.description !== portableKeyResult.description) {
      conflict(`keyResults[${index}].description`);
    }
    if (current.progress.aggregationMethod !== portableKeyResult.calculationMethod) {
      conflict(`keyResults[${index}].calculationMethod`);
    }
    if (current.progress.initialValue !== portableKeyResult.initialValue) {
      conflict(`keyResults[${index}].initialValue`);
    }
    if (current.progress.currentValue !== portableKeyResult.currentValue) {
      conflict(`keyResults[${index}].currentValue`);
    }
    if (current.progress.trackingBaseValue !== portableKeyResult.trackingBaseValue) {
      conflict(`keyResults[${index}].trackingBaseValue`);
    }
    if (current.progress.targetValue !== portableKeyResult.targetValue) {
      conflict(`keyResults[${index}].targetValue`);
    }
    if (stableJson(current.target) !== stableJson(portableKeyResult.target)) {
      conflict(`keyResults[${index}].target`);
    }
    if (current.progress.unit !== portableKeyResult.unit) conflict(`keyResults[${index}].unit`);
    if (current.weight !== portableKeyResult.weight) conflict(`keyResults[${index}].weight`);
  }

  const records = [...existing.records].sort((a, b) => {
    const byRecordedAt = Number(a.recordedAt) - Number(b.recordedAt);
    return byRecordedAt || String(a.id).localeCompare(String(b.id));
  });
  if (records.length !== goal.records.length) conflict('records.length');
  for (const [index, portableRecord] of goal.records.entries()) {
    const current = records[index];
    if (!current) conflict(`records[${index}]`);
    if (
      String(current.id) !== deterministicRecordId(existing.identityId, batchId, portableRecord.ref)
    ) {
      conflict(`records[${index}].id`);
    }
    if (
      String(current.keyResultId) !==
      deterministicKeyResultId(existing.identityId, batchId, portableRecord.keyResultRef)
    ) {
      conflict(`records[${index}].keyResultId`);
    }
    if (
      current.value !== portableRecord.value ||
      current.note !== portableRecord.note ||
      Number(current.recordedAt) !== portableRecord.recordedAt
    ) {
      conflict(`records[${index}]`);
    }
  }
  const reviews = [...existing.reviews].sort(
    (a, b) =>
      Number(a.reviewedAt) - Number(b.reviewedAt) || String(a.id).localeCompare(String(b.id)),
  );
  if (reviews.length !== goal.reviews.length) conflict('reviews.length');
  for (const [index, portableReview] of goal.reviews.entries()) {
    const current = reviews[index];
    if (!current) conflict(`reviews[${index}]`);
    if (
      String(current.id) !== deterministicReviewId(existing.identityId, batchId, portableReview.ref)
    ) {
      conflict(`reviews[${index}].id`);
    }
    const currentContext = current.systemContext;
    const portableContext = portableReview.systemContext;
    const normalizedContext = {
      ...currentContext,
      keyResults: currentContext.keyResults.map((keyResult) => ({
        keyResultRef: deterministicKeyResultId(
          existing.identityId,
          batchId,
          String(keyResult.keyResultId),
        ),
        title: keyResult.title,
        unit: keyResult.unit,
        startPercentage: keyResult.startPercentage,
        endPercentage: keyResult.endPercentage,
        deltaPercentage: keyResult.deltaPercentage,
        trend: keyResult.trend,
      })),
    };
    const portableKeyResults = portableContext.keyResults.map((keyResult) => ({
      keyResultRef: keyResult.keyResultRef,
      title: keyResult.title,
      unit: keyResult.unit,
      startPercentage: keyResult.startPercentage,
      endPercentage: keyResult.endPercentage,
      deltaPercentage: keyResult.deltaPercentage,
      trend: keyResult.trend,
    }));
    const comparablePortableContext = {
      ...portableContext,
      keyResults: portableKeyResults,
    };
    if (
      current.reflection !== portableReview.reflection ||
      current.challenges !== portableReview.challenges ||
      current.adjustments !== portableReview.adjustments ||
      Number(current.reviewedAt) !== portableReview.reviewedAt ||
      stableJson(normalizedContext) !== stableJson(comparablePortableContext)
    ) {
      conflict(`reviews[${index}]`);
    }
  }
}

function assertLifecycleCanConverge(
  existing: Pick<GoalPortabilitySnapshot, 'status' | 'archivedAt' | 'deletedAt'>,
  goal: GoalPortableDefinitionV3,
): void {
  if (existing.deletedAt !== null) {
    throw new Error(
      `goals@3 deterministic target lifecycle conflicts with portable goal ${goal.ref}: deleted target cannot be replayed`,
    );
  }
  const allowedPrefixes: Record<GoalStatus, readonly GoalStatus[]> = {
    [GoalStatus.Planned]: [GoalStatus.Planned],
    [GoalStatus.InProgress]: [GoalStatus.Planned, GoalStatus.InProgress],
    [GoalStatus.Completed]: [GoalStatus.Planned, GoalStatus.InProgress, GoalStatus.Completed],
    [GoalStatus.Abandoned]: [GoalStatus.Planned, GoalStatus.InProgress, GoalStatus.Abandoned],
  };
  if (!allowedPrefixes[goal.status].includes(existing.status)) {
    throw new Error(
      `goals@3 deterministic target lifecycle conflicts with portable goal ${goal.ref}: ${existing.status} cannot converge to ${goal.status}`,
    );
  }
  if (existing.archivedAt !== null && existing.status !== goal.status) {
    throw new Error(
      `goals@3 deterministic target lifecycle conflicts with portable goal ${goal.ref}: archived goal cannot change status`,
    );
  }
  if (!goal.archived && existing.archivedAt !== null) {
    throw new Error(
      `goals@3 deterministic target lifecycle conflicts with portable goal ${goal.ref}: archived target cannot converge to unarchived`,
    );
  }
}

interface GoalLifecycleState {
  goalId: string;
  goalVersion: number;
  status: GoalStatus;
  archivedAt: number | null;
}

async function transitionGoal(
  api: GoalApplicationPort,
  goal: GoalPortableDefinitionV3,
  context: PortableCapabilityExecutionContext,
  state: GoalLifecycleState,
): Promise<void> {
  const identityId = context.identityId;
  const step = async (
    operation: (
      id: string,
      identity: string,
      version: number,
    ) => Promise<Result<GoalMutationReceipt>>,
    name: string,
  ) => {
    const receipt = requireResult(
      await operation(state.goalId, identityId, state.goalVersion),
      name,
    );
    state.goalVersion = receipt.goalVersion;
    state.status = receipt.readModel.status;
    state.archivedAt = receipt.readModel.archivedAt;
  };

  if (goal.status === GoalStatus.InProgress && state.status === GoalStatus.Planned) {
    await step(api.activateGoal, 'activate portable goal');
  } else if (goal.status === GoalStatus.Completed) {
    if (state.status === GoalStatus.Planned) {
      await step(api.activateGoal, 'activate portable goal before completion');
    }
    if (state.status !== GoalStatus.Completed) {
      await step(api.completeGoal, 'complete portable goal');
    }
  } else if (goal.status === GoalStatus.Abandoned && state.status !== GoalStatus.Abandoned) {
    await step(api.abandonGoal, 'abandon portable goal');
  }

  if (goal.archived && state.archivedAt === null) {
    await step(api.archiveGoal, 'archive portable goal');
  }
}

export class GoalPortableCapability implements PortableCapability<GoalPortablePayloadV3> {
  readonly key = 'goals' as const;
  readonly schemaVersion = 3;
  readonly dependsOn = ['labels'] as const;
  readonly payloadSchema = GoalPortablePayloadV3Schema;

  async validateImport(
    payload: GoalPortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<void> {
    assertLabelRefsArePresent(payload, context);
  }

  constructor(
    private readonly api: GoalApplicationPort,
    private readonly portability: GoalPortabilityApplicationPort,
  ) {}

  async export(context: PortableCapabilityExecutionContext): Promise<GoalPortablePayloadV3> {
    const goals: GoalPortablePayloadV3['goals'] = [];
    const snapshots = await this.portability.listGoalSnapshots(context.identityId);
    for (const goal of snapshots) {
      const goalRef = context.references.declareExportReference(this.key, goal.id);
      goals.push({
        ref: goalRef,
        name: goal.name,
        summary: goal.summary,
        status: goal.status,
        startDate: goal.startDate,
        target: goal.target,
        reminderConfig: goal.reminderConfig,
        archived: goal.archivedAt !== null,
        labelRefs: goal.labels.map((label) =>
          context.references.resolveExportReference('labels', label.id),
        ),
        keyResults: goal.keyResults.map((keyResult) => ({
          ref: context.references.declareExportReference('goals', keyResult.id),
          title: keyResult.title,
          description: keyResult.description,
          calculationMethod: keyResult.progress.aggregationMethod,
          initialValue: keyResult.progress.initialValue,
          currentValue: keyResult.progress.currentValue,
          trackingBaseValue: keyResult.progress.trackingBaseValue,
          targetValue: keyResult.progress.targetValue,
          target: keyResult.target,
          unit: keyResult.progress.unit,
          weight: keyResult.weight,
        })),
        records: goal.records
          .slice()
          .sort(
            (a, b) =>
              Number(a.recordedAt) - Number(b.recordedAt) ||
              String(a.id).localeCompare(String(b.id)),
          )
          .map((record) => ({
            ref: context.references.declareExportReference('goals', String(record.id)),
            keyResultRef: context.references.resolveExportReference(
              'goals',
              String(record.keyResultId),
            ),
            value: record.value,
            note: record.note,
            recordedAt: Number(record.recordedAt),
          })),
        reviews: goal.reviews
          .slice()
          .sort(
            (a, b) =>
              Number(a.reviewedAt) - Number(b.reviewedAt) ||
              String(a.id).localeCompare(String(b.id)),
          )
          .map((review) => ({
            ref: context.references.declareExportReference('goals', String(review.id)),
            reflection: review.reflection,
            challenges: review.challenges,
            adjustments: review.adjustments,
            reviewedAt: Number(review.reviewedAt),
            systemContext: {
              ...review.systemContext,
              keyResults: review.systemContext.keyResults.map((keyResult) => ({
                ...keyResult,
                keyResultRef: context.references.resolveExportReference(
                  'goals',
                  String(keyResult.keyResultId),
                ),
              })),
            },
          })),
      });
    }
    return { goals };
  }

  async dryRun(
    payload: GoalPortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const target = GoalPortablePayloadV3Schema.parse(payload);
    const batchId = requireBatchId(context);
    let created = 0;
    let skipped = 0;
    for (const goal of target.goals) {
      const id = deterministicGoalId(context.identityId, batchId, goal.ref);
      const current = await this.portability.getGoalSnapshot(id, context.identityId);
      const labelIds = resolveDryRunLabelIds(goal, context);
      if (current) {
        assertExistingGoalMatchesPortableDefinition(current, goal, batchId, labelIds);
        assertLifecycleCanConverge(current, goal);
        skipped += 1;
      } else {
        created += 1;
      }

      // Dry-run predicts the same deterministic ids apply persists, so dependents
      // ordered after goals can compare Goal/Key Result relations before any
      // mutation-capable call. These bindings are predictions on the operation-local
      // registry only; dry-run never mutates persistence. An already bound ref is
      // re-bound to the same deterministic prediction, so replay stays idempotent.
      context.references.bindImportedReference(goal.ref, id);
      for (const keyResult of goal.keyResults) {
        context.references.bindImportedReference(
          keyResult.ref,
          deterministicKeyResultId(context.identityId, batchId, keyResult.ref),
        );
      }
      for (const record of goal.records) {
        context.references.bindImportedReference(
          record.ref,
          deterministicRecordId(context.identityId, batchId, record.ref),
        );
      }
      for (const review of goal.reviews) {
        context.references.bindImportedReference(
          review.ref,
          deterministicReviewId(context.identityId, batchId, review.ref),
        );
      }
    }
    return {
      created,
      updated: 0,
      skipped,
      warnings: [
        'goals@3 restores source-neutral Goal records; task-source provenance is not portable.',
      ],
    };
  }

  async apply(
    payload: GoalPortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const target = GoalPortablePayloadV3Schema.parse(payload);
    const batchId = requireBatchId(context);
    let created = 0;
    let skipped = 0;

    for (const goal of target.goals) {
      const id = deterministicGoalId(context.identityId, batchId, goal.ref);
      const labelIds = goal.labelRefs.map((ref) =>
        context.references.resolveImportedReference(ref),
      );
      const existing = await this.portability.getGoalSnapshot(id, context.identityId);
      if (!existing) created += 1;

      const input: GoalPortabilityRestoreInput = {
        id: id as never,
        name: goal.name,
        summary: goal.summary ?? undefined,
        startDate: goal.startDate ?? undefined,
        target: goal.target ?? undefined,
        reminderConfig: goal.reminderConfig,
        labelIds,
        initialKeyResults: goal.keyResults.map((keyResult) => ({
          id: deterministicKeyResultId(context.identityId, batchId, keyResult.ref) as never,
          title: keyResult.title,
          description: keyResult.description,
          calculationMethod: keyResult.calculationMethod,
          initialValue: keyResult.initialValue,
          currentValue: keyResult.currentValue,
          trackingBaseValue: keyResult.trackingBaseValue,
          targetValue: keyResult.targetValue,
          target: keyResult.target,
          unit: keyResult.unit,
          weight: keyResult.weight,
        })),
        records: goal.records.map((record) => ({
          id: deterministicRecordId(context.identityId, batchId, record.ref) as never,
          keyResultId: deterministicKeyResultId(
            context.identityId,
            batchId,
            record.keyResultRef,
          ) as never,
          value: record.value,
          note: record.note,
          sourceType: null,
          sourceId: null,
          recordedAt: record.recordedAt,
          createdAt: record.recordedAt,
          updatedAt: record.recordedAt,
        })),
        reviews: goal.reviews.map((review) => ({
          id: deterministicReviewId(context.identityId, batchId, review.ref) as never,
          reflection: review.reflection,
          challenges: review.challenges,
          adjustments: review.adjustments,
          reviewedAt: review.reviewedAt,
          createdAt: review.reviewedAt,
          updatedAt: review.reviewedAt,
          systemContext: {
            ...review.systemContext,
            keyResults: review.systemContext.keyResults.map((keyResult) => ({
              ...keyResult,
              keyResultId: deterministicKeyResultId(
                context.identityId,
                batchId,
                keyResult.keyResultRef,
              ) as never,
            })),
          } as never,
        })),
      };
      let lifecycleState: GoalLifecycleState;
      if (existing) {
        assertExistingGoalMatchesPortableDefinition(existing, goal, batchId, labelIds);
        assertLifecycleCanConverge(existing, goal);
        skipped += 1;
        lifecycleState = {
          goalId: existing.id,
          goalVersion: existing.version,
          status: existing.status,
          archivedAt: existing.archivedAt,
        };
      } else {
        const receipt = requireResult(
          await this.portability.restoreGoalForPortability(input, systemContext(context, goal.ref)),
          'create portable goal',
        );

        const committed = await this.portability.getGoalSnapshot(id, context.identityId);
        if (!committed) {
          throw new Error(`goals@3 portable goal was not persisted: ${goal.ref}`);
        }
        assertExistingGoalMatchesPortableDefinition(committed, goal, batchId, labelIds);
        assertLifecycleCanConverge(committed, goal);
        lifecycleState = {
          goalId: receipt.goalId,
          goalVersion: receipt.goalVersion,
          status: receipt.readModel.status,
          archivedAt: receipt.readModel.archivedAt,
        };
      }

      context.references.bindImportedReference(goal.ref, lifecycleState.goalId);
      for (const keyResult of goal.keyResults) {
        context.references.bindImportedReference(
          keyResult.ref,
          deterministicKeyResultId(context.identityId, batchId, keyResult.ref),
        );
      }
      for (const record of goal.records) {
        context.references.bindImportedReference(
          record.ref,
          deterministicRecordId(context.identityId, batchId, record.ref),
        );
      }
      for (const review of goal.reviews) {
        context.references.bindImportedReference(
          review.ref,
          deterministicReviewId(context.identityId, batchId, review.ref),
        );
      }
      await transitionGoal(this.api, goal, context, lifecycleState);
    }

    return {
      created,
      updated: 0,
      skipped,
      warnings: [
        'goals@3 restores source-neutral Goal records; task-source provenance is not portable.',
      ],
    };
  }
}

export function createGoalPortableCapability(
  api: GoalApplicationPort,
  portability: GoalPortabilityApplicationPort,
): GoalPortableCapability {
  return new GoalPortableCapability(api, portability);
}
