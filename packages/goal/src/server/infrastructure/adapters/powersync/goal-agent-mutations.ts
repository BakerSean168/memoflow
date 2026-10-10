import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import {
  GoalAgentCreateSchema,
  GoalAgentUpdateSchema,
  GoalAgentReceiptSchema,
  type GoalAgentReceipt,
  type GoalMutationReceipt,
} from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import type { IEventBus } from '@memoflow/patterns';
import { GoalPolicy } from '../../../domain';
import { CreateGoalUseCase } from '../../../application/use-cases/commands/create-goal.use-case';
import { UpdateGoalUseCase } from '../../../application/use-cases/commands/update-goal.use-case';
import { createInlineGoalWriteTransactionRunner } from '../../../application/use-cases/commands/goal-write-support';
import { GoalPowerSyncRepository } from './goal-powersync.repository';
import { GoalRecordPowerSyncRepository } from './goal-record-powersync.repository';
import { PowerSyncGoalReliableOperationAdapter } from './powersync-goal-reliable-operation.adapter';
import {
  BufferedGoalWriteEventBus,
  committedGoalWriteEventBus,
} from '../goal-write-buffered-event-bus';

export interface GoalAgentMutationAuthority {
  readonly connectionId: string;
  /** The host must revalidate its current authority using this owner transaction. */
  authorize(tx: IElectronDatabaseTransaction): Promise<void>;
}
export class GoalAgentMutationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const ReceiptRowSchema = z.object({ input_digest: z.string(), result_json: z.string() });
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** External writes enter the existing Goal use cases in one real owner transaction. */
export function createGoalPowerSyncAgentMutations(
  db: IElectronDatabase,
  events: IEventBus = committedGoalWriteEventBus,
) {
  async function mutate(
    input: { idempotencyKey: string },
    capability: string,
    cx: ExecutionContext,
    authority: GoalAgentMutationAuthority,
    work: (
      tx: IElectronDatabaseTransaction,
      buffered: BufferedGoalWriteEventBus,
    ) => Promise<Result<GoalMutationReceipt>>,
  ): Promise<GoalAgentReceipt> {
    if (!cx.identityId || !authority.connectionId) throw new GoalAgentMutationError('FORBIDDEN');
    const receiptId = hash([
      cx.identityId,
      authority.connectionId,
      capability,
      input.idempotencyKey,
    ]);
    const digest = hash(input);
    const buffered = new BufferedGoalWriteEventBus();
    const receipt = await db.writeTransaction(async (tx) => {
      await authority.authorize(tx);
      const row = await tx.getOptional<unknown>(
        'SELECT input_digest, result_json FROM goal_operation_receipts WHERE id = ? AND identity_id = ?',
        [receiptId, cx.identityId],
      );
      if (row) {
        const saved = ReceiptRowSchema.parse(row);
        if (saved.input_digest !== digest) throw new GoalAgentMutationError('CONFLICT');
        return GoalAgentReceiptSchema.parse(JSON.parse(saved.result_json));
      }
      const result = await work(tx, buffered);
      // A rejected owner operation must roll back any writes it made before
      // returning Result; its failure is never persisted as a success receipt.
      if (!result.ok) throw new GoalAgentMutationError(result.error.code);
      const saved = GoalAgentReceiptSchema.parse({ receiptId, result: result.data });
      await tx.execute(
        'INSERT INTO goal_operation_receipts (id,idempotency_key,operation_id,identity_id,source,occurrence_key,status,created_at,connection_id,capability,input_digest,result_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          receiptId,
          receiptId,
          receiptId,
          cx.identityId,
          'external_agent',
          input.idempotencyKey,
          'succeeded',
          new Date().toISOString(),
          authority.connectionId,
          capability,
          digest,
          JSON.stringify(saved),
        ],
      );
      return saved;
    });
    await buffered.flush(events);
    return receipt;
  }
  function owner(tx: IElectronDatabaseTransaction, buffered: BufferedGoalWriteEventBus) {
    const goalRepository = new GoalPowerSyncRepository(tx, buffered, true);
    const goalRecordRepository = new GoalRecordPowerSyncRepository(tx);
    const runner = createInlineGoalWriteTransactionRunner(
      { goalRepository, goalRecordRepository },
      new PowerSyncGoalReliableOperationAdapter(tx),
    );
    return {
      create: new CreateGoalUseCase(goalRepository, new GoalPolicy(), runner, goalRecordRepository),
      update: new UpdateGoalUseCase(goalRepository, new GoalPolicy(), runner),
    };
  }
  return {
    create(input: unknown, cx: ExecutionContext, authority: GoalAgentMutationAuthority) {
      const parsed = GoalAgentCreateSchema.parse(input);
      return mutate(parsed, 'goal.create.v1', cx, authority, (tx, buffered) =>
        owner(tx, buffered).create.execute(parsed.goal, cx),
      );
    },
    update(input: unknown, cx: ExecutionContext, authority: GoalAgentMutationAuthority) {
      const parsed = GoalAgentUpdateSchema.parse(input);
      return mutate(parsed, 'goal.update.v1', cx, authority, (tx, buffered) =>
        owner(tx, buffered).update.execute(parsed.goalId, cx.identityId, parsed.changes),
      );
    },
  };
}
