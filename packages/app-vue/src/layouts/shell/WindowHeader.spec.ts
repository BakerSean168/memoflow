/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import { Target } from '@lucide/vue';
import WindowHeader from './WindowHeader.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { expand: 'Expand', collapse: 'Collapse' },
      setting: { title: 'Settings' },
      nav: {
        capsule: {
          goal: 'Goals',
          task: 'Tasks',
          note: 'Notes',
          reminder: 'Reminders',
          notification: 'Notifications',
        },
      },
      shell: {
        back: 'Back',
        forward: 'Forward',
        showSidePanel: 'Show side panel',
        hideSidePanel: 'Hide side panel',
        moduleNav: 'Module navigation',
        moduleWithCount: '{name}, {count} items',
        previewModule: 'Preview {name}',
        openSchedule: 'Open schedule',
        enterModule: 'Enter',
        previewPlaceholder: 'Preview',
        schedule: { empty: 'Nothing scheduled today' },
        settings: { returnToApp: 'Back to app' },
        window: { minimize: 'Minimize', maximize: 'Maximize', close: 'Close' },
      },
    },
  },
});

describe('WindowHeader desktop drag contract', () => {
  it('keeps the flexible titlebar surface draggable while interactive navigation opts out', () => {
    const wrapper = mount(WindowHeader, {
      props: {
        sidebarCollapsed: false,
        rightPanelOpen: true,
        isDesktop: true,
        capsules: [{ id: 'goal', label: 'Goals', route: '/goals', icon: Target }],
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.get('[data-testid="window-header"]').classes()).toContain('window-header--drag');
    expect(wrapper.get('[data-testid="window-header-drag-surface"]').classes()).not.toContain(
      'no-drag',
    );
    expect(wrapper.get('[data-testid="shell-primary-capsules"]').classes()).toContain('no-drag');
  });
});

describe('WindowHeader workspace navigation', () => {
  it('renders compound module capsules without the redundant workspace launcher', async () => {
    const wrapper = mount(WindowHeader, {
      props: {
        sidebarCollapsed: false,
        rightPanelOpen: true,
        capsules: [{ id: 'goal', label: 'Goals', route: '/goals', icon: Target }],
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-testid="shell-workspace-launcher"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="capsule-nav-goal"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="capsule-preview-goal"]').exists()).toBe(true);

    await wrapper.get('[data-testid="capsule-nav-goal"]').trigger('click');
    expect(wrapper.emitted('open-module')).toEqual([[{ id: 'goal', route: '/goals' }]]);
  });

  it('uses the single shell header as the Settings page header', async () => {
    const wrapper = mount(WindowHeader, {
      props: {
        mode: 'settings',
        sidebarCollapsed: false,
        rightPanelOpen: true,
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.get('[data-testid="window-header"]').attributes('data-header-mode')).toBe(
      'settings',
    );
    expect(wrapper.find('[data-testid="shell-primary-capsules"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="settings-window-header-title"]').text()).toContain(
      'Settings',
    );
    expect(wrapper.get('[data-testid="shell-sidebar-toggle"]').exists()).toBe(true);

    await wrapper.get('[data-testid="shell-sidebar-toggle"]').trigger('click');
    expect(wrapper.emitted('toggle-sidebar')).toHaveLength(1);
  });

  it('exposes a dynamic right-panel toggle without changing sidebar state', async () => {
    const wrapper = mount(WindowHeader, {
      props: {
        sidebarCollapsed: false,
        rightPanelOpen: true,
      },
      global: { plugins: [i18n] },
    });

    const toggle = wrapper.get('[data-testid="shell-right-panel-toggle"]');
    expect(toggle.attributes('aria-label')).toBe('Hide side panel');
    expect(toggle.attributes('aria-pressed')).toBe('true');
    await toggle.trigger('click');
    expect(wrapper.emitted('toggle-right-panel')).toHaveLength(1);
    expect(wrapper.emitted('toggle-sidebar')).toBeUndefined();
  });
});
