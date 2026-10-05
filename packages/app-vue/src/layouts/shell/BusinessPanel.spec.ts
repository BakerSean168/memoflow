/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { defineComponent, h, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import BusinessPanel from './BusinessPanel.vue';
import { resolveBusinessTabDensity } from './business-tab-layout';
import type { BusinessTab } from './useAppShellStore';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      shell: {
        moduleNav: 'Module navigation',
        panel: {
          home: 'Today',
          workflow: 'Workflow',
          closeTab: 'Close tab',
          closeWorkflow: 'Close workflow',
          enterFocus: 'Enter focus',
          exitFocus: 'Exit focus',
          resize: 'Resize business panel',
        },
      },
    },
  },
});

const tabs: BusinessTab[] = [
  {
    id: 'tab-goal-1',
    module: 'goal',
    route: '/goals',
    title: 'Goals',
    lastActiveAt: 1,
  },
];

const StatefulBusinessContent = defineComponent({
  setup() {
    return () => h('input', { 'data-testid': 'business-draft', value: 'preserved draft' });
  },
});

function mountPanel(panelSurface: 'home' | 'business' = 'home') {
  return mount(BusinessPanel, {
    props: {
      tabs,
      activeTabId: 'tab-goal-1',
      layout: 'split',
      panelSurface,
    },
    slots: {
      home: '<div data-testid="home-surface">Home</div>',
      default: StatefulBusinessContent,
    },
    global: { plugins: [i18n] },
  });
}

describe('BusinessPanel tab density', () => {
  it('degrades labels before allowing the eight-tab strip to overflow', () => {
    expect(resolveBusinessTabDensity(960, 4)).toBe('comfortable');
    expect(resolveBusinessTabDensity(480, 4)).toBe('compact');
    expect(resolveBusinessTabDensity(520, 8)).toBe('icon');
  });
});

describe('BusinessPanel surfaces', () => {
  it('renders Home as a surface outside the business tab collection', () => {
    const wrapper = mountPanel();

    expect(wrapper.get('[data-testid="business-panel-home"]').attributes('aria-label')).toBe(
      'Today',
    );
    expect(wrapper.findAll('[data-testid="business-draft"]')).toHaveLength(1);
    expect(wrapper.text()).toContain('Goals');
    expect(
      wrapper.get('[data-testid="business-panel-focus-toggle"]').attributes('aria-label'),
    ).toBe('Enter focus');
    expect(wrapper.find('[data-testid="business-panel-close"]').exists()).toBe(false);
    expect(tabs).toHaveLength(1);
  });

  it('keeps business content mounted while Home is active', async () => {
    const wrapper = mountPanel('business');
    const businessElement = wrapper.get('[data-testid="business-draft"]').element;

    await wrapper.setProps({ panelSurface: 'home' });
    expect(wrapper.get('[data-testid="business-draft"]').element).toBe(businessElement);
  });

  it('exposes Home and focus commands without workflow chrome or a redundant panel close', async () => {
    const wrapper = mountPanel('business');

    await wrapper.get('[data-testid="business-panel-home"]').trigger('click');
    await wrapper.get('[data-testid="business-panel-focus-toggle"]').trigger('click');

    expect(wrapper.emitted('show-home')).toHaveLength(1);
    expect(wrapper.emitted('toggle-focus')).toHaveLength(1);
    expect(wrapper.find('[data-testid="business-panel-workflow"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="business-panel-close"]').exists()).toBe(false);
  });

  it('keeps the adaptive strip compact without native horizontal scrolling', () => {
    const wrapper = mountPanel('business');

    const strip = wrapper.get('[data-testid="business-panel-tab-strip"]');
    const tabList = wrapper.get('[data-testid="business-panel-tab-list"]');
    const activeTab = wrapper.get('[role="tab"]');

    expect(strip.classes()).toContain('h-9');
    expect(tabList.classes()).toContain('overflow-hidden');
    expect(tabList.classes()).not.toContain('overflow-x-auto');
    expect(wrapper.get('[data-testid="business-panel"]').attributes('data-tab-density')).toBe(
      'comfortable',
    );
    expect(activeTab.attributes('aria-selected')).toBe('true');
    expect(activeTab.attributes('tabindex')).toBe('0');
  });

  it.each(['home', 'workflow'] as const)(
    'uses only the first business tab as the tab stop on %s with a remembered non-first tab',
    async (panelSurface) => {
      const secondTab: BusinessTab = {
        id: 'tab-task-2',
        module: 'task',
        route: '/tasks',
        title: 'Tasks',
        lastActiveAt: 2,
      };
      const wrapper = mountPanel(panelSurface);
      await wrapper.setProps({ tabs: [...tabs, secondTab], activeTabId: secondTab.id });

      expect(wrapper.findAll('[role="tab"][tabindex="0"]')).toHaveLength(1);
      expect(wrapper.get('[role="tab"][tabindex="0"]').attributes('data-business-tab-id')).toBe(
        tabs[0].id,
      );
      expect(wrapper.findAll('[role="tab"][aria-selected="true"]')).toHaveLength(0);

      await wrapper.setProps({ panelSurface: 'business' });

      expect(wrapper.findAll('[role="tab"][tabindex="0"]')).toHaveLength(1);
      expect(wrapper.get('[role="tab"][tabindex="0"]').attributes('data-business-tab-id')).toBe(
        secondTab.id,
      );
      expect(wrapper.findAll('[role="tab"][aria-selected="true"]')).toHaveLength(1);
      expect(
        wrapper.get('[role="tab"][aria-selected="true"]').attributes('data-business-tab-id'),
      ).toBe(secondTab.id);
    },
  );

  it('uses overlay close controls and consistent chrome hit targets', () => {
    const wrapper = mountPanel('business');

    expect(wrapper.get('[data-testid="business-panel-tab-close"]').classes()).toEqual(
      expect.arrayContaining(['absolute', 'h-8', 'w-8']),
    );
    expect(wrapper.get('[data-testid="business-panel-focus-toggle"]').classes()).toEqual(
      expect.arrayContaining(['h-8', 'w-8']),
    );
  });

  it('supports native-like arrow navigation and Delete on the business tablist', async () => {
    const secondTab: BusinessTab = {
      id: 'tab-task-2',
      module: 'task',
      route: '/tasks',
      title: 'Tasks',
      lastActiveAt: 2,
    };
    const wrapper = mount(BusinessPanel, {
      props: {
        tabs: [...tabs, secondTab],
        activeTabId: 'tab-goal-1',
        layout: 'split',
        panelSurface: 'business',
      },
      global: { plugins: [i18n] },
    });

    const goalTab = wrapper.get('[data-business-tab-id="tab-goal-1"]');
    await goalTab.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('activate-tab')).toEqual([['tab-task-2']]);

    await goalTab.trigger('keydown', { key: 'Delete' });
    expect(wrapper.emitted('close-tab')).toEqual([['tab-goal-1']]);
  });

  it('delegates outer pane boundaries and resizing to AppShell', () => {
    const wrapper = mountPanel('business');
    const panel = wrapper.get('[data-testid="business-panel"]');

    expect(panel.classes()).toContain('bg-transparent');
    expect(panel.classes()).not.toContain('border-l');
    expect(panel.classes()).not.toContain('bg-background');
    expect(wrapper.find('[data-testid="business-panel-resizer"]').exists()).toBe(false);
  });

  it('keeps surface wrappers overflow-hidden with exactly one data-scroll-host each (Phase 2)', () => {
    const wrapper = mount(BusinessPanel, {
      props: {
        tabs,
        activeTabId: 'tab-goal-1',
        layout: 'split',
        panelSurface: 'business',
      },
      slots: {
        home: '<div data-scroll-host="home-probe">Home</div>',
        default: '<div data-scroll-host="business-probe">Business</div>',
      },
      global: { plugins: [i18n] },
    });

    // 每个 surface wrapper 只负责尺寸与裁剪；主滚动由内部唯一 data-scroll-host 承担。
    for (const name of ['home', 'business']) {
      const root = wrapper.get(`[data-surface-scroll-root="${name}"]`);
      expect(root.classes()).toContain('overflow-hidden');
      expect(root.findAll('[data-scroll-host]')).toHaveLength(1);
    }
  });
});

describe('BusinessPanel narrow keyboard contract', () => {
  it('keeps eight tabs named and keyboard reachable at a measured 520px', async () => {
    let resize: ResizeObserverCallback | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const manyTabs = Array.from({ length: 8 }, (_, index) => ({
      ...tabs[0],
      id: `tab-${index}`,
      title: `Goal ${index}`,
    }));
    const wrapper = mount(BusinessPanel, {
      attachTo: document.body,
      props: {
        tabs: manyTabs,
        activeTabId: 'tab-0',
        layout: 'split',
        panelSurface: 'home',
      },
      global: { plugins: [i18n] },
    });
    try {
      resize?.([{ contentRect: { width: 520 } } as ResizeObserverEntry], {} as ResizeObserver);
      await nextTick();
      expect(wrapper.attributes('data-tab-density')).toBe('icon');
      const tabButtons = wrapper.findAll('[role="tab"]');
      expect(tabButtons.filter((tab) => tab.attributes('tabindex') === '0')).toHaveLength(1);
      for (const [index, tab] of tabButtons.entries()) {
        expect(tab.attributes('aria-label')).toBe(`Goal ${index}`);
        expect(tab.element.tagName).toBe('BUTTON');
      }
      await tabButtons[0].trigger('keydown', { key: 'End' });
      expect(wrapper.emitted('activate-tab')).toEqual([['tab-7']]);
      expect(document.activeElement).toBe(tabButtons[7].element);
      await tabButtons[7].trigger('keydown', { key: 'ArrowRight' });
      expect(document.activeElement).toBe(tabButtons[0].element);
      for (const root of wrapper.findAll('[data-surface-scroll-root]')) {
        expect(root.classes()).toContain('overflow-hidden');
      }
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
    }
  });
});
