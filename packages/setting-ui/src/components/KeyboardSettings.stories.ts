import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { userEvent, within } from 'storybook/test';
import KeyboardSettings from './KeyboardSettings.vue';

const meta = {
  title: 'Business/Setting/KeyboardSettings',
  component: KeyboardSettings,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [() => ({ template: '<div style="max-width: 860px;"><story /></div>' })],
  argTypes: {},
} satisfies Meta<typeof KeyboardSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FilteredCommands: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole('textbox', { name: '搜索快捷键' }),
      '命令面板',
    );
  },
};

export const NoMatchingCommand: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: '搜索快捷键' }), 'zzz');
  },
};
