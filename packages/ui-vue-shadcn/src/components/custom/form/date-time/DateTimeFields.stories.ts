import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { asHm, asYmd } from '@memoflow/time';
import DateField from './DateField.vue';
import DateTimeField from './DateTimeField.vue';
import DurationField from './DurationField.vue';
import ReminderOffsetField from './ReminderOffsetField.vue';
import SegmentedTimeInput from './SegmentedTimeInput.vue';
import TimeField from './TimeField.vue';

const meta: Meta<typeof DateTimeField> = {
  title: 'Custom/Form/DateTimeFields',
  component: DateTimeField,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DateTimeField>;

export const Filled: Story = {
  render: () => ({
    components: { DateField, TimeField, DateTimeField, DurationField, ReminderOffsetField },
    setup() {
      const date = ref(asYmd('2026-08-25'));
      const time = ref(asHm('09:30'));
      const dateTime = ref({ date: asYmd('2026-08-25'), time: asHm('09:30'), allDay: false });
      const duration = ref(40);
      const offset = ref(15);
      return { date, time, dateTime, duration, offset };
    },
    template: `
      <div class="grid max-w-md gap-4 p-4">
        <DateField v-model="date" label="Due date" locale="en-US" />
        <TimeField v-model="time" label="Start time" />
        <DateTimeField v-model="dateTime" date-label="Session date" time-label="Session time" />
        <DurationField v-model="duration" label="Focus duration" />
        <ReminderOffsetField v-model="offset" />
      </div>
    `,
  }),
};

export const Empty: Story = {
  render: () => ({
    components: { DateTimeField },
    setup() {
      const value = ref({ date: null, time: null, allDay: false });
      return { value };
    },
    template: '<div class="max-w-sm p-4"><DateTimeField v-model="value" /></div>',
  }),
};

export const Disabled: Story = {
  render: () => ({
    components: { DateTimeField },
    setup() {
      return { value: ref({ date: asYmd('2026-08-25'), time: asHm('12:00'), allDay: false }) };
    },
    template: '<div class="max-w-sm p-4"><DateTimeField v-model="value" disabled /></div>',
  }),
};

export const ErrorState: Story = {
  render: () => ({
    components: { DateTimeField },
    setup() {
      return { value: ref({ date: null, time: null, allDay: false }) };
    },
    template: `
      <div class="max-w-sm p-4">
        <DateTimeField
          v-model="value"
          date-error="Choose a date"
          time-error="Choose a time"
        />
      </div>
    `,
  }),
};

export const NarrowPanel: Story = {
  render: () => ({
    components: { DateTimeField },
    setup() {
      return { value: ref({ date: null, time: null, allDay: false }) };
    },
    template: '<div class="w-[240px] p-3"><DateTimeField v-model="value" /></div>',
  }),
};

export const SegmentedTimeHm: Story = {
  render: () => ({
    components: { SegmentedTimeInput },
    setup() {
      const value = ref('09:30');
      return { value };
    },
    template: `
      <div class="flex max-w-xs items-center gap-3 p-4">
        <SegmentedTimeInput v-model="value" label="Routine time" />
        <span class="text-xs tabular-nums text-muted-foreground">{{ value }}</span>
      </div>
    `,
  }),
};

export const SegmentedTimeWithSeconds: Story = {
  render: () => ({
    components: { SegmentedTimeInput },
    setup() {
      const value = ref('13:23:45');
      return { value };
    },
    template: `
      <div class="flex max-w-xs items-center gap-3 p-4">
        <SegmentedTimeInput v-model="value" with-seconds label="Exact time" />
        <span class="text-xs tabular-nums text-muted-foreground">{{ value }}</span>
      </div>
    `,
  }),
};

export const SegmentedTimeDisabled: Story = {
  render: () => ({
    components: { SegmentedTimeInput },
    setup() {
      return { value: ref('23:59') };
    },
    template: '<div class="max-w-xs p-4"><SegmentedTimeInput v-model="value" disabled /></div>',
  }),
};

export const SegmentedTimeInvalid: Story = {
  render: () => ({
    components: { SegmentedTimeInput },
    setup() {
      return { value: ref('09:30') };
    },
    template: `
      <div class="max-w-xs space-y-1.5 p-4">
        <SegmentedTimeInput v-model="value" invalid aria-describedby="segmented-time-error" />
        <p id="segmented-time-error" class="text-xs text-destructive" role="alert">
          Choose a valid time
        </p>
      </div>
    `,
  }),
};
