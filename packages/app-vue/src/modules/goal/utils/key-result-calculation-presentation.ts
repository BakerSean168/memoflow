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
    explanationKey: 'goal.inspect.methodSum',
    labelKey: 'goal.dialog.krCalculationSum',
    recordInputKind: 'delta',
    recordPromptLabelKey: 'goal.recordDialog.changeThisTime',
  },
  Average: {
    explanationKey: 'goal.inspect.methodAverage',
    labelKey: 'goal.dialog.krCalculationAverage',
    recordInputKind: 'sample',
    recordPromptLabelKey: 'goal.recordDialog.recordedValue',
  },
  Max: {
    explanationKey: 'goal.inspect.methodMax',
    labelKey: 'goal.dialog.krCalculationMax',
    recordInputKind: 'sample',
    recordPromptLabelKey: 'goal.recordDialog.recordedValue',
  },
  Min: {
    explanationKey: 'goal.inspect.methodMin',
    labelKey: 'goal.dialog.krCalculationMin',
    recordInputKind: 'sample',
    recordPromptLabelKey: 'goal.recordDialog.recordedValue',
  },
  Last: {
    explanationKey: 'goal.inspect.methodLast',
    labelKey: 'goal.dialog.krCalculationLast',
    recordInputKind: 'sample',
    recordPromptLabelKey: 'goal.recordDialog.recordedValue',
  },
} as const satisfies Record<
  KeyResultCalculationMethod,
  {
    labelKey: string;
    explanationKey: string;
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

export function getKeyResultCalculationExplanation(
  method: KeyResultCalculationMethod,
  t: (key: string) => string,
): string {
  return t(KEY_RESULT_CALCULATION_PRESENTATION[method].explanationKey);
}
