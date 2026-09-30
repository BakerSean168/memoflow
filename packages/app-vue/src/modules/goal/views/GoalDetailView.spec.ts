import { flushPromises, shallowMount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockGoalMutationReceipt, createMockKeyResult } from '@memoflow/contracts/mocks';
import { productionLocaleMessages } from '../../../locales/production-messages';
import GoalDetailView from './GoalDetailView.vue';

const actions = vi.hoisted(() => ({ aggregate: vi.fn(), openDialog: vi.fn(), push: vi.fn() }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'goal-1' } }),
  useRouter: () => ({ push: actions.push }),
}));
vi.mock('../composables/useGoal', () => ({
  useGoal: () => ({ getGoalAggregateView: actions.aggregate }),
}));
vi.mock('../../../shared/utils/useStrictInject', () => ({ useStrictInject: () => ({}) }));
vi.mock('../../../shared/composables/useLabelCatalog', () => ({
  useLabelCatalog: () => ({ options: ref([]), isLoading: ref(false), createLabel: vi.fn() }),
}));
vi.mock('../composables/useGoalWorkspace', () => ({
  useGoalWorkspace: () => ({
    workspace: ref({
      goal: createMockGoalMutationReceipt({
        status: 'InProgress',
        reminderConfig: null,
        keyResults: [
          createMockKeyResult({ id: 'kr-1' as never }),
          createMockKeyResult({ id: 'kr-2' as never }),
        ],
      }).readModel,
      taskContext: { availability: 'Unavailable' },
      knowledgeContext: { availability: 'Unavailable' },
      recentReviews: [],
      recentProgress: [],
    }),
    isLoading: ref(false),
    error: ref(null),
    refresh: vi.fn(),
  }),
}));
const DialogStub = defineComponent({
  setup(_, { expose }) {
    expose({ openDialog: actions.openDialog });
    return () => null;
  },
});

describe('Goal Detail quick check-in', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['click', 'Enter', ' '])(
    'reads the aggregate and opens the dialog once for %s activation',
    async (activation) => {
      actions.aggregate.mockResolvedValue({});
      const wrapper = shallowMount(GoalDetailView, {
        global: {
          plugins: [
            createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages }),
          ],
          stubs: { GoalRecordDialog: DialogStub },
        },
      });
      const button = wrapper.get('[data-testid="goal-quick-check-in-kr-2"]');
      expect(button.element.tagName).toBe('BUTTON');
      expect(button.attributes('type')).toBe('button');
      if (activation !== 'click') {
        await button.trigger('keydown', { key: activation });
        await button.trigger('keyup', { key: activation });
        await flushPromises();
        expect(actions.aggregate).not.toHaveBeenCalled();
        expect(actions.openDialog).not.toHaveBeenCalled();
      }
      // happy-dom does not synthesize keyboard clicks; dispatch the native activation click.
      await button.trigger('click');
      await flushPromises();
      expect(actions.aggregate).toHaveBeenCalledTimes(1);
      expect(actions.aggregate).toHaveBeenCalledWith('goal-1');
      expect(actions.openDialog).toHaveBeenCalledTimes(1);
      expect(actions.openDialog).toHaveBeenCalledWith('goal-1', 'kr-2');
      expect(actions.push).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );
});
