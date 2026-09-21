/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { defineComponent, h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TodayOverviewPanel from './TodayOverviewPanel.vue';

const goalHomeMocks = vi.hoisted(() => ({
  refresh: vi.fn(async () => undefined),
}));

vi.mock('../../modules/goal/composables/useGoalHomeSummary', async () => {
  const { ref } = await import('vue');
  return {
    useGoalHomeSummary: () => ({
      goals: ref([]),
      isLoading: ref(false),
      refresh: goalHomeMocks.refresh,
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

const RoutineUpcomingWidgetStub = defineComponent({
  name: 'RoutineUpcomingWidget',
  emits: ['view-all'],
  setup(_, { emit }) {
    return () =>
      h('div', { 'data-testid': 'routine-upcoming-widget' }, [
        h('button', { onClick: () => emit('view-all') }, 'routines'),
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
        RoutineUpcomingWidget: RoutineUpcomingWidgetStub,
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

  it('loads Goal-owned Home progress only when the Home surface becomes active', async () => {
    const wrapper = mountPanel(false);
    expect(goalHomeMocks.refresh).not.toHaveBeenCalled();

    await wrapper.setProps({ active: true });
    await nextTick();

    expect(goalHomeMocks.refresh).toHaveBeenCalledOnce();
    expect(wrapper.get('[data-testid="today-overview-widgets"]').exists()).toBe(true);
  });

  it('routes Task, Routine, and Goal owner surfaces through the shell', async () => {
    const wrapper = mountPanel(true);

    await wrapper.get('[data-testid="today-overview-create-goal"]').trigger('click');
    await wrapper.get('[data-testid="today-overview-create-task"]').trigger('click');
    await wrapper.get('[data-testid="daily-todo-widget"] button').trigger('click');
    await wrapper.get('[data-testid="routine-upcoming-widget"] button').trigger('click');
    await wrapper.get('[data-testid="goal-progress-widget"] button:nth-child(1)').trigger('click');
    await wrapper.get('[data-testid="goal-progress-widget"] button:nth-child(2)').trigger('click');

    expect(wrapper.emitted('open-route')).toEqual([
      ['goal', '/goals?dialog=goal'],
      ['task', '/tasks?dialog=quick-task'],
      ['task', '/tasks'],
      ['routine', '/routines'],
      ['goal', '/goals'],
      ['goal', '/goals/goal-1'],
    ]);
  });

  it('reconciles the Goal owner projection after task completion', async () => {
    vi.useFakeTimers();
    const wrapper = mountPanel(true);
    await nextTick();
    goalHomeMocks.refresh.mockClear();

    await wrapper.get('[data-testid="daily-todo-complete"]').trigger('click');
    await vi.runAllTimersAsync();

    expect(goalHomeMocks.refresh).toHaveBeenCalledTimes(5);
  });
});
