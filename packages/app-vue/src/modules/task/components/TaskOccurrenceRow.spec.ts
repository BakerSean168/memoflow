/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import enTask from '../../../locales/en-US/task';
import TaskOccurrenceRow from './TaskOccurrenceRow.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      task: enTask,
    },
  },
});
const day = new Date(2026, 7, 28).getTime();

function instance(overrides: Partial<TaskOccurrenceClientDTO> = {}): TaskOccurrenceClientDTO {
  return {
    id: 'occurrence-1',
    templateId: 'plan-1',
    identityId: 'identity-1',
    instanceDate: day,
    timeConfig: {
      timeType: 'TimePoint',
      startDate: day,
      timePoint: 9 * 60,
      timeRange: null,
    },
    importance: 'Moderate',
    status: 'Pending',
    isOverdue: false,
    actualStartTime: null,
    actualEndTime: null,
    comment: null,
    version: 1,
    createdAt: day,
    updatedAt: day,
    deletedAt: null,
    ...overrides,
  } as TaskOccurrenceClientDTO;
}

const template = {
  id: 'plan-1',
  name: 'Morning review',
  description: null,
  labels: [{ id: 'label-focus', name: 'Focus', color: null }],
  goalBinding: { goalId: 'goal-1', keyResultId: 'kr-1', contribution: null },
  recurrenceRule: {
    frequency: 'Daily',
    interval: 1,
    daysOfWeek: [],
    endDate: null,
    occurrences: 10,
  },
} as TaskPlanClientDTO;

function mountRow(overrides: Partial<TaskOccurrenceClientDTO> = {}) {
  return mount(TaskOccurrenceRow, {
    props: {
      occurrence: instance(overrides),
      template,
      position: { position: 3, total: 10 },
      now: day + 12 * 60 * 60_000,
    },
    global: { plugins: [i18n] },
  });
}

describe('TaskOccurrenceRow', () => {
  it('renders occurrence state, repeat position, Goal context, and real correction actions', () => {
    const wrapper = mountRow();

    expect(wrapper.text()).toContain('Morning review');
    expect(wrapper.text()).toContain('Overdue');
    expect(wrapper.text()).toContain('Occurrence 3 of 10');
    expect(wrapper.text()).toContain('Goal linked');
    expect(wrapper.get('[data-testid="task-occurrence-complete"]')).toBeTruthy();
    expect(wrapper.get('[data-testid="task-occurrence-missed"]')).toBeTruthy();
    expect(wrapper.get('[data-testid="task-occurrence-skip"]')).toBeTruthy();
  });

  it('emits complete, missed, skip, and plan navigation with durable IDs', async () => {
    const wrapper = mountRow();

    await wrapper.get('[data-testid="task-occurrence-complete"]').trigger('click');
    await wrapper.get('[data-testid="task-occurrence-missed"]').trigger('click');
    await wrapper.get('[data-testid="task-occurrence-skip"]').trigger('click');
    await wrapper.get('button[aria-label="Open plan Morning review"]').trigger('click');

    expect(wrapper.emitted('complete')).toEqual([['occurrence-1']]);
    expect(wrapper.emitted('missed')).toEqual([['occurrence-1']]);
    expect(wrapper.emitted('skip')).toEqual([['occurrence-1']]);
    expect(wrapper.emitted('open-plan')).toEqual([['plan-1']]);
  });

  it('offers undo instead of completing an already-completed occurrence', async () => {
    const wrapper = mountRow({ status: 'Completed' });

    expect(wrapper.find('[data-testid="task-occurrence-complete"]').exists()).toBe(false);
    const undo = wrapper.get('[data-testid="task-occurrence-uncomplete"]');
    await undo.trigger('click');
    expect(wrapper.emitted('uncomplete')).toEqual([['occurrence-1']]);
  });
});
