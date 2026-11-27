import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import type { RoutineDefinitionDto, RoutineProfileDto } from '@memoflow/routine-contracts';
import RoutineEditorDialog from './RoutineEditorDialog.vue';

const profiles = [
  {
    id: 'profile-work',
    name: '工作时段',
    description: '工作日 09:00 – 18:00',
    enabled: true,
    active: true,
    version: 1,
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-11-10T08:00:00.000Z',
  },
  {
    id: 'profile-evening',
    name: '晚间个人',
    description: null,
    enabled: true,
    active: false,
    version: 2,
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-11-11T08:00:00.000Z',
  },
] as unknown as RoutineProfileDto[];

const wallClockRoutine = {
  id: 'routine-1',
  name: '睡前准备',
  description: '开始晚间放松流程，逐步减少刺激性活动。',
  enabled: true,
  trigger: {
    type: 'WallClock',
    timingOwner: 'scheduler',
    localTime: '23:30',
    timeZone: 'Asia/Shanghai',
    recurrence: {
      startDate: '2026-11-22',
      frequency: 'daily',
      interval: 1,
      byWeekday: [],
      count: null,
      until: null,
    },
  },
  version: 3,
  createdAt: '2026-10-20T08:00:00.000Z',
  updatedAt: '2026-11-10T08:00:00.000Z',
} as unknown as RoutineDefinitionDto;

const weeklyWallClockRoutine = {
  ...wallClockRoutine,
  id: 'routine-weekly',
  name: '工作日晨间复盘',
  description: '每周一、三、五早上固定时间梳理当天重点。',
  trigger: {
    type: 'WallClock',
    timingOwner: 'scheduler',
    localTime: '09:00',
    timeZone: 'Asia/Shanghai',
    recurrence: {
      startDate: '2026-11-22',
      frequency: 'weekly',
      interval: 1,
      byWeekday: [1, 3, 5],
      count: null,
      until: null,
    },
  },
} as unknown as RoutineDefinitionDto;

const elapsedRoutine = {
  ...wallClockRoutine,
  id: 'routine-elapsed',
  name: '定时站立拉伸',
  description: '每 50 分钟起身活动一次。',
  trigger: {
    type: 'Elapsed',
    timingOwner: 'scheduler',
    durationMs: 50 * 60_000,
    anchor: 'last-satisfied',
  },
} as unknown as RoutineDefinitionDto;

const meta = {
  title: 'Business/Routine/RoutineEditorDialog',
  component: RoutineEditorDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    open: { description: '是否打开', control: 'boolean' },
    saving: { description: '保存中', control: 'boolean' },
    submitError: { description: '提交错误' },
    routine: { description: '编辑的例程；为空时创建' },
    profiles: { description: '可用档案' },
    localRuntimeAvailable: { description: '本地运行时是否可用', control: 'boolean' },
  },
  render: (args) => ({
    components: { RoutineEditorDialog },
    setup() {
      const open = ref(true);
      return { args, open };
    },
    template:
      '<div style="height: 900px"><RoutineEditorDialog v-bind="args" v-model:open="open" /></div>',
  }),
} satisfies Meta<typeof RoutineEditorDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {
  args: {
    open: true,
    saving: false,
    submitError: null,
    routine: null,
    profiles,
    membershipProfileIds: [],
    preset: null,
    localRuntimeAvailable: false,
  },
};

export const EditWallClock: Story = {
  args: {
    open: true,
    saving: false,
    submitError: null,
    routine: wallClockRoutine,
    profiles,
    membershipProfileIds: ['profile-work'],
    preset: null,
    localRuntimeAvailable: true,
  },
};

export const SaveFailure: Story = {
  args: {
    open: true,
    saving: false,
    submitError: '保存失败，请检查网络后重试。',
    routine: wallClockRoutine,
    profiles,
    membershipProfileIds: ['profile-work'],
    preset: null,
    localRuntimeAvailable: true,
  },
};

export const Saving: Story = {
  args: {
    open: true,
    saving: true,
    submitError: null,
    routine: wallClockRoutine,
    profiles,
    membershipProfileIds: ['profile-work'],
    preset: null,
    localRuntimeAvailable: true,
  },
};

export const EditWeeklyWallClock: Story = {
  args: {
    open: true,
    saving: false,
    submitError: null,
    routine: weeklyWallClockRoutine,
    profiles,
    membershipProfileIds: ['profile-work'],
    preset: null,
    localRuntimeAvailable: true,
  },
};

export const PanelWallClock: Story = {
  args: {
    open: true,
    presentation: 'panel',
    saving: false,
    submitError: null,
    routine: weeklyWallClockRoutine,
    profiles,
    membershipProfileIds: ['profile-work'],
    preset: null,
    localRuntimeAvailable: true,
  },
};

export const ElapsedMode: Story = {
  args: {
    open: true,
    saving: false,
    submitError: null,
    routine: elapsedRoutine,
    profiles,
    membershipProfileIds: [],
    preset: null,
    localRuntimeAvailable: true,
  },
};

export const NarrowWallClock: Story = {
  args: {
    open: true,
    presentation: 'panel',
    saving: false,
    submitError: null,
    routine: weeklyWallClockRoutine,
    profiles,
    membershipProfileIds: ['profile-work'],
    preset: null,
    localRuntimeAvailable: true,
  },
  render: (args) => ({
    components: { RoutineEditorDialog },
    setup() {
      const open = ref(true);
      return { args, open };
    },
    template:
      '<div style="width: 375px; height: 780px; position: relative; overflow: hidden; border: 1px solid hsl(var(--border));"><RoutineEditorDialog v-bind="args" v-model:open="open" /></div>',
  }),
};
