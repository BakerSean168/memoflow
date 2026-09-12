import { ResultErrorException, type ResultError } from '@memoflow/contracts/result';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import {
  TaskLabelOwnershipError,
  type ITaskPlanRepository,
} from '../../../domain/repositories/i-task-plan-repository';
import { mapInfraErrorToResultError } from '@memoflow/utils/errors';
import { OptimisticConcurrencyError } from '../../../domain/errors/optimistic-concurrency.error';

export interface TaskWriteRepositories {
  /** 完整事务（complete 等）需要模板读取；仅实例操作（uncomplete）可省略。 */
  readonly templateRepository?: ITaskPlanRepository;
  readonly instanceRepository: ITaskOccurrenceRepository;
}

export interface TaskWriteTransactionRunner {
  run<T>(work: (repositories: TaskWriteRepositories) => Promise<T>): Promise<T>;
}

export function createInlineTaskWriteTransactionRunner(
  repositories: TaskWriteRepositories,
): TaskWriteTransactionRunner {
  return {
    run: (work) => work(repositories),
  };
}

export function mapTaskWriteErrorToResultError(
  error: unknown,
  fallbackMessage: string,
): ResultError {
  if (error instanceof TaskLabelOwnershipError) {
    return {
      code: error.code,
      message: error.message,
      cause: error,
    };
  }
  if (error instanceof OptimisticConcurrencyError) {
    return {
      code: 'CONFLICT',
      message: error.message,
      context: {
        aggregateName: error.aggregateName,
        aggregateId: error.aggregateId,
      },
      cause: error,
    };
  }
  if (error instanceof ResultErrorException) {
    const ctx = (error as { context?: Record<string, unknown> }).context;
    const cause = (error as { cause?: unknown }).cause ?? error;
    return { code: 'BAD_REQUEST', message: error.message, context: ctx, cause };
  }

  return mapInfraErrorToResultError(error, fallbackMessage);
}
