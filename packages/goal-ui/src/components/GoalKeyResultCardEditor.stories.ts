import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import type { GoalTimeframe, KeyResultCalculationMethod } from '@memoflow/goal-contracts';
import GoalKeyResultCardEditor from './GoalKeyResultCardEditor.vue';

interface EditorState {
  title: string;
  description: string;
  initialValue: number;
  currentValue: number;
  targetValue: number | '';
  target: GoalTimeframe | null;
  calculationMethod: KeyResultCalculationMethod;
  unit: string;
  weight: number;
}

function createState(overrides: Partial<EditorState> = {}): EditorState {
  return {
    title: '每周完成两次力量训练',
    description: '以训练日志为准，包含一次下肢与一次上肢。',
    initialValue: 0,
    currentValue: 6,
    targetValue: 24,
    target: { kind: 'quarter', year: 2026, quarter: 4 },
    calculationMethod: 'Sum',
    unit: '次',
    weight: 4,
    ...overrides,
  };
}

const meta = {
  title: 'Business/Goal/GoalKeyResultCardEditor',
  component: GoalKeyResultCardEditor,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [() => ({ template: '<div style="max-width: 760px;"><story /></div>' })],
  argTypes: {
    goalStart: { description: '所属目标起始时间范围' },
    goalTarget: { description: '所属目标结束时间范围' },
    disabled: { description: '只读态', control: 'boolean' },
  },
  render: (args) => ({
    components: { GoalKeyResultCardEditor },
    setup() {
      const state = ref(createState());
      return { args, state };
    },
    template: `
      <GoalKeyResultCardEditor
        v-bind="args"
        v-model:title="state.title"
        v-model:description="state.description"
        v-model:initialValue="state.initialValue"
        v-model:currentValue="state.currentValue"
        v-model:targetValue="state.targetValue"
        v-model:target="state.target"
        v-model:calculationMethod="state.calculationMethod"
        v-model:unit="state.unit"
        v-model:weight="state.weight"
      />
    `,
  }),
} satisfies Meta<typeof GoalKeyResultCardEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    ...createState(),
    goalStart: { kind: 'year', year: 2026 },
    goalTarget: { kind: 'year', year: 2026 },
    disabled: false,
  },
};

export const LastValueMethod: Story = {
  args: {
    ...createState(),
    goalStart: { kind: 'year', year: 2026 },
    goalTarget: { kind: 'year', year: 2026 },
  },
  render: (args) => ({
    components: { GoalKeyResultCardEditor },
    setup() {
      const state = ref(
        createState({
          title: '体重维持在 72kg 以下',
          description: '每次称重记录当前值。',
          initialValue: 76,
          currentValue: 73.4,
          targetValue: 72,
          calculationMethod: 'Last',
          unit: 'kg',
          weight: 5,
        }),
      );
      return { args, state };
    },
    template: `
      <GoalKeyResultCardEditor
        v-bind="args"
        v-model:title="state.title"
        v-model:description="state.description"
        v-model:initialValue="state.initialValue"
        v-model:currentValue="state.currentValue"
        v-model:targetValue="state.targetValue"
        v-model:target="state.target"
        v-model:calculationMethod="state.calculationMethod"
        v-model:unit="state.unit"
        v-model:weight="state.weight"
      />
    `,
  }),
};

export const Disabled: Story = {
  args: {
    ...createState(),
    goalStart: { kind: 'year', year: 2026 },
    goalTarget: { kind: 'year', year: 2026 },
    disabled: true,
  },
};

export const Untitled: Story = {
  args: { ...createState(), goalStart: null, goalTarget: null },
  render: (args) => ({
    components: { GoalKeyResultCardEditor },
    setup() {
      const state = ref(
        createState({
          title: '',
          description: '',
          currentValue: 0,
          targetValue: '',
          target: null,
          unit: '',
          weight: 3,
        }),
      );
      return { args, state };
    },
    template: `
      <GoalKeyResultCardEditor
        v-bind="args"
        v-model:title="state.title"
        v-model:description="state.description"
        v-model:initialValue="state.initialValue"
        v-model:currentValue="state.currentValue"
        v-model:targetValue="state.targetValue"
        v-model:target="state.target"
        v-model:calculationMethod="state.calculationMethod"
        v-model:unit="state.unit"
        v-model:weight="state.weight"
      />
    `,
  }),
};
