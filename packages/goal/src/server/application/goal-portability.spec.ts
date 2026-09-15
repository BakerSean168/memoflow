import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type {
  PortableCapabilityExecutionContext,
  PortableReferencePort,
  PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import { GoalStatus, KeyResultCalculationMethod } from '@memoflow/contracts/goal';
import { error, ok } from '@memoflow/contracts/result';
import type { GoalApplicationPort } from './goal.application.port';
import type {
  GoalPortabilityApplicationPort,
  GoalPortabilityCreateInput,
  GoalPortabilitySnapshot,
} from './goal-portability.application.port';
import { GoalPortableCapability } from './goal-portability';

/** Independent re-derivation of the deterministic portability id seed. */
function stableUuidForTest(seed: string): string {
  const hex = createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function deterministicGoalId(identityId: string, batchId: string, ref: string): string {
  return `IGoalId_${stableUuidForTest(`portable:${identityId}:${batchId}:goal:${ref}`)}`;
}

function deterministicKeyResultId(identityId: string, batchId: string, ref: string): string {
  return `IKeyResultId_${stableUuidForTest(`portable:${identityId}:${batchId}:key-result:${ref}`)}`;
}

function referenceContext() {
  let seq = 0;
  const exports = new Map<string, PortableReferenceV3>();
  const imports = new Map<PortableReferenceV3, string>([
    ['labels:1' as PortableReferenceV3, 'label-host-1'],
  ]);
  const references: PortableReferencePort = {
    declareExportReference(capability, sourceKey) {
      const ref = `${capability}:${++seq}` as PortableReferenceV3;
      exports.set(`${capability}:${sourceKey}`, ref);
      return ref;
    },
    resolveExportReference(capability, sourceKey) {
      if (capability === 'labels' && sourceKey === 'label-host-1')
        return 'labels:1' as PortableReferenceV3;
      const ref = exports.get(`${capability}:${sourceKey}`);
      if (!ref) throw new Error(`missing export reference ${capability}:${sourceKey}`);
      return ref;
    },
    bindImportedReference(ref, targetKey) {
      imports.set(ref, targetKey);
    },
    resolveImportedReference(ref) {
      const value = imports.get(ref);
      if (!value) throw new Error(`missing imported reference ${ref}`);
      return value;
    },
  };
  return {
    context: {
      identityId: 'identity-1',
      batchId: 'batch-1',
      references,
    } satisfies PortableCapabilityExecutionContext,
    imports,
  };
}

function portableGoalPayload(status: GoalStatus = GoalStatus.Planned) {
  return {
    goals: [
      {
        ref: 'goals:1' as PortableReferenceV3,
        name: 'Ship vNext',
        summary: null,
        status,
        startDate: null,
        target: null,
        reminderConfig: null,
        archived: false,
        labelRefs: ['labels:1' as PortableReferenceV3],
        keyResults: [
          {
            ref: 'goals:2' as PortableReferenceV3,
            title: 'Finish cutover',
            description: null,
            calculationMethod: KeyResultCalculationMethod.Sum,
            initialValue: 0,
            currentValue: 50,
            trackingBaseValue: 40,
            targetValue: 100,
            target: null,
            unit: '%',
            weight: 3,
          },
        ],
      },
    ],
  };
}

function readModelFromCreateInput(
  createInput: Parameters<GoalApplicationPort['createGoal']>[0],
  overrides: Record<string, unknown> = {},
) {
  const keyResult = createInput.initialKeyResults[0];
  return {
    ...receipt().readModel,
    id: createInput.id,
    name: createInput.name,
    summary: createInput.summary ?? null,
    startDate: createInput.startDate ?? null,
    target: createInput.target ?? null,
    reminderConfig: createInput.reminderConfig ?? null,
    labels: createInput.labelIds.map((id) => ({ id })),
    keyResults: [
      {
        id: keyResult.id,
        title: keyResult.title,
        description: keyResult.description,
        progress: {
          initialValue: keyResult.initialValue,
          currentValue: keyResult.currentValue,
          trackingBaseValue: keyResult.trackingBaseValue ?? keyResult.currentValue,
          targetValue: keyResult.targetValue,
          aggregationMethod: keyResult.calculationMethod,
          unit: keyResult.unit,
        },
        target: keyResult.target,
        progressPercentage: 50,
        isCompleted: false,
        weight: keyResult.weight,
        order: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    totalKeyResults: 1,
    ...overrides,
  };
}

type ReplayReadModel = ReturnType<typeof readModelFromCreateInput>;

function portabilityFromApi(api: GoalApplicationPort): GoalPortabilityApplicationPort {
  const snapshots = new Map<string, GoalPortabilitySnapshot>();
  const toSnapshot = (model: ReplayReadModel): GoalPortabilitySnapshot => ({
    id: model.id as never,
    identityId: model.identityId as never,
    name: model.name,
    summary: model.summary,
    status: model.status,
    startDate: model.startDate,
    target: model.target,
    archivedAt: model.archivedAt,
    deletedAt: model.deletedAt ?? null,
    sortOrder: model.sortOrder ?? 0,
    createdAt: model.createdAt ?? 1,
    reminderConfig: model.reminderConfig,
    labels: model.labels,
    keyResults: model.keyResults.map((keyResult) => ({
      id: keyResult.id as never,
      title: keyResult.title,
      description: keyResult.description,
      progress: keyResult.progress as never,
      target: keyResult.target,
      weight: keyResult.weight,
      sortOrder: keyResult.order,
      createdAt: keyResult.createdAt,
      updatedAt: keyResult.updatedAt,
    })),
  });
  return {
    async listGoalSnapshots(identityId) {
      const result = await api.listGoals({
        identityId: identityId as never,
        systemView: 'all' as never,
        page: 1,
        pageSize: 100,
        includeKeyResults: true,
        includeReviews: false,
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.data.data.map((model) => toSnapshot(model as unknown as ReplayReadModel));
    },
    async getGoalSnapshot(id, identityId) {
      const existing = snapshots.get(id);
      if (existing) return existing;
      const result = await api.getGoal(id, identityId, true);
      if (!result.ok) return null;
      const snapshot = toSnapshot(result.data as unknown as ReplayReadModel);
      snapshots.set(id, snapshot);
      return snapshot;
    },
    async createGoalForPortability(input: GoalPortabilityCreateInput, cx) {
      const result = await api.createGoal(input, cx);
      if (result.ok) {
        snapshots.set(input.id as string, toSnapshot(readModelFromCreateInput(input)));
      }
      return result;
    },
  };
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    goalId: 'IGoalId_11111111-1111-5111-8111-111111111111',
    goalVersion: 1,
    affectedEntityIds: { goalIds: [], keyResultIds: [], recordIds: [], reviewIds: [] },
    readModel: {
      id: 'IGoalId_11111111-1111-5111-8111-111111111111',
      identityId: 'identity-1',
      name: 'Ship vNext',
      summary: null,
      status: GoalStatus.Planned,
      startDate: null,
      target: null,
      completedAt: null,
      archivedAt: null,
      sortOrder: 0,
      reminderConfig: null,
      labels: [],
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      version: 1,
      keyResults: [],
      reviews: [],
      totalKeyResults: 0,
      completedKeyResults: 0,
      overallProgress: 0,
    },
    ...overrides,
  } as never;
}

describe('GoalPortableCapability', () => {
  it('exports owner facts and portable label/KR references without host identity or ids', async () => {
    const api = {
      listGoals: vi.fn().mockResolvedValue(
        ok({
          data: [
            {
              id: 'goal-host-1',
              identityId: 'identity-1',
              name: 'Ship vNext',
              summary: 'Converge the model',
              status: GoalStatus.InProgress,
              startDate: null,
              target: null,
              completedAt: null,
              archivedAt: null,
              sortOrder: 0,
              reminderConfig: null,
              labels: [{ id: 'label-host-1' }],
              createdAt: 1,
              updatedAt: 2,
              deletedAt: null,
              version: 7,
              keyResults: [
                {
                  id: 'kr-host-1',
                  title: 'Finish cutover',
                  description: null,
                  progress: {
                    initialValue: 0,
                    currentValue: 50,
                    trackingBaseValue: 40,
                    targetValue: 100,
                    aggregationMethod: KeyResultCalculationMethod.Sum,
                    unit: '%',
                  },
                  target: null,
                  progressPercentage: 50,
                  isCompleted: false,
                  weight: 3,
                  order: 0,
                  createdAt: 1,
                  updatedAt: 2,
                },
              ],
              reviews: null,
              totalKeyResults: 1,
              completedKeyResults: 0,
              overallProgress: 50,
            },
          ],
          pagination: { page: 1, pageSize: 100, total: 1, hasMore: false, totalPages: 1 },
        }),
      ),
    } as unknown as GoalApplicationPort;
    const { context } = referenceContext();

    const payload = await new GoalPortableCapability(api, portabilityFromApi(api)).export(context);

    expect(payload.goals[0]).toMatchObject({
      ref: 'goals:1',
      name: 'Ship vNext',
      labelRefs: ['labels:1'],
      keyResults: [{ ref: 'goals:2', title: 'Finish cutover', currentValue: 50 }],
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('identity-1');
    expect(serialized).not.toContain('goal-host-1');
    expect(serialized).not.toContain('kr-host-1');
    expect(serialized).not.toContain('version');
  });

  it('dry-run resolves label references already bound by labels portability', async () => {
    const api = { getGoal: vi.fn().mockResolvedValue(error('NOT_FOUND', 'missing')) } as unknown as GoalApplicationPort;
    const { context } = referenceContext();
    const capability = new GoalPortableCapability(api, portabilityFromApi(api));

    context.references.bindImportedReference('labels:1', 'portable-label:labels:1');
    await expect(capability.dryRun(portableGoalPayload(), context)).resolves.toMatchObject({
      created: 1,
      skipped: 0,
    });
  });

  it('dry-run binds deterministic Goal and Key Result refs without mutating persistence', async () => {
    const getGoal = vi.fn().mockResolvedValue(error('NOT_FOUND', 'missing'));
    const createGoal = vi.fn();
    const api = { getGoal, createGoal } as unknown as GoalApplicationPort;
    const { context, imports } = referenceContext();

    const result = await new GoalPortableCapability(api, portabilityFromApi(api)).dryRun(
      portableGoalPayload(),
      context,
    );

    expect(result).toMatchObject({ created: 1, updated: 0, skipped: 0 });
    // Predictions only: no mutation-capable Goal application call happens.
    expect(createGoal).not.toHaveBeenCalled();
    expect(api.activateGoal).toBeUndefined();
    const goalId = deterministicGoalId(context.identityId, context.batchId!, 'goals:1');
    const keyResultId = deterministicKeyResultId(context.identityId, context.batchId!, 'goals:2');
    expect(goalId).toMatch(/^IGoalId_[0-9a-f-]{36}$/);
    expect(keyResultId).toMatch(/^IKeyResultId_[0-9a-f-]{36}$/);
    expect(imports.get('goals:1')).toBe(goalId);
    expect(imports.get('goals:2')).toBe(keyResultId);
    expect(getGoal).toHaveBeenCalledWith(goalId, 'identity-1', true);
  });

  it('dry-run re-binds the same deterministic predictions when the Goal already exists', async () => {
    const existing = readModelFromCreateInput(
      {
        id: deterministicGoalId('identity-1', 'batch-1', 'goals:1') as never,
        name: 'Ship vNext',
        summary: null,
        startDate: null,
        target: null,
        reminderConfig: null,
        labelIds: ['label-host-1'],
        initialKeyResults: [
          {
            id: deterministicKeyResultId('identity-1', 'batch-1', 'goals:2') as never,
            title: 'Finish cutover',
            description: null,
            calculationMethod: KeyResultCalculationMethod.Sum,
            initialValue: 0,
            currentValue: 50,
            trackingBaseValue: 40,
            targetValue: 100,
            target: null,
            unit: '%',
            weight: 3,
          },
        ],
      } as never,
      { status: GoalStatus.Planned },
    );
    const api = {
      getGoal: vi.fn().mockResolvedValue(ok(existing)),
      createGoal: vi.fn(),
    } as unknown as GoalApplicationPort;
    const { context, imports } = referenceContext();
    const capability = new GoalPortableCapability(api, portabilityFromApi(api));

    await expect(capability.dryRun(portableGoalPayload(), context)).resolves.toMatchObject({
      created: 0,
      updated: 0,
      skipped: 1,
    });
    // A replay prediction must not conflict with itself across operations.
    await expect(capability.dryRun(portableGoalPayload(), context)).resolves.toMatchObject({
      created: 0,
      updated: 0,
      skipped: 1,
    });

    expect(api.createGoal).not.toHaveBeenCalled();
    expect(imports.get('goals:1')).toBe(deterministicGoalId('identity-1', 'batch-1', 'goals:1'));
    expect(imports.get('goals:2')).toBe(
      deterministicKeyResultId('identity-1', 'batch-1', 'goals:2'),
    );
  });

  it('dry-run keeps predicted Goal and Key Result bindings operation-local', async () => {
    const api = { getGoal: vi.fn().mockResolvedValue(error('NOT_FOUND', 'missing')) } as unknown as GoalApplicationPort;
    const capability = new GoalPortableCapability(api, portabilityFromApi(api));

    const first = referenceContext();
    await capability.dryRun(portableGoalPayload(), first.context);
    expect(first.imports.has('goals:1')).toBe(true);

    // A separate operation with a fresh registry must not observe the prediction.
    const second = referenceContext();
    expect(second.imports.has('goals:1')).toBe(false);
    await expect(capability.dryRun(portableGoalPayload(), second.context)).resolves.toMatchObject({
      created: 1,
    });
    expect(second.imports.has('goals:2')).toBe(true);
    expect(first.imports.get('goals:1')).toBe(second.imports.get('goals:1'));
  });

  it('dry-run detects same-batch replay through deterministic host ids', async () => {
    const getGoal = vi
      .fn()
      .mockResolvedValueOnce(error('NOT_FOUND', 'missing'))
      .mockResolvedValueOnce(ok(receipt().readModel));
    const api = { getGoal } as unknown as GoalApplicationPort;
    const capability = new GoalPortableCapability(api, portabilityFromApi(api));
    const { context } = referenceContext();
    const payload = {
      goals: [
        {
          ref: 'goals:1' as PortableReferenceV3,
          name: 'Ship vNext',
          summary: null,
          status: GoalStatus.Planned,
          startDate: null,
          target: null,
          reminderConfig: null,
          archived: false,
          labelRefs: [],
          keyResults: [],
        },
      ],
    };

    expect(await capability.dryRun(payload, context)).toMatchObject({ created: 1, skipped: 0 });
    expect(await capability.dryRun(payload, context)).toMatchObject({ created: 0, skipped: 1 });
    expect(getGoal.mock.calls[0]![0]).toBe(getGoal.mock.calls[1]![0]);
    expect(getGoal.mock.calls[0]![0]).toMatch(/^IGoalId_[0-9a-f-]{36}$/);
  });

  it('applies through the Goal application port, resolves labels and restores lifecycle', async () => {
    const created = receipt();
    const active = receipt({
      goalVersion: 2,
      readModel: { ...created.readModel, status: GoalStatus.InProgress, version: 2 },
    });
    const api = {
      getGoal: vi.fn().mockResolvedValue(error('NOT_FOUND', 'missing')),
      createGoal: vi.fn().mockResolvedValue(ok(created)),
      activateGoal: vi.fn().mockResolvedValue(ok(active)),
    } as unknown as GoalApplicationPort;
    const { context, imports } = referenceContext();

    const result = await new GoalPortableCapability(api, portabilityFromApi(api)).apply(
      {
        goals: [
          {
            ref: 'goals:1',
            name: 'Ship vNext',
            summary: null,
            status: GoalStatus.InProgress,
            startDate: null,
            target: null,
            reminderConfig: null,
            archived: false,
            labelRefs: ['labels:1'],
            keyResults: [
              {
                ref: 'goals:2',
                title: 'Finish cutover',
                description: null,
                calculationMethod: KeyResultCalculationMethod.Sum,
                initialValue: 0,
                currentValue: 50,
                trackingBaseValue: 40,
                targetValue: 100,
                target: null,
                unit: '%',
                weight: 3,
              },
            ],
          },
        ],
      },
      context,
    );

    expect(result).toMatchObject({ created: 1, updated: 0, skipped: 0 });
    expect(api.createGoal).toHaveBeenCalledOnce();
    const createInput = (api.createGoal as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createInput.labelIds).toEqual(['label-host-1']);
    expect(createInput.id).toMatch(/^IGoalId_[0-9a-f-]{36}$/);
    expect(createInput.initialKeyResults[0].id).toMatch(/^IKeyResultId_[0-9a-f-]{36}$/);
    expect(api.activateGoal).toHaveBeenCalledWith(created.goalId, 'identity-1', 1);
    expect(imports.get('goals:1')).toBe(created.goalId);
    expect(imports.get('goals:2')).toMatch(/^IKeyResultId_[0-9a-f-]{36}$/);
  });

  it('treats a semantically identical deterministic Goal as replay and resumes lifecycle', async () => {
    const seedApi = {
      getGoal: vi.fn().mockResolvedValue(error('NOT_FOUND', 'missing')),
      createGoal: vi.fn().mockImplementation(async (input) =>
        ok(
          receipt({
            goalId: input.id,
            readModel: readModelFromCreateInput(input),
          }),
        ),
      ),
    } as unknown as GoalApplicationPort;
    const seedContext = referenceContext().context;
    await new GoalPortableCapability(seedApi, portabilityFromApi(seedApi)).apply(
      portableGoalPayload(),
      seedContext,
    );
    const createInput = (seedApi.createGoal as ReturnType<typeof vi.fn>).mock.calls[0]![0];

    const existing = readModelFromCreateInput(createInput, {
      status: GoalStatus.Planned,
      version: 7,
      updatedAt: 999,
    });
    existing.keyResults[0]!.progress.trackingBaseValue = 40;
    const replayReceipt = receipt({
      goalId: createInput.id,
      goalVersion: 7,
      readModel: existing,
    });
    const active = receipt({
      goalId: createInput.id,
      goalVersion: 8,
      readModel: { ...existing, status: GoalStatus.InProgress, version: 8 },
    });
    const replayApi = {
      getGoal: vi.fn().mockResolvedValue(ok(existing)),
      createGoal: vi.fn().mockResolvedValue(ok(replayReceipt)),
      activateGoal: vi.fn().mockResolvedValue(ok(active)),
    } as unknown as GoalApplicationPort;
    const { context, imports } = referenceContext();

    const result = await new GoalPortableCapability(replayApi, portabilityFromApi(replayApi)).apply(
      portableGoalPayload(GoalStatus.InProgress),
      context,
    );

    expect(result).toMatchObject({ created: 0, updated: 0, skipped: 1 });
    expect(replayApi.createGoal).toHaveBeenCalledOnce();
    expect(replayApi.activateGoal).toHaveBeenCalledWith(createInput.id, 'identity-1', 7);
    expect(imports.get('goals:1')).toBe(createInput.id);
    expect(imports.get('goals:2')).toBe(createInput.initialKeyResults[0].id);
  });

  it.each([
    ['name', (existing: ReplayReadModel) => ({ ...existing, name: 'Drifted Goal' })],
    ['labels', (existing: ReplayReadModel) => ({ ...existing, labels: [{ id: 'other-label' }] })],
    [
      'key result',
      (existing: ReplayReadModel) => ({
        ...existing,
        keyResults: [{ ...existing.keyResults[0]!, title: 'Drifted KR' }],
      }),
    ],
    [
      'key result identity',
      (existing: ReplayReadModel) => ({
        ...existing,
        keyResults: [
          { ...existing.keyResults[0]!, id: 'IKeyResultId_ffffffff-ffff-5fff-8fff-ffffffffffff' },
        ],
      }),
    ],
  ])('fails closed when deterministic replay drifts in %s', async (_label, mutate) => {
    const seedApi = {
      getGoal: vi.fn().mockResolvedValue(error('NOT_FOUND', 'missing')),
      createGoal: vi.fn().mockImplementation(async (input) =>
        ok(
          receipt({
            goalId: input.id,
            readModel: readModelFromCreateInput(input),
          }),
        ),
      ),
    } as unknown as GoalApplicationPort;
    await new GoalPortableCapability(seedApi, portabilityFromApi(seedApi)).apply(
      portableGoalPayload(),
      referenceContext().context,
    );
    const createInput = (seedApi.createGoal as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const existing = mutate(readModelFromCreateInput(createInput));
    const replayApi = {
      getGoal: vi.fn().mockResolvedValue(ok(existing)),
      createGoal: vi.fn(),
      activateGoal: vi.fn(),
    } as unknown as GoalApplicationPort;

    await expect(
      new GoalPortableCapability(replayApi, portabilityFromApi(replayApi)).apply(
        portableGoalPayload(GoalStatus.InProgress),
        referenceContext().context,
      ),
    ).rejects.toThrow('goals@3 deterministic target conflicts with portable definition goals:1');
    expect(replayApi.createGoal).not.toHaveBeenCalled();
    expect(replayApi.activateGoal).not.toHaveBeenCalled();
  });

  it.each([
    [GoalStatus.Planned, GoalStatus.Completed],
    [GoalStatus.InProgress, GoalStatus.Completed],
    [GoalStatus.Completed, GoalStatus.Abandoned],
    [GoalStatus.Abandoned, GoalStatus.Completed],
  ])(
    'fails closed when existing lifecycle %s cannot converge to target %s',
    async (target, existingStatus) => {
      const seedApi = {
        getGoal: vi.fn().mockResolvedValue(error('NOT_FOUND', 'missing')),
        createGoal: vi
          .fn()
          .mockImplementation(async (input) =>
            ok(receipt({ goalId: input.id, readModel: readModelFromCreateInput(input) })),
          ),
      } as unknown as GoalApplicationPort;
      await new GoalPortableCapability(seedApi, portabilityFromApi(seedApi)).apply(
        portableGoalPayload(),
        referenceContext().context,
      );
      const createInput = (seedApi.createGoal as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const existing = readModelFromCreateInput(createInput, { status: existingStatus });
      const replayApi = {
        getGoal: vi.fn().mockResolvedValue(ok(existing)),
        createGoal: vi
          .fn()
          .mockResolvedValue(
            ok(receipt({ goalId: createInput.id, goalVersion: 9, readModel: existing })),
          ),
        activateGoal: vi.fn(),
        completeGoal: vi.fn(),
        abandonGoal: vi.fn(),
      } as unknown as GoalApplicationPort;

      await expect(
        new GoalPortableCapability(replayApi, portabilityFromApi(replayApi)).apply(
          portableGoalPayload(target),
          referenceContext().context,
        ),
      ).rejects.toThrow('goals@3 deterministic target lifecycle conflicts');
    },
  );

  it('fails closed when replay would need to unarchive an existing deterministic Goal', async () => {
    const seedApi = {
      getGoal: vi.fn().mockResolvedValue(error('NOT_FOUND', 'missing')),
      createGoal: vi
        .fn()
        .mockImplementation(async (input) =>
          ok(receipt({ goalId: input.id, readModel: readModelFromCreateInput(input) })),
        ),
    } as unknown as GoalApplicationPort;
    await new GoalPortableCapability(seedApi, portabilityFromApi(seedApi)).apply(
      portableGoalPayload(),
      referenceContext().context,
    );
    const createInput = (seedApi.createGoal as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const existing = readModelFromCreateInput(createInput, { archivedAt: 123 });
    const replayApi = {
      getGoal: vi.fn().mockResolvedValue(ok(existing)),
      createGoal: vi
        .fn()
        .mockResolvedValue(
          ok(receipt({ goalId: createInput.id, goalVersion: 9, readModel: existing })),
        ),
    } as unknown as GoalApplicationPort;

    await expect(
      new GoalPortableCapability(replayApi, portabilityFromApi(replayApi)).apply(
        portableGoalPayload(),
        referenceContext().context,
      ),
    ).rejects.toThrow('archived target cannot converge to unarchived');
  });
});
