import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createDefaultUserPreferenceProfile } from '@memoflow/setting-contracts';
import { setProductTimePreferences } from '../utils/product-time';
import { productionLocaleMessages } from '../../locales/production-messages';
import ProductDateTimePicker from './ProductDateTimePicker.vue';

enableAutoUnmount(afterEach);
afterEach(() => setProductTimePreferences(createDefaultUserPreferenceProfile()));

describe('ProductDateTimePicker', () => {
  it('rejects a clock at or before its minimum and cannot apply while disabled', async () => {
    const preferences = createDefaultUserPreferenceProfile();
    setProductTimePreferences({
      ...preferences,
      regional: { ...preferences.regional, timeZone: 'UTC' },
    });
    const wrapper = mount(ProductDateTimePicker, {
      props: {
        open: true,
        presentation: 'panel',
        modelValue: Date.parse('2026-10-16T13:45:00Z'),
        minValue: Date.parse('2026-10-16T13:00:00Z'),
        title: 'Choose time',
      },
      global: {
        plugins: [
          createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages }),
        ],
      },
    });
    await flushPromises();
    const hour = wrapper.get('input[aria-label="Hour"]');
    await hour.setValue('12');
    const apply = wrapper.get('footer button:last-child');
    expect(apply.attributes('disabled')).toBeDefined();
    expect(hour.attributes('aria-invalid')).toBe('true');
    expect(hour.attributes('aria-describedby')).toBe(
      wrapper.get('[role="alert"]').attributes('id'),
    );
    await hour.setValue('14');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    await wrapper.setProps({ disabled: true });
    apply.element.dispatchEvent(new Event('click', { bubbles: true }));
    expect(wrapper.emitted('apply')).toBeUndefined();
    await wrapper.setProps({ disabled: false });
    await apply.trigger('click');
    expect(wrapper.emitted('apply')).toEqual([[Date.parse('2026-10-16T14:45:00Z')]]);
  });

  it('seeds an initially open pane, focuses its clock, applies once and restores the opener after cancel', async () => {
    const preferences = createDefaultUserPreferenceProfile();
    setProductTimePreferences({
      ...preferences,
      regional: { ...preferences.regional, timeZone: 'UTC' },
    });
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const wrapper = mount(ProductDateTimePicker, {
      attachTo: document.body,
      props: {
        open: true,
        presentation: 'panel',
        modelValue: Date.parse('2026-10-16T13:45:00Z'),
        title: 'Choose time',
      },
      global: {
        plugins: [
          createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages }),
        ],
      },
    });
    await flushPromises();
    const hour = wrapper.get<HTMLInputElement>('input[aria-label="Hour"]');
    expect(hour.element.value).toBe('13');
    expect(document.activeElement).toBe(hour.element);
    await hour.trigger('keydown', { key: 'ArrowUp' });
    expect(hour.element.value).toBe('14');
    await wrapper.get('footer button:last-child').trigger('click');
    expect(wrapper.emitted('apply')).toEqual([[Date.parse('2026-10-16T14:45:00Z')]]);
    await wrapper.setProps({ open: false });
    await flushPromises();
    expect(document.activeElement).toBe(opener);
    await wrapper.setProps({ open: true });
    await flushPromises();
    expect(wrapper.get<HTMLInputElement>('input[aria-label="Hour"]').element.value).toBe('13');
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('apply')).toHaveLength(1);
    expect(wrapper.emitted('update:open')).toEqual([[false], [false]]);
    wrapper.unmount();
    opener.remove();
  });

  it('cycles Tab and Shift+Tab at the modal picker boundaries', async () => {
    const wrapper = mount(ProductDateTimePicker, {
      attachTo: document.body,
      props: { open: true, modelValue: Date.parse('2026-10-16T13:45:00Z'), title: 'Choose time' },
      global: {
        plugins: [
          createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages }),
        ],
      },
    });
    await flushPromises();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const first = dialog.querySelector<HTMLElement>('button:not([disabled]):not([tabindex="-1"])')!;
    const last = [...dialog.querySelectorAll<HTMLButtonElement>('button')].at(-1)!;
    last.focus();
    last.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(first);
    first.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(last);
    wrapper.unmount();
  });
});
