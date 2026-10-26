import { installGoalUiHost } from '@goal-ui-test-host/di/goal-ui-host';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import { KeyResultCalculationMethod } from '@memoflow/goal-contracts';
import { productionLocaleMessages } from '@goal-ui-test-host/locales/production-messages';
import {
  KEY_RESULT_CALCULATION_METHODS,
  KEY_RESULT_CALCULATION_PRESENTATION,
  getKeyResultCalculationLabel,
  getKeyResultRecordPromptLabel,
} from './index';

describe('Goal calculation presentation', () => {
  it('orders every domain method exactly once and describes every method', () => {
    expect(KEY_RESULT_CALCULATION_METHODS).toEqual(['Sum', 'Average', 'Max', 'Min', 'Last']);
    expect([...KEY_RESULT_CALCULATION_METHODS].sort()).toEqual(
      Object.values(KeyResultCalculationMethod).sort(),
    );
    expect(Object.keys(KEY_RESULT_CALCULATION_PRESENTATION).sort()).toEqual(
      Object.values(KeyResultCalculationMethod).sort(),
    );
  });

  it('uses the canonical Goal label keys', () => {
    expect(
      KEY_RESULT_CALCULATION_METHODS.map((method) =>
        getKeyResultCalculationLabel(method, (key) => key),
      ),
    ).toEqual([
      'goal.dialog.krCalculationSum',
      'goal.dialog.krCalculationAverage',
      'goal.dialog.krCalculationMax',
      'goal.dialog.krCalculationMin',
      'goal.dialog.krCalculationLast',
    ]);
  });

  it('describes Sum records as deltas', () => {
    expect(KEY_RESULT_CALCULATION_PRESENTATION.Sum).toMatchObject({
      recordInputKind: 'delta',
      recordPromptLabelKey: 'goal.recordDialog.changeThisTime',
    });
  });

  it.each(['Average', 'Max', 'Min', 'Last'] as const)(
    'describes %s records as samples',
    (method) => {
      expect(KEY_RESULT_CALCULATION_PRESENTATION[method]).toMatchObject({
        recordInputKind: 'sample',
        recordPromptLabelKey: 'goal.recordDialog.recordedValue',
      });
    },
  );

  it.each([
    {
      locale: 'zh-CN',
      labels: ['累计', '平均值', '最高值', '最低值', '最新值'],
      prompts: ['本次变化', '本次记录值', '本次记录值', '本次记录值', '本次记录值'],
    },
    {
      locale: 'en-US',
      labels: ['Cumulative', 'Average', 'Maximum', 'Minimum', 'Latest'],
      prompts: [
        'Change this time',
        'Recorded value',
        'Recorded value',
        'Recorded value',
        'Recorded value',
      ],
    },
  ])('localizes every method and record prompt in $locale', ({ locale, labels, prompts }) => {
    const { t } = createI18n({ legacy: false, locale, messages: productionLocaleMessages }).global;
    expect(
      KEY_RESULT_CALCULATION_METHODS.map((method) => getKeyResultCalculationLabel(method, t)),
    ).toEqual(labels);
    expect(
      KEY_RESULT_CALCULATION_METHODS.map((method) => getKeyResultRecordPromptLabel(method, t)),
    ).toEqual(prompts);
  });
});

installGoalUiHost();
