import { describe, expect, it, vi } from 'vitest';
import type { Instant } from '@memoflow/contracts/primitives';
import { IdentityId } from '@memoflow/domain-shared';
import { TaskOccurrenceId } from '../../domain/value-objects/task-occurrence-id';
import { TaskPlanId } from '../../domain/value-objects/task-plan-id';
import type { ITaskOccurrenceRepository } from '../../domain/repositories/i-task-occurrence-repository';
import type { ITaskPlanRepository } from '../../domain/repositories/i-task-plan-repository';
import type { TaskWriteTransactionRunner } from '../use-cases/commands/task-write-support';
import {
  TaskCanonicalRestoreService,
  type TaskCanonicalRestoreBundle,
} from './task-canonical-restore.service';

const createdAt = 1_780_000_000_000 as Instant;
const updatedAt = 1_780_000_100_000 as Instant;
const closedAt = 1_780_000_090_000 as Instant;

function makeBundle(): TaskCanonicalRestoreBundle {
  const identityId = IdentityId.generate();
  const planId = TaskPlanId.generate();
  const occurrenceId = TaskOccurrenceId.generate();
  return {
    identityId,
    plans: [
      {
        id: planId,
        title: 'Restored plan',
        description: 'portable truth',
        schedule: { kind: 'OneTime', date: '2026-09-14', timing: { kind: 'AllDay' } },
        reminderConfig: {
          enabled: true,
          triggers: [
            {
              type: 'Relative',
              absoluteTime: null,
              relativeValue: 15,
              relativeUnit: 'Minutes',
            },
          ],
        },
        importance: 'Important',
        status: 'Closed',
        outcome: 'Succeeded',
        completionPolicy: 'StrictNoBackfill',
        closedAt,
        archivedAt: null,
        abandonedReason: null,
        goalBinding: {
          goalId: 'GoalId_00000000-0000-4000-8000-000000000001',
          keyResultId: 'KeyResultId_00000000-0000-4000-8000-000000000002',
          contribution: { value: 2, trigger: 'EachCompletion' },
        },
        checklist: [{ id: 'portable-check-1', title: 'Proof', order: 0 }],
        labelIds: ['LabelId_00000000-0000-4000-8000-000000000003'],
        createdAt,
        updatedAt,
      },
    ],
    occurrences: [
      {
        id: occurrenceId,
        planId,
        scheduleSnapshot: { date: '2026-09-14', timing: { kind: 'AllDay' } },
        importanceSnapshot: 'Important',
        status: 'Completed',
        actualStartAt: 1_780_000_010_000 as Instant,
        result: {
          kind: 'Completed',
          recordedAt: 1_780_000_020_000,
          actualDurationMinutes: 10,
          note: 'done',
          rating: 5,
        },
        checklistState: [
          {
            definitionId: 'portable-check-1',
            titleSnapshot: 'Proof',
            orderSnapshot: 0,
            completed: true,
            completedAt: 1_780_000_020_000,
          },
        ],
        createdAt,
        updatedAt,
      },
    ],
  };
}

function makeHarness() {
  const savedPlans: unknown[] = [];
  const savedOccurrences: unknown[] = [];
  const replaceLabels = vi.fn(async () => []);
  const planRepository = {
    findByIdForIdentity: vi.fn(async () => null),
    save: vi.fn(async (plan) => {
      savedPlans.push(plan);
    }),
    replaceLabels,
  } as unknown as ITaskPlanRepository;
  const occurrenceRepository = {
    findByIdForIdentity: vi.fn(async () => null),
    saveMany: vi.fn(async (occurrences) => {
      savedOccurrences.push(...occurrences);
    }),
  } as unknown as ITaskOccurrenceRepository;
  const run = vi.fn(async (work) => work({ planRepository, occurrenceRepository }));
  const transactionRunner = { run } as TaskWriteTransactionRunner;
  return {
    savedPlans,
    savedOccurrences,
    replaceLabels,
    planRepository,
    occurrenceRepository,
    transactionRunner,
    service: new TaskCanonicalRestoreService(transactionRunner),
  };
}

describe('TaskCanonicalRestoreService', () => {
  it('restores canonical plan and occurrence state without normal command side effects', async () => {
    const bundle = makeBundle();
    const harness = makeHarness();

    await expect(harness.service.restore(bundle)).resolves.toEqual({
      plansCreated: 1,
      plansSkipped: 0,
      occurrencesCreated: 1,
      occurrencesSkipped: 0,
    });

    expect(harness.transactionRunner.run).toHaveBeenCalledTimes(1);
    expect(harness.savedPlans).toHaveLength(1);
    expect(harness.savedOccurrences).toHaveLength(1);
    expect(harness.replaceLabels).toHaveBeenCalledWith(
      bundle.identityId,
      bundle.plans[0]!.id,
      bundle.plans[0]!.labelIds,
    );

    const plan = harness.savedPlans[0] as {
      toServerDTO(): Record<string, unknown>;
      version: number;
      domainEvents: readonly unknown[];
    };
    expect(plan.toServerDTO()).toMatchObject({
      id: bundle.plans[0]!.id,
      identityId: bundle.identityId,
      name: 'Restored plan',
      status: 'Closed',
      outcome: 'Succeeded',
      completionPolicy: 'StrictNoBackfill',
      closedAt,
      deletedAt: null,
      version: 1,
    });
    expect(plan.version).toBe(1);

    const occurrence = harness.savedOccurrences[0] as {
      toServerDTO(): Record<string, unknown>;
      version: number;
    };
    expect(occurrence.toServerDTO()).toMatchObject({
      id: bundle.occurrences[0]!.id,
      planId: bundle.plans[0]!.id,
      identityId: bundle.identityId,
      occurrenceKey: `${bundle.plans[0]!.id}:2026-09-14`,
      status: 'Completed',
      result: { kind: 'Completed', rating: 5 },
      deletedAt: null,
      version: 1,
    });
    expect(occurrence.version).toBe(1);
  });

  it('rejects an inconsistent plan lifecycle before opening a transaction', async () => {
    const bundle = makeBundle();
    const harness = makeHarness();
    const invalid: TaskCanonicalRestoreBundle = {
      ...bundle,
      plans: [{ ...bundle.plans[0]!, status: 'Active', outcome: 'Succeeded' }],
    };

    await expect(harness.service.restore(invalid)).rejects.toThrow('lifecycle is inconsistent');
    expect(harness.transactionRunner.run).not.toHaveBeenCalled();
  });

  it('rejects occurrence checklist references outside the restored plan', async () => {
    const bundle = makeBundle();
    const harness = makeHarness();
    const invalid: TaskCanonicalRestoreBundle = {
      ...bundle,
      occurrences: [
        {
          ...bundle.occurrences[0]!,
          checklistState: [
            {
              ...bundle.occurrences[0]!.checklistState[0]!,
              definitionId: 'other-definition',
            },
          ],
        },
      ],
    };

    await expect(harness.service.restore(invalid)).rejects.toThrow(
      'references checklist definition outside its plan',
    );
    expect(harness.transactionRunner.run).not.toHaveBeenCalled();
  });

  it('lets TaskOccurrence domain invariants reject terminal status/result drift', async () => {
    const bundle = makeBundle();
    const harness = makeHarness();
    const invalid: TaskCanonicalRestoreBundle = {
      ...bundle,
      occurrences: [
        {
          ...bundle.occurrences[0]!,
          status: 'Completed',
          result: null,
        },
      ],
    };

    await expect(harness.service.restore(invalid)).rejects.toThrow(
      'Completed TaskOccurrence requires a Completed result',
    );
    expect(harness.transactionRunner.run).not.toHaveBeenCalled();
  });

  it('skips semantically identical deterministic targets so an interrupted batch can resume', async () => {
    const original = makeBundle();
    const bundle: TaskCanonicalRestoreBundle = {
      ...original,
      plans: [{ ...original.plans[0]!, labelIds: [] }],
    };
    const first = makeHarness();
    await first.service.restore(bundle);

    const replay = makeHarness();
    vi.mocked(replay.planRepository.findByIdForIdentity).mockResolvedValue(
      first.savedPlans[0] as never,
    );
    vi.mocked(replay.occurrenceRepository.findByIdForIdentity).mockResolvedValue(
      first.savedOccurrences[0] as never,
    );

    await expect(replay.service.restore(bundle)).resolves.toEqual({
      plansCreated: 0,
      plansSkipped: 1,
      occurrencesCreated: 0,
      occurrencesSkipped: 1,
    });
    expect(replay.planRepository.save).not.toHaveBeenCalled();
    expect(replay.occurrenceRepository.saveMany).not.toHaveBeenCalled();
  });

  it('fails closed when a deterministic target id is bound to different business state', async () => {
    const bundle = makeBundle();
    const harness = makeHarness();
    vi.mocked(harness.planRepository.findByIdForIdentity).mockResolvedValueOnce({
      labels: [],
      toServerDTO: () => ({ name: 'different' }),
    } as never);

    await expect(harness.service.restore(bundle)).rejects.toThrow(
      'Task restore target conflicts with existing state',
    );
    expect(harness.occurrenceRepository.saveMany).not.toHaveBeenCalled();
  });
});
