import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type {
  CalendarEventProjection,
  PlannerConflictProjection,
} from '@memoflow/schedule-contracts';
import PlannerCalendar from './PlannerCalendar.vue';
import type { PlannerOwnerCommandRouter } from './index';

const day = new Date();
day.setHours(0, 0, 0, 0);
const midnight = day.getTime();

const ownerCommands: PlannerOwnerCommandRouter = {
  route: async () => ({ status: 'applied', ownerType: 'schedule.calendar-entry' }),
};

function projections(): CalendarEventProjection[] {
  return [
    {
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
        subtitle: '会议室 A',
        tone: 'default',
        status: 'Confirmed',
      },
      editableCapabilities: { move: true, resize: true },
      ownerCommandTarget: { ownerType: 'schedule.calendar-entry', ownerId: 'schedule-1' },
      revision: 4,
    },
    {
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
        subtitle: '重要',
        tone: 'accent',
        status: 'Pending',
      },
      editableCapabilities: { move: true, resize: true },
      ownerCommandTarget: { ownerType: 'task.occurrence', ownerId: 'occurrence-1' },
      revision: 2,
    },
    {
      identityId: 'identity-1',
      sourceType: 'routine',
      sourceId: 'routine-1',
      title: '每小时起身活动',
      occupancy: 'non-blocking',
      allDay: false,
      start: midnight + 15 * 3_600_000,
      end: midnight + 15.25 * 3_600_000,
      displayMetadata: {
        semantic: 'routine-wall-clock',
        subtitle: '例程提醒',
        tone: 'muted',
        status: null,
      },
      editableCapabilities: { move: false, resize: false },
      ownerCommandTarget: { ownerType: 'routine.routine', ownerId: 'routine-1' },
      revision: 1,
    },
    {
      identityId: 'identity-1',
      sourceType: 'goal',
      sourceId: 'goal-1',
      title: '年度目标截止',
      occupancy: 'marker',
      allDay: true,
      start: new Date(midnight).toISOString().slice(0, 10),
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
    },
  ] as unknown as CalendarEventProjection[];
}

function conflicts(): PlannerConflictProjection[] {
  return [
    {
      id: 'conflict-1',
      identityId: 'identity-1',
      left: { sourceType: 'schedule', sourceId: 'schedule-1' },
      right: { sourceType: 'task', sourceId: 'occurrence-1' },
      overlapRange: {
        kind: 'Timed',
        start: midnight + 14 * 3_600_000,
        end: midnight + 14.5 * 3_600_000,
      },
      overlapDurationMs: 30 * 60_000,
      severity: 'Moderate',
      suggestions: [],
    },
  ] as unknown as PlannerConflictProjection[];
}

const meta = {
  title: 'Business/Schedule/PlannerCalendar',
  component: PlannerCalendar,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    () => ({
      template:
        '<div style="height: 720px; border: 1px solid hsl(var(--border)); border-radius: 0.5rem; overflow: hidden;"><story /></div>',
    }),
  ],
  argTypes: {
    view: { description: '日 / 周 / 月视图', control: 'select' },
    loading: { description: '加载遮罩', control: 'boolean' },
    locale: { description: 'FullCalendar locale' },
  },
} satisfies Meta<typeof PlannerCalendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Week: Story = {
  args: {
    projections: projections(),
    conflicts: conflicts(),
    ownerCommands,
    view: 'week',
    loading: false,
    initialDate: Date.now(),
    locale: 'en-US',
  },
};

export const Month: Story = {
  args: {
    projections: projections(),
    conflicts: [],
    ownerCommands,
    view: 'month',
    loading: false,
    initialDate: Date.now(),
    locale: 'en-US',
  },
};

export const Day: Story = {
  args: {
    projections: projections(),
    conflicts: [],
    ownerCommands,
    view: 'day',
    loading: false,
    initialDate: Date.now(),
    locale: 'zh-CN',
  },
};

export const Loading: Story = {
  args: {
    projections: projections(),
    conflicts: [],
    ownerCommands,
    view: 'week',
    loading: true,
    initialDate: Date.now(),
    locale: 'en-US',
  },
};

export const Empty: Story = {
  args: {
    projections: [],
    conflicts: [],
    ownerCommands,
    view: 'week',
    loading: false,
    initialDate: Date.now(),
    locale: 'en-US',
  },
};
