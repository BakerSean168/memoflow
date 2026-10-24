import type { Meta, StoryObj } from '@storybook/vue3-vite';
import {
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
} from '.';
import { Label } from '../label';
import { ref } from 'vue';

const meta = {
  title: 'Atoms/NumberField',
  component: NumberField,
  tags: ['autodocs'],
} satisfies Meta<typeof NumberField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components: {
      NumberField,
      NumberFieldContent,
      NumberFieldDecrement,
      NumberFieldIncrement,
      NumberFieldInput,
      Label,
    },
    setup() {
      const value = ref(5);
      return { value };
    },
    template: `
      <NumberField v-model="value" :min="0" :max="100">
        <Label>Quantity</Label>
        <NumberFieldContent>
          <NumberFieldDecrement />
          <NumberFieldInput />
          <NumberFieldIncrement />
        </NumberFieldContent>
      </NumberField>
    `,
  }),
};

export const WithStep: Story = {
  render: () => ({
    components: {
      NumberField,
      NumberFieldContent,
      NumberFieldDecrement,
      NumberFieldIncrement,
      NumberFieldInput,
    },
    setup() {
      const value = ref(0);
      return { value };
    },
    template: `
      <NumberField v-model="value" :min="0" :max="100" :step="5">
        <NumberFieldContent>
          <NumberFieldDecrement />
          <NumberFieldInput />
          <NumberFieldIncrement />
        </NumberFieldContent>
      </NumberField>
    `,
  }),
};

export const Disabled: Story = {
  render: () => ({
    components: {
      NumberField,
      NumberFieldContent,
      NumberFieldDecrement,
      NumberFieldIncrement,
      NumberFieldInput,
    },
    template: `
      <NumberField :default-value="10" disabled>
        <NumberFieldContent>
          <NumberFieldDecrement />
          <NumberFieldInput />
          <NumberFieldIncrement />
        </NumberFieldContent>
      </NumberField>
    `,
  }),
};
