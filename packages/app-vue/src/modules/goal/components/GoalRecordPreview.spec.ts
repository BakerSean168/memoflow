import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import { previewGoalRecord, createGoalRecordAggregationSnapshot } from '@memoflow/goal/client';
import enUS from '../../../locales/en-US';
import GoalRecordPreview from './GoalRecordPreview.vue';

describe('Goal Record preview', () => {
  it.each([
    ['Sum', 0, 50, 100, 5, 55],
    ['Average', 100, 80, 50, 20, 50],
    ['Max', 0, 80, 100, 70, 80],
    ['Min', 100, 80, 50, 90, 80],
  ] as const)(
    'renders current, after, target and actual unit for %s',
    (aggregationMethod, initialValue, currentValue, targetValue, candidate, after) => {
      const preview = previewGoalRecord(
        {
          keyResultId: 'kr-1' as never,
          initialValue,
          currentValue,
          targetValue,
          aggregationMethod,
          unit: 'kg',
          trackingBaseValue: 50,
          aggregationSnapshot: createGoalRecordAggregationSnapshot(
            aggregationMethod === 'Sum' ? [] : [80],
          ),
        },
        candidate,
      );
      const wrapper = mount(GoalRecordPreview, {
        props: { preview, unit: 'kg' },
        global: {
          plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
        },
      });
      expect(wrapper.text().replace(/\s/g, '')).toContain(`Current${currentValue}`);
      expect(wrapper.text()).toContain(`After${after}`);
      expect(wrapper.text().replace(/\s/g, '')).toContain(`Target${targetValue}`);
      expect(wrapper.text()).toContain('kg');
      if (aggregationMethod === 'Max' || aggregationMethod === 'Min')
        expect(wrapper.text()).toContain('sample will still be recorded');
    },
  );
});
