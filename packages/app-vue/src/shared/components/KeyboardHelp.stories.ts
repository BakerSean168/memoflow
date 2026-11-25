import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { onUnmounted } from 'vue';
import { expect, within } from 'storybook/test';
import KeyboardHelp from './KeyboardHelp.vue';
import { keyboard } from '../keyboard/runtime';
import { displayChord } from '../keyboard/keymap';

/**
 * Drives the same global runtime singleton the app and unit tests use. The
 * runtime's own definitions supply the representative preview/list scope rows
 * and multi-key bindings (`J / ↓`, `Mod+K`); no handler or backend is involved.
 */
function renderHelp(platform?: 'mac' | 'windows') {
  return {
    components: { KeyboardHelp },
    setup() {
      const previousPlatform = keyboard.engine.host.platform;
      if (platform) keyboard.engine.host.platform = platform;
      keyboard.helpOpen.value = true;
      onUnmounted(() => {
        keyboard.helpOpen.value = false;
        keyboard.engine.host.platform = previousPlatform;
      });
    },
    template: `<KeyboardHelp />`,
  };
}

const meta = {
  title: 'Business/AppVue/KeyboardHelp',
  component: KeyboardHelp,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  render: () => renderHelp(),
} satisfies Meta<typeof KeyboardHelp>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Stable open state with the effective runtime bindings, nothing dismisses it. */
export const OpenWithCommands: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByTestId('keyboard-help');
    await expect(page.getByText('命令面板')).toBeVisible();
    await expect(
      page.getAllByText(displayChord('Mod+K', keyboard.engine.host)).length,
    ).toBeGreaterThan(0);
    await expect(page.getAllByText('J / ↓').length).toBeGreaterThan(0);
    await expect(page.getAllByText('· 预览').length).toBeGreaterThan(0);
    await expect(page.getAllByText('· 列表').length).toBeGreaterThan(0);
  },
};

/** macOS host renders the Command glyph instead of the Ctrl text. */
export const PlatformChords: Story = {
  render: () => renderHelp('mac'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByTestId('keyboard-help');
    await expect(page.getAllByText('⌘K').length).toBeGreaterThan(0);
    await expect(page.queryByText('Ctrl+K')).not.toBeInTheDocument();
  },
};
