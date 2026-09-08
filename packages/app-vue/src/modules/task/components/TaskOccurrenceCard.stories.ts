import type { Meta, StoryObj } from '@storybook/vue3-vite';
import TaskOccurrenceCard from './TaskOccurrenceCard.vue';
import type { TaskOccurrenceViewModel } from './types';

const now = Date.now();

function createMockTask(overrides: Record<string, unknown> = {}) {
  const base: TaskOccurrenceViewModel = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    templateId: '660e8400-e29b-41d4-a716-446655440001',
    templateTitle: '每日复盘',
    isCompleted: false,
    statusText: 'PENDING',
    instanceDate: new Date(now).toISOString(),
    timeConfig: {
      timeType: 'TimePoint' as const,
      startDate: now,
      timePoint: 540, // 9:00 AM
      timeRange: null,
    },
    actualEndTime: null,
    note: '',
    instanceDateFormatted: new Date(now).toLocaleDateString(),
  };

  return {
    ...base,
    ...overrides,
  } as TaskOccurrenceViewModel;
}

const meta = {
  title: 'Business/Task/TaskOccurrenceCard',
  component: TaskOccurrenceCard,
  tags: ['autodocs'],
  argTypes: {
    showBorder: { control: 'boolean' },
  },
  args: {
    showBorder: true,
  },
} satisfies Meta<typeof TaskOccurrenceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {
  args: {
    task: createMockTask(),
  },
};

export const Completed: Story = {
  args: {
    task: createMockTask({
      isCompleted: true,
      statusText: 'COMPLETED',
      actualEndTime: new Date(now).toISOString(),
    }),
  },
};

export const AllDay: Story = {
  args: {
    task: createMockTask({
      timeConfig: {
        timeType: 'AllDay',
        startDate: now,
        timePoint: null,
        timeRange: null,
      },
    }),
  },
};

export const TimeRange: Story = {
  args: {
    task: createMockTask({
      timeConfig: {
        timeType: 'TIME_RANGE',
        startDate: now,
        timePoint: null,
        timeRange: { start: 540, end: 660 }, // 9:00 - 11:00
      },
    }),
  },
};

export const NoBorder: Story = {
  args: {
    task: createMockTask(),
    showBorder: false,
  },
};

export const TaskList: Story = {
  args: {
    task: createMockTask(),
  },
  render: () => ({
    components: { TaskOccurrenceCard },
    setup() {
      const tasks = [
        createMockTask({
          id: '1',
          isCompleted: true,
          statusText: 'COMPLETED',
          actualEndTime: new Date(now).toISOString(),
        }),
        createMockTask({
          id: '2',
          statusText: 'PENDING',
          timeConfig: { timeType: 'TimePoint', startDate: now, timePoint: 600, timeRange: null },
        }),
        createMockTask({
          id: '3',
          statusText: 'PENDING',
          timeConfig: {
            timeType: 'TimeRange',
            startDate: now,
            timePoint: null,
            timeRange: { start: 780, end: 840 },
          },
        }),
        createMockTask({
          id: '4',
          statusText: 'PENDING',
          timeConfig: { timeType: 'AllDay', startDate: now, timePoint: null, timeRange: null },
        }),
      ];
      return { tasks };
    },
    template: `
      <div class="border rounded-md max-w-lg">
        <TaskOccurrenceCard
          v-for="task in tasks"
          :key="String(task.id)"
          :task="task"
          @complete="(id) => console.log('Complete:', id)"
          @undo="(id) => console.log('Undo:', id)"
        />
      </div>
    `,
  }),
};
