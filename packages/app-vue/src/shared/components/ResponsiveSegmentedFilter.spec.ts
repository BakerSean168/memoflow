import { shallowMount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ToggleGroup } from '@memoflow/ui-vue-shadcn';
import ResponsiveSegmentedFilter from './ResponsiveSegmentedFilter.vue';

const options = [
  { value: 'all', label: 'All' },
  { value: 'enabled', label: 'Running' },
  { value: 'disabled', label: 'Paused' },
] as const;

describe('ResponsiveSegmentedFilter', () => {
  it('uses the same model for the expanded segmented control and compact dropdown', async () => {
    const wrapper = shallowMount(ResponsiveSegmentedFilter, {
      props: {
        modelValue: 'all',
        options,
        accessibleLabel: 'Routine status',
        testId: 'routine-state-filter',
      },
    });

    const expanded = wrapper.findComponent(ToggleGroup);

    expect(expanded.props('modelValue')).toBe('all');

    expanded.vm.$emit('update:modelValue', 'enabled');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([['enabled']]);
  });

  it('ignores empty single-select updates so clicking the active segment cannot clear the filter', async () => {
    const wrapper = shallowMount(ResponsiveSegmentedFilter, {
      props: {
        modelValue: 'enabled',
        options,
        accessibleLabel: 'Routine status',
      },
    });

    const expanded = wrapper.findComponent(ToggleGroup);
    expanded.vm.$emit('update:modelValue', '');
    expanded.vm.$emit('update:modelValue', 'enabled');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
