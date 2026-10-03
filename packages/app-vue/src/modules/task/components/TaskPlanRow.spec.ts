/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import enTask from '../../../locales/en-US/task';
import { ActionableWrapper, type MenuAction } from '../../../components/shared';
import type { TaskPlanViewModel } from './types';
import TaskPlanRow from './TaskPlanRow.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { delete: 'Delete', none: 'None', unknown: 'Unknown' },
      task: enTask,
    },
  },
});

function plan(overrides: Partial<TaskPlanViewModel> = {}): TaskPlanViewModel {
  return {
    id: 'plan-1',
    title: 'Morning review',
    description: 'Review the daily plan before deep work.',
    status: 'ACTIVE',
    statusText: 'Enabled',
    isActive: true,
    isPaused: false,
    isArchived: false,
    importance: 'Moderate',
    importanceText: 'Medium',
    recurrenceText: 'Every day',
    labels: [
      {
        id: 'focus',
        identityId: 'identity-1',
        name: 'Focus',
        normalizedName: 'focus',
        color: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    labelIds: ['focus'],
    goalBinding: {
      goalId: 'goal-1',
      keyResultId: 'kr-1',
    },
    checklist: [],
    schedule: {
      kind: 'Recurring',
      startDate: '2026-09-28',
      timing: { kind: 'AllDay' },
      recurrence: {
        frequency: 'Daily',
        interval: 1,
        byWeekday: [],
        end: { kind: 'Never' },
      },
    },
    reminderConfig: null,
    completionRate: 72,
    ...overrides,
  } as TaskPlanViewModel;
}

describe('TaskPlanRow', () => {
  it('renders a Linear-style high-density plan row', () => {
    const wrapper = mount(TaskPlanRow, {
      props: { plan: plan() },
      global: { plugins: [i18n] },
    });

    expect(wrapper.get('[data-testid="task-plan-row"]').text()).toContain('Morning review');
    expect(wrapper.text()).toContain('Review the daily plan before deep work.');
    expect(wrapper.text()).toContain('Enabled');
    expect(wrapper.text()).toContain('2026-09-28');
    expect(wrapper.text()).toContain('All day');
    expect(wrapper.text()).toContain('Every day');
    expect(wrapper.text()).toContain('Goal linked');
    expect(wrapper.text()).toContain('72%');
    expect(wrapper.text()).toContain('#Focus');
    expect(wrapper.find('[data-testid="task-plan-card"]').exists()).toBe(false);
  });

  it('keeps low-frequency end/delete actions in the shared action menu', () => {
    const wrapper = mount(TaskPlanRow, {
      props: { plan: plan() },
      global: { plugins: [i18n] },
    });

    const actionable = wrapper.getComponent(ActionableWrapper);
    expect(actionable.props('moreButtonPosition')).toBe('center-right');
    expect(actionable.props('moreButtonLabel')).toBe('More actions');

    const actions = actionable.props('actions') as MenuAction[];
    expect(actions.map((action) => action.key)).toEqual(['abandon', 'delete']);
    expect(actions[1]?.destructive).toBe(true);

    actions[0]?.handler();
    actions[1]?.handler();
    expect(wrapper.emitted('abandon')).toHaveLength(1);
    expect(wrapper.emitted('delete')).toHaveLength(1);
  });

  it.each(['Succeeded', 'Failed', 'Abandoned'] as const)('shows terminal %s and hides End Plan independently of archive metadata', (outcome) => {
    const wrapper = mount(TaskPlanRow, {
      props: {
        plan: plan({
          status: 'CLOSED',
          statusText: 'Closed',
          outcome,
          outcomeText: outcome,
          stateText: outcome,
          isActive: false,
          isPaused: false,
        }),
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.get('[data-testid="task-plan-row"]').text()).toContain(outcome);
    expect(wrapper.get('[data-testid="task-plan-row"]').text()).not.toContain('Closed');
    const actions = wrapper.getComponent(ActionableWrapper).props('actions') as MenuAction[];
    expect(actions.map((action) => action.key)).toEqual(['delete']);
  });

  it('emits navigation from the row body while keeping actions separate', async () => {
    const wrapper = mount(TaskPlanRow, {
      props: { plan: plan() },
      global: { plugins: [i18n] },
    });

    await wrapper.get('[data-testid="task-plan-row"] > button').trigger('click');
    expect(wrapper.emitted('view')).toHaveLength(1);
  });
});
