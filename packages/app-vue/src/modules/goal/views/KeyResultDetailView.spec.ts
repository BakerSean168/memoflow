import { enableAutoUnmount, mount } from '@vue/test-utils';
import { ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { productionLocaleMessages } from '../../../locales/production-messages';
import { KEY_RESULT_CALCULATION_METHODS } from '../utils';
import KeyResultDetailView from './KeyResultDetailView.vue';

const goal = vi.hoisted(() => ({ getGoalAggregateView: vi.fn() }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { goalId: 'goal-1', keyResultId: 'kr-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('../composables/useGoal', () => ({
  useGoal: () => ({
    getGoalAggregateView: goal.getGoalAggregateView,
    keyResults: ref([
      {
        id: 'kr-1',
        title: 'Distance',
        description: null,
        progress: {
          aggregationMethod: method.value,
          initialValue: 0,
          currentValue: 1,
          targetValue: 10,
          unit: 'km',
        },
        target: null,
        weight: 3,
        progressPercentage: 10,
        isCompleted: false,
      },
    ]),
  }),
}));
const method = ref<(typeof KEY_RESULT_CALCULATION_METHODS)[number]>('Sum');
enableAutoUnmount(afterEach);

describe.each([
  { locale: 'zh-CN', labels: ['累计', '平均值', '最高值', '最低值', '最新值'] },
  { locale: 'en-US', labels: ['Cumulative', 'Average', 'Maximum', 'Minimum', 'Latest'] },
])('KeyResultDetailView in $locale', ({ locale, labels }) => {
  it.each(KEY_RESULT_CALCULATION_METHODS)(
    'localizes %s and keeps the KR unit',
    (calculationMethod) => {
      method.value = calculationMethod;
      const wrapper = mount(KeyResultDetailView, {
        global: {
          plugins: [createI18n({ legacy: false, locale, messages: productionLocaleMessages })],
        },
      });
      expect(wrapper.get('article p').text()).toBe(
        labels[KEY_RESULT_CALCULATION_METHODS.indexOf(calculationMethod)],
      );
      expect(wrapper.get('article').text()).toContain('1 / 10 km');
      expect(goal.getGoalAggregateView).toHaveBeenCalledWith('goal-1');
    },
  );
});
