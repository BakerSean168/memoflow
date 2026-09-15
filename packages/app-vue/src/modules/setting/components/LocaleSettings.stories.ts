import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import LocaleSettings from './LocaleSettings.vue';

const defaultSettings = {
  language: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  dateStyle: 'medium',
  timeStyle: '24h',
  weekStartsOn: 1,
};

const meta = {
  title: 'Business/Setting/LocaleSettings',
  component: LocaleSettings,
  tags: ['autodocs'],
  argTypes: {},
  args: {
    modelValue: defaultSettings,
  },
} satisfies Meta<typeof LocaleSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { LocaleSettings },
    setup() {
      const model = ref({ ...args.modelValue });
      return { model };
    },
    template: '<LocaleSettings v-model="model" />',
  }),
  args: {
    modelValue: defaultSettings,
  },
};

export const EnglishUS: Story = {
  render: (args) => ({
    components: { LocaleSettings },
    setup() {
      const model = ref({ ...args.modelValue });
      return { model };
    },
    template: '<LocaleSettings v-model="model" />',
  }),
  args: {
    modelValue: {
      language: 'en-US',
      timeZone: 'America/New_York',
      dateStyle: 'short',
      timeStyle: '12h',
      weekStartsOn: 0,
    },
  },
};

export const Japanese: Story = {
  render: (args) => ({
    components: { LocaleSettings },
    setup() {
      const model = ref({ ...args.modelValue });
      return { model };
    },
    template: '<LocaleSettings v-model="model" />',
  }),
  args: {
    modelValue: {
      language: 'en-US',
      timeZone: 'Asia/Tokyo',
      dateStyle: 'long',
      timeStyle: '24h',
      weekStartsOn: 1,
    },
  },
};
