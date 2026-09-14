import { describe, expect, it, vi } from 'vitest';
import type {
  PortableCapabilityExecutionContext,
  PortableReferencePort,
  PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import { GoalStatus, KeyResultCalculationMethod } from '@memoflow/contracts/goal';
import { error, ok } from '@memoflow/contracts/result';
import type { GoalApplicationPort } from './goal.application.port';
import { GoalPortableCapability } from './goal-portability';

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

    const payload = await new GoalPortableCapability(api).export(context);

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

  it('dry-run detects same-batch replay through deterministic host ids', async () => {
    const getGoal = vi
      .fn()
      .mockResolvedValueOnce(error('NOT_FOUND', 'missing'))
      .mockResolvedValueOnce(ok(receipt().readModel));
    const api = { getGoal } as unknown as GoalApplicationPort;
    const capability = new GoalPortableCapability(api);
    const { context } = referenceContext();
    const payload = {
      goals: [
        {
          ref: 'goals:1' as PortableReferenceV3,
          name: 'A',
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

    const result = await new GoalPortableCapability(api).apply(
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
});
