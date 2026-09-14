import { describe, expect, it, vi } from 'vitest';
import {
  PortableReferenceV3Schema,
  findBannedImportKey,
  type PortableCapabilityExecutionContext,
  type PortableReferencePort,
  type PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import { TaskPortablePayloadV3Schema } from '@memoflow/contracts/task';
import type { ITaskPlanRepository } from '../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../domain/repositories/i-task-occurrence-repository';
import type { TaskCanonicalRestoreService } from './services/task-canonical-restore.service';
import { TaskPortableCapability } from './task-portability';

function ref(value: string): PortableReferenceV3 {
  return PortableReferenceV3Schema.parse(value);
}

class FakeReferences implements PortableReferencePort {
  private readonly counters = new Map<string, number>();
  private readonly exports = new Map<string, PortableReferenceV3>();
  private readonly imports = new Map<PortableReferenceV3, string>();

  seedExport(key: string, source: string, value: string): void {
    this.exports.set(`${key}:${source}`, ref(value));
  }

  seedImport(value: string, target: string): void {
    this.imports.set(ref(value), target);
  }

  declareExportReference(capabilityKey: never, sourceKey: string): PortableReferenceV3 {
    const mapKey = `${capabilityKey}:${sourceKey}`;
    const existing = this.exports.get(mapKey);
    if (existing) return existing;
    const next = (this.counters.get(capabilityKey) ?? 0) + 1;
    this.counters.set(capabilityKey, next);
    const value = ref(`${capabilityKey}:${next}`);
    this.exports.set(mapKey, value);
    return value;
  }

  resolveExportReference(capabilityKey: never, sourceKey: string): PortableReferenceV3 {
    const value = this.exports.get(`${capabilityKey}:${sourceKey}`);
    if (!value) throw new Error(`missing export ref: ${capabilityKey}:${sourceKey}`);
    return value;
  }

  bindImportedReference(portableRef: PortableReferenceV3, targetKey: string): void {
    this.imports.set(portableRef, targetKey);
  }

  resolveImportedReference(portableRef: PortableReferenceV3): string {
    const value = this.imports.get(portableRef);
    if (!value) throw new Error(`missing import ref: ${portableRef}`);
    return value;
  }
}

function makeContext(references: FakeReferences, batchId = 'batch-task-v3') {
  return {
    identityId: 'IdentityId_00000000-0000-4000-8000-000000000001',
    batchId,
    references,
  } satisfies PortableCapabilityExecutionContext;
}

function makeCapability(options?: {
  planRepository?: Partial<ITaskPlanRepository>;
  occurrenceRepository?: Partial<ITaskOccurrenceRepository>;
  restore?: TaskCanonicalRestoreService['restore'];
}) {
  const planRepository = {
    findByIdentityId: vi.fn(async () => []),
    findByIdForIdentity: vi.fn(async () => null),
    ...options?.planRepository,
  } as unknown as ITaskPlanRepository;
  const occurrenceRepository = {
    findByIdentityId: vi.fn(async () => []),
    findByIdForIdentity: vi.fn(async () => null),
    ...options?.occurrenceRepository,
  } as unknown as ITaskOccurrenceRepository;
  const restore = vi.fn(
    options?.restore ??
      (async () => ({
        plansCreated: 1,
        plansSkipped: 0,
        occurrencesCreated: 1,
        occurrencesSkipped: 0,
      })),
  );
  const restoreService = { restore } as unknown as TaskCanonicalRestoreService;
  return {
    capability: new TaskPortableCapability(
      planRepository,
      occurrenceRepository,
      restoreService,
      () => 1_780_000_000_000,
    ),
    planRepository,
    occurrenceRepository,
    restore,
  };
}

function portablePayload() {
  return TaskPortablePayloadV3Schema.parse({
    plans: [
      {
        ref: 'tasks:1',
        title: 'Portable Task',
        description: null,
        schedule: { kind: 'OneTime', date: '2026-09-14', timing: { kind: 'AllDay' } },
        reminderConfig: null,
        importance: 'Moderate',
        status: 'Active',
        outcome: 'Open',
        completionPolicy: 'AllowCorrection',
        closedAt: null,
        archived: false,
        abandonedReason: null,
        goalLink: {
          goalRef: 'goals:1',
          keyResultRef: null,
          contribution: null,
        },
        labelRefs: ['labels:1'],
        checklist: [{ ref: 'tasks:2', title: 'Proof', order: 0 }],
      },
    ],
    occurrences: [
      {
        ref: 'tasks:3',
        planRef: 'tasks:1',
        scheduleSnapshot: { date: '2026-09-14', timing: { kind: 'AllDay' } },
        importanceSnapshot: 'Moderate',
        status: 'Pending',
        actualStartAt: null,
        result: null,
        checklistState: [
          {
            definitionRef: 'tasks:2',
            titleSnapshot: 'Proof',
            orderSnapshot: 0,
            completed: false,
            completedAt: null,
          },
        ],
      },
    ],
  });
}

describe('TaskPortableCapability', () => {
  it('exports only portable refs and user-owned Task facts', async () => {
    const references = new FakeReferences();
    references.seedExport('labels', 'LabelId_host', 'labels:1');
    references.seedExport('goals', 'GoalId_host', 'goals:1');
    references.seedExport('goals', 'KeyResultId_host', 'goals:2');

    const plan = {
      id: 'ITaskPlanId_host',
      labels: [{ id: 'LabelId_host' }],
      toServerDTO: () => ({
        id: 'ITaskPlanId_host',
        identityId: 'IdentityId_host',
        name: 'Portable Task',
        description: null,
        schedule: { kind: 'OneTime', date: '2026-09-14', timing: { kind: 'AllDay' } },
        reminderConfig: null,
        importance: 'Moderate',
        status: 'Active',
        outcome: 'Open',
        completionPolicy: 'AllowCorrection',
        closedAt: null,
        archivedAt: null,
        abandonedReason: null,
        goalBinding: {
          goalId: 'GoalId_host',
          keyResultId: 'KeyResultId_host',
          contribution: { value: 1, trigger: 'EachCompletion' },
        },
        checklist: [{ id: 'check-host', title: 'Proof', order: 0 }],
        createdAt: 1,
        updatedAt: 2,
        deletedAt: null,
        version: 7,
      }),
    };
    const occurrence = {
      id: 'ITaskOccurrenceId_host',
      toServerDTO: () => ({
        id: 'ITaskOccurrenceId_host',
        planId: 'ITaskPlanId_host',
        identityId: 'IdentityId_host',
        occurrenceKey: 'host-key',
        scheduleSnapshot: { date: '2026-09-14', timing: { kind: 'AllDay' } },
        importanceSnapshot: 'Moderate',
        status: 'Completed',
        actualStartAt: 100,
        result: {
          kind: 'Completed',
          recordedAt: 200,
          actualDurationMinutes: 10,
          note: null,
          rating: null,
        },
        checklistState: [
          {
            definitionId: 'check-host',
            titleSnapshot: 'Proof',
            orderSnapshot: 0,
            completed: true,
            completedAt: 200,
          },
        ],
        createdAt: 1,
        updatedAt: 2,
        deletedAt: null,
        version: 4,
      }),
    };
    const { capability } = makeCapability({
      planRepository: { findByIdentityId: vi.fn(async () => [plan as never]) },
      occurrenceRepository: { findByIdentityId: vi.fn(async () => [occurrence as never]) },
    });

    const payload = await capability.export(makeContext(references));

    expect(payload.plans[0]).toMatchObject({
      title: 'Portable Task',
      goalLink: { goalRef: 'goals:1', keyResultRef: 'goals:2' },
      labelRefs: ['labels:1'],
    });
    expect(payload.occurrences[0]).toMatchObject({ status: 'Completed' });
    expect(findBannedImportKey(payload)).toBeNull();
    expect(JSON.stringify(payload)).not.toContain('IdentityId_host');
    expect(JSON.stringify(payload)).not.toContain('ITaskPlanId_host');
    expect(JSON.stringify(payload)).not.toContain('check-host');
  });

  it('accepts Goal-only links but rejects contribution without a KR', () => {
    const payload = portablePayload();
    expect(TaskPortablePayloadV3Schema.safeParse(payload).success).toBe(true);

    const invalid = structuredClone(payload);
    invalid.plans[0]!.goalLink!.contribution = { value: 1, trigger: 'EachCompletion' };
    expect(TaskPortablePayloadV3Schema.safeParse(invalid).success).toBe(false);
  });

  it('dry-runs deterministic plan and occurrence targets without resolving dependency refs', async () => {
    const references = new FakeReferences();
    const { capability } = makeCapability();

    await expect(capability.dryRun(portablePayload(), makeContext(references))).resolves.toEqual({
      created: 2,
      updated: 0,
      skipped: 0,
      warnings: [],
    });
  });

  it('applies through the Task-owned restore seam and binds deterministic refs', async () => {
    const references = new FakeReferences();
    references.seedImport('labels:1', 'LabelId_target');
    references.seedImport('goals:1', 'GoalId_target');
    const { capability, restore } = makeCapability();
    const context = makeContext(references);

    await expect(capability.apply(portablePayload(), context)).resolves.toEqual({
      created: 2,
      updated: 0,
      skipped: 0,
      warnings: [],
    });

    const bundle = restore.mock.calls[0]![0];
    expect(bundle.plans[0]).toMatchObject({
      title: 'Portable Task',
      goalBinding: { goalId: 'GoalId_target', keyResultId: null },
      labelIds: ['LabelId_target'],
      checklist: [{ title: 'Proof', order: 0 }],
    });
    expect(bundle.plans[0].id).toMatch(/^ITaskPlanId_/);
    expect(bundle.occurrences[0].id).toMatch(/^ITaskOccurrenceId_/);
    expect(bundle.occurrences[0].planId).toBe(bundle.plans[0].id);
    expect(bundle.occurrences[0].checklistState[0].definitionId).toBe(
      bundle.plans[0].checklist[0].id,
    );
    expect(references.resolveImportedReference(ref('tasks:1'))).toBe(bundle.plans[0].id);
    expect(references.resolveImportedReference(ref('tasks:3'))).toBe(bundle.occurrences[0].id);
  });

  it('derives the same host identities for the same batch during replay', async () => {
    const firstRefs = new FakeReferences();
    firstRefs.seedImport('labels:1', 'LabelId_target');
    firstRefs.seedImport('goals:1', 'GoalId_target');
    const first = makeCapability();
    await first.capability.apply(portablePayload(), makeContext(firstRefs, 'same-batch'));

    const secondRefs = new FakeReferences();
    secondRefs.seedImport('labels:1', 'LabelId_target');
    secondRefs.seedImport('goals:1', 'GoalId_target');
    const second = makeCapability();
    await second.capability.apply(portablePayload(), makeContext(secondRefs, 'same-batch'));

    expect(second.restore.mock.calls[0]![0].plans[0].id).toBe(
      first.restore.mock.calls[0]![0].plans[0].id,
    );
    expect(second.restore.mock.calls[0]![0].occurrences[0].id).toBe(
      first.restore.mock.calls[0]![0].occurrences[0].id,
    );
  });
});
