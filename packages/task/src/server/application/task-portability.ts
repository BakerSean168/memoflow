import { createHash } from 'node:crypto';
import type {
  PortableCapability,
  PortableCapabilityExecutionContext,
  PortableCapabilityReceipt,
  PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import { TaskPortablePayloadV3Schema, type TaskPortablePayloadV3 } from '@memoflow/contracts/task';
import type { ITaskPlanRepository } from '../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../domain/repositories/i-task-occurrence-repository';
import type { TaskCanonicalRestoreService } from './services/task-canonical-restore.service';

function stableUuid(seed: string): string {
  const hex = createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  const variant = Number.parseInt(hex[16]!, 16);
  hex[16] = ((variant & 0x3) | 0x8).toString(16);
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function requireBatchId(context: PortableCapabilityExecutionContext): string {
  if (!context.batchId) throw new Error('tasks@3 requires a portability batch id');
  return context.batchId;
}

function requireImportedReference(
  context: PortableCapabilityExecutionContext,
  portableRef: PortableReferenceV3,
  capability: string,
): string {
  try {
    return context.references.resolveImportedReference(portableRef);
  } catch {
    throw new Error(`tasks@3 ${capability} reference is not bound: ${portableRef}`);
  }
}

/**
 * Deterministic dry-run planning must not depend on whether imported dependency
 * refs are already bound: dependency capabilities bind their refs during their own
 * apply, so a standalone dry-run cannot require them. Resolve when the ref is bound
 * to keep dry-run/replay parity with apply, and otherwise fall back to the stable
 * portable ref itself so conflict comparison stays deterministic.
 */
function resolveDryRunReference(
  context: PortableCapabilityExecutionContext,
  portableRef: PortableReferenceV3,
): string {
  if (isImportedReferenceResolved(context, portableRef)) {
    return context.references.resolveImportedReference(portableRef);
  }
  return portableRef;
}

/**
 * True only when the reference seam can confirm the imported ref is bound.
 * `hasImportedReference` is optional, so a seam without it is treated as unbound
 * until resolution proves otherwise; dry-run never assumes a dependency is bound.
 */
function isImportedReferenceResolved(
  context: PortableCapabilityExecutionContext,
  portableRef: PortableReferenceV3,
): boolean {
  if (typeof context.references.hasImportedReference === 'function') {
    return context.references.hasImportedReference(portableRef);
  }
  try {
    context.references.resolveImportedReference(portableRef);
    return true;
  } catch {
    return false;
  }
}

function deterministicPlanId(
  identityId: string,
  batchId: string,
  ref: PortableReferenceV3,
): string {
  return `ITaskPlanId_${stableUuid(`portable:${identityId}:${batchId}:task-plan:${ref}`)}`;
}

function deterministicOccurrenceId(
  identityId: string,
  batchId: string,
  ref: PortableReferenceV3,
): string {
  return `ITaskOccurrenceId_${stableUuid(`portable:${identityId}:${batchId}:task-occurrence:${ref}`)}`;
}

function deterministicChecklistId(
  identityId: string,
  batchId: string,
  ref: PortableReferenceV3,
): string {
  return `portable-checklist-${stableUuid(`portable:${identityId}:${batchId}:task-checklist:${ref}`)}`;
}

function checklistSourceKey(planId: string, definitionId: string): string {
  return `checklist:${planId}:${definitionId}`;
}

function throwIfPlanConflict(
  current: import('../domain/aggregates/task-plan').TaskPlan,
  incoming: TaskPortablePayloadV3['plans'][number],
  context: PortableCapabilityExecutionContext,
  batchId: string,
): void {
  const dto = current.toServerDTO();
  if (dto.deletedAt !== null) {
    throw new Error(`tasks@3 cannot restore over deleted plan: ${String(current.id)}`);
  }
  // Dependency refs may be unbound during a standalone dry-run; only compare the
  // Goal binding when the imported refs are actually resolvable, otherwise the
  // comparison would use ref proxies and report a false conflict on replay.
  const goalBinding = incoming.goalLink
    ? {
        goalId: resolveDryRunReference(context, incoming.goalLink.goalRef),
        keyResultId: incoming.goalLink.keyResultRef
          ? resolveDryRunReference(context, incoming.goalLink.keyResultRef)
          : null,
        contribution: incoming.goalLink.contribution,
      }
    : null;
  const goalRefsResolved =
    incoming.goalLink === null ||
    isImportedReferenceResolved(context, incoming.goalLink.goalRef);
  const same =
    dto.name === incoming.title.trim() &&
    dto.description === incoming.description &&
    JSON.stringify(dto.schedule) === JSON.stringify(incoming.schedule) &&
    JSON.stringify(dto.reminderConfig) === JSON.stringify(incoming.reminderConfig) &&
    dto.importance === incoming.importance &&
    dto.status === incoming.status &&
    dto.outcome === incoming.outcome &&
    dto.completionPolicy === incoming.completionPolicy &&
    dto.closedAt === incoming.closedAt &&
    (dto.archivedAt !== null) === incoming.archived &&
    dto.abandonedReason === incoming.abandonedReason &&
    (!goalRefsResolved || JSON.stringify(dto.goalBinding) === JSON.stringify(goalBinding)) &&
    dto.checklist.length === incoming.checklist.length &&
    incoming.checklist.every((item) =>
      dto.checklist.some(
        (definition) => definition.title === item.title && definition.order === item.order,
      ),
    );
  if (!same) {
    throw new Error(
      `tasks@3 deterministic plan target conflicts with imported state: ${batchId}:${incoming.ref}`,
    );
  }
}

function throwIfOccurrenceConflict(
  current: import('../domain/aggregates/task-occurrence').TaskOccurrence,
  incoming: TaskPortablePayloadV3['occurrences'][number],
  planId: string,
): void {
  const dto = current.toServerDTO();
  if (dto.deletedAt !== null) {
    throw new Error(`tasks@3 cannot restore over deleted occurrence: ${String(current.id)}`);
  }
  if (
    dto.planId !== planId ||
    JSON.stringify(dto.scheduleSnapshot) !== JSON.stringify(incoming.scheduleSnapshot) ||
    dto.importanceSnapshot !== incoming.importanceSnapshot ||
    dto.status !== incoming.status ||
    dto.actualStartAt !== incoming.actualStartAt ||
    JSON.stringify(dto.result) !== JSON.stringify(incoming.result)
  ) {
    throw new Error(`tasks@3 deterministic occurrence target conflicts with imported state: ${String(current.id)}`);
  }
}

/** Task-owned V3 capability. Persistence ids never enter the portable payload. */
export class TaskPortableCapability implements PortableCapability<TaskPortablePayloadV3> {
  readonly key = 'tasks' as const;
  readonly schemaVersion = 3;
  readonly dependsOn = ['labels', 'goals'] as const;
  readonly payloadSchema = TaskPortablePayloadV3Schema;

  constructor(
    private readonly planRepository: ITaskPlanRepository,
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    private readonly restoreService: TaskCanonicalRestoreService,
    private readonly now: () => number = Date.now,
  ) {}

  async export(context: PortableCapabilityExecutionContext): Promise<TaskPortablePayloadV3> {
    const plans = await this.planRepository.findByIdentityId(context.identityId);
    const portablePlans: TaskPortablePayloadV3['plans'] = [];

    for (const plan of plans) {
      const dto = plan.toServerDTO();
      const ref = context.references.declareExportReference(this.key, String(plan.id));
      portablePlans.push({
        ref,
        title: dto.name,
        description: dto.description,
        schedule: dto.schedule,
        reminderConfig: dto.reminderConfig,
        importance: dto.importance,
        status: dto.status,
        outcome: dto.outcome,
        completionPolicy: dto.completionPolicy,
        closedAt: dto.closedAt,
        archived: dto.archivedAt !== null,
        abandonedReason: dto.abandonedReason,
        goalLink:
          dto.goalBinding === null
            ? null
            : {
                goalRef: context.references.resolveExportReference(
                  'goals',
                  String(dto.goalBinding.goalId),
                ),
                keyResultRef:
                  dto.goalBinding.keyResultId === null
                    ? null
                    : context.references.resolveExportReference(
                        'goals',
                        String(dto.goalBinding.keyResultId),
                      ),
                contribution: dto.goalBinding.contribution,
              },
        labelRefs: plan.labels.map((label) =>
          context.references.resolveExportReference('labels', label.id),
        ),
        checklist: dto.checklist.map((definition) => ({
          ref: context.references.declareExportReference(
            this.key,
            checklistSourceKey(String(plan.id), definition.id),
          ),
          title: definition.title,
          order: definition.order,
        })),
      });
    }

    const occurrences = await this.occurrenceRepository.findByIdentityId(context.identityId);
    const portableOccurrences: TaskPortablePayloadV3['occurrences'] = occurrences.map(
      (occurrence) => {
        const dto = occurrence.toServerDTO();
        return {
          ref: context.references.declareExportReference(this.key, String(occurrence.id)),
          planRef: context.references.resolveExportReference(this.key, String(dto.planId)),
          scheduleSnapshot: dto.scheduleSnapshot,
          importanceSnapshot: dto.importanceSnapshot,
          status: dto.status,
          actualStartAt: dto.actualStartAt,
          result: dto.result,
          checklistState: dto.checklistState.map((item) => ({
            definitionRef: context.references.resolveExportReference(
              this.key,
              checklistSourceKey(String(dto.planId), item.definitionId),
            ),
            titleSnapshot: item.titleSnapshot,
            orderSnapshot: item.orderSnapshot,
            completed: item.completed,
            completedAt: item.completedAt,
          })),
        };
      },
    );

    return TaskPortablePayloadV3Schema.parse({
      plans: portablePlans,
      occurrences: portableOccurrences,
    });
  }

  async validateImport(
    payload: TaskPortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<void> {
    await this.dryRun(payload, context);
  }

  async dryRun(
    payload: TaskPortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const target = TaskPortablePayloadV3Schema.parse(payload);
    const batchId = requireBatchId(context);
    const planIdsByRef = new Map<PortableReferenceV3, string>();
    const checklistRefs = new Set<PortableReferenceV3>();
    let created = 0;
    let skipped = 0;

    for (const plan of target.plans) {
      const id = deterministicPlanId(context.identityId, batchId, plan.ref);
      planIdsByRef.set(plan.ref, id);
      for (const definition of plan.checklist) {
        if (!checklistRefs.add(definition.ref)) {
          throw new Error(`tasks@3 duplicate checklist reference: ${definition.ref}`);
        }
      }
      const current = await this.planRepository.findByIdForIdentity(context.identityId, id);
      if (current) {
        throwIfPlanConflict(current, plan, context, batchId);
        skipped += 1;
      } else {
        created += 1;
      }
    }
    for (const occurrence of target.occurrences) {
      const id = deterministicOccurrenceId(context.identityId, batchId, occurrence.ref);
      const planId = planIdsByRef.get(occurrence.planRef);
      if (!planId) throw new Error(`tasks@3 occurrence references an unknown plan: ${occurrence.planRef}`);
      const current = await this.occurrenceRepository.findByIdForIdentity(context.identityId, id);
      if (current) {
        throwIfOccurrenceConflict(current, occurrence, planId);
        skipped += 1;
      } else {
        created += 1;
      }
    }

    return { created, updated: 0, skipped, warnings: [] };
  }

  async apply(
    payload: TaskPortablePayloadV3,
    context: PortableCapabilityExecutionContext,
  ): Promise<PortableCapabilityReceipt> {
    const target = TaskPortablePayloadV3Schema.parse(payload);
    const batchId = requireBatchId(context);
    const restoredAt = this.now();
    const planIdsByRef = new Map<PortableReferenceV3, string>();
    const checklistIdsByRef = new Map<PortableReferenceV3, string>();

    for (const plan of target.plans) {
      planIdsByRef.set(plan.ref, deterministicPlanId(context.identityId, batchId, plan.ref));
      for (const definition of plan.checklist) {
        checklistIdsByRef.set(
          definition.ref,
          deterministicChecklistId(context.identityId, batchId, definition.ref),
        );
      }
    }

    const receipt = await this.restoreService.restore({
      identityId: context.identityId,
      plans: target.plans.map((plan) => ({
        id: planIdsByRef.get(plan.ref)!,
        title: plan.title,
        description: plan.description,
        schedule: plan.schedule,
        reminderConfig: plan.reminderConfig,
        importance: plan.importance,
        status: plan.status,
        outcome: plan.outcome,
        completionPolicy: plan.completionPolicy,
        closedAt: plan.closedAt,
        archivedAt: plan.archived ? restoredAt : null,
        abandonedReason: plan.abandonedReason,
        goalBinding:
          plan.goalLink === null
            ? null
            : {
                goalId: requireImportedReference(context, plan.goalLink.goalRef, 'goal'),
                keyResultId:
                  plan.goalLink.keyResultRef === null
                    ? null
                    : requireImportedReference(context, plan.goalLink.keyResultRef, 'key result'),
                contribution: plan.goalLink.contribution,
              },
        checklist: plan.checklist.map((definition) => ({
          id: checklistIdsByRef.get(definition.ref)!,
          title: definition.title,
          order: definition.order,
        })),
        labelIds: plan.labelRefs.map((ref) => requireImportedReference(context, ref, 'label')),
        createdAt: restoredAt,
        updatedAt: restoredAt,
      })),
      occurrences: target.occurrences.map((occurrence) => ({
        id: deterministicOccurrenceId(context.identityId, batchId, occurrence.ref),
        planId: planIdsByRef.get(occurrence.planRef)!,
        scheduleSnapshot: occurrence.scheduleSnapshot,
        importanceSnapshot: occurrence.importanceSnapshot,
        status: occurrence.status,
        actualStartAt: occurrence.actualStartAt as never,
        result: occurrence.result,
        checklistState: occurrence.checklistState.map((item) => ({
          definitionId: checklistIdsByRef.get(item.definitionRef)!,
          titleSnapshot: item.titleSnapshot,
          orderSnapshot: item.orderSnapshot,
          completed: item.completed,
          completedAt: item.completedAt,
        })),
        createdAt: restoredAt,
        updatedAt: restoredAt,
      })),
    });

    for (const plan of target.plans) {
      context.references.bindImportedReference(plan.ref, planIdsByRef.get(plan.ref)!);
      for (const definition of plan.checklist) {
        context.references.bindImportedReference(
          definition.ref,
          checklistIdsByRef.get(definition.ref)!,
        );
      }
    }
    for (const occurrence of target.occurrences) {
      context.references.bindImportedReference(
        occurrence.ref,
        deterministicOccurrenceId(context.identityId, batchId, occurrence.ref),
      );
    }

    return {
      created: receipt.plansCreated + receipt.occurrencesCreated,
      updated: 0,
      skipped: receipt.plansSkipped + receipt.occurrencesSkipped,
      warnings: [],
    };
  }
}

export function createTaskPortableCapability(
  planRepository: ITaskPlanRepository,
  occurrenceRepository: ITaskOccurrenceRepository,
  restoreService: TaskCanonicalRestoreService,
): TaskPortableCapability {
  return new TaskPortableCapability(planRepository, occurrenceRepository, restoreService);
}
