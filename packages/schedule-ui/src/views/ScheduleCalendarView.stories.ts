import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, userEvent, within } from 'storybook/test';
import { provide } from 'vue';
import type { CalendarEntryClientDTO } from '@memoflow/schedule-contracts';
import type { GoalClientDTO } from '@memoflow/goal-contracts';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/task-contracts';
import { TaskPlanScheduleSchema } from '@memoflow/task-contracts';
import {
  createMockTaskOccurrence,
  createMockTaskPlan,
} from '@memoflow/task-contracts/test-support/task.mock';
import {
  GOAL_SERVICE_KEY,
  ROUTINE_SERVICE_KEY,
  SCHEDULE_SERVICE_KEY,
  TASK_SERVICE_KEY,
} from '../../../app-vue/src/di/keys';
import type {
  IGoalService,
  IRoutineService,
  IScheduleService,
  ITaskService,
} from '../../../app-vue/src/di/types';
import ScheduleCalendarView from './ScheduleCalendarView.vue';
import { createScheduleStoryEvent } from '../components/story-fixtures';

type CalendarStoryParameters = {
  mode?: 'ready' | 'empty';
  overlapping?: boolean;
};

const hour = 3_600_000;
const midnight = (() => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
})();

function scheduleEntry(
  id: string,
  title: string,
  startHour: number,
  endHour: number,
): CalendarEntryClientDTO {
  return createScheduleStoryEvent({
    id,
    identityId: 'identity-story',
    title,
    range: { kind: 'Timed', start: midnight + startHour * hour, end: midnight + endHour * hour },
  });
}

const baseEntries = [
  scheduleEntry('schedule-story-1', 'Quarterly architecture review', 10, 11.5),
  scheduleEntry('schedule-story-2', 'Team lunch', 12.5, 13.5),
];

const overlapEntries = [
  scheduleEntry('schedule-story-1', 'Quarterly architecture review', 10, 11.5),
  scheduleEntry('schedule-story-overlap', 'Design sync moved into the review', 11, 12),
];

const goalTargetDate = new Date(midnight);
goalTargetDate.setDate(goalTargetDate.getDate() + 1);
const goalTargetYmd = [
  goalTargetDate.getFullYear(),
  String(goalTargetDate.getMonth() + 1).padStart(2, '0'),
  String(goalTargetDate.getDate()).padStart(2, '0'),
].join('-');

const goal = {
  id: 'IGoalId_story_goal_p1b' as GoalClientDTO['id'],
  identityId: 'identity-story' as GoalClientDTO['identityId'],
  name: 'Build a sustainable deep-work system',
  summary: 'Protect two uninterrupted focus blocks each working day.',
  description: null,
  status: 'InProgress',
  start: { kind: 'day', date: '2026-10-01' },
  target: { kind: 'day', date: goalTargetYmd },
  completedAt: null,
  archivedAt: null,
  sortOrder: 0,
  reminderConfig: null,
  labels: [],
  createdAt: midnight,
  updatedAt: midnight,
  deletedAt: null,
  version: 3,
  keyResults: null,
  reviews: null,
  totalKeyResults: 2,
  completedKeyResults: 0,
  overallProgress: 58,
} as unknown as GoalClientDTO;

const taskPlan: TaskPlanClientDTO = createMockTaskPlan({
  id: 'story-task-plan-1' as TaskPlanClientDTO['id'],
  name: 'Morning focus block',
  status: 'Active',
  outcome: 'Open',
  importance: 'Important',
  goalBinding: null,
  checklist: [],
  labels: [],
  schedule: TaskPlanScheduleSchema.parse({
    kind: 'Recurring',
    startDate: '2026-10-01',
    timing: { kind: 'At', time: '14:00' as never },
    recurrence: {
      frequency: 'Weekly',
      interval: 1,
      byWeekday: [1, 2, 3, 4, 5],
      end: { kind: 'Never' },
    },
  }),
});

const taskOccurrence: TaskOccurrenceClientDTO = createMockTaskOccurrence({
  id: 'story-task-occurrence-1' as TaskOccurrenceClientDTO['id'],
  planId: 'story-task-plan-1' as TaskOccurrenceClientDTO['planId'],
  identityId: 'identity-story' as TaskOccurrenceClientDTO['identityId'],
  occurrenceKey: 'story-task-plan-1:today',
  importanceSnapshot: 'Important',
  status: 'Pending',
  actualStartAt: null,
  result: null,
  checklistState: [],
  dueAt: midnight + 14 * hour,
  isOverdue: false,
  version: 2,
  scheduleSnapshot: {
    date: '2026-11-24' as TaskOccurrenceClientDTO['scheduleSnapshot']['date'],
    timing: { kind: 'At', time: '14:00' as never },
  },
});

function installCalendarPorts(parameters: CalendarStoryParameters) {
  const entries =
    parameters.mode === 'empty' ? [] : parameters.overlapping ? overlapEntries : baseEntries;
  provide(SCHEDULE_SERVICE_KEY, {
    getSchedulesByAccount: async () => ({ ok: true, data: entries }),
  } as unknown as IScheduleService);
  provide(TASK_SERVICE_KEY, {
    listOccurrencesByDateRange: async () => ({
      ok: true,
      data: parameters.mode === 'empty' ? [] : [taskOccurrence],
    }),
    listPlans: async () => ({ ok: true, data: { plans: [taskPlan], total: 1 } }),
  } as unknown as ITaskService);
  provide(GOAL_SERVICE_KEY, {
    listGoals: async () => ({
      ok: true,
      data: { goals: parameters.mode === 'empty' ? [] : [goal], pagination: { hasMore: false } },
    }),
    updateGoal: async () => ({ ok: true, data: {} }),
  } as unknown as IGoalService);
  provide(ROUTINE_SERVICE_KEY, {
    getUpcomingOccurrences: async () => ({ ok: true, data: { occurrences: [] } }),
  } as unknown as IRoutineService);
}

const meta = {
  title: 'Business/Schedule/ScheduleCalendarView',
  component: ScheduleCalendarView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  render: (_args, { parameters }) => ({
    components: { ScheduleCalendarView },
    setup() {
      installCalendarPorts(parameters);
      return {};
    },
    template: `<div style="height: 980px" data-testid="calendar-story-surface">
      <ScheduleCalendarView />
    </div>`,
  }),
} satisfies Meta<typeof ScheduleCalendarView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WeekWithMixedSources: Story = {};

export const EmptyWeek: Story = {
  parameters: { mode: 'empty' },
};

export const OverlappingWeek: Story = {
  parameters: { overlapping: true },
};

export const DayView: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByTestId('schedule-view-tab-day'));
    await expect(canvas.getByTestId('schedule-calendar-view')).toBeVisible();
    await expect(canvas.getByTestId('schedule-period-label')).not.toBeEmptyDOMElement();
  },
};
