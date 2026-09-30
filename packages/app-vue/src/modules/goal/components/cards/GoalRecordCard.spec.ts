import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import type { GoalRecordClientDTO } from '@memoflow/contracts/goal';
import GoalRecordCard from './GoalRecordCard.vue';
import enGoal from '../../../../locales/en-US/goal';
import zhGoal from '../../../../locales/zh-CN/goal';
import { formatProductDateTime } from '../../../../shared/utils/product-time';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      goal: {
        cards: {
          cardsRecordCard: {
            authorship: { Manual: 'Manual record', TaskAutomatic: 'Automatic Task contribution', TaskUserMeasurement: 'Measurement entered on Task completion' },
            recordValue: 'Record value: ',
          },
        },
      },
    },
  },
});

function createRecord(overrides: Partial<GoalRecordClientDTO> = {}): GoalRecordClientDTO {
  return {
    id: 'record-1' as GoalRecordClientDTO['id'],
    keyResultId: 'kr-1' as GoalRecordClientDTO['keyResultId'],
    goalId: 'goal-1' as GoalRecordClientDTO['goalId'],
    value: 12,
    valueAfter: 12,
    authorship: 'Manual',
    source: null,
    recordedAt: 1745780400000,
    comment: 'Closed the remaining branch coverage gap.',
    createdAt: 1745780400000,
    updatedAt: 1745780400000,
    ...overrides,
  } as GoalRecordClientDTO;
}

describe('GoalRecordCard', () => {
  it('exports both public names from the single neutral implementation', () => {
    const index = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');
    expect(index).toMatch(
      /default as GoalRecordCard,\s*default as GoalRecordCardFromCards[\s\S]*?from '\.\/cards\/GoalRecordCard.vue'/,
    );
    expect(existsSync(resolve(__dirname, '../GoalRecordCard.vue'))).toBe(false);
    const component = readFileSync(resolve(__dirname, './GoalRecordCard.vue'), 'utf8');
    expect(component).not.toMatch(/\bPlus\b/);
  });

  it.each([-5, 0])('renders neutral record value %s without a positive prefix', (value) => {
    const wrapper = mount(GoalRecordCard, {
      props: { record: createRecord({ value }) },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain(`Record value: ${value}`);
    expect(wrapper.text()).not.toContain(`+${value}`);
    wrapper.unmount();
  });
  it('renders formatted value date and comment for a persisted progress record', () => {
    const record = createRecord();
    const wrapper = mount(GoalRecordCard, {
      props: { record },
      global: { plugins: [i18n] },
    });

    expect(wrapper.text()).toContain('Record value: 12');
    // ADR-037: product-time dateTime (session locale), not Date.toLocaleString
    expect(wrapper.text()).toContain(formatProductDateTime(record.recordedAt));
    expect(wrapper.text()).toContain('Closed the remaining branch coverage gap.');
  });

  it('falls back to product empty unknown and hides the comment block when absent', () => {
    const wrapper = mount(GoalRecordCard, {
      props: {
        record: createRecord({
          recordedAt: 'invalid-date' as unknown as GoalRecordClientDTO['createdAt'],
          comment: null,
        }),
      },
      global: { plugins: [i18n] },
    });

    // Invalid Instant → product-time empty/unknown catalog (session style, often '—')
    expect(wrapper.text()).toContain(formatProductDateTime('invalid-date'));
    expect(wrapper.text()).not.toContain('Closed the remaining branch coverage gap.');
  });
  it.each([
    ['Manual', 'Manual record'],
    ['TaskAutomatic', 'Automatic Task contribution'],
    ['TaskUserMeasurement', 'Measurement entered on Task completion'],
  ] as const)('renders localized %s provenance with recordedAt', (authorship, label) => {
    const record = createRecord({ authorship, recordedAt: 1700000000000, createdAt: 1600000000000,
      source: authorship === 'Manual' ? null : { type: 'TASK_INSTANCE', id: 'private-task-source-id' } });
    const wrapper = mount(GoalRecordCard, { props: { record }, global: { plugins: [i18n] } });
    expect(wrapper.text()).toContain(label);
    expect(wrapper.text()).toContain(formatProductDateTime(record.recordedAt));
    expect(wrapper.text()).not.toContain(formatProductDateTime(record.createdAt));
    expect(wrapper.text()).not.toContain('private-task-source-id');
    wrapper.unmount();
  });

  it.each([
    ['en-US', enGoal], ['zh-CN', zhGoal],
  ] as const)('uses the shipped %s provenance catalog', (locale, catalog) => {
    const localized = createI18n({ legacy: false, locale, messages: { [locale]: { goal: catalog } } });
    for (const authorship of ['Manual', 'TaskAutomatic', 'TaskUserMeasurement'] as const) {
      const wrapper = mount(GoalRecordCard, { props: { record: createRecord({ authorship }) }, global: { plugins: [localized] } });
      expect(wrapper.text()).toContain(catalog.cards.cardsRecordCard.authorship[authorship]);
      expect(wrapper.text()).not.toContain('goal.cards.cardsRecordCard.authorship.');
      wrapper.unmount();
    }
  });

});
