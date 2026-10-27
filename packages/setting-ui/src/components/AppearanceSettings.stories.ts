import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import AppearanceSettings from './AppearanceSettings.vue';

const defaultSettings = {
  theme: 'light' as const,
};

const meta = {
  title: 'Business/Setting/AppearanceSettings',
  component: AppearanceSettings,
  tags: ['autodocs'],
  argTypes: {},
  args: {
    modelValue: defaultSettings,
  },
} satisfies Meta<typeof AppearanceSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { AppearanceSettings },
    setup() {
      const model = ref({ ...args.modelValue });
      return { model };
    },
    template: '<AppearanceSettings v-model="model" />',
  }),
  args: {
    modelValue: defaultSettings,
  },
};

export const DarkTheme: Story = {
  render: (args) => ({
    components: { AppearanceSettings },
    setup() {
      const model = ref({ ...args.modelValue });
      return { model };
    },
    template: '<AppearanceSettings v-model="model" />',
  }),
  args: {
    modelValue: {
      theme: 'dark' as const,
    },
  },
};

export const CompactMode: Story = {
  render: (args) => ({
    components: { AppearanceSettings },
    setup() {
      const model = ref({ ...args.modelValue });
      return { model };
    },
    template: '<AppearanceSettings v-model="model" />',
  }),
  args: {
    modelValue: {
      theme: 'auto' as const,
    },
  },
};

export const CustomThemeOptions: Story = {
  render: (args) => ({
    components: { AppearanceSettings },
    setup() {
      const model = ref({ ...args.modelValue });
      return { model, themeOptions: args.themeOptions };
    },
    template: '<AppearanceSettings v-model="model" :themeOptions="themeOptions" />',
  }),
  args: {
    modelValue: defaultSettings,
    themeOptions: [
      { label: 'Day Mode', value: 'light' },
      { label: 'Night Mode', value: 'dark' },
      { label: 'Auto (System)', value: 'auto' },
    ],
  },
};
