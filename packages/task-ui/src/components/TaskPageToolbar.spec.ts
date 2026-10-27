/** @vitest-environment happy-dom */

import { shallowMount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import {
  LabelFilterPopover,
  ProductSingleSelectFilter,
} from '@task-ui-test-host/shared/components';
import TaskPageToolbar from './TaskPageToolbar.vue';
import { installTaskUiHost } from '@task-ui-test-host/di/task-ui-host';
installTaskUiHost();

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
            plans: 'Plans',
          },
          filter: {
            surface: 'View',
            status: 'Status',
            planState: 'Plan state',
            allStatuses: 'All statuses',
            label: 'Filter by label',
            matchesAllLabels: 'Matches all selected labels',
            sort: 'Sort',
            viewOptions: 'Filter and sort',
          },
          planState: {
            all: 'All plan states',
            active: 'Active',
            paused: 'Paused',
            succeeded: 'Succeeded',
            failed: 'Failed',
            abandoned: 'Ended',
            archived: 'Archived',
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

const labelOptions = [
  { id: 'work', name: 'Work', color: '#3366ff' },
  { id: 'ai', name: 'AI', color: null },
];

function mountToolbar() {
  return shallowMount(TaskPageToolbar, {
    props: {
      activeSurface: 'today',
      visibleItemCount: 3,
      occurrenceStatusFilter: 'all',
      planStateFilter: 'all',
      labelFilterIds: ['work'],
      labelOptions,
      occurrenceSort: 'time',
      goalScopeLabel: null,
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

describe('TaskPageToolbar', () => {
  it('keeps classification, filters, sort, and create action on one Goal-style row', () => {
    const wrapper = mountToolbar();

    expect(wrapper.findAll('[data-testid="task-page-toolbar"]')).toHaveLength(1);
    expect(wrapper.findComponent({ name: 'ProductSurfaceHeader' }).exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="task-filter-bar"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-primary-action="create-task"]')).toHaveLength(1);
    const sharedFilters = wrapper.findAllComponents(ProductSingleSelectFilter);
    expect(sharedFilters).toHaveLength(3);
    expect(sharedFilters[0]!.props('modelValue')).toBe('today');
    expect(sharedFilters[1]!.props('modelValue')).toBe('all');
    expect(sharedFilters[2]!.props('modelValue')).toBe('time');
    expect(wrapper.findComponent(LabelFilterPopover).exists()).toBe(true);
  });

  it('forwards label selection and the primary create action', async () => {
    const wrapper = mountToolbar();

    wrapper.findComponent(LabelFilterPopover).vm.$emit('update:modelValue', ['work', 'ai']);
    expect(wrapper.emitted('update:labelFilterIds')).toEqual([[['work', 'ai']]]);

    await wrapper.get('[data-primary-action="create-task"]').trigger('click');
    expect(wrapper.emitted('createTask')).toHaveLength(1);
  });

  it('switches from occurrence controls to an independent plan-state filter on Plans', async () => {
    const wrapper = mountToolbar();
    await wrapper.setProps({ activeSurface: 'plans', planStateFilter: 'failed' });

    const planFilter = wrapper
      .findAllComponents(ProductSingleSelectFilter)
      .find((filter) => filter.props('modelValue') === 'failed');
    expect(planFilter?.exists()).toBe(true);
    expect(wrapper.props('planStateFilter')).toBe('failed');
    expect(wrapper.props('occurrenceStatusFilter')).toBe('all');
  });
});
