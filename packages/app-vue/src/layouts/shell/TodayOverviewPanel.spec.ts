/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { defineComponent, h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TodayOverviewPanel from './TodayOverviewPanel.vue';

const dashboardMocks = vi.hoisted(() => ({
  fetchDashboard: vi.fn(async () => undefined),
}));

vi.mock('../../modules/dashboard/composables/useDashboard', async () => {
  const { ref } = await import('vue');
  return {
    useDashboard: () => ({
      goalProgress: ref([]),
      isLoading: ref(false),
      fetchDashboard: dashboardMocks.fetchDashboard,
    }),
  };
});

const DailyTodoWidgetStub = defineComponent({
  name: 'DailyTodoWidget',
  emits: ['view-all', 'completed'],
  setup(_, { emit }) {
    return () =>
      h('div', { 'data-testid': 'daily-todo-widget' }, [
        h('button', { onClick: () => emit('view-all') }, 'tasks'),
        h(
          'button',
          { 'data-testid': 'daily-todo-complete', onClick: () => emit('completed') },
          'complete',
        ),
      ]);
  },
});

const GoalProgressWidgetStub = defineComponent({
  name: 'GoalProgressWidget',
  emits: ['view-all', 'select'],
  setup(_, { emit }) {
    return () =>
      h('div', { 'data-testid': 'goal-progress-widget' }, [
        h('button', { onClick: () => emit('view-all') }, 'goals'),
        h('button', { onClick: () => emit('select', 'goal-1') }, 'goal'),
      ]);
  },
});

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      shell: {
        home: {
          title: 'Today',
          directActions: 'Quick actions',
          newGoal: 'New goal',
          quickTask: 'Quick task',
        },
      },
    },
  },
});

function mountPanel(active: boolean) {
  return mount(TodayOverviewPanel, {
    props: { active },
    global: {
      plugins: [i18n],
      stubs: {
        DailyTodoWidget: DailyTodoWidgetStub,
        GoalProgressWidget: GoalProgressWidgetStub,
      },
    },
  });
}

describe('TodayOverviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads dashboard data only when the Home surface becomes active', async () => {
    const wrapper = mountPanel(false);
    expect(dashboardMocks.fetchDashboard).not.toHaveBeenCalled();

    await wrapper.setProps({ active: true });
    await nextTick();

    expect(dashboardMocks.fetchDashboard).toHaveBeenCalledOnce();
    expect(wrapper.get('[data-testid="today-overview-widgets"]').exists()).toBe(true);
  });

  it('routes direct actions and widget navigation through the shell', async () => {
    const wrapper = mountPanel(true);

    await wrapper.get('[data-testid="today-overview-create-goal"]').trigger('click');
    await wrapper.get('[data-testid="today-overview-create-task"]').trigger('click');
    await wrapper.get('[data-testid="daily-todo-widget"] button').trigger('click');
    await wrapper.get('[data-testid="goal-progress-widget"] button:nth-child(1)').trigger('click');
    await wrapper.get('[data-testid="goal-progress-widget"] button:nth-child(2)').trigger('click');

    expect(wrapper.emitted('open-route')).toEqual([
      ['goal', '/goals?dialog=goal'],
      ['task', '/tasks?dialog=quick-task'],
      ['task', '/tasks'],
      ['goal', '/goals'],
      ['goal', '/goals/goal-1'],
    ]);
  });

  it('reconciles the dashboard projection after task completion', async () => {
    vi.useFakeTimers();
    const wrapper = mountPanel(true);
    await nextTick();
    dashboardMocks.fetchDashboard.mockClear();

    await wrapper.get('[data-testid="daily-todo-complete"]').trigger('click');
    await vi.runAllTimersAsync();

    expect(dashboardMocks.fetchDashboard).toHaveBeenCalledTimes(5);
  });
});
