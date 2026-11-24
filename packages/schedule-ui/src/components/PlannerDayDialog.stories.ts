import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import type { CalendarEventProjection } from '@memoflow/schedule-contracts';
import { derivePlannerConflicts } from '@memoflow/schedule-client';
import PlannerDayDialog from './PlannerDayDialog.vue';

const day = new Date(2026, 10, 24);
day.setHours(0, 0, 0, 0);
const midnight = day.getTime();
const hour = 3_600_000;

const scheduleEntry = {
  identityId: 'identity-story',
  sourceType: 'schedule',
  sourceId: 'schedule-story-1',
  title: 'Quarterly architecture review',
  occupancy: 'blocking',
  allDay: false,
  start: midnight + 10 * hour,
  end: midnight + 11.5 * hour,
  displayMetadata: {
    semantic: 'calendar-entry',
    subtitle: 'Room A · rollout risks and open decisions',
    tone: 'default',
    status: 'Confirmed',
  },
  editableCapabilities: { move: true, resize: true },
  ownerCommandTarget: { ownerType: 'schedule.calendar-entry', ownerId: 'schedule-story-1' },
  revision: 4,
} as unknown as CalendarEventProjection;

const taskOccurrence = {
  identityId: 'identity-story',
  sourceType: 'task',
  sourceId: 'occurrence-story-1',
  title: 'Write the rollout risks section',
  occupancy: 'blocking',
  allDay: false,
  start: midnight + 14 * hour,
  end: midnight + 15 * hour,
  displayMetadata: {
    semantic: 'task-occurrence',
    subtitle: 'Morning focus block',
    tone: 'accent',
    status: 'Pending',
  },
  editableCapabilities: { move: true, resize: true },
  ownerCommandTarget: { ownerType: 'task.occurrence', ownerId: 'occurrence-story-1' },
  revision: 2,
} as unknown as CalendarEventProjection;

const goalMarker = {
  identityId: 'identity-story',
  sourceType: 'goal',
  sourceId: 'goal-story-1',
  title: 'Deep-work system quarter ends',
  occupancy: 'marker',
  allDay: true,
  start: '2026-12-31',
  end: null,
  displayMetadata: {
    semantic: 'goal-target',
    subtitle: 'Build a sustainable deep-work system',
    tone: 'success',
    status: null,
  },
  editableCapabilities: { move: false, resize: false },
  ownerCommandTarget: { ownerType: 'goal.goal', ownerId: 'goal-story-1' },
  revision: 1,
} as unknown as CalendarEventProjection;

const overlappingSecondEntry = {
  ...scheduleEntry,
  sourceId: 'schedule-story-2',
  title: 'Design sync moved into the review',
  start: midnight + 11 * hour,
  end: midnight + 12 * hour,
  ownerCommandTarget: { ownerType: 'schedule.calendar-entry', ownerId: 'schedule-story-2' },
  revision: 1,
} as unknown as CalendarEventProjection;

const fullDayEvents = [scheduleEntry, taskOccurrence, goalMarker];
const overlappingEvents = [scheduleEntry, overlappingSecondEntry];

const meta = {
  title: 'Business/Schedule/PlannerDayDialog',
  component: PlannerDayDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    open: { description: 'Whether the day detail surface is open', control: 'boolean' },
    events: { description: 'Canonical Planner projections for the selected day' },
    conflicts: { description: 'Derived hard conflicts for the same projections' },
  },
  render: (args) => ({
    components: { PlannerDayDialog },
    setup() {
      const open = ref(true);
      return { args, open };
    },
    template: `<div style="height: 820px">
      <PlannerDayDialog v-bind="args" v-model:open="open" />
    </div>`,
  }),
} satisfies Meta<typeof PlannerDayDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyDay: Story = {
  args: { open: true, date: day, events: [], conflicts: [] },
};

export const FullDay: Story = {
  args: { open: true, date: day, events: fullDayEvents, conflicts: [] },
};

export const OverlappingEvents: Story = {
  args: {
    open: true,
    date: day,
    events: overlappingEvents,
    conflicts: derivePlannerConflicts(overlappingEvents),
  },
};

export const LongEventTitles: Story = {
  args: {
    open: true,
    date: day,
    events: [
      {
        ...scheduleEntry,
        sourceId: 'schedule-story-long',
        title:
          'Cross-team working session with platform, design and the customer success group about the rollout plan',
        ownerCommandTarget: {
          ownerType: 'schedule.calendar-entry',
          ownerId: 'schedule-story-long',
        },
      },
      { ...goalMarker, sourceId: 'goal-story-long' },
    ] as CalendarEventProjection[],
    conflicts: [],
  },
};
