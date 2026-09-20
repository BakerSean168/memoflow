import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { requireYmd } from '@memoflow/contracts/primitives';
import ProductDatePicker from './ProductDatePicker.vue';

describe('ProductDatePicker', () => {
  it('accepts explicit coarse input and projects it to the exact start boundary', async () => {
    const wrapper = mount(ProductDatePicker, {
      props: { modelValue: null, label: 'Start', testId: 'start-picker' },
      attachTo: document.body,
    });
    await wrapper.get('[data-testid="start-picker"]').trigger('click');
    const queryElement = document.querySelector<HTMLInputElement>(
      '[data-testid="start-picker-query"]',
    )!;
    expect(queryElement.getAttribute('aria-label')).toBe('Choose date');
    const query = new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="start-picker-query"]')!,
    );
    await query.setValue('Q4 2027');
    await query.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([requireYmd('2027-10-01')]);
    wrapper.unmount();
  });
});
