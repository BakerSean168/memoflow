import { createHash } from 'node:crypto';
import type {
  GoalClientDTO,
  GoalMutationReceipt,
  GoalPortableDefinitionV3,
  GoalPortablePayloadV3,
} from '@memoflow/contracts/goal';
import { GoalPortablePayloadV3Schema, GoalStatus, GoalSystemView } from '@memoflow/contracts/goal';
import type {
  PortableCapability,
  PortableCapabilityExecutionContext,
  PortableCapabilityReceipt,
  PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import type { IdentityId } from '@memoflow/contracts/primitives';
import type { Result } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { GoalApplicationPort } from './goal.application.port';

const PAGE_SIZE = 100;

function stableUuid(seed: string): string {
  const hex = createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  const variant = Number.parseInt(hex[16]!, 16);
  hex[16] = ((variant & 0x3) | 0x8).toString(16);
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function deterministicGoalId(batchId: string, ref: PortableReferenceV3): string {
  return `IGoalId_${stableUuid(`portable:${batchId}:goal:${ref}`)}`;
}

function deterministicKeyResultId(batchId: string, ref: PortableReferenceV3): string {
  return `IKeyResultId_${stableUuid(`portable:${batchId}:key-result:${ref}`)}`;
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

function assertExistingGoalMatchesPortableDefinition(
  existing: GoalClientDTO,
  goal: GoalPortableDefinitionV3,
  batchId: string,
  resolvedLabelIds: readonly string[],
): void {
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

  const existingKeyResults = [...(existing.keyResults ?? [])].sort((a, b) => a.order - b.order);
  if (existingKeyResults.length !== goal.keyResults.length) conflict('keyResults.length');

  for (const [index, portableKeyResult] of goal.keyResults.entries()) {
    const current = existingKeyResults[index];
    if (!current) conflict(`keyResults[${index}]`);
    if (current.id !== deterministicKeyResultId(batchId, portableKeyResult.ref)) {
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
    if (current.progress.targetValue !== portableKeyResult.targetValue) {
      conflict(`keyResults[${index}].targetValue`);
    }
    if (stableJson(current.target) !== stableJson(portableKeyResult.target)) {
      conflict(`keyResults[${index}].target`);
    }
    if (current.progress.unit !== portableKeyResult.unit) conflict(`keyResults[${index}].unit`);
    if (current.weight !== portableKeyResult.weight) conflict(`keyResults[${index}].weight`);
  }
}

async function transitionGoal(
  api: GoalApplicationPort,
  goal: GoalPortableDefinitionV3,
  context: PortableCapabilityExecutionContext,
  receipt: GoalMutationReceipt,
): Promise<GoalMutationReceipt> {
  let current = receipt;
  const goalId = current.goalId;
  const identityId = context.identityId;

  const currentStatus = current.readModel.status;
  const allowedPrefixes: Record<GoalStatus, readonly GoalStatus[]> = {
    [GoalStatus.Planned]: [GoalStatus.Planned],
    [GoalStatus.InProgress]: [GoalStatus.Planned, GoalStatus.InProgress],
    [GoalStatus.Completed]: [GoalStatus.Planned, GoalStatus.InProgress, GoalStatus.Completed],
    [GoalStatus.Abandoned]: [GoalStatus.Planned, GoalStatus.InProgress, GoalStatus.Abandoned],
  };
  if (!allowedPrefixes[goal.status].includes(currentStatus)) {
    throw new Error(
      `goals@3 deterministic target lifecycle conflicts with portable goal ${goal.ref}: ${currentStatus} cannot converge to ${goal.status}`,
    );
  }
  if (!goal.archived && current.readModel.archivedAt !== null) {
    throw new Error(
      `goals@3 deterministic target lifecycle conflicts with portable goal ${goal.ref}: archived target cannot converge to unarchived`,
    );
  }

  if (goal.status === GoalStatus.InProgress && current.readModel.status === GoalStatus.Planned) {
    current = requireResult(
      await api.activateGoal(goalId, identityId, current.goalVersion),
      'activate portable goal',
    );
  } else if (goal.status === GoalStatus.Completed) {
    if (current.readModel.status === GoalStatus.Planned) {
      current = requireResult(
        await api.activateGoal(goalId, identityId, current.goalVersion),
        'activate portable goal before completion',
      );
    }
    if (current.readModel.status !== GoalStatus.Completed) {
      current = requireResult(
        await api.completeGoal(goalId, identityId, current.goalVersion),
        'complete portable goal',
      );
    }
  } else if (
    goal.status === GoalStatus.Abandoned &&
    current.readModel.status !== GoalStatus.Abandoned
  ) {
    current = requireResult(
      await api.abandonGoal(goalId, identityId, current.goalVersion),
      'abandon portable goal',
    );
  }

  if (goal.archived && current.readModel.archivedAt === null) {
    current = requireResult(
      await api.archiveGoal(goalId, identityId, current.goalVersion),
      'archive portable goal',
    );
  }
  return current;
}

/** Goal-owned definition/KR capability. Goal history remains a later PORT-1610 capability. */
export class GoalPortableCapability implements PortableCapability<GoalPortablePayloadV3> {
  readonly key = 'goals' as const;
  readonly schemaVersion = 3;
  readonly dependsOn = ['labels'] as const;
  readonly payloadSchema = GoalPortablePayloadV3Schema;

  constructor(private readonly api: GoalApplicationPort) {}

  async export(context: PortableCapabilityExecutionContext): Promise<GoalPortablePayloadV3> {
    const goals: GoalPortablePayloadV3['goals'] = [];
    let page = 1;
    while (true) {
      const result = requireResult(
        await this.api.listGoals({
          identityId: context.identityId as IdentityId,
          systemView: GoalSystemView.All,
          page,
          pageSize: PAGE_SIZE,
          includeKeyResults: true,
          includeReviews: false,
        }),
        'list portable goals',
      );
      for (const goal of result.data) {
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
          keyResults: (goal.keyResults ?? []).map((keyResult) => ({
            ref: context.references.declareExportReference('goals', keyResult.id),
            title: keyResult.title,
            description: keyResult.description,
            calculationMethod: keyResult.progress.aggregationMethod,
            initialValue: keyResult.progress.initialValue,
            currentValue: keyResult.progress.currentValue,
            targetValue: keyResult.progress.targetValue,
            target: keyResult.target,
            unit: keyResult.progress.unit,
            weight: keyResult.weight,
          })),
        });
      }
      if (!result.pagination.hasMore) break;
      page += 1;
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
      const id = deterministicGoalId(batchId, goal.ref);
      const current = await this.api.getGoal(id, context.identityId, true);
      if (current.ok) skipped += 1;
      else if (current.error.code === 'NOT_FOUND') created += 1;
      else requireResult(current, 'inspect portable goal');
    }
    return {
      created,
      updated: 0,
      skipped,
      warnings: [
        'goals@3 currently covers Goal definitions and Key Results; Goal records/reviews remain on V2 until PORT-1610.',
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
      const id = deterministicGoalId(batchId, goal.ref);
      const labelIds = goal.labelRefs.map((ref) =>
        context.references.resolveImportedReference(ref),
      );
      const existing = await this.api.getGoal(id, context.identityId, true);
      if (existing.ok) {
        assertExistingGoalMatchesPortableDefinition(existing.data, goal, batchId, labelIds);
        skipped += 1;
      } else if (existing.error.code === 'NOT_FOUND') {
        created += 1;
      } else {
        requireResult(existing, 'inspect portable goal');
      }

      let receipt = requireResult(
        await this.api.createGoal(
          {
            id: id as never,
            name: goal.name,
            summary: goal.summary ?? undefined,
            startDate: goal.startDate ?? undefined,
            target: goal.target ?? undefined,
            reminderConfig: goal.reminderConfig,
            labelIds,
            initialKeyResults: goal.keyResults.map((keyResult) => ({
              id: deterministicKeyResultId(batchId, keyResult.ref) as never,
              title: keyResult.title,
              description: keyResult.description,
              calculationMethod: keyResult.calculationMethod,
              initialValue: keyResult.initialValue,
              currentValue: keyResult.currentValue,
              targetValue: keyResult.targetValue,
              target: keyResult.target,
              unit: keyResult.unit,
              weight: keyResult.weight,
            })),
          },
          systemContext(context, goal.ref),
        ),
        'create portable goal',
      );

      context.references.bindImportedReference(goal.ref, receipt.goalId);
      for (const keyResult of goal.keyResults) {
        context.references.bindImportedReference(
          keyResult.ref,
          deterministicKeyResultId(batchId, keyResult.ref),
        );
      }
      receipt = await transitionGoal(this.api, goal, context, receipt);
    }

    return {
      created,
      updated: 0,
      skipped,
      warnings: [
        'goals@3 currently covers Goal definitions and Key Results; Goal records/reviews remain on V2 until PORT-1610.',
      ],
    };
  }
}

export function createGoalPortableCapability(api: GoalApplicationPort): GoalPortableCapability {
  return new GoalPortableCapability(api);
}
