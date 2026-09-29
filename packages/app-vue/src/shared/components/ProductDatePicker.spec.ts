import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { requireYmd } from '@memoflow/contracts/primitives';
import ProductDatePicker from './ProductDatePicker.vue';

describe('ProductDatePicker', () => {
  it('presents an exact-day value in the compact editable slash format', async () => {
    const wrapper = mount(ProductDatePicker, {
      props: {
        modelValue: requireYmd('2027-11-15'),
        label: 'Start',
        testId: 'start-picker',
      },
      attachTo: document.body,
    });
    await wrapper.get('[data-testid="start-picker"]').trigger('click');

    expect(
      (document.querySelector('[data-testid="start-picker-query"]') as HTMLInputElement).value,
    ).toBe('2027/11/15');
    wrapper.unmount();
  });

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

  it('switches precision on an empty exact-date field without emitting a made-up date', async () => {
    const wrapper = mount(ProductDatePicker, {
      props: { modelValue: null, label: 'Start', testId: 'start-picker' },
      attachTo: document.body,
    });
    await wrapper.get('[data-testid="start-picker"]').trigger('click');

    const quarterPrecision = new DOMWrapper(
      document.querySelector('[data-testid="start-picker-precision-quarter"]')!,
    );
    await quarterPrecision.trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    const year = Number(
      (document.querySelector('[data-testid="start-picker-year"]') as HTMLInputElement).value,
    );
    const q4 = new DOMWrapper(document.querySelector('[data-testid="start-picker-quarter-4"]')!);
    await q4.trigger('click');
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      requireYmd(`${year}-10-01`),
    ]);
    wrapper.unmount();
  });

  it('exposes the same five precision controls used by timeframe targets', async () => {
    const wrapper = mount(ProductDatePicker, {
      props: { modelValue: null, label: 'Start', testId: 'start-picker' },
      attachTo: document.body,
    });
    await wrapper.get('[data-testid="start-picker"]').trigger('click');
    expect(document.body.textContent).toContain('Day');
    expect(document.body.textContent).toContain('Month');
    expect(document.body.textContent).toContain('Quarter');
    expect(document.body.textContent).toContain('Half');
    expect(document.body.textContent).toContain('Year');
    wrapper.unmount();
  });

  it('supports exact-day-only mode without rendering precision tabs or accepting coarse input', async () => {
    const wrapper = mount(ProductDatePicker, {
      props: {
        modelValue: null,
        label: 'Start',
        testId: 'start-picker',
        allowedKinds: ['day'],
      },
      attachTo: document.body,
    });
    await wrapper.get('[data-testid="start-picker"]').trigger('click');

    expect(document.querySelector('[data-testid="start-picker-precision-day"]')).toBeNull();
    expect(document.querySelector('[data-testid="start-picker-precision-month"]')).toBeNull();
    expect(document.querySelector('[data-testid="start-picker-precision-quarter"]')).toBeNull();

    const query = new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="start-picker-query"]')!,
    );
    await query.setValue('Q4 2027');
    await query.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    wrapper.unmount();
  });
});
