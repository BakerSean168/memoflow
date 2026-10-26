import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import CreateScheduleDialog from './CreateScheduleDialog.vue';
import type { CalendarEntryClientDTO } from '@memoflow/schedule-contracts';
import { createScheduleStoryEvent } from './story-fixtures';

const now = Date.now();
const later = now + 2 * 60 * 60 * 1000;

const existingSchedule: CalendarEntryClientDTO = createScheduleStoryEvent({
  title: 'Weekly Team Standup',
  description: 'Discuss progress and blockers',
  startTime: now,
  endTime: later,
  duration: 7200,
  hasConflict: false,
  priority: 2,
  location: 'Conference Room A',
  attendees: ['alice@example.com', 'bob@example.com'],
});

const meta = {
  title: 'Business/Schedule/CreateScheduleDialog',
  component: CreateScheduleDialog,
  tags: ['autodocs'],
  argTypes: {
    loading: { control: 'boolean' },
  },
  args: {
    modelValue: true,
    loading: false,
    onSubmit: async () => true,
  },
} satisfies Meta<typeof CreateScheduleDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { CreateScheduleDialog },
    setup() {
      const open = ref(args.modelValue);
      return { args, open };
    },
    template: '<CreateScheduleDialog v-bind="args" v-model="open" />',
  }),
  args: {
    modelValue: true,
  },
};

export const EditMode: Story = {
  render: (args) => ({
    components: { CreateScheduleDialog },
    setup() {
      const open = ref(true);
      return { args, open };
    },
    template: '<CreateScheduleDialog v-bind="args" v-model="open" />',
  }),
  args: {
    modelValue: true,
    schedule: existingSchedule,
  },
};

export const Loading: Story = {
  render: (args) => ({
    components: { CreateScheduleDialog },
    setup() {
      const open = ref(true);
      return { args, open };
    },
    template: '<CreateScheduleDialog v-bind="args" v-model="open" />',
  }),
  args: {
    modelValue: true,
    loading: true,
  },
};
