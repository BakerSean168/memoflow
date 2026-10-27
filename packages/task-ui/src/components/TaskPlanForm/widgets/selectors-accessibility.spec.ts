import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import enUS from '../../../../../locales/en-US';
import WeekdaySelector from './WeekdaySelector.vue';
import MonthDaySelector from './MonthDaySelector.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  missingWarn: false,
  fallbackWarn: false,
  messages: { 'en-US': enUS },
});

describe('recurrence selectors accessibility', () => {
  it('uses pressed buttons for weekday choices', () => {
    const wrapper = mount(WeekdaySelector, {
      props: { modelValue: [1] },
      global: { plugins: [i18n] },
    });
    const monday = wrapper.get('[data-testid="weekday-option-1"]');

    expect(monday.element.tagName).toBe('BUTTON');
    expect(monday.attributes('type')).toBe('button');
    expect(monday.attributes('aria-pressed')).toBe('true');
  });

  it('uses pressed buttons for month-day choices', () => {
    const wrapper = mount(MonthDaySelector, {
      props: { modelValue: [15] },
      global: { plugins: [i18n] },
    });
    const day = wrapper.get('[data-testid="month-day-option-15"]');

    expect(day.element.tagName).toBe('BUTTON');
    expect(day.attributes('type')).toBe('button');
    expect(day.attributes('aria-pressed')).toBe('true');
  });
});
