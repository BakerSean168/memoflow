import type { Instant } from '@memoflow/contracts/primitives';
import {
  ImportanceLevel,
  type ImportanceLevel as ImportanceLevelValue,
} from '@memoflow/contracts/shared';
import {
  TaskOccurrenceChecklistItemSchema,
  TaskOccurrenceResultSchema,
  TaskOccurrenceStatus,
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  type ChecklistItemDefinitionDTO,
  type GoalContributionRule,
  type TaskOccurrenceChecklistItem,
  type TaskOccurrenceResult,
  type TaskOccurrenceScheduleSnapshot as TaskOccurrenceScheduleSnapshotDTO,
  type TaskPlanCompletionPolicyValue,
  type TaskPlanOutcomeValue,
  type TaskPlanSchedule as TaskPlanScheduleDTO,
  type TaskReminderConfigDTO,
} from '@memoflow/contracts/task';
import { IdentityId } from '@memoflow/domain-shared';
import { TaskOccurrence } from '../../domain/aggregates/task-occurrence';
import { TaskPlan } from '../../domain/aggregates/task-plan';
import { TaskOccurrenceId } from '../../domain/value-objects/task-occurrence-id';
import { TaskPlanId } from '../../domain/value-objects/task-plan-id';
import { buildTaskOccurrenceOccurrenceKeyFromDate } from '../../domain/value-objects/task-occurrence-occurrence-key';
import {
  ChecklistItemDefinition,
  TaskGoalBinding,
  TaskOccurrenceScheduleSnapshot,
  TaskPlanSchedule,
  TaskPlanStatus,
  TaskReminderConfig,
} from '../../domain/value-objects';
import type { TaskWriteTransactionRunner } from '../use-cases/commands/task-write-support';

export interface TaskCanonicalRestoreGoalBinding {
  readonly goalId: string;
  readonly keyResultId: string | null;
  readonly contribution: GoalContributionRule | null;
}

/**
 * Canonical TaskPlan facts accepted by the Task-owned restore boundary.
 * Host identity, CAS version, deletion state and persistence timestamps are not caller-controlled.
 */
export interface TaskCanonicalRestorePlan {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly schedule: TaskPlanScheduleDTO;
  readonly reminderConfig: TaskReminderConfigDTO | null;
  readonly importance: ImportanceLevelValue;
  readonly status: string;
  readonly outcome: TaskPlanOutcomeValue;
  readonly completionPolicy: TaskPlanCompletionPolicyValue;
  readonly closedAt: Instant | null;
  readonly archivedAt: Instant | null;
  readonly abandonedReason: string | null;
  readonly goalBinding: TaskCanonicalRestoreGoalBinding | null;
  readonly checklist: readonly ChecklistItemDefinitionDTO[];
  readonly labelIds: readonly string[];
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

/** Canonical TaskOccurrence facts restored under one plan in the same bundle. */
export interface TaskCanonicalRestoreOccurrence {
  readonly id: string;
  readonly planId: string;
  readonly scheduleSnapshot: TaskOccurrenceScheduleSnapshotDTO;
  readonly importanceSnapshot: ImportanceLevelValue;
  readonly status: (typeof TaskOccurrenceStatus)[keyof typeof TaskOccurrenceStatus];
  readonly actualStartAt: Instant | null;
  readonly result: TaskOccurrenceResult | null;
  readonly checklistState: readonly TaskOccurrenceChecklistItem[];
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

export interface TaskCanonicalRestoreBundle {
  readonly identityId: string;
  readonly plans: readonly TaskCanonicalRestorePlan[];
  readonly occurrences: readonly TaskCanonicalRestoreOccurrence[];
}

export interface TaskCanonicalRestoreReceipt {
  readonly plansCreated: number;
  readonly plansSkipped: number;
  readonly occurrencesCreated: number;
  readonly occurrencesSkipped: number;
}

function assertInstant(value: Instant, field: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a valid Instant`);
}

function assertOptionalInstant(value: Instant | null, field: string): void {
  if (value !== null) assertInstant(value, field);
}

function assertImportance(value: ImportanceLevelValue, field: string): void {
  if (!Object.values(ImportanceLevel).includes(value)) {
    throw new Error(`${field} is invalid`);
  }
}

function comparablePlanState(plan: TaskPlan): string {
  const dto = plan.toServerDTO();
  return JSON.stringify({
    name: dto.name,
    description: dto.description,
    schedule: dto.schedule,
    reminderConfig: dto.reminderConfig,
    importance: dto.importance,
    goalBinding: dto.goalBinding,
    checklist: dto.checklist,
    status: dto.status,
    outcome: dto.outcome,
    completionPolicy: dto.completionPolicy,
    closedAt: dto.closedAt,
    archived: dto.archivedAt !== null,
    abandonedReason: dto.abandonedReason,
    deleted: dto.deletedAt !== null,
  });
}

function comparableOccurrenceState(occurrence: TaskOccurrence): string {
  const dto = occurrence.toServerDTO();
  return JSON.stringify({
    planId: dto.planId,
    occurrenceKey: dto.occurrenceKey,
    scheduleSnapshot: dto.scheduleSnapshot,
    importanceSnapshot: dto.importanceSnapshot,
    status: dto.status,
    actualStartAt: dto.actualStartAt,
    result: dto.result,
    checklistState: dto.checklistState,
    deleted: dto.deletedAt !== null,
  });
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function assertLifecycle(plan: TaskCanonicalRestorePlan): void {
  if (!Object.values(TaskPlanOutcome).includes(plan.outcome)) {
    throw new Error(`Task plan ${plan.id} has an invalid outcome`);
  }
  if (!Object.values(TaskPlanCompletionPolicy).includes(plan.completionPolicy)) {
    throw new Error(`Task plan ${plan.id} has an invalid completion policy`);
  }

  const status = TaskPlanStatus.of(plan.status);
  const isClosed = status === TaskPlanStatus.Closed;
  const isOpenOutcome = plan.outcome === TaskPlanOutcome.Open;
  if (isClosed === isOpenOutcome) {
    throw new Error(
      `Task plan ${plan.id} lifecycle is inconsistent: Open outcome requires Active/Paused; terminal outcome requires Closed`,
    );
  }
  if ((isClosed && plan.closedAt === null) || (!isClosed && plan.closedAt !== null)) {
    throw new Error(`Task plan ${plan.id} closedAt does not match its lifecycle`);
  }
  if (plan.outcome !== TaskPlanOutcome.Abandoned && plan.abandonedReason !== null) {
    throw new Error(`Task plan ${plan.id} abandonedReason requires Abandoned outcome`);
  }
}

/**
 * Task-owned import/restore seam for canonical business state.
 *
 * This deliberately bypasses normal command behavior (occurrence generation,
 * settlement and Goal outbox publication) while still reconstructing every
 * aggregate through Task domain value objects and aggregate `load()` guards.
 */
export class TaskCanonicalRestoreService {
  constructor(private readonly transactionRunner: TaskWriteTransactionRunner) {}

  async restore(bundle: TaskCanonicalRestoreBundle): Promise<TaskCanonicalRestoreReceipt> {
    if (bundle.identityId.trim().length === 0) throw new Error('Task restore identity is required');

    const identityId = IdentityId.of(bundle.identityId);
    const planIds = new Set<string>();
    const occurrenceIds = new Set<string>();
    const occurrenceKeys = new Set<string>();
    const checklistIdsByPlan = new Map<string, Set<string>>();

    const plans = bundle.plans.map((input) => {
      if (planIds.has(input.id)) throw new Error(`Duplicate Task plan restore id: ${input.id}`);
      planIds.add(input.id);
      assertInstant(input.createdAt, `Task plan ${input.id} createdAt`);
      assertInstant(input.updatedAt, `Task plan ${input.id} updatedAt`);
      assertOptionalInstant(input.closedAt, `Task plan ${input.id} closedAt`);
      assertOptionalInstant(input.archivedAt, `Task plan ${input.id} archivedAt`);
      if (input.updatedAt < input.createdAt) {
        throw new Error(`Task plan ${input.id} updatedAt cannot precede createdAt`);
      }
      assertImportance(input.importance, `Task plan ${input.id} importance`);
      assertLifecycle(input);

      const checklist = input.checklist.map((item) => ChecklistItemDefinition.fromDTO(item));
      const checklistIds = new Set<string>();
      for (const item of checklist) {
        if (checklistIds.has(item.id)) {
          throw new Error(`Task plan ${input.id} has duplicate checklist definition identity`);
        }
        checklistIds.add(item.id);
      }
      checklistIdsByPlan.set(input.id, checklistIds);

      return {
        aggregate: TaskPlan.load({
          id: TaskPlanId.of(input.id),
          identityId,
          title: input.title,
          description: input.description,
          schedule: TaskPlanSchedule.create(input.schedule),
          reminderConfig:
            input.reminderConfig === null ? null : TaskReminderConfig.create(input.reminderConfig),
          importance: input.importance,
          status: TaskPlanStatus.of(input.status),
          outcome: input.outcome,
          completionPolicy: input.completionPolicy,
          closedAt: input.closedAt,
          archivedAt: input.archivedAt,
          abandonedReason: input.abandonedReason,
          goalBinding:
            input.goalBinding === null
              ? null
              : TaskGoalBinding.fromDTO({
                  goalId: input.goalBinding.goalId as never,
                  keyResultId: input.goalBinding.keyResultId as never,
                  contribution: input.goalBinding.contribution,
                }),
          checklist,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
          deletedAt: null,
          version: 1,
        }),
        labelIds: [...new Set(input.labelIds)],
      };
    });

    const occurrences = bundle.occurrences.map((input) => {
      if (occurrenceIds.has(input.id)) {
        throw new Error(`Duplicate Task occurrence restore id: ${input.id}`);
      }
      occurrenceIds.add(input.id);
      if (!planIds.has(input.planId)) {
        throw new Error(`Task occurrence ${input.id} references a plan outside the restore bundle`);
      }
      assertInstant(input.createdAt, `Task occurrence ${input.id} createdAt`);
      assertInstant(input.updatedAt, `Task occurrence ${input.id} updatedAt`);
      assertOptionalInstant(input.actualStartAt, `Task occurrence ${input.id} actualStartAt`);
      if (input.updatedAt < input.createdAt) {
        throw new Error(`Task occurrence ${input.id} updatedAt cannot precede createdAt`);
      }
      assertImportance(input.importanceSnapshot, `Task occurrence ${input.id} importance`);

      const scheduleSnapshot = TaskOccurrenceScheduleSnapshot.create(input.scheduleSnapshot);
      const occurrenceKey = buildTaskOccurrenceOccurrenceKeyFromDate(
        input.planId,
        scheduleSnapshot.date,
      );
      if (occurrenceKeys.has(occurrenceKey)) {
        throw new Error(`Duplicate Task occurrence date in restore bundle: ${occurrenceKey}`);
      }
      occurrenceKeys.add(occurrenceKey);

      const checklistState = TaskOccurrenceChecklistItemSchema.array().parse(input.checklistState);
      const planChecklistIds = checklistIdsByPlan.get(input.planId)!;
      for (const state of checklistState) {
        if (!planChecklistIds.has(state.definitionId)) {
          throw new Error(
            `Task occurrence ${input.id} references checklist definition outside its plan`,
          );
        }
      }

      return TaskOccurrence.load({
        id: TaskOccurrenceId.of(input.id),
        planId: TaskPlanId.of(input.planId),
        identityId,
        occurrenceKey,
        scheduleSnapshot,
        importanceSnapshot: input.importanceSnapshot,
        status: input.status,
        actualStartAt: input.actualStartAt,
        result: input.result === null ? null : TaskOccurrenceResultSchema.parse(input.result),
        checklistState,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        deletedAt: null,
        version: 1,
      });
    });

    let plansCreated = 0;
    let plansSkipped = 0;
    let occurrencesCreated = 0;
    let occurrencesSkipped = 0;

    await this.transactionRunner.run(async ({ planRepository, occurrenceRepository }) => {
      if (!planRepository) throw new Error('Task canonical restore requires the plan repository');
      for (const plan of plans) {
        const targetId = String(plan.aggregate.id);
        const existing = await planRepository.findByIdForIdentity(bundle.identityId, targetId);
        if (existing) {
          const existingLabelIds = existing.labels.map((label) => label.id);
          if (
            comparablePlanState(existing) !== comparablePlanState(plan.aggregate) ||
            !sameStringSet(existingLabelIds, plan.labelIds)
          ) {
            throw new Error(`Task restore target conflicts with existing state: ${targetId}`);
          }
          plansSkipped += 1;
          continue;
        }
        await planRepository.save(plan.aggregate);
        if (plan.labelIds.length > 0) {
          await planRepository.replaceLabels(bundle.identityId, targetId, plan.labelIds);
        }
        plansCreated += 1;
      }

      const missingOccurrences: TaskOccurrence[] = [];
      for (const occurrence of occurrences) {
        const targetId = String(occurrence.id);
        const existing = await occurrenceRepository.findByIdForIdentity(
          bundle.identityId,
          targetId,
        );
        if (existing) {
          if (comparableOccurrenceState(existing) !== comparableOccurrenceState(occurrence)) {
            throw new Error(
              `Task occurrence restore target conflicts with existing state: ${targetId}`,
            );
          }
          occurrencesSkipped += 1;
          continue;
        }
        missingOccurrences.push(occurrence);
      }
      if (missingOccurrences.length > 0) {
        await occurrenceRepository.saveMany(missingOccurrences);
        occurrencesCreated += missingOccurrences.length;
      }
    });

    return { plansCreated, plansSkipped, occurrencesCreated, occurrencesSkipped };
  }
}
