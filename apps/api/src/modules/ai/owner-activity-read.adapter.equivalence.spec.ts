import { projectAIOwnerActivity, type AIActivityItem } from '@memoflow/ai';
import { TaskOccurrenceStatus } from '@memoflow/task-contracts';
import { GoalActivityReadService } from '@memoflow/goal';
import { ScheduleActivityReadService } from '@memoflow/schedule';
import { TaskActivityReadService } from '@memoflow/task';
import { describe, expect, it } from 'vitest';
import { OwnerActivityAIReadAdapter } from './owner-activity-read.adapter';

const IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440000';

interface OwnerFacts {
  readonly goals: {
    id: string;
    name: string;
    updatedAt: number;
    deletedAt: number | null;
  }[];
  readonly taskPlans: {
    id: string;
    title: string;
    createdAt: number;
    deletedAt: number | null;
  }[];
  readonly taskOccurrences: {
    id: string;
    planId: string;
    status: TaskOccurrenceStatus;
    result: { recordedAt: number } | null;
    updatedAt: number;
    deletedAt: number | null;
  }[];
  readonly schedules: { id: string; title: string; createdAt: number }[];
  readonly since: number;
  readonly limit?: number;
}

const occurrence = (
  overrides: Partial<OwnerFacts['taskOccurrences'][number]> = {},
): OwnerFacts['taskOccurrences'][number] => ({
  id: 'occurrence-1',
  planId: 'task-1',
  status: TaskOccurrenceStatus.Completed,
  result: { recordedAt: 10_000 },
  updatedAt: 9_000,
  deletedAt: null,
  ...overrides,
});

const plan = (
  overrides: Partial<OwnerFacts['taskPlans'][number]> = {},
): OwnerFacts['taskPlans'][number] => ({
  id: 'task-1',
  title: 'Review PR',
  createdAt: 7_000,
  deletedAt: null,
  ...overrides,
});

const cases: readonly (OwnerFacts & { readonly name: string })[] = [
  {
    name: 'baseline projection',
    goals: [
      { id: 'goal-1', name: 'Ship vNext', updatedAt: 8_000, deletedAt: null },
      { id: 'goal-old', name: 'Old goal', updatedAt: 1_000, deletedAt: null },
    ],
    taskPlans: [
      plan(),
      plan({ id: 'task-deleted', title: 'Deleted', createdAt: 9_500, deletedAt: 9_600 }),
    ],
    taskOccurrences: [
      occurrence(),
      occurrence({
        id: 'occurrence-pending',
        status: TaskOccurrenceStatus.Pending,
        result: null,
        updatedAt: 9_500,
      }),
    ],
    schedules: [{ id: 'schedule-1', title: 'Focus block', createdAt: 9_000 }],
    since: 5_000,
    limit: 3,
  },
  {
    name: 'empty truth',
    goals: [],
    taskPlans: [],
    taskOccurrences: [],
    schedules: [],
    since: 0,
  },
  {
    name: 'timestamp ties across every stream',
    goals: [{ id: 'goal-tie', name: 'Tie goal', updatedAt: 5_000, deletedAt: null }],
    taskPlans: [plan({ id: 'task-tie', title: 'Tie plan', createdAt: 5_000 })],
    taskOccurrences: [occurrence({ id: 'occurrence-tie', result: { recordedAt: 5_000 } })],
    schedules: [{ id: 'schedule-tie', title: 'Tie schedule', createdAt: 5_000 }],
    since: 5_000,
    limit: 10,
  },
  {
    name: 'default limit over many task items',
    goals: [],
    taskPlans: Array.from({ length: 15 }, (_, index) =>
      plan({ id: `task-${index}`, title: `Task ${index}`, createdAt: 100 + index }),
    ),
    taskOccurrences: [],
    schedules: [],
    since: 0,
  },
  {
    name: 'explicit limit above the ceiling',
    goals: [],
    taskPlans: Array.from({ length: 15 }, (_, index) =>
      plan({ id: `task-${index}`, title: `Task ${index}`, createdAt: 100 + index }),
    ),
    taskOccurrences: [],
    schedules: [],
    since: 0,
    limit: 100,
  },
  {
    name: 'fractional limit',
    goals: [],
    taskPlans: Array.from({ length: 15 }, (_, index) =>
      plan({ id: `task-${index}`, title: `Task ${index}`, createdAt: 100 + index }),
    ),
    taskOccurrences: [],
    schedules: [],
    since: 0,
    limit: 2.7,
  },
  {
    name: 'zero limit',
    goals: [],
    taskPlans: [plan()],
    taskOccurrences: [occurrence()],
    schedules: [{ id: 'schedule-1', title: 'Focus block', createdAt: 9_000 }],
    since: 0,
    limit: 0,
  },
  {
    name: 'deleted and pending entries with high timestamps',
    goals: [{ id: 'goal-deleted', name: 'Deleted goal', updatedAt: 99_000, deletedAt: 99_500 }],
    taskPlans: [
      plan({ id: 'task-deleted', title: 'Deleted', createdAt: 99_000, deletedAt: 99_500 }),
      plan(),
    ],
    taskOccurrences: [
      occurrence({ id: 'occurrence-deleted', result: { recordedAt: 99_000 }, deletedAt: 99_500 }),
      occurrence({
        id: 'occurrence-pending',
        status: TaskOccurrenceStatus.Pending,
        result: null,
        updatedAt: 99_000,
      }),
      occurrence(),
    ],
    schedules: [{ id: 'schedule-1', title: 'Focus block', createdAt: 9_000 }],
    since: 0,
    limit: 10,
  },
  {
    name: 'completed occurrence without recorded result falls back to updatedAt',
    goals: [],
    taskPlans: [plan()],
    taskOccurrences: [occurrence({ result: null, updatedAt: 12_345 })],
    schedules: [],
    since: 0,
    limit: 10,
  },
  {
    name: 'inclusive since boundary',
    goals: [{ id: 'goal-boundary', name: 'Boundary', updatedAt: 5_000, deletedAt: null }],
    taskPlans: [plan({ createdAt: 5_000 })],
    taskOccurrences: [occurrence({ result: { recordedAt: 5_000 } })],
    schedules: [{ id: 'schedule-boundary', title: 'Boundary', createdAt: 5_000 }],
    since: 5_000,
    limit: 10,
  },
  {
    name: 'per-domain bound keeps the global top-N under ties',
    goals: Array.from({ length: 12 }, (_, index) => ({
      id: `goal-${index}`,
      name: `Goal ${index}`,
      updatedAt: 1_000,
      deletedAt: null,
    })),
    taskPlans: [],
    taskOccurrences: Array.from({ length: 12 }, (_, index) =>
      occurrence({ id: `occurrence-${index}`, result: { recordedAt: 1_000 } }),
    ),
    schedules: Array.from({ length: 12 }, (_, index) => ({
      id: `schedule-${index}`,
      title: `Schedule ${index}`,
      createdAt: 1_000,
    })),
    since: 0,
    limit: 5,
  },
];

/**
 * Test oracle for the retired host mapping: the legacy projection contract is
 * reproduced here so the domain-capability assembly is compared item by item.
 */
function legacyProjection(facts: OwnerFacts): AIActivityItem[] {
  return projectAIOwnerActivity({
    goals: facts.goals.map((goal) => ({
      id: String(goal.id),
      name: goal.name,
      updatedAt: Number(goal.updatedAt),
      deleted: goal.deletedAt !== null,
    })),
    taskPlans: facts.taskPlans.map((task) => ({
      id: String(task.id),
      title: task.title,
      createdAt: Number(task.createdAt),
      deleted: task.deletedAt !== null,
    })),
    taskOccurrences: facts.taskOccurrences.map((entry) => ({
      id: String(entry.id),
      planId: String(entry.planId),
      completed: entry.status === TaskOccurrenceStatus.Completed,
      timestamp: entry.result?.recordedAt ?? Number(entry.updatedAt),
      deleted: entry.deletedAt !== null,
    })),
    schedules: facts.schedules.map((schedule) => ({
      id: String(schedule.id),
      title: schedule.title,
      createdAt: Number(schedule.createdAt),
    })),
    since: facts.since,
    limit: facts.limit,
  });
}

describe('OwnerActivityAIReadAdapter equivalence with the retired host projection', () => {
  for (const facts of cases) {
    it(facts.name, async () => {
      const goalRepository = { findByIdentityId: async () => facts.goals };
      const taskPlanRepository = { findByIdentityId: async () => facts.taskPlans };
      const taskOccurrenceRepository = { findByIdentityId: async () => facts.taskOccurrences };
      const scheduleRepository = { findByIdentityId: async () => facts.schedules };

      const adapter = new OwnerActivityAIReadAdapter({
        goalActivity: new GoalActivityReadService({ goalRepository: goalRepository as never }),
        taskActivity: new TaskActivityReadService({
          taskPlanRepository: taskPlanRepository as never,
          taskOccurrenceRepository: taskOccurrenceRepository as never,
        }),
        scheduleActivity: new ScheduleActivityReadService({
          scheduleRepository: scheduleRepository as never,
        }),
      });

      await expect(
        adapter.listRecent({
          identityId: IDENTITY_ID,
          since: facts.since,
          limit: facts.limit,
        }),
      ).resolves.toEqual(legacyProjection(facts));
    });
  }
});
