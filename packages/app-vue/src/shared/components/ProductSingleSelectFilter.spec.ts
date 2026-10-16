import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
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

  it('keeps the trigger focused when the closing menu surface steals focus late', async () => {
    vi.useFakeTimers();
    const wrapper = render();
    document.body.appendChild(wrapper.element);
    const trigger = wrapper.get('[data-testid="status-filter"]').element as HTMLElement;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    wrapper.findComponent(RadioGroupStub).vm.$emit('update:modelValue', 'active');
    await wrapper.vm.$nextTick();

    // Model the deferred teardown steal: focus lands on the exiting content node.
    const exitingContent = document.createElement('div');
    exitingContent.setAttribute('data-reka-menu-content', '');
    exitingContent.setAttribute('data-state', 'closed');
    exitingContent.tabIndex = -1;
    document.body.appendChild(exitingContent);
    exitingContent.focus();
    expect(document.activeElement).toBe(trigger);

    // A freshly reopened menu surface keeps its own focus.
    exitingContent.setAttribute('data-state', 'open');
    exitingContent.focus();
    expect(document.activeElement).toBe(exitingContent);

    // After the teardown window expires, later focus moves are left alone.
    exitingContent.setAttribute('data-state', 'closed');
    vi.advanceTimersByTime(3000);
    exitingContent.focus();
    expect(document.activeElement).toBe(exitingContent);

    exitingContent.remove();
    wrapper.element.remove();
    wrapper.unmount();
    vi.useRealTimers();
  });
});
