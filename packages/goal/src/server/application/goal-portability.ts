import { createHash } from 'node:crypto';
import type {
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

async function transitionGoal(
  api: GoalApplicationPort,
  goal: GoalPortableDefinitionV3,
  context: PortableCapabilityExecutionContext,
  receipt: GoalMutationReceipt,
): Promise<GoalMutationReceipt> {
  let current = receipt;
  const goalId = current.goalId;
  const identityId = context.identityId;

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
      const existing = await this.api.getGoal(id, context.identityId, true);
      if (existing.ok) skipped += 1;
      else if (existing.error.code === 'NOT_FOUND') created += 1;
      else requireResult(existing, 'inspect portable goal');

      const labelIds = goal.labelRefs.map((ref) =>
        context.references.resolveImportedReference(ref),
      );
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
