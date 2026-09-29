import {
  ReminderTriggerType as ReminderTriggerTypeContract,
  type ReminderTriggerType as IReminderTriggerType,
} from '@memoflow/contracts/goal';

export type ReminderTriggerType = IReminderTriggerType & { readonly __brand: unique symbol };

// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/contracts).
const VALUES: IReminderTriggerType[] = Object.values(ReminderTriggerTypeContract);

export const ReminderTriggerType = {
  AbsoluteAt: 'AbsoluteAt' as ReminderTriggerType,
  TimeProgressPercentage: 'TimeProgressPercentage' as ReminderTriggerType,
  RemainingDays: 'RemainingDays' as ReminderTriggerType,

  of(value: string): ReminderTriggerType {
    if (!this.isValid(value)) {
      throw new Error(`Invalid ReminderTriggerType: ${value}`);
    }
    return value as ReminderTriggerType;
  },

  isValid(value: string): value is ReminderTriggerType {
    return VALUES.includes(value as IReminderTriggerType);
  },

  getAll(): ReminderTriggerType[] {
    return VALUES as ReminderTriggerType[];
  },

  isTimeProgress(type: ReminderTriggerType): boolean {
    return type === this.TimeProgressPercentage;
  },

  isRemainingDays(type: ReminderTriggerType): boolean {
    return type === this.RemainingDays;
  },
};
