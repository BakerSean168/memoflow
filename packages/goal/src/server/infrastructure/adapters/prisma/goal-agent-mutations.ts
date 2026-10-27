import {
  runExternalMutation,
  ExternalMutationError,
  type ExternalMutationAuthority,
} from '@memoflow/database/transaction';
import type { Prisma, PrismaClient } from '@memoflow/database';
import { GetGoalUseCase } from '../../../application/use-cases/queries/get-goal.use-case';
import { AddGoalKeyResultUseCase } from '../../../application/use-cases/commands/add-goal-key-result.use-case';
import { UpdateGoalKeyResultUseCase } from '../../../application/use-cases/commands/update-goal-key-result.use-case';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import {
  GoalAgentCreateSchema,
  GoalAgentUpdateSchema,
  GoalAgentKeyResultCreateSchema,
  GoalAgentKeyResultUpdateSchema,
  GoalAgentPersistedResultSchema,
  GoalAgentPersistedReceiptSchema,
  type GoalMutationReceipt,
} from '@memoflow/goal-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import type { IEventBus } from '@memoflow/patterns';
import { GoalPolicy } from '../../../domain';
import { CreateGoalUseCase } from '../../../application/use-cases/commands/create-goal.use-case';
import { UpdateGoalUseCase } from '../../../application/use-cases/commands/update-goal.use-case';
import { createInlineGoalWriteTransactionRunner } from '../../../application/use-cases/commands/goal-write-support';
import { GoalPrismaRepository } from './goal-prisma.repository';
import { GoalRecordPrismaRepository } from './goal-record-prisma.repository';
import { PrismaGoalReliableOperationAdapter } from './prisma-goal-reliable-operation.adapter';
import {
  BufferedGoalWriteEventBus,
  committedGoalWriteEventBus,
} from '../goal-write-buffered-event-bus';

/** Hosted writes use the canonical Goal commands inside the receipt transaction. */
export function createGoalPrismaAgentMutations(
  db: PrismaClient,
  events: IEventBus = committedGoalWriteEventBus,
) {
  async function mutate(
    input: { idempotencyKey: string },
    capability: string,
    cx: ExecutionContext,
    authority: ExternalMutationAuthority,
    work: (
      tx: Prisma.TransactionClient,
      buffered: BufferedGoalWriteEventBus,
    ) => Promise<Result<GoalMutationReceipt>>,
  ) {
    const buffered = new BufferedGoalWriteEventBus();
    const receipt = await runExternalMutation(
      db,
      cx.identityId,
      authority,
      capability,
      input,
      GoalAgentPersistedReceiptSchema,
      async (tx) => {
        const result = await work(tx, buffered);
        if (!result.ok) throw new ExternalMutationError(result.error.code);
        // Persist only the projection the response returns; the full Goal read
        // model stays inside the owner and never outlives the write receipt.
        return { result: GoalAgentPersistedResultSchema.parse(result.data) };
      },
    );
    await buffered.flush(events);
    return receipt;
  }
  function owner(tx: Prisma.TransactionClient, buffered: BufferedGoalWriteEventBus) {
    const goalRepository = new GoalPrismaRepository(tx, buffered, true);
    const goalRecordRepository = new GoalRecordPrismaRepository(tx);
    const runner = createInlineGoalWriteTransactionRunner(
      { goalRepository, goalRecordRepository },
      new PrismaGoalReliableOperationAdapter(tx),
    );
    return {
      create: new CreateGoalUseCase(goalRepository, new GoalPolicy(), runner, goalRecordRepository),
      addKr: new AddGoalKeyResultUseCase(goalRepository, new GoalPolicy()),
      updateKr: new UpdateGoalKeyResultUseCase(goalRepository, new GoalPolicy()),
      update: new UpdateGoalUseCase(goalRepository, new GoalPolicy(), runner),
    };
  }
  return {
    createKeyResult(input: unknown, cx: ExecutionContext, authority: ExternalMutationAuthority) {
      const parsed = GoalAgentKeyResultCreateSchema.parse(input);
      const { calculationMethod, ...keyResult } = parsed.keyResult;
      return mutate(parsed, 'goal.key-result.create.v1', cx, authority, (tx, buffered) =>
        owner(tx, buffered).addKr.execute(parsed.goalId, cx.identityId, {
          ...keyResult,
          aggregationMethod: calculationMethod,
        }),
      );
    },
    updateKeyResult(input: unknown, cx: ExecutionContext, authority: ExternalMutationAuthority) {
      const parsed = GoalAgentKeyResultUpdateSchema.parse(input);
      const { calculationMethod, description, unit, ...changes } = parsed.changes;
      return mutate(parsed, 'goal.key-result.update.v1', cx, authority, (tx, buffered) =>
        owner(tx, buffered).updateKr.execute(parsed.goalId, cx.identityId, parsed.keyResultId, {
          ...changes,
          aggregationMethod: calculationMethod,
          description,
          unit,
        }),
      );
    },
    create(input: unknown, cx: ExecutionContext, authority: ExternalMutationAuthority) {
      const parsed = GoalAgentCreateSchema.parse(input);
      return mutate(parsed, 'goal.create.v1', cx, authority, (tx, buffered) =>
        owner(tx, buffered).create.execute(parsed.goal, cx),
      );
    },
    update(input: unknown, cx: ExecutionContext, authority: ExternalMutationAuthority) {
      const parsed = GoalAgentUpdateSchema.parse(input);
      return mutate(parsed, 'goal.update.v1', cx, authority, (tx, buffered) =>
        owner(tx, buffered).update.execute(parsed.goalId, cx.identityId, parsed.changes),
      );
    },
  };
}

export function createGoalPrismaAgentReadPort(tx: Prisma.TransactionClient) {
  const query = new GetGoalUseCase(new GoalPrismaRepository(tx));
  return {
    getKeyResultMeasurementContext: query.getKeyResultMeasurementContext.bind(query),
    assertGoalOwnership: async (goalId: string, identityId: string) =>
      (await query.execute(goalId, identityId)).ok,
  };
}
