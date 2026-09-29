/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { defineComponent, h } from 'vue';
import { describe, expect, it } from 'vitest';
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

function mountPanel(panelSurface: 'home' | 'business' | 'workflow' = 'home') {
  return mount(BusinessPanel, {
    props: {
      tabs,
      activeTabId: 'tab-goal-1',
      layout: 'split',
      panelSurface,
      workflowAvailable: true,
      workflowAttentionCount: 2,
    },
    slots: {
      home: '<div data-testid="home-surface">Home</div>',
      default: StatefulBusinessContent,
      workflow: '<div data-testid="workflow-surface">Workflow</div>',
    },
    global: { plugins: [i18n] },
  });
}

describe('BusinessPanel tab density', () => {
  it('degrades labels before allowing the eight-tab strip to overflow', () => {
    expect(resolveBusinessTabDensity(960, 4, false)).toBe('comfortable');
    expect(resolveBusinessTabDensity(520, 4, true)).toBe('compact');
    expect(resolveBusinessTabDensity(520, 8, true)).toBe('icon');
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

  it('keeps business content mounted while Home and workflow are active', async () => {
    const wrapper = mountPanel('business');
    const businessElement = wrapper.get('[data-testid="business-draft"]').element;

    await wrapper.setProps({ panelSurface: 'home' });
    expect(wrapper.get('[data-testid="business-draft"]').element).toBe(businessElement);

    await wrapper.setProps({ panelSurface: 'workflow' });
    expect(wrapper.get('[data-testid="business-draft"]').element).toBe(businessElement);
    expect(wrapper.get('[data-testid="workflow-surface"]').exists()).toBe(true);
  });

  it('exposes distinct workflow, Home, and focus commands without a redundant panel close', async () => {
    const wrapper = mountPanel('workflow');

    await wrapper.get('[data-testid="business-panel-home"]').trigger('click');
    await wrapper.get('[data-testid="business-panel-workflow"]').trigger('click');
    await wrapper.get('[data-testid="business-panel-focus-toggle"]').trigger('click');

    expect(wrapper.emitted('show-home')).toHaveLength(1);
    expect(wrapper.emitted('show-workflow')).toHaveLength(1);
    expect(wrapper.emitted('toggle-focus')).toHaveLength(1);
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

  it('uses overlay close controls and consistent chrome hit targets', () => {
    const wrapper = mountPanel('business');

    expect(wrapper.get('[data-testid="business-panel-tab-close"]').classes()).toEqual(
      expect.arrayContaining(['absolute', 'h-6', 'w-6']),
    );
    expect(wrapper.get('[data-testid="business-panel-focus-toggle"]').classes()).toEqual(
      expect.arrayContaining(['h-7', 'w-7']),
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

  it('exposes the resize handle as a keyboard-operable separator', async () => {
    const wrapper = mountPanel('business');
    const separator = wrapper.get('[data-testid="business-panel-resizer"]');

    expect(separator.attributes()).toMatchObject({
      role: 'separator',
      tabindex: '0',
      'aria-orientation': 'vertical',
      'aria-label': 'Resize business panel',
    });
    expect(separator.classes()).toEqual(expect.arrayContaining(['left-0', 'z-20']));
    expect(separator.classes()).not.toContain('-translate-x-1/2');

    await separator.trigger('keydown', { key: 'ArrowLeft' });
    await separator.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('resize-by')).toEqual([[24], [-24]]);
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
        workflow: '<div data-scroll-host="workflow-probe">Workflow</div>',
      },
      global: { plugins: [i18n] },
    });

    // 每个 surface wrapper 只负责尺寸与裁剪；主滚动由内部唯一 data-scroll-host 承担。
    for (const name of ['home', 'business', 'workflow']) {
      const root = wrapper.get(`[data-surface-scroll-root="${name}"]`);
      expect(root.classes()).toContain('overflow-hidden');
      expect(root.findAll('[data-scroll-host]')).toHaveLength(1);
    }
  });
});
