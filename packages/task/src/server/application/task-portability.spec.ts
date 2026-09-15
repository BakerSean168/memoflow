import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
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

/** Independent re-derivation of the deterministic checklist id seed. */
function expectedChecklistId(identityId: string, batchId: string, ref: PortableReferenceV3): string {
  return `portable-checklist-${stableUuidForTest(
    `portable:${identityId}:${batchId}:task-checklist:${ref}`,
  )}`;
}

/** Independent re-derivation of the deterministic plan id seed. */
function expectedPlanId(identityId: string, batchId: string, ref: PortableReferenceV3): string {
  return `ITaskPlanId_${stableUuidForTest(`portable:${identityId}:${batchId}:task-plan:${ref}`)}`;
}

function stableUuidForTest(seed: string): string {
  const hex = createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

const TASK_IDENTITY_ID = 'IdentityId_00000000-0000-4000-8000-000000000001';

/** Host TaskPlan DTO as it would exist after a prior apply of `portablePayload`. */
function currentPlan(overrides?: {
  labelIds?: string[];
  checklist?: Array<{ id: string; title: string; order: number }>;
  goalBinding?: { goalId: string; keyResultId: string | null; contribution: null } | null;
}) {
  return {
    toServerDTO: () => ({
      id: 'ITaskPlanId_target',
      identityId: 'IdentityId_target',
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
      goalBinding:
        overrides?.goalBinding === undefined
          ? { goalId: 'GoalId_target', keyResultId: null, contribution: null }
          : overrides.goalBinding,
      checklist: overrides?.checklist ?? [
        { id: 'portable-checklist-host', title: 'Proof', order: 0 },
      ],
      createdAt: 1,
      updatedAt: 2,
      deletedAt: null,
      version: 3,
    }),
    labels: (overrides?.labelIds ?? ['LabelId_target']).map((id) => ({ id })),
  };
}

/** Host TaskOccurrence DTO as it would exist after a prior apply of `portablePayload`. */
function currentOccurrence(overrides: {
  planId: string;
  checklistState: Array<{
    definitionId: string;
    titleSnapshot: string;
    orderSnapshot: number;
    completed: boolean;
    completedAt: number | null;
  }>;
}) {
  return {
    toServerDTO: () => ({
      id: 'ITaskOccurrenceId_target',
      planId: overrides.planId,
      identityId: 'IdentityId_target',
      occurrenceKey: `${overrides.planId}:2026-09-14`,
      scheduleSnapshot: { date: '2026-09-14', timing: { kind: 'AllDay' } },
      importanceSnapshot: 'Moderate',
      status: 'Pending',
      actualStartAt: null,
      result: null,
      checklistState: overrides.checklistState,
      createdAt: 1,
      updatedAt: 2,
      deletedAt: null,
      version: 1,
    }),
  };
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

  it('skips the Goal binding comparison when keyResultRef stays unbound during replay', async () => {
    const references = new FakeReferences();
    // Mixed resolution: the imported Goal is already bound while its Key Result is
    // still unbound, which is exactly how a replay sees a partially applied Goal
    // dependency set. The binding comparison must stay off rather than compare the
    // current host Key Result against the portable ref proxy.
    references.seedImport('goals:1', 'GoalId_target');
    references.seedImport('labels:1', 'LabelId_target');
    const payload = structuredClone(portablePayload());
    payload.plans[0]!.goalLink = {
      goalRef: ref('goals:1'),
      keyResultRef: ref('goals:2'),
      contribution: null,
    };
    const { capability } = makeCapability({
      planRepository: {
        findByIdForIdentity: vi.fn(async () => ({
          labels: [{ id: 'LabelId_target' }],
          toServerDTO: () => ({
            id: 'ITaskPlanId_target',
            identityId: 'IdentityId_target',
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
              goalId: 'GoalId_target',
              keyResultId: 'KeyResultId_target',
              contribution: null,
            },
            // Deterministic ids must match, otherwise replay reports an unrelated
            // checklist conflict and never exercises the Goal binding branch.
            checklist: [
              {
                id: expectedChecklistId(
                  TASK_IDENTITY_ID,
                  'batch-task-v3',
                  payload.plans[0]!.checklist[0]!.ref,
                ),
                title: 'Proof',
                order: 0,
              },
            ],
            createdAt: 1,
            updatedAt: 2,
            deletedAt: null,
            version: 3,
          }),
        })),
      } as never,
    });

    await expect(capability.dryRun(payload, makeContext(references))).resolves.toEqual({
      created: 1,
      updated: 0,
      skipped: 1,
      warnings: [],
    });
  });

  it('still reports a Goal binding conflict once every imported ref is resolved', async () => {
    const references = new FakeReferences();
    references.seedImport('goals:1', 'GoalId_target');
    references.seedImport('goals:2', 'KeyResultId_other');
    const payload = structuredClone(portablePayload());
    payload.plans[0]!.goalLink = {
      goalRef: ref('goals:1'),
      keyResultRef: ref('goals:2'),
      contribution: null,
    };
    const { capability } = makeCapability({
      planRepository: {
        findByIdForIdentity: vi.fn(async () => ({
          labels: [{ id: 'LabelId_target' }],
          toServerDTO: () => ({
            id: 'ITaskPlanId_target',
            identityId: 'IdentityId_target',
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
              goalId: 'GoalId_target',
              keyResultId: 'KeyResultId_target',
              contribution: null,
            },
            checklist: [{ id: 'check-target', title: 'Proof', order: 0 }],
            createdAt: 1,
            updatedAt: 2,
            deletedAt: null,
            version: 3,
          }),
        })),
      } as never,
    });

    await expect(capability.dryRun(payload, makeContext(references))).rejects.toThrow(
      /deterministic plan target conflicts/,
    );
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

  it('reports a label assignment conflict during replay', async () => {
    const references = new FakeReferences();
    // The incoming label ref is bound, so replay must compare resolved host ids
    // instead of ignoring the assignment and silently accepting drift.
    references.seedImport('labels:1', 'LabelId_target');
    references.seedImport('goals:1', 'GoalId_target');
    const payload = portablePayload();
    const { capability } = makeCapability({
      planRepository: { findByIdForIdentity: vi.fn(async () => currentPlan({ labelIds: ['LabelId_other'] })) },
    });

    await expect(capability.dryRun(payload, makeContext(references))).rejects.toThrow(
      /deterministic plan target conflicts/,
    );
  });

  it('skips the label comparison while label refs stay unbound during replay', async () => {
    const references = new FakeReferences();
    // Standalone task dry-run: the Labels capability has not bound its refs yet, so
    // the resolved-proxy comparison would report a false label conflict. Labels are
    // the only gate here (Goal link is null and checklist ids are deterministic).
    references.seedImport('goals:1', 'GoalId_target');
    const payload = structuredClone(portablePayload());
    payload.plans[0]!.goalLink = null;
    const definitionId = expectedChecklistId(
      TASK_IDENTITY_ID,
      'batch-task-v3',
      payload.plans[0]!.checklist[0]!.ref,
    );
    const { capability } = makeCapability({
      planRepository: {
        findByIdForIdentity: vi.fn(async () =>
          currentPlan({
            labelIds: ['LabelId_target'],
            checklist: [{ id: definitionId, title: 'Proof', order: 0 }],
            goalBinding: null,
          }),
        ),
      },
    });

    await expect(capability.dryRun(payload, makeContext(references))).resolves.toEqual({
      created: 1,
      updated: 0,
      skipped: 1,
      warnings: [],
    });
  });

  it('reports a checklist conflict during replay using deterministic checklist ids', async () => {
    const references = new FakeReferences();
    references.seedImport('labels:1', 'LabelId_target');
    references.seedImport('goals:1', 'GoalId_target');
    const payload = portablePayload();
    const definitionRef = payload.plans[0]!.checklist[0]!.ref;
    const wrongId = expectedChecklistId(TASK_IDENTITY_ID, 'batch-task-v3', ref('tasks:99'));
    const matchId = expectedChecklistId(TASK_IDENTITY_ID, 'batch-task-v3', definitionRef);
    expect(wrongId).not.toBe(matchId);

    const conflicting = makeCapability({
      planRepository: {
        findByIdForIdentity: vi.fn(async () =>
          currentPlan({
            checklist: [{ id: wrongId, title: 'Proof', order: 0 }],
          }),
        ),
      },
    });
    await expect(conflicting.capability.dryRun(payload, makeContext(references))).rejects.toThrow(
      /deterministic plan target conflicts/,
    );

    const matching = makeCapability({
      planRepository: {
        findByIdForIdentity: vi.fn(async () =>
          currentPlan({
            checklist: [{ id: matchId, title: 'Proof', order: 0 }],
          }),
        ),
      },
    });
    await expect(matching.capability.dryRun(payload, makeContext(references))).resolves.toEqual({
      created: 1,
      updated: 0,
      skipped: 1,
      warnings: [],
    });
  });

  it('reports an occurrence checklist-state conflict during replay', async () => {
    const references = new FakeReferences();
    references.seedImport('labels:1', 'LabelId_target');
    references.seedImport('goals:1', 'GoalId_target');
    const payload = portablePayload();
    const definitionId = expectedChecklistId(
      TASK_IDENTITY_ID,
      'batch-task-v3',
      payload.plans[0]!.checklist[0]!.ref,
    );
    const { capability } = makeCapability({
      planRepository: {
        findByIdForIdentity: vi.fn(async () =>
          currentPlan({ checklist: [{ id: definitionId, title: 'Proof', order: 0 }] }),
        ),
      },
      occurrenceRepository: {
        findByIdForIdentity: vi.fn(async () =>
          currentOccurrence({
            planId: expectedPlanId(TASK_IDENTITY_ID, 'batch-task-v3', payload.plans[0]!.ref),
            // Incoming state is incomplete; the persisted state is complete.
            checklistState: [
              {
                definitionId,
                titleSnapshot: 'Proof',
                orderSnapshot: 0,
                completed: true,
                completedAt: 123,
              },
            ],
          }),
        ),
      },
    });

    await expect(capability.dryRun(payload, makeContext(references))).rejects.toThrow(
      /deterministic occurrence target conflicts/,
    );
  });

  it('skips a deeply identical occurrence replay', async () => {
    const references = new FakeReferences();
    references.seedImport('labels:1', 'LabelId_target');
    references.seedImport('goals:1', 'GoalId_target');
    const payload = portablePayload();
    const definitionId = expectedChecklistId(
      TASK_IDENTITY_ID,
      'batch-task-v3',
      payload.plans[0]!.checklist[0]!.ref,
    );
    const planDto = currentPlan({ checklist: [{ id: definitionId, title: 'Proof', order: 0 }] });
    const { capability } = makeCapability({
      planRepository: { findByIdForIdentity: vi.fn(async () => planDto) },
      occurrenceRepository: {
        findByIdForIdentity: vi.fn(async () =>
          currentOccurrence({
            planId: expectedPlanId(TASK_IDENTITY_ID, 'batch-task-v3', payload.plans[0]!.ref),
            checklistState: [
              {
                definitionId,
                titleSnapshot: 'Proof',
                orderSnapshot: 0,
                completed: false,
                completedAt: null,
              },
            ],
          }),
        ),
      },
    });

    await expect(capability.dryRun(payload, makeContext(references))).resolves.toEqual({
      created: 0,
      updated: 0,
      skipped: 2,
      warnings: [],
    });
  });
});
