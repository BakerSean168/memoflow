import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { TASK_SERVICE_KEY } from '@task-ui-test-host/di/keys';
import type { TaskClientPort } from '@memoflow/task-client';
import { TaskPlanScheduleSchema } from '@memoflow/task-contracts';
import {
  createMockTaskOccurrence,
  createMockTaskPlan,
} from '@memoflow/task-contracts/test-support/task.mock';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/task-contracts';
import DailyTodoWidget from './DailyTodoWidget.vue';

const now = new Date();
now.setHours(12, 0, 0, 0);
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
  now.getDate(),
).padStart(2, '0')}`;

const firstPlan = createMockTaskPlan({
  name: '完成季度架构评审材料',
  status: 'Active',
  outcome: 'Open',
  schedule: TaskPlanScheduleSchema.parse({
    kind: 'OneTime',
    date: today,
    timing: { kind: 'At', time: '15:00' },
  }),
  labels: [],
  goalBinding: null,
  checklist: [],
});

const secondPlan = createMockTaskPlan({
  name: '晨间拉伸',
  status: 'Active',
  outcome: 'Open',
  schedule: TaskPlanScheduleSchema.parse({
    kind: 'Recurring',
    startDate: today,
    timing: { kind: 'At', time: '07:30' },
    recurrence: {
      frequency: 'Daily',
      interval: 1,
      byWeekday: [],
      end: { kind: 'Never' },
    },
  }),
  labels: [],
  goalBinding: null,
  checklist: [],
});

function mockOccurrence(
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

const occurrences = [
  mockOccurrence(firstPlan, 'Pending', 15),
  mockOccurrence(secondPlan, 'Completed', 7),
];

function renderWithData(occurrenceData: TaskOccurrenceClientDTO[]) {
  return {
    components: { DailyTodoWidget },
    setup() {
      provide(TASK_SERVICE_KEY, {
        listOccurrencesByDateRange: async () => ({ ok: true, data: occurrenceData }),
        getPlan: async (id: string) => ({
          ok: true,
          data: id === String(secondPlan.id) ? secondPlan : firstPlan,
        }),
      } as unknown as TaskClientPort);
      return {};
    },
    template:
      '<div style="width: 380px; padding: 1rem; background: hsl(var(--workspace-business));"><DailyTodoWidget /></div>',
  };
}

const meta = {
  title: 'Business/Task/DailyTodoWidget',
  component: DailyTodoWidget,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    active: { description: '活动面板时加载今日数据', control: 'boolean' },
  },
} satisfies Meta<typeof DailyTodoWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { active: true },
  render: () => renderWithData(occurrences),
};

export const Empty: Story = {
  args: { active: true },
  render: () => renderWithData([]),
};

export const AllCompleted: Story = {
  args: { active: true },
  render: () =>
    renderWithData([
      mockOccurrence(firstPlan, 'Completed', 15),
      mockOccurrence(secondPlan, 'Completed', 7),
    ]),
};
