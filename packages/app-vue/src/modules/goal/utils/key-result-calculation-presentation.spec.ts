import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import { KeyResultCalculationMethod } from '@memoflow/contracts/goal';
import { productionLocaleMessages } from '../../../locales/production-messages';
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

  it('keeps Task presentation free of competing calculation label maps', () => {
    const taskRoot = resolve(__dirname, '../../task');
    const sources = readdirSync(taskRoot, { recursive: true, encoding: 'utf8' }).filter(
      (file) => /\.(vue|ts)$/.test(file) && !/\.(spec|test)\.ts$/.test(file),
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const source = readFileSync(resolve(taskRoot, file), 'utf8');
      expect(source, file).not.toMatch(
        /(?:\b(?:Sum|Average|Max|Min|Last)|\[KeyResultCalculationMethod\.\w+\])\s*:\s*(?:t\(|['"])/,
      );
      expect(source, file).not.toContain('goal.dialog.krCalculation');
    }
  });
});
