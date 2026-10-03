import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import {
  computed,
  defineComponent,
  h,
  inject,
  provide,
  type ComputedRef,
  type InjectionKey,
} from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it } from 'vitest';
import { productionLocaleMessages } from '../../../locales/production-messages';
import { KEY_RESULT_CALCULATION_METHODS } from '../utils';
import GoalKeyResultCardEditor from './GoalKeyResultCardEditor.vue';
import GoalKeyResultDraftEditor from './GoalKeyResultDraftEditor.vue';

enableAutoUnmount(afterEach);

// Keep Select's controlled value/event contract without browser portals or pointer handling.
const selectContext: InjectionKey<{
  modelValue: ComputedRef<string>;
  update: (value: string) => void;
}> = Symbol('select');
const selectStubs = {
  Select: defineComponent({
    props: { modelValue: { type: String, required: true } },
    emits: ['update:modelValue'],
    setup(props, { emit, slots }) {
      provide(selectContext, {
        modelValue: computed(() => props.modelValue),
        update: (value) => emit('update:modelValue', value),
      });
      return () => h('div', { 'data-testid': 'select-stub' }, slots.default?.());
    },
  }),
  SelectTrigger: defineComponent({
    setup(_, { slots }) {
      return () => h('button', { role: 'combobox' }, slots.default?.());
    },
  }),
  SelectValue: defineComponent({
    setup() {
      const select = inject(selectContext)!;
      return () => h('span', select.modelValue.value);
    },
  }),
  SelectContent: defineComponent({
    setup(_, { slots }) {
      return () => h('div', slots.default?.());
    },
  }),
  SelectItem: defineComponent({
    props: { value: { type: String, required: true } },
    setup(props, { slots }) {
      const select = inject(selectContext)!;
      return () =>
        h(
          'button',
          {
            role: 'option',
            onClick: () => select.update(props.value),
          },
          slots.default?.(),
        );
    },
  }),
};

describe.each([
  { locale: 'zh-CN', labels: ['累计', '平均值', '最高值', '最低值', '最新值'] },
  { locale: 'en-US', labels: ['Cumulative', 'Average', 'Maximum', 'Minimum', 'Latest'] },
])('Goal KR editors in $locale', ({ locale, labels }) => {
  it('renders localized options while preserving selected and emitted domain methods', async () => {
    const i18n = createI18n({ legacy: false, locale, messages: productionLocaleMessages });
    const wrapper = mount(GoalKeyResultCardEditor, {
      props: {
        title: 'Distance',
        description: '',
        initialValue: 0,
        currentValue: 1,
        targetValue: 10,
        target: null,
        calculationMethod: 'Sum',
        unit: 'km',
        weight: 3,
      },
      global: { plugins: [i18n], stubs: selectStubs },
    });
    const trigger = wrapper.get('[data-testid="draft-kr-calculation-method"]');
    for (const method of KEY_RESULT_CALCULATION_METHODS) {
      await wrapper.setProps({ calculationMethod: method });
      await flushPromises();
      expect(trigger.text()).toBe(method);
    }

    const options = wrapper.findAll('[role="option"]');
    expect(options.map((option) => option.text())).toEqual(labels);
    for (const [index, method] of KEY_RESULT_CALCULATION_METHODS.entries()) {
      await options[index]!.trigger('click');
      expect(wrapper.emitted('update:calculationMethod')?.at(-1)).toEqual([method]);
    }
    expect(wrapper.get<HTMLInputElement>('[data-testid="draft-kr-unit-input"]').element.value).toBe(
      'km',
    );

    i18n.global.locale.value = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
    await flushPromises();
    expect(options.map((option) => option.text())).toEqual(
      locale === 'zh-CN'
        ? ['Cumulative', 'Average', 'Maximum', 'Minimum', 'Latest']
        : ['累计', '平均值', '最高值', '最低值', '最新值'],
    );
  });

  it('localizes all saved draft rows and preserves their KR units', () => {
    const wrapper = mount(GoalKeyResultDraftEditor, {
      props: {
        modelValue: KEY_RESULT_CALCULATION_METHODS.map((calculationMethod) => ({
          title: 'Distance',
          calculationMethod,
          initialValue: 0,
          currentValue: 1,
          targetValue: 10,
          unit: 'km',
          weight: 3,
        })),
      },
      global: {
        stubs: selectStubs,
        plugins: [createI18n({ legacy: false, locale, messages: productionLocaleMessages })],
      },
    });
    expect(
      wrapper.findAll('[data-testid="goal-key-result-draft-calculation"]').map((row) => row.text()),
    ).toEqual(labels);
    for (const row of wrapper.findAll('[data-testid="goal-key-result-draft-row"]')) {
      expect(row.text()).toContain('1 → 10 km');
    }
  });
});
