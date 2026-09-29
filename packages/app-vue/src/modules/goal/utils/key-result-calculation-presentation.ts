import { KeyResultCalculationMethod } from '@memoflow/contracts/goal';

export const KEY_RESULT_CALCULATION_METHODS = [
  KeyResultCalculationMethod.Sum,
  KeyResultCalculationMethod.Average,
  KeyResultCalculationMethod.Max,
  KeyResultCalculationMethod.Min,
  KeyResultCalculationMethod.Last,
] as const;

/** Goal-owned presentation vocabulary. The unit always comes from the KR itself. */
export const KEY_RESULT_CALCULATION_PRESENTATION = {
  Sum: {
    labelKey: 'goal.dialog.krCalculationSum',
    recordInputKind: 'delta',
    recordPromptLabelKey: 'goal.recordDialog.changeThisTime',
  },
  Average: {
    labelKey: 'goal.dialog.krCalculationAverage',
    recordInputKind: 'sample',
    recordPromptLabelKey: 'goal.recordDialog.recordedValue',
  },
  Max: {
    labelKey: 'goal.dialog.krCalculationMax',
    recordInputKind: 'sample',
    recordPromptLabelKey: 'goal.recordDialog.recordedValue',
  },
  Min: {
    labelKey: 'goal.dialog.krCalculationMin',
    recordInputKind: 'sample',
    recordPromptLabelKey: 'goal.recordDialog.recordedValue',
  },
  Last: {
    labelKey: 'goal.dialog.krCalculationLast',
    recordInputKind: 'sample',
    recordPromptLabelKey: 'goal.recordDialog.recordedValue',
  },
} as const satisfies Record<
  KeyResultCalculationMethod,
  {
    labelKey: string;
    recordInputKind: 'delta' | 'sample';
    recordPromptLabelKey: string;
  }
>;

export function getKeyResultCalculationLabel(
  method: KeyResultCalculationMethod,
  t: (key: string) => string,
): string {
  return t(KEY_RESULT_CALCULATION_PRESENTATION[method].labelKey);
}

export function getKeyResultRecordPromptLabel(
  method: KeyResultCalculationMethod,
  t: (key: string) => string,
): string {
  return t(KEY_RESULT_CALCULATION_PRESENTATION[method].recordPromptLabelKey);
}
