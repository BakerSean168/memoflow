import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, userEvent, within } from 'storybook/test';
import { provide } from 'vue';
import type { TaskOccurrenceClientDTO } from '@memoflow/task-contracts';
import { GOAL_SERVICE_KEY, TASK_SERVICE_KEY } from '@task-ui-test-host/di/keys';
import type { IGoalService, ITaskService } from '@task-ui-test-host/di/types';
import TaskManagementView from './TaskManagementView.vue';
import {
  createStoryOccurrence,
  createStoryTaskPlan,
} from '../components/dialogs/task-story-fixtures';

type ManagementStoryParameters = {
  mode?: 'ready' | 'empty' | 'error' | 'loading';
};

function installManagementPorts(parameters: ManagementStoryParameters) {
  const mode = parameters.mode ?? 'ready';
  const plan = createStoryTaskPlan();
  const today = createStoryOccurrence({
    id: 'story-task-occurrence-today' as TaskOccurrenceClientDTO['id'],
    status: 'Pending',
    dueAt: Date.now() + 2 * 3_600_000,
    occurrenceKey: 'story-task-plan-1:today',
  });
  const overdue = createStoryOccurrence({
    id: 'story-task-occurrence-overdue' as TaskOccurrenceClientDTO['id'],
    status: 'InProgress',
    dueAt: Date.now() - 26 * 3_600_000,
    isOverdue: true,
    occurrenceKey: 'story-task-plan-1:overdue',
    scheduleSnapshot: {
      date: '2026-11-23' as TaskOccurrenceClientDTO['scheduleSnapshot']['date'],
      timing: { kind: 'At', time: '09:30' as never },
    },
  });

  provide(TASK_SERVICE_KEY, {
    listOccurrencesByDateRange: async () => {
      if (mode === 'loading') return new Promise(() => {});
      if (mode === 'error') throw new Error('Story double cannot reach the Task owner');
      if (mode === 'empty') return { ok: true, data: [] };
      return { ok: true, data: [overdue, today] };
    },
    getPlan: async () => ({ ok: true, data: plan }),
    listPlans: async () => ({ ok: true, data: { plans: [plan], total: 1 } }),
  } as unknown as ITaskService);
  provide(GOAL_SERVICE_KEY, {
    getGoal: async () => ({ ok: false, error: { code: 'NOT_FOUND', message: 'Story double' } }),
    getKeyResults: async () => ({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Story double' },
    }),
  } as unknown as IGoalService);
  return plan;
}

const meta = {
  title: 'Business/Task/TaskManagementView',
  component: TaskManagementView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  render: (_args, { parameters }) => ({
    components: { TaskManagementView },
    setup() {
      installManagementPorts(parameters);
      return {};
    },
    template: `<div style="height: 980px" data-testid="task-management-story-surface">
      <TaskManagementView />
    </div>`,
  }),
} satisfies Meta<typeof TaskManagementView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TodayWithOverdue: Story = {};

export const TodayEmpty: Story = {
  parameters: { mode: 'empty' },
};

export const LoadFailure: Story = {
  parameters: { mode: 'error' },
};

export const Loading: Story = {
  parameters: { mode: 'loading' },
};

export const PlansSurface: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByTestId('task-surface-trigger'));
    await userEvent.click(await canvas.findByTestId('task-surface-plans'));
    await expect(await canvas.findByTestId('task-plan-list')).toHaveTextContent(
      'Morning focus block',
    );
  },
};
