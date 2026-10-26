import {
  KeyResultCalculationMethod as KeyResultCalculationMethodContract,
  type KeyResultCalculationMethod as IKeyResultCalculationMethod,
} from '@memoflow/goal-contracts';

export type KeyResultCalculationMethod = IKeyResultCalculationMethod & {
  readonly __brand: unique symbol;
};

// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/contracts).
const VALUES: IKeyResultCalculationMethod[] = Object.values(KeyResultCalculationMethodContract);

export const KeyResultCalculationMethod = {
  Sum: 'Sum' as KeyResultCalculationMethod,
  Average: 'Average' as KeyResultCalculationMethod,
  Max: 'Max' as KeyResultCalculationMethod,
  Min: 'Min' as KeyResultCalculationMethod,
  Last: 'Last' as KeyResultCalculationMethod,

  of(value: string): KeyResultCalculationMethod {
    if (!this.isValid(value)) {
      throw new Error(`Invalid KeyResultCalculationMethod: ${value}`);
    }
    return value as KeyResultCalculationMethod;
  },

  isValid(value: string): value is KeyResultCalculationMethod {
    return VALUES.includes(value as IKeyResultCalculationMethod);
  },

  getAll(): KeyResultCalculationMethod[] {
    return VALUES as KeyResultCalculationMethod[];
  },

  isAggregation(method: KeyResultCalculationMethod): boolean {
    return method !== this.Last;
  },
};
