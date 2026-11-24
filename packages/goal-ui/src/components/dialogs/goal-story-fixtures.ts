import type {
  GoalClientDTO,
  GoalRecordClientDTO,
  KeyResultClientDTO,
  GoalRecordPreviewContext,
} from '@memoflow/goal-contracts';
import {
  createMockGoal,
  createMockGoalRecord,
  createMockKeyResult,
} from '@memoflow/goal-contracts/test-support/goal.mock';

/**
 * Deterministic Goal surfaces used by P1-B catalog stories.
 *
 * Production DTOs only: no story invents a view model or a writable owner
 * projection. IDs and display copy stay fixed so screenshots and reviews do not
 * drift between runs.
 */
export const storyGoalId = 'IGoalId_story_goal_p1b' as GoalClientDTO['id'];
export const storyKeyResultId = 'IKeyResultId_story_kr_p1b' as KeyResultClientDTO['id'];

export const storyKeyResults: KeyResultClientDTO[] = [
  createMockKeyResult({
    id: storyKeyResultId,
    title: 'Deep work sessions per week',
    description: 'Counted from the weekly review log.',
    progress: {
      aggregationMethod: 'Sum',
      initialValue: 0,
      currentValue: 7,
      targetValue: 12,
      unit: 'sessions',
    },
    progressPercentage: 58,
    isCompleted: false,
    weight: 4,
    order: 0,
  }),
  createMockKeyResult({
    id: 'IKeyResultId_story_kr_p1b_2' as KeyResultClientDTO['id'],
    title: 'Average focus block length',
    description: null,
    progress: {
      aggregationMethod: 'Average',
      initialValue: 40,
      currentValue: 62,
      targetValue: 75,
      unit: 'min',
    },
    progressPercentage: 63,
    isCompleted: false,
    weight: 3,
    order: 1,
  }),
];

export function createStoryGoal(overrides: Partial<GoalClientDTO> = {}): GoalClientDTO {
  return createMockGoal({
    id: storyGoalId,
    name: 'Build a sustainable deep-work system',
    summary: 'Protect two uninterrupted focus blocks each working day.',
    description:
      'This quarter focuses on the routine around focused work: the calendar guard rails, the weekly review loop and the short feedback cycles.',
    status: 'InProgress',
    start: { kind: 'day', date: '2026-10-01' as never },
    target: { kind: 'quarter', year: 2026, quarter: 4 },
    version: 6,
    overallProgress: 58,
    totalKeyResults: storyKeyResults.length,
    completedKeyResults: 0,
    keyResults: storyKeyResults,
    reviews: [],
    labels: [],
    reminderConfig: null,
    ...overrides,
  });
}

export const storyRecords: GoalRecordClientDTO[] = [
  createMockGoalRecord({
    id: 'IGoalRecordId_story_record_1' as GoalRecordClientDTO['id'],
    goalId: storyGoalId,
    keyResultId: storyKeyResultId,
    value: 2,
    valueAfter: 7,
    authorship: 'Manual',
    source: null,
    comment: 'Two sessions before the afternoon review.',
    recordedAt: Date.UTC(2026, 10, 19, 9, 30),
    createdAt: Date.UTC(2026, 10, 19, 9, 30),
    updatedAt: Date.UTC(2026, 10, 19, 9, 30),
  }),
  createMockGoalRecord({
    id: 'IGoalRecordId_story_record_2' as GoalRecordClientDTO['id'],
    goalId: storyGoalId,
    keyResultId: storyKeyResultId,
    value: 1,
    valueAfter: 5,
    authorship: 'TaskUserMeasurement',
    source: { type: 'TASK_INSTANCE', id: 'occurrence_story_1' },
    comment: null,
    recordedAt: Date.UTC(2026, 10, 18, 18, 5),
    createdAt: Date.UTC(2026, 10, 18, 18, 5),
    updatedAt: Date.UTC(2026, 10, 18, 18, 5),
  }),
];

export const storyPreviewContext: GoalRecordPreviewContext = {
  keyResultId: storyKeyResultId as GoalRecordPreviewContext['keyResultId'],
  trackingBaseValue: 7,
  initialValue: 0,
  currentValue: 7,
  targetValue: 12,
  aggregationMethod: 'Sum',
  unit: 'sessions',
  aggregationSnapshot: { count: 6, sum: 7, max: 2, min: 1, last: 2 },
};

/**
 * Frozen read model for GoalDetailView. Task context is Available so the
 * cross-owner section is reviewable; knowledge stays Unavailable because the
 * story never connects a repository or a cloud space.
 */
export function createStoryGoalWorkspace(goal = createStoryGoal()) {
  return {
    goal,
    taskContext: {
      availability: 'Available' as const,
      summary: {
        total: 2,
        active: 1,
        completed: 1,
        goalLevel: 0,
        byKeyResult: [{ keyResultId: storyKeyResultId, total: 2, active: 1 }],
      },
      preview: [
        {
          taskPlanId: 'task-plan-story-1',
          name: 'Morning focus block',
          status: 'Active' as const,
          outcome: 'Open' as const,
          keyResultId: storyKeyResultId,
          hasContribution: true,
        },
        {
          taskPlanId: 'task-plan-story-2',
          name: 'Weekly review of the focus log',
          status: 'Active' as const,
          outcome: 'Open' as const,
          keyResultId: storyKeyResultId,
          hasContribution: false,
        },
      ],
    },
    knowledgeContext: {
      availability: 'Unavailable' as const,
      summary: null,
      preview: [],
    },
    recentProgress: storyRecords,
    recentReviews: [],
  };
}
