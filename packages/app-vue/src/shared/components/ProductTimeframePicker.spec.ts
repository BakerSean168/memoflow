import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProductTimeframePicker from './ProductTimeframePicker.vue';

describe('ProductTimeframePicker', () => {
  it('parses explicit quarter input without collapsing precision to a day', async () => {
    const wrapper = mount(ProductTimeframePicker, {
      props: { modelValue: null, label: 'Target', testId: 'target-picker' },
      attachTo: document.body,
    });
    await wrapper.get('[data-testid="target-picker"]').trigger('click');
    const queryElement = document.querySelector<HTMLInputElement>(
      '[data-testid="target-picker-query"]',
    )!;
    expect(queryElement.getAttribute('aria-label')).toBe('Target timeframe');
    const query = new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="target-picker-query"]')!,
    );
    await query.setValue('Q4 2027');
    await query.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      { kind: 'quarter', year: 2027, quarter: 4 },
    ]);
    wrapper.unmount();
  });
});
