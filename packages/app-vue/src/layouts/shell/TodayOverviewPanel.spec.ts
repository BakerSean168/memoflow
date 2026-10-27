import { installRoutineUiHost } from '../../di/routine-ui-host';
import { installGoalUiHost } from '../../di/goal-ui-host';
/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { defineComponent, h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TodayOverviewPanel from './TodayOverviewPanel.vue';
import { GoalProgressWidget } from '@memoflow/goal-ui';
import type { GoalHomeProgressItem } from '@memoflow/goal-contracts';

const goalHomeMocks = vi.hoisted(() => ({
  refresh: vi.fn(async () => undefined),
  errorMessage: null as string | null,
}));

vi.mock('@memoflow/goal-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/goal-ui')>();
  const { computed, ref } = await import('vue');
  return {
    ...actual,
    useGoalHomeSummary: () => ({
      goals: ref([]),
      isLoading: ref(false),
      error: computed(() => goalHomeMocks.errorMessage),
      refresh: goalHomeMocks.refresh,
    }),
  };
});

const DailyTodoWidgetStub = defineComponent({
  name: 'DailyTodoWidget',
  emits: ['view-all', 'open-plan', 'completed'],
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
  props: { error: { type: String, default: null } },
  emits: ['view-all', 'select', 'retry'],
  setup(props, { emit }) {
    return () =>
      h('div', { 'data-testid': 'goal-progress-widget' }, [
        h('button', { onClick: () => emit('view-all') }, 'goals'),
        h('button', { onClick: () => emit('select', 'goal-1') }, 'goal'),
        ...(props.error
          ? [
              h(
                'button',
                { 'data-testid': 'goal-progress-retry', onClick: () => emit('retry') },
                'retry',
              ),
            ]
          : []),
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

const messages = {
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
  'zh-CN': {
    shell: {
      home: {
        title: '今日概览',
        directActions: '直接开始',
        newGoal: '新建目标',
        quickTask: '快速任务',
      },
    },
  },
} as const;

function mountPanel(active: boolean, locale: 'en-US' | 'zh-CN' = 'en-US') {
  const i18n = createI18n({
    legacy: false,
    locale,
    messages,
  });
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
    goalHomeMocks.errorMessage = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats the home date with the active UI locale', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T12:00:00.000Z'));

    const zh = mountPanel(true, 'zh-CN');
    expect(zh.get('[data-testid="today-overview-date"]').text()).toBe('9月26日周六');

    const en = mountPanel(true, 'en-US');
    expect(en.get('[data-testid="today-overview-date"]').text()).toBe('Sat, September 26');
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

    wrapper.getComponent(DailyTodoWidgetStub).vm.$emit('open-plan', 'plan-1');

    expect(wrapper.emitted('open-route')).toEqual([
      ['goal', '/goals?dialog=goal'],
      ['task', '/tasks?dialog=quick-task'],
      ['task', '/tasks'],
      ['routine', '/routines'],
      ['goal', '/goals'],
      ['goal', '/goals/goal-1'],
      ['task', '/tasks/plan-1'],
    ]);
  });

  it('passes goal summary failures to the widget and wires its retry to refresh', async () => {
    goalHomeMocks.errorMessage = 'Could not load goals';
    const wrapper = mountPanel(true);
    await nextTick();

    expect(wrapper.getComponent(GoalProgressWidgetStub).props('error')).toBe(
      'Could not load goals',
    );
    goalHomeMocks.refresh.mockClear();
    await wrapper.get('[data-testid="goal-progress-retry"]').trigger('click');
    expect(goalHomeMocks.refresh).toHaveBeenCalledOnce();
  });

  it('renders Goal progress errors without claiming the user has no goals', async () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          goal: {
            homeProgress: {
              title: '目标进度',
              viewAll: '查看全部',
              empty: '暂无活跃目标',
              loadError: '暂时无法更新目标',
              retry: '重试',
            },
          },
        },
      },
    });
    const passthrough = { template: '<div><slot /></div>' };
    const cachedGoal: GoalHomeProgressItem = {
      id: 'cached',
      name: '缓存目标',
      progress: 32,
      status: 'Planned',
      target: null,
      keyResultCount: 1,
    };
    const wrapper = mount(GoalProgressWidget, {
      props: { goals: [], error: 'Request failed' },
      global: {
        plugins: [i18n],
        stubs: {
          Card: passthrough,
          CardHeader: passthrough,
          CardTitle: passthrough,
          CardContent: passthrough,
          Progress: passthrough,
          Skeleton: passthrough,
          Button: { template: '<button type="button"><slot /></button>' },
        },
      },
    });

    expect(wrapper.get('[data-testid="goal-progress-error"]').text()).toContain('暂时无法更新目标');
    expect(wrapper.text()).not.toContain('暂无活跃目标');
    await wrapper.get('[data-testid="goal-progress-retry"]').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);

    await wrapper.setProps({ goals: [cachedGoal] });
    expect(wrapper.get('[data-testid="goal-progress-item"]').text()).toContain('缓存目标');
    expect(wrapper.get('[data-testid="goal-progress-error"]').exists()).toBe(true);

    await wrapper.setProps({ error: null });
    expect(wrapper.find('[data-testid="goal-progress-error"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="goal-progress-item"]').exists()).toBe(true);
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

installGoalUiHost();

installRoutineUiHost();
