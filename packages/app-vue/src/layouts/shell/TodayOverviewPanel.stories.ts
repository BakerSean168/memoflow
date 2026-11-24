import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { expect, within } from 'storybook/test';
import type { GoalClientPort } from '@memoflow/goal-client';
import type { RoutineClientPort } from '@memoflow/routine-client';
import type { TaskClientPort } from '@memoflow/task-client';
import type { GoalHomeProgressSummary } from '@memoflow/goal-contracts';
import type { RoutineUpcomingOccurrence } from '@memoflow/routine-contracts';
import { TaskPlanScheduleSchema } from '@memoflow/task-contracts';
import {
  createMockTaskOccurrence,
  createMockTaskPlan,
} from '@memoflow/task-contracts/test-support/task.mock';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/task-contracts';
import { error, ok } from '@memoflow/transport-contracts/result';
import { useTaskStore } from '@memoflow/task-ui';
import TodayOverviewPanel from './TodayOverviewPanel.vue';
import { GOAL_SERVICE_KEY, ROUTINE_SERVICE_KEY, TASK_SERVICE_KEY } from '../../di/keys';
import {
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
  createTestServerStateRuntime,
} from '../../platform/server-state';

const now = new Date();
now.setHours(12, 0, 0, 0);
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
  now.getDate(),
).padStart(2, '0')}`;

function taskPlan(name: string, time: string): TaskPlanClientDTO {
  return createMockTaskPlan({
    name,
    status: 'Active',
    outcome: 'Open',
    schedule: TaskPlanScheduleSchema.parse({
      kind: 'OneTime',
      date: today,
      timing: { kind: 'At', time },
    }),
    labels: [],
    goalBinding: null,
    checklist: [],
  });
}

function occurrence(
  plan: TaskPlanClientDTO,
  status: TaskOccurrenceClientDTO['status'],
  hour: number,
): TaskOccurrenceClientDTO {
  const due = new Date(now);
  due.setHours(hour, 0, 0, 0);
  return createMockTaskOccurrence({
    planId: plan.id,
    status,
    importanceSnapshot: 'Moderate',
    scheduleSnapshot: {
      date: today,
      timing: { kind: 'At', time: `${String(hour).padStart(2, '0')}:00` },
    } as unknown as TaskOccurrenceClientDTO['scheduleSnapshot'],
    dueAt: due.getTime(),
    result:
      status === 'Completed'
        ? {
            kind: 'Completed',
            recordedAt: due.getTime(),
            actualDurationMinutes: 12,
            note: null,
            rating: null,
          }
        : null,
    checklistState: [],
  });
}

const morningPlan = taskPlan('Morning stretch and review', '07:30');
const reviewPlan = taskPlan('Review the quarterly architecture memo', '15:00');
const inboxPlan = taskPlan('Clear the shared inbox', '17:30');

const plans = [morningPlan, reviewPlan, inboxPlan];

const defaultOccurrences: TaskOccurrenceClientDTO[] = [
  occurrence(morningPlan, 'Completed', 7),
  occurrence(reviewPlan, 'Pending', 15),
  occurrence(inboxPlan, 'Pending', 17),
];

const longOccurrences: TaskOccurrenceClientDTO[] = Array.from({ length: 8 }, (_, index) =>
  occurrence(
    taskPlan(
      `Long-running task ${index + 1}: reconcile every workspace note and follow up with the team about the annual planning review`,
      `${String(8 + index).padStart(2, '0')}:00`,
    ),
    index === 0 ? 'Completed' : 'Pending',
    8 + index,
  ),
);

const routineItems: RoutineUpcomingOccurrence[] = [
  {
    identityId: 'identity-storybook',
    routineId: 'routine-water',
    occurrenceKey: 'routine-water-1',
    title: 'Water the balcony plants',
    description: null,
    occurrenceAt: now.getTime() + 60 * 60_000,
    endAt: null,
    revision: 1,
    editable: false,
  },
  {
    identityId: 'identity-storybook',
    routineId: 'routine-standup',
    occurrenceKey: 'routine-standup-1',
    title: 'Daily stand-up notes',
    description: 'Capture decisions and blockers for the team.',
    occurrenceAt: now.getTime() + 2 * 60 * 60_000,
    intervalMs: 24 * 60 * 60_000,
    endAt: null,
    revision: 2,
    editable: false,
  },
  {
    identityId: 'identity-storybook',
    routineId: 'routine-inbox',
    occurrenceKey: 'routine-inbox-1',
    title: 'Inbox zero sweep',
    description: null,
    occurrenceAt: now.getTime() + 3 * 60 * 60_000,
    timingStatus: 'awaiting-completion',
    endAt: null,
    revision: 1,
    editable: false,
  },
];

const goalId = (value: string): GoalHomeProgressSummary['goals'][number]['id'] =>
  value as GoalHomeProgressSummary['goals'][number]['id'];

const goalSummary: GoalHomeProgressSummary = {
  activeCount: 3,
  goals: [
    {
      id: goalId('GoalId_550e8400-e29b-41d4-a716-446655440101'),
      name: 'Ship the annual planning review',
      progress: 64,
      status: 'InProgress',
      target: { kind: 'quarter', year: 2026, quarter: 4 },
      keyResultCount: 3,
    },
    {
      id: goalId('GoalId_550e8400-e29b-41d4-a716-446655440102'),
      name: 'Build a durable morning routine',
      progress: 28,
      status: 'InProgress',
      target: null,
      keyResultCount: 2,
    },
    {
      id: goalId('GoalId_550e8400-e29b-41d4-a716-446655440103'),
      name: 'Finish the architecture reading list',
      progress: 82,
      status: 'InProgress',
      target: { kind: 'month', year: 2026, month: 12 },
      keyResultCount: 4,
    },
  ],
};

interface StoryData {
  occurrences: TaskOccurrenceClientDTO[];
  plans: TaskPlanClientDTO[];
  routines: RoutineUpcomingOccurrence[];
  goals: GoalHomeProgressSummary;
  taskFails?: boolean;
  routineFails?: boolean;
  goalFails?: boolean;
  pending?: boolean;
}

function taskService(data: StoryData): TaskClientPort {
  return {
    listOccurrencesByDateRange: async () => {
      if (data.pending) return new Promise(() => undefined);
      if (data.taskFails) return error('SERVICE_UNAVAILABLE', 'Today tasks are unavailable');
      return ok(data.occurrences);
    },
    getPlan: async (planId: string) => {
      const plan = data.plans.find((item) => item.id === planId) ?? data.plans[0];
      return plan ? ok(plan) : error('NOT_FOUND', 'Task plan not found');
    },
  } as unknown as TaskClientPort;
}

function routineService(data: StoryData): RoutineClientPort {
  return {
    getUpcomingOccurrences: async () => {
      if (data.pending) return new Promise(() => undefined);
      if (data.routineFails) return error('SERVICE_UNAVAILABLE', 'Routines are unavailable');
      return ok({ occurrences: data.routines });
    },
  } as unknown as RoutineClientPort;
}

function goalService(data: StoryData): GoalClientPort {
  return {
    getHomeSummary: async () => {
      if (data.pending) return new Promise(() => undefined);
      if (data.goalFails) return error('SERVICE_UNAVAILABLE', 'Goals are unavailable');
      return ok(data.goals);
    },
  } as unknown as GoalClientPort;
}

function renderPanel(data: StoryData, width = 'w-[26rem]', height = 'h-[52rem]') {
  return {
    components: { TodayOverviewPanel },
    setup() {
      useTaskStore().reset();
      provide(SERVER_STATE_RUNTIME_KEY, createTestServerStateRuntime());
      provide(SERVER_STATE_IDENTITY_SCOPE_KEY, () => 'storybook-today');
      provide(TASK_SERVICE_KEY, taskService(data));
      provide(ROUTINE_SERVICE_KEY, routineService(data));
      provide(GOAL_SERVICE_KEY, goalService(data));
      return {};
    },
    template: `
      <div class="bg-background p-4">
        <div class="${width} ${height} overflow-hidden rounded-xl border shadow-sm">
          <TodayOverviewPanel :active="true" />
        </div>
      </div>
    `,
  };
}

const meta = {
  title: 'Business/AppVue/TodayOverviewPanel',
  component: TodayOverviewPanel,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  render: () =>
    renderPanel({
      occurrences: defaultOccurrences,
      plans,
      routines: routineItems,
      goals: goalSummary,
    }),
} satisfies Meta<typeof TodayOverviewPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default Home overview: quick actions, today's tasks, upcoming routines and Goal progress. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('today-overview-panel')).toBeVisible();
    await expect(page.getByTestId('today-overview-date')).not.toBeEmptyDOMElement();
    await expect(page.getByTestId('daily-todo-widget')).toBeVisible();
    await expect(page.getByTestId('routine-upcoming-widget')).toBeVisible();
    await expect(page.getByTestId('goal-progress-widget')).toBeVisible();
    await expect(page.getByTestId('today-overview-create-goal')).toBeVisible();
    await expect(page.getByTestId('today-overview-create-task')).toBeVisible();
  },
};

/** Every owner returns an empty collection: each widget keeps its own empty state. */
export const Empty: Story = {
  render: () =>
    renderPanel({
      occurrences: [],
      plans: [],
      routines: [],
      goals: { activeCount: 0, goals: [] },
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('today-overview-widgets')).toBeVisible();
    await expect(page.getByTestId('goal-progress-widget')).not.toHaveTextContent('Ship the');
  },
};

/** All owner reads stay in flight, so each widget keeps its skeleton. */
export const Loading: Story = {
  render: () =>
    renderPanel({
      occurrences: [],
      plans: [],
      routines: [],
      goals: { activeCount: 0, goals: [] },
      pending: true,
    }),
};

/** Task, Routine and Goal reads fail independently; Goal offers its own retry. */
export const Error: Story = {
  render: () =>
    renderPanel({
      occurrences: [],
      plans: [],
      routines: [],
      goals: { activeCount: 0, goals: [] },
      taskFails: true,
      routineFails: true,
      goalFails: true,
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('goal-progress-widget')).toBeVisible();
  },
};

/** Long owner content scrolls inside the Home surface without widening the panel. */
export const LongContent: Story = {
  render: () =>
    renderPanel({
      occurrences: longOccurrences,
      plans,
      routines: routineItems,
      goals: {
        activeCount: 5,
        goals: Array.from({ length: 5 }, (_, index) => ({
          id: goalId(`GoalId_550e8400-e29b-41d4-a716-44665544020${index}`),
          name: `Goal ${index + 1}: a deliberately long objective name that must truncate cleanly across the widget`,
          progress: 12 + index * 15,
          status: 'InProgress' as const,
          target: null,
          keyResultCount: index + 1,
        })),
      },
    }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('today-overview-panel')).toHaveClass('overflow-y-auto');
  },
};

/** Narrow split panel: the header actions stay on one row and widgets keep full width. */
export const NarrowPanel: Story = {
  render: () =>
    renderPanel(
      { occurrences: defaultOccurrences, plans, routines: routineItems, goals: goalSummary },
      'w-[20rem]',
      'h-[44rem]',
    ),
};
