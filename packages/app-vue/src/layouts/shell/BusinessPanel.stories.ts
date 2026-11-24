import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, waitFor, within } from 'storybook/test';
import BusinessPanel from './BusinessPanel.vue';
import type { BusinessTab, ShellModule } from './useAppShellStore';

const modules: ShellModule[] = ['goal', 'task', 'routine', 'note', 'notification', 'schedule'];

const tabs: BusinessTab[] = [
  {
    id: 'tab-goal',
    module: 'goal',
    route: '/goals',
    title: 'Goals',
    titleKey: 'nav.capsule.goal',
    titleSource: 'module',
    lastActiveAt: 3,
  },
  {
    id: 'tab-task',
    module: 'task',
    route: '/tasks',
    title: 'Tasks',
    titleKey: 'nav.capsule.task',
    titleSource: 'module',
    lastActiveAt: 2,
  },
  {
    id: 'tab-routine',
    module: 'routine',
    route: '/routines',
    title: 'Routines',
    titleKey: 'nav.capsule.routine',
    titleSource: 'module',
    lastActiveAt: 1,
  },
];

const manyTabs: BusinessTab[] = Array.from({ length: 8 }, (_, index) => {
  const module = modules[index % modules.length]!;
  return {
    id: `tab-${module}-${index}`,
    module,
    route: `/${module}s/${index}`,
    title:
      index === 0
        ? 'Quarterly planning workspace'
        : `${module.charAt(0).toUpperCase()}${module.slice(1)} ${index + 1}`,
    lastActiveAt: 100 - index,
  };
});

function renderPanel(args: Record<string, unknown>, width = 'w-[52rem]', height = 'h-[30rem]') {
  return {
    components: { BusinessPanel },
    data() {
      return { args };
    },
    template: `
      <div class="bg-background p-4">
        <div class="${width} ${height} overflow-hidden rounded-xl border bg-[hsl(var(--workspace-business))] shadow-sm">
          <BusinessPanel v-bind="args">
            <template #home>
              <div class="h-full overflow-y-auto p-4" data-testid="story-home-surface">
                <p class="text-sm font-medium text-foreground">Today surface</p>
                <p class="mt-1 text-xs text-muted-foreground">
                  Home stays mounted beside the business tabs; its widgets scroll independently.
                </p>
                <div class="mt-4 grid gap-2">
                  <div class="h-20 rounded-lg bg-[hsl(var(--surface-raised)/0.7)]" />
                  <div class="h-20 rounded-lg bg-[hsl(var(--surface-raised)/0.7)]" />
                </div>
              </div>
            </template>
            <div class="h-full overflow-y-auto p-4" data-testid="story-business-surface">
              <p class="text-sm font-medium text-foreground">Business surface</p>
              <p class="mt-1 text-xs text-muted-foreground">
                The routed module renders inside the named container.
              </p>
              <div class="mt-4 h-40 rounded-lg border border-dashed border-border" />
            </div>
          </BusinessPanel>
        </div>
      </div>
    `,
  };
}

const meta = {
  title: 'Business/AppVue/BusinessPanel',
  component: BusinessPanel,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    tabs,
    activeTabId: 'tab-goal',
    layout: 'split',
    panelSurface: 'home',
    focusExitCollapsesPanel: false,
  },
  render: (args) => renderPanel(args as unknown as Record<string, unknown>),
} satisfies Meta<typeof BusinessPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default split workspace: Home is the surface and three module tabs stay labelled. */
export const HomeSurface: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('story-home-surface')).toBeVisible();
    await expect(page.getByTestId('business-panel-home')).toBeVisible();
    await expect(page.getByTestId('business-panel-tab-goal')).toBeVisible();
    await expect(page.getByTestId('business-panel-focus-toggle')).toHaveAttribute(
      'aria-label',
      'Enter focus',
    );
  },
};

/** Business reveals the routed surface, marks the active tab and keeps its close control. */
export const BusinessSurface: Story = {
  args: { panelSurface: 'business', activeTabId: 'tab-task' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('story-business-surface')).toBeVisible();
    await expect(page.getByTestId('story-home-surface')).not.toBeVisible();
    const active = page.getByTestId('business-panel-tab-task');
    await expect(active.querySelector('button')).toHaveAttribute('aria-pressed', 'true');
    await expect(active.querySelector('[data-testid="business-panel-tab-close"]')).toBeVisible();
  },
};

/** Eight tabs in a narrow panel degrade to icon density while the active tab keeps context. */
export const IconDensity: Story = {
  args: { tabs: manyTabs, activeTabId: 'tab-goal-0', panelSurface: 'business' },
  render: (args) => renderPanel(args as unknown as Record<string, unknown>, 'w-[30rem]'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(page.getByTestId('business-panel')).toHaveAttribute('data-tab-density', 'icon'),
    );
    await expect(page.getByTestId('business-panel-tab-goal-0')).toHaveTextContent(
      'Quarterly planning workspace',
    );
    await expect(page.getByTestId('business-panel-tab-task-1')).not.toHaveTextContent('Task 2');
  },
};

/** A long object title truncates inside the tab instead of widening the panel. */
export const NarrowObjectTitle: Story = {
  args: {
    tabs: [
      {
        id: 'tab-object',
        module: 'goal',
        route: '/goals/goal-1',
        title: 'Ship the annual planning review across every workspace before the quarter closes',
        titleSource: 'object',
        lastActiveAt: 4,
      },
      tabs[1]!,
    ],
    activeTabId: 'tab-object',
    panelSurface: 'business',
  },
  render: (args) => renderPanel(args as unknown as Record<string, unknown>, 'w-[24rem]'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('business-panel-tab-object')).toBeVisible();
    await expect(
      page.getByTestId('business-panel-tab-object').querySelector('.truncate'),
    ).toHaveClass('truncate');
  },
};

/** Focus layout: the panel toggle leaves focus instead of collapsing the panel. */
export const FocusMode: Story = {
  args: { layout: 'focus', panelSurface: 'business' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('business-panel-focus-toggle')).toHaveAttribute(
      'aria-label',
      'Exit focus',
    );
  },
};

/** With no split geometry the focus toggle becomes a panel collapse action (#965). */
export const FocusExitCollapsesPanel: Story = {
  args: { layout: 'focus', panelSurface: 'business', focusExitCollapsesPanel: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('business-panel-focus-toggle')).toHaveAttribute(
      'aria-label',
      'Hide side panel',
    );
  },
};
