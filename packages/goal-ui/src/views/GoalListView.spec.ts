import { installGoalUiHost } from '@goal-ui-test-host/di/goal-ui-host';
import { shallowMount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { productionLocaleMessages } from '@goal-ui-test-host/locales/production-messages';
import GoalListView from './GoalListView.vue';

const routerPush = vi.hoisted(() => vi.fn());
const routerReplace = vi.hoisted(() => vi.fn());

const goalState = vi.hoisted(() => ({
  systemView: 'active' as 'active' | 'completed' | 'all',
  hasActiveFilter: false,
}));
const setSystemView = vi.hoisted(() =>
  vi.fn((view: 'active' | 'completed' | 'all') => {
    goalState.systemView = view;
  }),
);
const clearFilters = vi.hoisted(() =>
  vi.fn(() => {
    goalState.hasActiveFilter = false;
  }),
);

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, path: '/goals', hash: '' }),
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

vi.mock('../composables/useGoal', async () => {
  const { computed, ref } = await import('vue');
  return {
    useGoal: () => ({
      goals: ref([]),
      isLoading: ref(false),
      selectedFolderId: ref(null),
      systemView: computed(() => goalState.systemView),
      hasActiveFilter: computed(() => goalState.hasActiveFilter),
      setSystemView,
      clearFilters,
      deleteGoal: vi.fn(),
    }),
  };
});

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: productionLocaleMessages,
});

const EmptyStateStub = defineComponent({
  name: 'AppEmptyState',
  props: {
    title: String,
    description: String,
    actionLabel: String,
    testid: String,
  },
  emits: ['action'],
  setup(props, { emit }) {
    return () =>
      h('div', { 'data-testid': props.testid }, [
        h('span', { 'data-testid': 'empty-state-title' }, props.title),
        h('span', { 'data-testid': 'empty-state-description' }, props.description),
        props.actionLabel
          ? h(
              'button',
              {
                'data-testid': 'empty-state-action',
                onClick: () => emit('action'),
              },
              props.actionLabel,
            )
          : null,
      ]);
  },
});

function mountView() {
  return shallowMount(GoalListView, {
    global: {
      plugins: [i18n],
      stubs: {
        AppEmptyState: EmptyStateStub,
        ScrollArea: defineComponent({
          setup(_, { slots }) {
            return () => h('div', slots.default?.());
          },
        }),
      },
    },
  });
}

describe('GoalListView', () => {
  beforeEach(() => {
    goalState.systemView = 'active';
    goalState.hasActiveFilter = false;
    setSystemView.mockClear();
    clearFilters.mockClear();
  });

  it('leaves toolbar controls to GoalModuleLayout and owns only the row/empty content surface', () => {
    const wrapper = mountView();

    expect(wrapper.find('[data-testid="goals-empty-state"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-primary-action="create-goal"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="goal-list-create-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="create-goal-button"]').exists()).toBe(false);
    expect(wrapper.find('header').exists()).toBe(false);
  });

  it('describes a non-active empty view and offers to show all goals', async () => {
    goalState.systemView = 'completed';
    const wrapper = mountView();

    expect(wrapper.get('[data-testid="goals-view-empty"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="empty-state-description"]').text()).toContain(
      'No goals in this view',
    );
    const action = wrapper.get('[data-testid="empty-state-action"]');
    expect(action.text()).toBe('View all goals');

    await action.trigger('click');
    expect(setSystemView).toHaveBeenCalledWith('all');
  });

  it('offers to clear filters when a filter hides every goal in the view', async () => {
    goalState.systemView = 'completed';
    goalState.hasActiveFilter = true;
    const wrapper = mountView();

    const action = wrapper.get('[data-testid="empty-state-action"]');
    expect(action.text()).toBe('Clear filters');

    await action.trigger('click');
    expect(clearFilters).toHaveBeenCalledOnce();
  });
});

installGoalUiHost();
