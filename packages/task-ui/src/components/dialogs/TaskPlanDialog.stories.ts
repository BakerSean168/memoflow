import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide, ref } from 'vue';
import { GOAL_SERVICE_KEY, LABEL_SERVICE_KEY } from '@task-ui-test-host/di/keys';
import type { IGoalService, ILabelService } from '@task-ui-test-host/di/types';
import { TaskPlanScheduleSchema } from '@memoflow/task-contracts';
import type { TaskPlanViewModel } from '../types';
import TaskPlanDialog from './TaskPlanDialog.vue';

const recurringTask: TaskPlanViewModel = {
  id: 'task-plan-1',
  title: '每周三次力量训练',
  description: '以训练日志为准，包含一次下肢与一次上肢。',
  status: 'Active',
  isActive: true,
  isPaused: false,
  isArchived: false,
  importance: 'Important',
  labels: [],
  labelIds: [],
  goalBinding: null,
  checklist: [],
  schedule: TaskPlanScheduleSchema.parse({
    kind: 'Recurring',
    startDate: '2026-11-02',
    timing: { kind: 'At', time: '19:30' },
    recurrence: {
      frequency: 'Weekly',
      interval: 1,
      byWeekday: [1, 3, 5],
      end: { kind: 'Never' },
    },
  }),
  reminderConfig: null,
  occurrenceCount: 18,
  completedOccurrenceCount: 12,
  pendingOccurrenceCount: 2,
  completionRate: 66.7,
  futurePendingOccurrenceCount: 2,
};

const goals = [
  {
    id: 'goal-1',
    name: '技术能力提升',
    summary: '全年聚焦架构设计与工程效率。',
    status: 'InProgress',
  },
];

function storyDecorator(args: Record<string, unknown>) {
  return {
    components: { TaskPlanDialog },
    setup() {
      provide(GOAL_SERVICE_KEY, {
        listGoals: async () => ({
          ok: true,
          data: {
            goals,
            pagination: {
              page: 1,
              pageSize: 100,
              total: goals.length,
              hasMore: false,
              totalPages: 1,
            },
          },
        }),
        getGoalAggregateView: async () => ({
          ok: true,
          data: { goal: goals[0], keyResults: [], reviews: [] },
        }),
      } as unknown as IGoalService);
      provide(LABEL_SERVICE_KEY, {
        listLabels: async () => ({ ok: true, data: [] }),
      } as unknown as ILabelService);
      const open = ref(true);
      return { args: { ...args, modelValue: true }, open };
    },
    template: '<div style="height: 900px"><TaskPlanDialog v-bind="args" v-model="open" /></div>',
  };
}

const meta = {
  title: 'Business/Task/TaskPlanDialog',
  component: TaskPlanDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    modelValue: { description: '是否打开', control: 'boolean' },
    mode: { description: '创建 / 编辑 / 复制', control: 'select' },
    template: { description: '编辑态的 TaskPlanViewModel' },
    saving: { description: '保存中', control: 'boolean' },
  },
  render: (args) => storyDecorator(args as unknown as Record<string, unknown>),
} satisfies Meta<typeof TaskPlanDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {
  args: { modelValue: true, mode: 'create', template: null, saving: false },
};

export const Edit: Story = {
  args: { modelValue: true, mode: 'edit', template: recurringTask, saving: false },
};

export const Copy: Story = {
  args: { modelValue: true, mode: 'copy', template: recurringTask, saving: false },
};
