/** @vitest-environment happy-dom */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shallowMount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import { LabelFilterPopover } from '../../../shared/components';
import TaskPageToolbar from './TaskPageToolbar.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { clear: 'Clear' },
      task: {
        action: { create: 'New plan' },
        management: {
          surface: {
            today: 'Today',
            upcoming: 'Upcoming',
            plans: 'Plans',
          },
          filter: {
            status: 'Status',
            allStatuses: 'All statuses',
            label: 'Filter by label',
            matchesAllLabels: 'Matches all selected labels',
            sort: 'Sort',
            viewOptions: 'Filter and sort',
          },
          sort: {
            time: 'Time',
            status: 'Status',
            title: 'Title',
          },
        },
        metadata: {
          labels: 'Labels',
          searchLabels: 'Search labels',
          noLabels: 'No labels',
        },
        occurrence: {
          status: {
            pending: 'Pending',
            inprogress: 'In progress',
            completed: 'Completed',
            missed: 'Missed',
            skipped: 'Skipped',
          },
        },
      },
    },
  },
});

const source = readFileSync(resolve(__dirname, 'TaskPageToolbar.vue'), 'utf8');

const labelOptions = [
  { id: 'work', name: 'Work', color: '#3366ff' },
  { id: 'ai', name: 'AI', color: null },
];

function mountToolbar() {
  return shallowMount(TaskPageToolbar, {
    props: {
      activeSurface: 'today',
      visibleItemCount: 3,
      statusFilter: 'all',
      labelFilterIds: ['work'],
      labelOptions,
      occurrenceSort: 'time',
      goalScopeLabel: null,
    },
    global: { plugins: [i18n] },
  });
}

describe('TaskPageToolbar', () => {
  it('keeps classification, filters, sort, and create action on one Goal-style row', () => {
    const wrapper = mountToolbar();

    expect(wrapper.findAll('[data-testid="task-page-toolbar"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="task-filter-bar"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-primary-action="create-task"]')).toHaveLength(1);
    for (const selector of [
      'task-surface-trigger',
      'task-status-filter',
      'task-compact-view-options',
      'task-occurrence-sort',
    ]) {
      expect(source).toContain(`data-testid="${selector}"`);
    }
    expect(source).toContain('{{ currentSurfaceLabel }}');
    expect(source).toContain('{{ visibleItemCount }}');
    expect(wrapper.findComponent(LabelFilterPopover).exists()).toBe(true);
    expect(source).toContain('<ResponsivePrimaryAction');
    expect(source).not.toContain('task-goal-filter');
    expect(source).not.toContain('goalFilter');
    expect(source).not.toContain('overflow-x-auto');
    expect(source).not.toContain('task-search-input');
  });

  it('forwards label selection and the primary create action', async () => {
    const wrapper = mountToolbar();

    wrapper.findComponent(LabelFilterPopover).vm.$emit('update:modelValue', ['work', 'ai']);
    expect(wrapper.emitted('update:labelFilterIds')).toEqual([[['work', 'ai']]]);

    await wrapper.get('[data-primary-action="create-task"]').trigger('click');
    expect(wrapper.emitted('createTask')).toHaveLength(1);
  });

  it('hides occurrence-only status and sorting controls on the Plans surface', async () => {
    const wrapper = mountToolbar();
    await wrapper.setProps({ activeSurface: 'plans' });

    expect(wrapper.find('[data-testid="task-status-filter"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="task-occurrence-sort"]').exists()).toBe(false);
  });
});
