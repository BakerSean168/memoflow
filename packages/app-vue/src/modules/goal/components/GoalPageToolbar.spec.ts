/** @vitest-environment happy-dom */

import { shallowMount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import type { GoalSystemView } from '@memoflow/contracts/goal';
import { LabelFilterPopover } from '../../../shared/components';
import GoalPageToolbar from './GoalPageToolbar.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { clear: 'Clear' },
      goal: {
        systemFolders: { active: 'Active' },
        list: {
          labels: 'Labels',
          searchLabels: 'Search labels',
          noLabels: 'No labels',
          matchesAllLabels: 'Matches all selected labels',
          newGoal: 'New Goal',
        },
      },
    },
  },
});

const systemViews = [
  { id: 'active' as GoalSystemView, label: 'Active' },
  { id: 'completed' as GoalSystemView, label: 'Completed' },
  { id: 'all' as GoalSystemView, label: 'All' },
];
const labelOptions = [
  { id: 'work', name: 'Work', color: '#3366ff' },
  { id: 'ai', name: 'AI', color: null },
];

function mountToolbar() {
  return shallowMount(GoalPageToolbar, {
    props: {
      systemViews,
      activeSystemView: 'active',
      visibleGoalCount: 2,
      labelOptions,
      selectedLabelIds: ['work'],
    },
    global: {
      plugins: [i18n],
      stubs: {
        ProductSurfaceHeader: {
          name: 'ProductSurfaceHeader',
          template: '<header><slot /></header>',
        },
      },
    },
  });
}

describe('GoalPageToolbar (GOAL-5101)', () => {
  it('keeps only system view, Label AND filter, and the single primary create action', async () => {
    const wrapper = mountToolbar();

    expect(wrapper.findAll('[data-testid="goal-page-toolbar"]')).toHaveLength(1);
    expect(wrapper.findComponent({ name: 'ProductSurfaceHeader' }).exists()).toBe(true);
    expect(wrapper.findAll('[data-primary-action="create-goal"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="create-goal-entry"]')).toHaveLength(1);
    expect(wrapper.findComponent(LabelFilterPopover).exists()).toBe(true);

    expect(wrapper.find('[data-testid="goal-search-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="goal-refresh-entry"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="goal-focus-entry"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="goal-toolbar-more"]').exists()).toBe(false);

    await wrapper.get('[data-testid="create-goal-entry"]').trigger('click');
    expect(wrapper.emitted('create-goal')).toHaveLength(1);
  });

  it('forwards the controlled label selection without doing client-side filtering', () => {
    const wrapper = mountToolbar();
    wrapper.findComponent(LabelFilterPopover).vm.$emit('update:modelValue', ['work', 'ai']);
    expect(wrapper.emitted('update-labels')).toEqual([[['work', 'ai']]]);
  });

  it('exposes only Active / Completed / All system views and never resurrects taxonomy controls', () => {
    const wrapper = mountToolbar();
    expect(wrapper.props('systemViews').map((view) => view.id)).toEqual([
      'active',
      'completed',
      'all',
    ]);
    expect(wrapper.text()).not.toContain('Folder');
    expect(wrapper.text()).not.toContain('Compare');
    expect(wrapper.text()).not.toContain('Search');
  });
});
