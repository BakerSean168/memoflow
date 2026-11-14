import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import ActiveUsageTriggerEditor from './ActiveUsageTriggerEditor.vue';
import ElapsedTriggerEditor from './ElapsedTriggerEditor.vue';
import WallClockTriggerEditor from './WallClockTriggerEditor.vue';
import type {
  RoutineActiveAnchor,
  RoutineElapsedAnchor,
  RoutineFrequency,
} from './routine-editor.types';

const modelArgs = {
  activeMinutes: 50,
  naturalBreakMinutes: 5,
  anchor: 'last-satisfied' as RoutineActiveAnchor,
};

const meta = {
  title: 'Business/Routine/TriggerEditors',
  component: ActiveUsageTriggerEditor,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    () => ({
      template:
        '<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; max-width: 640px;"><story /></div>',
    }),
  ],
  argTypes: {
    disabled: { description: '只读态', control: 'boolean' },
  },
} satisfies Meta<typeof ActiveUsageTriggerEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveUsage: Story = {
  args: { ...modelArgs, disabled: false },
  render: (args) => ({
    components: { ActiveUsageTriggerEditor },
    setup() {
      const activeMinutes = ref(50);
      const naturalBreakMinutes = ref(5);
      const anchor = ref<RoutineActiveAnchor>('last-satisfied');
      return { args, activeMinutes, naturalBreakMinutes, anchor };
    },
    template: `
      <ActiveUsageTriggerEditor
        v-bind="args"
        v-model:activeMinutes="activeMinutes"
        v-model:naturalBreakMinutes="naturalBreakMinutes"
        v-model:anchor="anchor"
      />
    `,
  }),
};

export const ActiveUsageProfileAnchor: Story = {
  args: { ...modelArgs, disabled: false },
  render: (args) => ({
    components: { ActiveUsageTriggerEditor },
    setup() {
      const activeMinutes = ref(120);
      const naturalBreakMinutes = ref(10);
      const anchor = ref<RoutineActiveAnchor>('profile-activation');
      return { args, activeMinutes, naturalBreakMinutes, anchor };
    },
    template: `
      <ActiveUsageTriggerEditor
        v-bind="args"
        v-model:activeMinutes="activeMinutes"
        v-model:naturalBreakMinutes="naturalBreakMinutes"
        v-model:anchor="anchor"
      />
    `,
  }),
};

export const Elapsed: Story = {
  args: { ...modelArgs, disabled: false },
  render: (args) => ({
    components: { ElapsedTriggerEditor },
    setup() {
      const durationMinutes = ref(50);
      const anchor = ref<RoutineElapsedAnchor>('routine-activation');
      return { args, durationMinutes, anchor };
    },
    template: `
      <ElapsedTriggerEditor
        v-bind="args"
        v-model:durationMinutes="durationMinutes"
        v-model:anchor="anchor"
      />
    `,
  }),
};

export const WallClock: Story = {
  args: { ...modelArgs, disabled: false },
  render: (args) => ({
    components: { WallClockTriggerEditor },
    setup() {
      const localTime = ref('09:00');
      const startDate = ref('2026-11-02');
      const frequency = ref<RoutineFrequency>('weekly');
      const recurrenceInterval = ref(1);
      const selectedWeekdays = ref<number[]>([1, 3, 5]);
      const timeZone = ref('Asia/Shanghai');
      return {
        args,
        localTime,
        startDate,
        frequency,
        recurrenceInterval,
        selectedWeekdays,
        timeZone,
      };
    },
    template: `
      <div style="width: 100%; max-width: 640px;">
        <WallClockTriggerEditor
          v-bind="args"
          v-model:localTime="localTime"
          v-model:startDate="startDate"
          v-model:frequency="frequency"
          v-model:recurrenceInterval="recurrenceInterval"
          v-model:selectedWeekdays="selectedWeekdays"
          v-model:timeZone="timeZone"
        />
      </div>
    `,
  }),
};

export const Disabled: Story = {
  args: { ...modelArgs, disabled: true },
  render: (args) => ({
    components: { ActiveUsageTriggerEditor, ElapsedTriggerEditor },
    setup() {
      const activeMinutes = ref(50);
      const naturalBreakMinutes = ref(5);
      const activeAnchor = ref<RoutineActiveAnchor>('last-satisfied');
      const durationMinutes = ref(45);
      const elapsedAnchor = ref<RoutineElapsedAnchor>('last-satisfied');
      return {
        args,
        activeMinutes,
        naturalBreakMinutes,
        activeAnchor,
        durationMinutes,
        elapsedAnchor,
      };
    },
    template: `
      <ActiveUsageTriggerEditor
        v-bind="args"
        v-model:activeMinutes="activeMinutes"
        v-model:naturalBreakMinutes="naturalBreakMinutes"
        v-model:anchor="activeAnchor"
      />
      <ElapsedTriggerEditor
        v-bind="args"
        v-model:durationMinutes="durationMinutes"
        v-model:anchor="elapsedAnchor"
      />
    `,
  }),
};
