import { afterAll, beforeEach, expect, it } from 'vitest';
import { GoalPortablePayloadV3Schema } from '@memoflow/contracts/goal';
import { TaskPortablePayloadV3Schema } from '@memoflow/contracts/task';
import { LabelPortablePayloadV3Schema } from '@memoflow/contracts/label';
import type {
  PortableCapabilityExecutionContext,
  PortableReferenceV3,
} from '@memoflow/contracts/data-portability';
import { createGoalPrismaPortableCapability } from '@memoflow/goal';
import { createTaskPrismaPortableCapability } from '@memoflow/task';
import { createLabelPrismaPortableCapability } from '@memoflow/label';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';

beforeEach(cleanAll);
afterAll(disconnectPrisma);

function context(identityId: string): PortableCapabilityExecutionContext {
  const bindings = new Map<PortableReferenceV3, string>();
  return {
    identityId,
    batchId: 'profile-linked-batch',
    references: {
      declareExportReference: () => {
        throw new Error('Not exporting');
      },
      resolveExportReference: () => {
        throw new Error('Not exporting');
      },
      bindImportedReference: (ref, id) => {
        bindings.set(ref, id);
      },
      resolveImportedReference: (ref) => {
        const id = bindings.get(ref);
        if (!id) throw new Error(`Unbound reference ${ref}`);
        return id;
      },
    },
  };
}

it('copies Label → Goal/KR → Task/Occurrence atomically and preserves relationships on replay', async () => {
  const db = await getPrisma();
  const account = await seedAccount();
  const labels = LabelPortablePayloadV3Schema.parse({
    labels: [{ ref: 'labels:1', name: 'Focus', color: null }],
  });
  const goals = GoalPortablePayloadV3Schema.parse({
    goals: [
      {
        ref: 'goals:1',
        name: 'Study',
        summary: null,
        description: null,
        status: 'InProgress',
        start: null,
        target: null,
        reminderConfig: null,
        archived: false,
        labelRefs: ['labels:1'],
        keyResults: [
          {
            ref: 'goals:2',
            title: 'Chapters',
            description: null,
            calculationMethod: 'Sum',
            initialValue: 0,
            currentValue: 1,
            trackingBaseValue: 0,
            targetValue: 10,
            target: null,
            unit: null,
            weight: 1,
          },
        ],
        records: [],
        reviews: [],
      },
    ],
  });
  const tasks = TaskPortablePayloadV3Schema.parse({
    plans: [
      {
        ref: 'tasks:1',
        title: 'Read',
        description: null,
        schedule: { kind: 'OneTime', date: '2026-10-08', timing: { kind: 'AllDay' } },
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
          keyResultRef: 'goals:2',
          contribution: { value: 1, trigger: 'EachCompletion' },
        },
        labelRefs: ['labels:1'],
        checklist: [{ ref: 'tasks:2', title: 'Take notes', order: 0 }],
      },
    ],
    occurrences: [
      {
        ref: 'tasks:3',
        planRef: 'tasks:1',
        scheduleSnapshot: { date: '2026-10-08', timing: { kind: 'AllDay' } },
        importanceSnapshot: 'Moderate',
        status: 'Completed',
        actualStartAt: 1000,
        result: {
          kind: 'Completed',
          recordedAt: 2000,
          actualDurationMinutes: 5,
          note: 'Historical',
          rating: null,
        },
        checklistState: [
          {
            definitionRef: 'tasks:2',
            titleSnapshot: 'Take notes',
            orderSnapshot: 0,
            completed: true,
            completedAt: 2000,
          },
        ],
      },
    ],
  });

  async function apply(fault: boolean) {
    return db.$transaction(async (tx) => {
      const ctx = context(account.id);
      await createLabelPrismaPortableCapability(tx).apply(labels, ctx);
      await createGoalPrismaPortableCapability(tx).apply(goals, ctx);
      await createTaskPrismaPortableCapability(tx).apply(tasks, ctx);
      if (fault) throw new Error('fault after final owner');
    });
  }
  await expect(apply(true)).rejects.toThrow('fault after final owner');
  expect(await db.label.count()).toBe(0);
  expect(await db.goal.count()).toBe(0);
  expect(await db.taskPlan.count()).toBe(0);
  expect(await db.taskOccurrence.count()).toBe(0);
  await apply(false);
  await apply(false);
  expect(await db.label.count()).toBe(1);
  expect(await db.goal.count()).toBe(1);
  expect(await db.taskPlan.count()).toBe(1);
  expect(await db.taskOccurrence.count()).toBe(1);
  const goal = await db.goal.findFirstOrThrow();
  const keyResult = await db.keyResult.findFirstOrThrow();
  const task = await db.taskPlan.findFirstOrThrow();
  expect(task.goalId).toBe(goal.id);
  expect(task.keyResultId).toBe(keyResult.id);
  const goalLabel = await db.goalLabel.findFirstOrThrow();
  const taskLabel = await db.taskLabel.findFirstOrThrow();
  expect(taskLabel.labelId).toBe(goalLabel.labelId);
  expect(taskLabel.taskPlanId).toBe(task.id);
  const occurrence = await db.taskOccurrence.findFirstOrThrow();
  expect(occurrence).toMatchObject({ planId: task.id, status: 'Completed' });
  expect(await db.outboxMessage.count({ where: { status: 'pending' } })).toBe(0);
  expect(await db.taskGoalOutbox.count()).toBe(0);
});
