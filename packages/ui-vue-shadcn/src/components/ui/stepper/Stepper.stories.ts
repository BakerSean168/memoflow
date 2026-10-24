import type { Meta, StoryObj } from '@storybook/vue3-vite';
import {
  Stepper,
  StepperItem,
  StepperTrigger,
  StepperIndicator,
  StepperTitle,
  StepperDescription,
  StepperSeparator,
} from '.';
import { ref } from 'vue';

const meta = {
  title: 'Atoms/Stepper',
  component: Stepper,
  tags: ['autodocs'],
} satisfies Meta<typeof Stepper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components: {
      Stepper,
      StepperItem,
      StepperTrigger,
      StepperIndicator,
      StepperTitle,
      StepperDescription,
      StepperSeparator,
    },
    setup() {
      const step = ref(1);
      const steps = [
        { step: 1, title: 'Step 1', description: 'Your details' },
        { step: 2, title: 'Step 2', description: 'Verify email' },
        { step: 3, title: 'Step 3', description: 'Complete' },
      ];
      return { step, steps };
    },
    template: `
      <Stepper v-model="step">
        <StepperItem
          v-for="item in steps"
          :key="item.step"
          :step="item.step"
          class="basis-1/3"
        >
          <StepperTrigger>
            <StepperIndicator>{{ item.step }}</StepperIndicator>
          </StepperTrigger>
          <div class="flex flex-col items-center text-center">
            <StepperTitle>{{ item.title }}</StepperTitle>
            <StepperDescription>{{ item.description }}</StepperDescription>
          </div>
          <StepperSeparator v-if="item.step < steps.length" />
        </StepperItem>
      </Stepper>
    `,
  }),
};

export const Completed: Story = {
  render: () => ({
    components: {
      Stepper,
      StepperItem,
      StepperTrigger,
      StepperIndicator,
      StepperTitle,
      StepperSeparator,
    },
    template: `
      <Stepper :model-value="3">
        <StepperItem :step="1" class="basis-1/3">
          <StepperTrigger><StepperIndicator>✓</StepperIndicator></StepperTrigger>
          <StepperTitle>Account</StepperTitle>
          <StepperSeparator />
        </StepperItem>
        <StepperItem :step="2" class="basis-1/3">
          <StepperTrigger><StepperIndicator>✓</StepperIndicator></StepperTrigger>
          <StepperTitle>Verify</StepperTitle>
          <StepperSeparator />
        </StepperItem>
        <StepperItem :step="3" class="basis-1/3">
          <StepperTrigger><StepperIndicator>3</StepperIndicator></StepperTrigger>
          <StepperTitle>Complete</StepperTitle>
        </StepperItem>
      </Stepper>
    `,
  }),
};
