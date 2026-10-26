import type { IGoalRecordRepository, IGoalRepository } from '../../../domain';
import type { GoalNativeAiLease } from '@memoflow/goal-contracts';
import type {
  BusinessOperationReceipt,
  GoalRecordReceiptInput,
  GoalReliableOperationPort,
} from '@memoflow/reliable-messaging-contracts';

export interface GoalWriteRepositories {
  readonly goalRepository: IGoalRepository;
  readonly goalRecordRepository: IGoalRecordRepository;
}

export interface GoalWriteTransactionContext extends GoalWriteRepositories {
  /** Executes while holding the same DB transaction lock as the Goal create.
   * Absent in test/inline runners: a fenced AI create MUST fail closed. */
  readonly assertNativeAiLease?: (identityId: string, lease: GoalNativeAiLease) => Promise<boolean>;
  readonly recordGoalCompletionReceipt: (
    input: GoalRecordReceiptInput,
  ) => Promise<BusinessOperationReceipt>;
}

export interface GoalWriteTransactionRunner {
  run<T>(work: (context: GoalWriteTransactionContext) => Promise<T>): Promise<T>;
}

export function createInlineGoalWriteTransactionRunner(
  repositories: GoalWriteRepositories,
  receiptPort: GoalReliableOperationPort,
): GoalWriteTransactionRunner {
  return {
    run: (work) =>
      work({
        ...repositories,
        recordGoalCompletionReceipt: (input) => receiptPort.recordGoalCompletionReceipt(input),
      }),
  };
}
