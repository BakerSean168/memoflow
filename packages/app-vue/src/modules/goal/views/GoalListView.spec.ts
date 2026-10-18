import { shallowMount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { defineComponent, h, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { productionLocaleMessages } from '../../../locales/production-messages';
import GoalListView from './GoalListView.vue';

const routerPush = vi.hoisted(() => vi.fn());
const routerReplace = vi.hoisted(() => vi.fn());

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, path: '/goals', hash: '' }),
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

vi.mock('../composables/useGoal', () => ({
  useGoal: () => ({
    goals: ref([]),
    isLoading: ref(false),
    selectedFolderId: ref(null),
    systemView: ref('active'),
    deleteGoal: vi.fn(),
  }),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: productionLocaleMessages,
});

const EmptyStateStub = defineComponent({
  name: 'AppEmptyState',
  setup(_, { slots }) {
    return () => h('div', { 'data-testid': 'goals-empty-state' }, slots.action?.());
  },
});

describe('GoalListView', () => {
  it('leaves toolbar controls to GoalModuleLayout and owns only the row/empty content surface', () => {
    const wrapper = shallowMount(GoalListView, {
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

    expect(wrapper.find('[data-testid="goals-empty-state"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-primary-action="create-goal"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="goal-list-create-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="create-goal-button"]').exists()).toBe(false);
    expect(wrapper.find('header').exists()).toBe(false);
  });
});
