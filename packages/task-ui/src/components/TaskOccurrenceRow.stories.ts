import type { Meta, StoryObj } from '@storybook/vue3-vite';
import {
  createMockTaskOccurrence,
  createMockTaskPlan,
} from '@memoflow/task-contracts/test-support/task.mock';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/task-contracts';
import { TaskPlanScheduleSchema } from '@memoflow/task-contracts';
import TaskOccurrenceRow from './TaskOccurrenceRow.vue';

const now = Date.now();

const plan = createMockTaskPlan({
  name: '完成季度架构评审材料',
  description: '整理三个交付面的变更与风险。',
  status: 'Active',
  outcome: 'Open',
  schedule: TaskPlanScheduleSchema.parse({
    kind: 'OneTime',
    date: '2026-11-14',
    timing: { kind: 'At', time: '15:00' },
  }),
  labels: [],
  goalBinding: null,
  checklist: [
    { id: 'check-1', title: '整理变更清单', order: 0 },
    { id: 'check-2', title: '补充性能数据', order: 1 },
    { id: 'check-3', title: '同步风险与后续计划', order: 2 },
  ] as unknown as TaskPlanClientDTO['checklist'],
});

function mockOccurrence(overrides: Partial<TaskOccurrenceClientDTO> = {}): TaskOccurrenceClientDTO {
  return createMockTaskOccurrence({
    planId: plan.id,
    status: 'Pending',
    importanceSnapshot: 'Important',
    scheduleSnapshot: {
      date: '2026-11-14',
      timing: { kind: 'At', time: '15:00' },
    } as unknown as TaskOccurrenceClientDTO['scheduleSnapshot'],
    dueAt: now + 2 * 86_400_000,
    isOverdue: false,
    result: null,
    checklistState: [],
    ...overrides,
  });
}

const meta = {
  title: 'Business/Task/TaskOccurrenceRow',
  component: TaskOccurrenceRow,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    () => ({
      template:
        '<div class="@container/panel" style="max-width: 760px; border: 1px solid hsl(var(--border)); border-radius: 0.5rem;"><story /></div>',
    }),
  ],
  argTypes: {
    occurrence: { description: '任务实例 DTO' },
    template: { description: '任务计划 DTO' },
    position: { description: '重复周期中的位置' },
    busy: { description: '操作进行中', control: 'boolean' },
    inspect: { description: '点击打开详情而非计划', control: 'boolean' },
    now: { description: '用于判定逾期的时间戳' },
  },
} satisfies Meta<typeof TaskOccurrenceRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {
  args: { occurrence: mockOccurrence(), template: plan, now },
};

export const WithChecklist: Story = {
  args: {
    occurrence: mockOccurrence({
      checklistState: [
        {
          definitionId: 'check-1',
          titleSnapshot: '整理变更清单',
          orderSnapshot: 0,
          completed: true,
          completedAt: now - 3_600_000,
        },
        {
          definitionId: 'check-2',
          titleSnapshot: '补充性能数据',
          orderSnapshot: 1,
          completed: false,
          completedAt: null,
        },
        {
          definitionId: 'check-3',
          titleSnapshot: '同步风险与后续计划',
          orderSnapshot: 2,
          completed: false,
          completedAt: null,
        },
      ],
    }),
    template: plan,
    now,
  },
};

export const Completed: Story = {
  args: {
    occurrence: mockOccurrence({
      status: 'Completed',
      result: {
        kind: 'Completed',
        recordedAt: now - 1_800_000,
        actualDurationMinutes: 45,
        note: '评审通过。',
        rating: 4,
      },
    }),
    template: plan,
    now,
  },
};

export const Missed: Story = {
  args: {
    occurrence: mockOccurrence({
      status: 'Missed',
      dueAt: now - 86_400_000,
      result: { kind: 'Missed', recordedAt: now - 86_400_000, reason: null },
    }),
    template: plan,
    now,
  },
};

export const Overdue: Story = {
  args: {
    occurrence: mockOccurrence({ dueAt: now - 3_600_000 }),
    template: plan,
    now,
  },
};

export const RecurringPosition: Story = {
  args: {
    occurrence: mockOccurrence(),
    template: {
      ...plan,
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
    } as TaskPlanClientDTO,
    position: { position: 2, total: 3 },
    now,
  },
};

export const Busy: Story = {
  args: { occurrence: mockOccurrence(), template: plan, busy: true, now },
};
