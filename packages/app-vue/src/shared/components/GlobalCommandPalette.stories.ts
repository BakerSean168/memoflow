import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { onUnmounted } from 'vue';
import { userEvent, within } from 'storybook/test';
import { _setOpen } from '@memoflow/ui-vue-shadcn';
import GlobalCommandPalette from './GlobalCommandPalette.vue';

const meta = {
  title: 'Business/AppVue/GlobalCommandPalette',
  component: GlobalCommandPalette,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  render: () => ({
    components: { GlobalCommandPalette },
    setup() {
      _setOpen(true);
      onUnmounted(() => _setOpen(false));
    },
    template: `<GlobalCommandPalette />`,
  }),
} satisfies Meta<typeof GlobalCommandPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const NoMatches: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const search = await page.findByPlaceholderText('Type a command...');
    await userEvent.type(search, 'archive everything');
    await page.findByText('No matching commands');
  },
};
