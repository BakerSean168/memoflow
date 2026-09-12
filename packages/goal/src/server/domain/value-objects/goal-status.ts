import {
  GoalStatus as GoalStatusContract,
  type GoalStatus as IGoalStatus,
} from '@memoflow/contracts/goal';

export type GoalStatus = IGoalStatus & { readonly __brand: unique symbol };

const VALUES: IGoalStatus[] = Object.values(GoalStatusContract);

export const GoalStatus = {
  Planned: 'Planned' as GoalStatus,
  InProgress: 'InProgress' as GoalStatus,
  Completed: 'Completed' as GoalStatus,
  Abandoned: 'Abandoned' as GoalStatus,

  of(value: string): GoalStatus {
    if (!this.isValid(value)) throw new Error(`Invalid GoalStatus: ${value}`);
    return value as GoalStatus;
  },

  isValid(value: string): value is GoalStatus {
    return VALUES.includes(value as IGoalStatus);
  },

  getAll(): GoalStatus[] {
    return VALUES as GoalStatus[];
  },

  isPlanned(status: GoalStatus): boolean {
    return status === this.Planned;
  },

  isInProgress(status: GoalStatus): boolean {
    return status === this.InProgress;
  },

  isCompleted(status: GoalStatus): boolean {
    return status === this.Completed;
  },

  isAbandoned(status: GoalStatus): boolean {
    return status === this.Abandoned;
  },

  isTerminal(status: GoalStatus): boolean {
    return this.isCompleted(status) || this.isAbandoned(status);
  },
};
