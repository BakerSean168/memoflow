import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProductSingleSelectFilter from './ProductSingleSelectFilter.vue';

const options = [
  { value: 'all', label: 'All', count: 4 },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused', disabled: true },
] as const;

const passthrough = (name: string, tag = 'div') =>
  defineComponent({
    name,
    setup(_props, { attrs, slots }) {
      return () => h(tag, attrs, slots.default?.());
    },
  });

const RadioGroupStub = defineComponent({
  name: 'DropdownMenuRadioGroup',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup(_props, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.());
  },
});

function render(modelValue = 'all') {
  return mount(ProductSingleSelectFilter, {
    props: {
      modelValue,
      options,
      accessibleLabel: 'Status',
      testId: 'status-filter',
      showCurrentCount: true,
    },
    global: {
      stubs: {
        Button: passthrough('Button', 'button'),
        DropdownMenu: passthrough('DropdownMenu'),
        DropdownMenuTrigger: passthrough('DropdownMenuTrigger'),
        DropdownMenuContent: passthrough('DropdownMenuContent'),
        DropdownMenuRadioGroup: RadioGroupStub,
        DropdownMenuRadioItem: passthrough('DropdownMenuRadioItem'),
        ChevronDown: true,
        ListFilter: true,
      },
    },
  });
}

describe('ProductSingleSelectFilter', () => {
  it('renders the current single-select value through the shared filter trigger', () => {
    const wrapper = render();

    expect(wrapper.text()).toContain('All');
    expect(wrapper.text()).toContain('4');
    expect(wrapper.get('[data-testid="status-filter"]').attributes('aria-label')).toBe('Status');
  });

  it('emits only valid enabled changes and ignores active, disabled, or unknown values', async () => {
    const wrapper = render();
    const group = wrapper.findComponent(RadioGroupStub);

    group.vm.$emit('update:modelValue', 'active');
    group.vm.$emit('update:modelValue', 'all');
    group.vm.$emit('update:modelValue', 'paused');
    group.vm.$emit('update:modelValue', 'missing');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('update:modelValue')).toEqual([['active']]);
  });
});
