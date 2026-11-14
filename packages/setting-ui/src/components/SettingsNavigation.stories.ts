import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { userEvent, within } from 'storybook/test';
import SettingsNavigation from './SettingsNavigation.vue';

const items = [
  { value: 'shortcuts', label: 'Keyboard shortcuts' },
  { value: 'appearance', label: 'Appearance & Language' },
  { value: 'repository', label: 'Knowledge Repository' },
  { value: 'ai', label: 'AI' },
  { value: 'notifications', label: 'Notifications & Reminders' },
  { value: 'account', label: 'Account & Privacy' },
  { value: 'data', label: 'Data' },
];

const meta = {
  title: 'Business/Setting/SettingsNavigation',
  component: SettingsNavigation,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [() => ({ template: '<div style="height: 420px; width: 260px;"><story /></div>' })],
  args: { items, active: 'appearance' },
  argTypes: {
    active: { control: 'select', options: items.map((item) => item.value) },
  },
} satisfies Meta<typeof SettingsNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Filtered: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Search settings sections' }), 'Key');
  },
};

export const NoMatches: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Search settings sections' }), 'zzz');
  },
};
