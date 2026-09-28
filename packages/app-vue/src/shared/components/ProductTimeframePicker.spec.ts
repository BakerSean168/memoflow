import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import ProductTimeframePicker from './ProductTimeframePicker.vue';

describe('ProductTimeframePicker', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('presents exact-day input in the compact editable slash format', async () => {
    const wrapper = mount(ProductTimeframePicker, {
      props: {
        modelValue: { kind: 'day', date: '2027-11-15' },
        label: 'Target',
        testId: 'target-picker',
      },
      attachTo: document.body,
    });
    await wrapper.get('[data-testid="target-picker"]').trigger('click');

    expect(
      (document.querySelector('[data-testid="target-picker-query"]') as HTMLInputElement).value,
    ).toBe('2027/11/15');
    wrapper.unmount();
  });

  it('blocks a start candidate whose semantic start is after the allowed target end', async () => {
    const wrapper = mount(ProductTimeframePicker, {
      props: {
        modelValue: { kind: 'day', date: '2026-09-27' },
        label: 'Start',
        testId: 'start-picker',
        maxStartBoundary: '2026-09-30',
        constraintText: 'Start cannot be after target.',
      },
      attachTo: document.body,
    });
    await wrapper.get('[data-testid="start-picker"]').trigger('click');
    const query = new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="start-picker-query"]')!,
    );
    await query.setValue('2026/10/30');
    await query.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(document.body.textContent).toContain('Start cannot be after target.');
    wrapper.unmount();
  });

  it('allows a coarse target whose semantic end still overlaps the start boundary', async () => {
    const wrapper = mount(ProductTimeframePicker, {
      props: {
        modelValue: null,
        label: 'Target',
        testId: 'target-picker',
        minEndBoundary: '2026-09-30',
      },
      attachTo: document.body,
    });
    await wrapper.get('[data-testid="target-picker"]').trigger('click');
    const query = new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="target-picker-query"]')!,
    );
    await query.setValue('Q3 2026');
    await query.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      { kind: 'quarter', year: 2026, quarter: 3 },
    ]);
    wrapper.unmount();
  });

  it('switches precision on an empty value without inventing a default period', async () => {
    const wrapper = mount(ProductTimeframePicker, {
      props: { modelValue: null, label: 'Target', testId: 'target-picker' },
      attachTo: document.body,
    });
    await wrapper.get('[data-testid="target-picker"]').trigger('click');

    const quarterPrecision = new DOMWrapper(
      document.querySelector('[data-testid="target-picker-precision-quarter"]')!,
    );
    await quarterPrecision.trigger('click');
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    const year = Number(
      (document.querySelector('[data-testid="target-picker-year"]') as HTMLInputElement).value,
    );
    const q4 = new DOMWrapper(document.querySelector('[data-testid="target-picker-quarter-4"]')!);
    await q4.trigger('click');
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      { kind: 'quarter', year, quarter: 4 },
    ]);
    wrapper.unmount();
  });

  it('converts an existing value around the same planning anchor when precision changes', async () => {
    const wrapper = mount(ProductTimeframePicker, {
      props: {
        modelValue: { kind: 'day', date: '2027-11-15' },
        label: 'Target',
        testId: 'target-picker',
      },
      attachTo: document.body,
    });
    await wrapper.get('[data-testid="target-picker"]').trigger('click');

    const quarterPrecision = new DOMWrapper(
      document.querySelector('[data-testid="target-picker-precision-quarter"]')!,
    );
    await quarterPrecision.trigger('click');
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      { kind: 'quarter', year: 2027, quarter: 4 },
    ]);
    wrapper.unmount();
  });

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
