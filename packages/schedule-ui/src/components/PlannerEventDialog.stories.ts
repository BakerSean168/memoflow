import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import type { CalendarEventProjection } from '@memoflow/schedule-contracts';
import PlannerEventDialog from './PlannerEventDialog.vue';

const day = new Date();
day.setHours(0, 0, 0, 0);
const midnight = day.getTime();

const scheduleEvent = {
  identityId: 'identity-1',
  sourceType: 'schedule',
  sourceId: 'schedule-1',
  title: '产品评审会',
  occupancy: 'blocking',
  allDay: false,
  start: midnight + 10 * 3_600_000,
  end: midnight + 11.5 * 3_600_000,
  displayMetadata: {
    semantic: 'calendar-entry',
    subtitle: '会议室 A，评审 Q4 路线图。',
    tone: 'default',
    status: 'Confirmed',
  },
  editableCapabilities: { move: true, resize: true },
  ownerCommandTarget: { ownerType: 'schedule.calendar-entry', ownerId: 'schedule-1' },
  revision: 4,
} as unknown as CalendarEventProjection;

const taskEvent = {
  identityId: 'identity-1',
  sourceType: 'task',
  sourceId: 'occurrence-1',
  title: '完成季度架构评审材料',
  occupancy: 'blocking',
  allDay: false,
  start: midnight + 14 * 3_600_000,
  end: midnight + 15 * 3_600_000,
  displayMetadata: {
    semantic: 'task-occurrence',
    subtitle: '整理三个交付面的变更与风险。',
    tone: 'accent',
    status: 'Pending',
  },
  editableCapabilities: { move: true, resize: true },
  ownerCommandTarget: { ownerType: 'task.occurrence', ownerId: 'occurrence-1' },
  revision: 2,
} as unknown as CalendarEventProjection;

const goalEvent = {
  identityId: 'identity-1',
  sourceType: 'goal',
  sourceId: 'goal-1',
  title: '年度目标截止',
  occupancy: 'marker',
  allDay: true,
  start: '2026-12-31',
  end: null,
  displayMetadata: {
    semantic: 'goal-target',
    subtitle: '技术能力提升',
    tone: 'success',
    status: null,
  },
  editableCapabilities: { move: false, resize: false },
  ownerCommandTarget: { ownerType: 'goal.goal', ownerId: 'goal-1' },
  revision: 1,
} as unknown as CalendarEventProjection;

const meta = {
  title: 'Business/Schedule/PlannerEventDialog',
  component: PlannerEventDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    open: { description: '是否打开', control: 'boolean' },
    event: { description: '日历事件投影' },
    hasConflict: { description: '是否展示冲突提示', control: 'boolean' },
  },
  render: (args) => ({
    components: { PlannerEventDialog },
    setup() {
      const open = ref(true);
      return { args, open };
    },
    template:
      '<div style="height: 640px"><PlannerEventDialog v-bind="args" v-model:open="open" /></div>',
  }),
} satisfies Meta<typeof PlannerEventDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ScheduleEntry: Story = {
  args: { open: true, event: scheduleEvent, hasConflict: false },
};

export const ScheduleEntryWithConflict: Story = {
  args: { open: true, event: scheduleEvent, hasConflict: true },
};

export const TaskOccurrence: Story = {
  args: { open: true, event: taskEvent, hasConflict: false },
};

export const GoalMarker: Story = {
  args: { open: true, event: goalEvent, hasConflict: false },
};
