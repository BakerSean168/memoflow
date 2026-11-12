import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { createDefaultUserPreferenceProfile } from '@memoflow/setting-contracts';
import { requireYmd } from '@memoflow/shared-primitives';
import { formatProductYmd, setProductTimePreferences } from '../utils/product-time';
import ProductDatePicker from './ProductDatePicker.vue';

describe('ProductDatePicker', () => {
  afterEach(() => {
    setProductTimePreferences(createDefaultUserPreferenceProfile());
  });

  it('reformats a day chip when the product locale changes', async () => {
    const base = createDefaultUserPreferenceProfile();
    setProductTimePreferences({
      ...base,
      presentation: { ...base.presentation, language: 'en-US' },
    });
    const enLabel = formatProductYmd('2027-11-15');
    const wrapper = mount(ProductDatePicker, {
      props: {
        modelValue: requireYmd('2027-11-15'),
        label: 'Start',
        testId: 'start-picker',
      },
      attachTo: document.body,
    });
    expect(wrapper.get('[data-testid="start-picker"]').text()).toContain(enLabel);

    setProductTimePreferences({
      ...base,
      presentation: { ...base.presentation, language: 'zh-CN' },
    });
    await nextTick();

    const zhLabel = formatProductYmd('2027-11-15');
    expect(zhLabel).not.toBe(enLabel);
    expect(wrapper.get('[data-testid="start-picker"]').text()).toContain(zhLabel);
    wrapper.unmount();
  });

  it('reserves a single validation line and associates only a visible parse error', async () => {
    const wrapper = mount(ProductDatePicker, {
      props: { modelValue: null, label: 'Start', testId: 'start-picker' },
      attachTo: document.body,
    });
    await wrapper.get('[data-testid="start-picker"]').trigger('click');
    const query = new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="start-picker-query"]')!,
    );
    const slot = document.querySelector('[aria-live="polite"]');
    expect(slot?.classList.contains('min-h-4')).toBe(true);
    expect(query.attributes('aria-describedby')).toBeUndefined();
    await query.setValue('not a date');
    await query.trigger('keydown', { key: 'Enter' });
    expect(query.attributes('aria-invalid')).toBe('true');
    expect(query.attributes('aria-describedby')).toBe('start-picker-validation');
    expect(document.querySelector('#start-picker-validation')?.getAttribute('title')).toBe(
      'Enter a supported date format.',
    );
    await query.setValue('2026/10/16');
    await query.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([requireYmd('2026-10-16')]);
    wrapper.unmount();
  });

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

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([requireYmd(`${year}-10-01`)]);
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
