import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, within } from 'storybook/test';
import { Bell, Calendar, FileText, ListTodo, Repeat2, Target } from '@lucide/vue';
import WindowHeader, { type WindowHeaderCapsule } from './WindowHeader.vue';

/**
 * Mirrors the AppShell capsule list: primary business modules plus the utility
 * Schedule/Notification entries. Only Notification carries a live count today,
 * so the task capsule deliberately keeps `badge: null` for review contrast.
 */
const capsules: WindowHeaderCapsule[] = [
  {
    id: 'goal',
    label: 'Goals',
    route: '/goals',
    icon: Target,
    placement: 'primary',
    badge: null,
  },
  {
    id: 'task',
    label: 'Tasks',
    route: '/tasks',
    icon: ListTodo,
    placement: 'primary',
    previewSize: 'wide',
    badge: null,
  },
  {
    id: 'routine',
    label: 'Routines',
    route: '/routines',
    icon: Repeat2,
    placement: 'primary',
  },
  {
    id: 'note',
    label: 'Knowledge',
    route: '/repository',
    icon: FileText,
    placement: 'primary',
  },
  {
    id: 'schedule',
    label: 'Schedule',
    route: '/schedule',
    icon: Calendar,
    placement: 'utility',
  },
  {
    id: 'notification',
    label: 'Notifications',
    route: '/notifications',
    icon: Bell,
    placement: 'utility',
    badge: 3,
  },
];

const windowControls = {
  isMaximized: false,
  isMinimizable: true,
  isMaximizable: true,
  isClosable: true,
};

const meta = {
  title: 'Business/AppVue/WindowHeader',
  component: WindowHeader,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    mode: 'workspace',
    sidebarCollapsed: false,
    rightPanelOpen: false,
    isDesktop: true,
    isMac: false,
    windowControls,
    capsules,
  },
  render: (args) => ({
    components: { WindowHeader },
    setup: () => ({ args }),
    template: `<div class="bg-background"><WindowHeader v-bind="args" /></div>`,
  }),
} satisfies Meta<typeof WindowHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Desktop workspace: primary capsules, utility entries and window controls. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.getByTestId('window-header')).toHaveAttribute(
      'data-header-mode',
      'workspace',
    );
    await expect(page.getByTestId('capsule-badge-notification')).toHaveTextContent('3');
    await expect(page.queryByTestId('capsule-badge-task')).not.toBeInTheDocument();
    await expect(page.getByTestId('shell-right-panel-toggle')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  },
};

/** Collapsed sidebar and an open right panel flip both toggle icons and states. */
export const SidebarCollapsedAndPanelOpen: Story = {
  args: { sidebarCollapsed: true, rightPanelOpen: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.getByTestId('shell-sidebar-toggle')).toHaveAttribute('aria-label', 'Expand');
    await expect(page.getByTestId('shell-right-panel-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('shell-right-panel-toggle')).toHaveAttribute(
      'aria-label',
      'Hide side panel',
    );
  },
};

/** Settings replaces the workspace capsule scene with the settings title. */
export const SettingsMode: Story = {
  args: { mode: 'settings' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.getByTestId('window-header')).toHaveAttribute('data-header-mode', 'settings');
    await expect(page.getByTestId('settings-window-header-title')).toHaveTextContent(
      'App Settings',
    );
    await expect(page.queryByTestId('shell-primary-capsules')).not.toBeInTheDocument();
    await expect(page.queryByTestId('shell-right-panel-toggle')).not.toBeInTheDocument();
  },
};

/** Web host: no drag region and no self-drawn window controls. */
export const WebMode: Story = {
  args: { isDesktop: false },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.getByTestId('window-header')).not.toHaveClass('window-header--drag');
    await expect(page.queryByRole('button', { name: 'Minimize' })).not.toBeInTheDocument();
    await expect(page.queryByRole('button', { name: 'Maximize' })).not.toBeInTheDocument();
    await expect(page.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  },
};

/** Maximized desktop window swaps the restore affordance for the maximize glyph. */
export const Maximized: Story = {
  args: {
    windowControls: { ...windowControls, isMaximized: true },
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.getByRole('button', { name: 'Maximize' })).toBeVisible();
  },
};
