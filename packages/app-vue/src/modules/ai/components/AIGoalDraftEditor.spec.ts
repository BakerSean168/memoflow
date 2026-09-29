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
import { KEY_RESULT_CALCULATION_METHODS } from '../../goal/utils';
import type { EditableKeyResult } from '../composables';
import AIGoalDraftEditor from './AIGoalDraftEditor.vue';

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
])('AIGoalDraftEditor in $locale', ({ locale, labels }) => {
  it('uses Goal option labels and preserves selected methods and emitted draft payloads', async () => {
    const keyResults: EditableKeyResult[] = KEY_RESULT_CALCULATION_METHODS.map(
      (aggregationMethod, index) => ({
        draftRef: `kr-${index}`,
        title: 'Distance',
        description: '',
        aggregationMethod,
        initialValue: 0,
        currentValue: 1,
        targetValue: 10,
        target: null,
        unit: 'km',
        weight: 3,
      }),
    );
    const i18n = createI18n({ legacy: false, locale, messages: productionLocaleMessages });
    const wrapper = mount(AIGoalDraftEditor, {
      props: {
        goal: { name: 'Fitness', summary: '', status: 'Planned', start: null, target: null },
        keyResults,
        isSubmitting: false,
      },
      global: { plugins: [i18n], stubs: selectStubs },
    });
    await flushPromises();
    const methodSelects = wrapper.findAll('[data-testid="select-stub"]').slice(1);
    expect(methodSelects.map((select) => select.get('[role="combobox"]').text())).toEqual(
      KEY_RESULT_CALCULATION_METHODS,
    );
    for (const [index, select] of methodSelects.entries()) {
      const options = select.findAll('[role="option"]');
      expect(options.map((option) => option.text())).toEqual(labels);
      for (const [methodIndex, aggregationMethod] of KEY_RESULT_CALCULATION_METHODS.entries()) {
        await options[methodIndex]!.trigger('click');
        expect(wrapper.emitted('update-key-result')?.at(-1)).toEqual([
          { index, value: { ...keyResults[index], aggregationMethod } },
        ]);
      }
    }

    i18n.global.locale.value = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
    await flushPromises();
    expect(methodSelects[0]!.findAll('[role="option"]').map((option) => option.text())).toEqual(
      locale === 'zh-CN'
        ? ['Cumulative', 'Average', 'Maximum', 'Minimum', 'Latest']
        : ['累计', '平均值', '最高值', '最低值', '最新值'],
    );
  });
});
