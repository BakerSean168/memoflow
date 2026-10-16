import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import { setProductTimePreferences } from '../utils/product-time';
import { productionLocaleMessages } from '../../locales/production-messages';
import ProductDateTimePicker from './ProductDateTimePicker.vue';

enableAutoUnmount(afterEach);
afterEach(() => setProductTimePreferences(createDefaultUserPreferenceProfile()));

const source = readFileSync(resolve(__dirname, 'ProductDateTimePicker.vue'), 'utf8');
const fields = readFileSync(resolve(__dirname, 'ProductDateTimePickerFields.vue'), 'utf8');
const schedule = readFileSync(
  resolve(__dirname, '../../modules/schedule/components/CreateScheduleDialog.vue'),
  'utf8',
);

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
  it('reuses one Linear day calendar and clock editor in both presentations', () => {
    expect(fields).toContain('<Calendar');
    expect(fields).toContain('appearance="linear"');
    expect(fields).toContain('inputmode="numeric"');
    expect(fields).toContain('hourDraft');
    expect(fields).toContain('minuteDraft');
    expect(source).toContain('<ProductDateTimePickerFields');
    expect(source).toContain('<DialogContent');
    expect(source).not.toContain('ProductTemporalPickerSurface');
    expect(fields).not.toContain('ToggleGroup');
  });

  it('keeps exact day/hour/minute arithmetic, minimum guard and return path', () => {
    expect(source).toContain('getProductTime().input.combine');
    expect(source).toContain('formatProductDateTime');
    expect(source).toContain('draftInstant.value <= effectiveMinValue.value');
    expect(source).toContain(':disabled="disabled || !canApply"');
    expect(source).toContain('pastTimeText');
    expect(source).toContain("emit('update:open', false)");
  });

  it('opens within the business pane for Schedule without changing other callers', () => {
    expect(source).toContain("presentation === 'panel'");
    expect(source).toContain('<ProductEditorFrame');
    expect(source).toContain('pane-size="picker"');
    expect(source).toContain('<Dialog v-else');
    expect(schedule).toContain(':presentation="presentation"');
    expect(schedule).toContain('@lg/panel:grid-cols-');
    expect(schedule).toContain(":picker-width=\"presentation === 'panel' ? 'pane' : 'standard'\"");
  });
});
