import { GoalRecordSourceType } from '@memoflow/contracts/goal';
import {
  TaskGoalSettlementSourceType,
  type TaskGoalProgressOutboxEventV2,
  type TaskGoalSettlementSource,
} from '@memoflow/contracts/task';
import { ResultErrorException } from '@memoflow/contracts/result';
import type { IGoalRecordRepository, IGoalRepository } from '../../domain';
import { CreateGoalRecordUseCase } from '../use-cases/commands/create-goal-record.use-case';
import { RemoveTaskGoalContributionUseCase } from '../use-cases/commands/remove-task-goal-contribution.use-case';
import type { GoalWriteTransactionRunner } from '../use-cases/commands/goal-write-support';

export interface TaskGoalProgressHandler {
  handle(event: TaskGoalProgressOutboxEventV2): Promise<void>;
}

type CreateGoalRecordPort = Pick<CreateGoalRecordUseCase, 'execute'>;
type RemoveTaskContributionPort = Pick<RemoveTaskGoalContributionUseCase, 'execute'>;

/**
 * Goal-owned consumer for the durable Task -> Goal V2 contract.
 *
 * The event names the settlement source explicitly; Goal never infers Task
 * semantics from contribution triggers or re-reads Task repositories.
 */
export class GoalTaskProgressHandler implements TaskGoalProgressHandler {
  constructor(
    private readonly createGoalRecord: CreateGoalRecordPort,
    private readonly removeTaskContribution: RemoveTaskContributionPort,
  ) {}

  async handle(event: TaskGoalProgressOutboxEventV2): Promise<void> {
    if (event.schemaVersion !== 2 || event.eventType !== 'task.goal-progress-requested') {
      throw new Error(`Unsupported Task -> Goal event contract: ${event.eventType}`);
    }

    if (event.action === 'revert') {
      for (const settlementSource of event.sources) {
        const source = toGoalRecordSource(settlementSource);
        const result = await this.removeTaskContribution.execute(
          String(event.identityId),
          source.type,
          source.id,
        );
        if (!result.ok) {
          throw new ResultErrorException(
            `Task -> Goal removal failed (${result.error.code})`,
            result.error.code,
            undefined,
            result.error.context,
            undefined,
            result.error,
          );
        }
      }
      return;
    }

    const source = toGoalRecordSource(event.source);
    const note =
      event.source.type === TaskGoalSettlementSourceType.TaskPlan
        ? `任务计划完成: ${event.taskTitle}`
        : `任务实例完成: ${event.taskTitle}`;
    const result = await this.createGoalRecord.execute(
      String(event.goalId),
      String(event.keyResultId),
      { value: event.value, note, source },
      String(event.identityId),
    );

    if (!result.ok) {
      throw new ResultErrorException(
        `Task -> Goal delivery failed (${result.error.code})`,
        result.error.code,
        undefined,
        result.error.context,
        undefined,
        result.error,
      );
    }
  }
}

function toGoalRecordSource(source: TaskGoalSettlementSource) {
  return source.type === TaskGoalSettlementSourceType.TaskPlan
    ? { type: GoalRecordSourceType.TaskPlan, id: source.id }
    : { type: GoalRecordSourceType.TaskOccurrence, id: source.id };
}

export function createGoalTaskProgressHandler(
  goalRepository: IGoalRepository,
  goalRecordRepository: IGoalRecordRepository,
  transactionRunner: GoalWriteTransactionRunner,
): TaskGoalProgressHandler {
  return new GoalTaskProgressHandler(
    new CreateGoalRecordUseCase(goalRepository, goalRecordRepository, transactionRunner),
    new RemoveTaskGoalContributionUseCase(goalRepository, goalRecordRepository, transactionRunner),
  );
}
