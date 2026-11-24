import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/task-contracts';
import { TaskPlanScheduleSchema } from '@memoflow/task-contracts';
import type { TaskPlanWorkspace } from '@memoflow/task-workspace-contracts';
import {
  createMockTaskOccurrence,
  createMockTaskPlan,
} from '@memoflow/task-contracts/test-support/task.mock';

/**
 * Deterministic Task DTOs for P1-B catalog stories. Due dates are computed from
 * the current day so the Today surface is stable regardless of when the
 * catalog is opened; no API, database or scheduler call is involved.
 */
function startOfToday(): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export const storyPlanId = 'story-task-plan-1' as TaskPlanClientDTO['id'];
export const storyOccurrenceId = 'story-task-occurrence-1' as TaskOccurrenceClientDTO['id'];

export function createStoryTaskPlan(
  overrides: Partial<TaskPlanClientDTO> = {},
): TaskPlanClientDTO {
  return createMockTaskPlan({
    id: storyPlanId,
    name: 'Morning focus block',
    description: 'Two uninterrupted hours on the quarterly architecture review.',
    status: 'Active',
    outcome: 'Open',
    importance: 'Important',
    goalBinding: null,
    checklist: [],
    labels: [],
    schedule: TaskPlanScheduleSchema.parse({
      kind: 'Recurring',
      startDate: '2026-10-01',
      timing: { kind: 'At', time: '09:30' as never },
      recurrence: {
        frequency: 'Weekly',
        interval: 1,
        byWeekday: [1, 2, 3, 4, 5],
        end: { kind: 'Never' },
      },
    }),
    ...overrides,
  });
}

export function createStoryOccurrence(
  overrides: Partial<TaskOccurrenceClientDTO> = {},
): TaskOccurrenceClientDTO {
  return createMockTaskOccurrence({
    id: storyOccurrenceId,
    planId: storyPlanId,
    occurrenceKey: 'story-task-plan-1:today',
    scheduleSnapshot: {
      date: '2026-11-24' as TaskOccurrenceClientDTO['scheduleSnapshot']['date'],
      timing: { kind: 'At', time: '09:30' as never },
    },
    importanceSnapshot: 'Important',
    status: 'Pending',
    actualStartAt: null,
    result: null,
    checklistState: [
      {
        definitionId: 'step-1',
        titleSnapshot: 'Open the architecture decision log',
        orderSnapshot: 0,
        completed: true,
        completedAt: Date.UTC(2026, 10, 24, 9, 40),
      },
      {
        definitionId: 'step-2',
        titleSnapshot: 'Write the rollout risks section',
        orderSnapshot: 1,
        completed: false,
        completedAt: null,
      },
    ],
    dueAt: startOfToday() + 9.5 * 3_600_000,
    isOverdue: false,
    version: 3,
    ...overrides,
  });
}

export function createStoryWorkspace(
  goalContext: TaskPlanWorkspace['goalContext'] = null,
): TaskPlanWorkspace {
  return {
    plan: createStoryTaskPlan(),
    labels: [],
    goalContext,
    occurrenceSummary: {
      total: 6,
      completed: 4,
      missed: 1,
      skipped: 0,
      pending: 1,
      inProgress: 0,
      completionRate: 67,
    },
    recentOccurrences: [],
    linkedNotes: [],
  };
}

export const storyGoalContext: TaskPlanWorkspace['goalContext'] = {
  availability: 'Available',
  goalId: 'IGoalId_story_goal_p1b' as never,
  keyResultId: 'IKeyResultId_story_kr_p1b' as never,
  goal: {
    goalId: 'IGoalId_story_goal_p1b' as never,
    goalTitle: 'Build a sustainable deep-work system',
  },
  keyResult: {
    keyResultId: 'IKeyResultId_story_kr_p1b' as never,
    keyResultTitle: 'Deep work sessions per week',
  },
};
