import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { brandedId, ID_PREFIXES, type IdentityId } from '@memoflow/contracts/primitives';
import {
  TaskAgentCreateSchema,
  TaskAgentUpdateSchema,
  TaskAgentCompleteSchema,
  TaskAgentReceiptSchema,
  type TaskAgentReceipt,
} from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import type { UserTimeContextPort } from '@memoflow/time';
import type { IEventBus } from '@memoflow/patterns';
import type { TaskGoalMeasurementReadPort } from '../../../application/ports/task-workspace-read.ports';
import { CreateTaskPlanUseCase } from '../../../application/use-cases/commands/create-task-plan.use-case';
import { UpdateTaskPlanUseCase } from '../../../application/use-cases/commands/update-task-plan.use-case';
import { CompleteTaskOccurrenceUseCase } from '../../../application/use-cases/commands/complete-task-occurrence.use-case';
import { TaskOccurrenceProjectionService } from '../../../application/services/task-occurrence-projection.service';
import { PowerSyncTaskWriteTransactionRunner } from './powersync-task-write-transaction-runner';
import { PowerSyncTaskPlanRepository } from './task-plan-powersync.repository';
import { PowerSyncTaskOccurrenceRepository } from './task-occurrence-powersync.repository';
import {
  BufferedTaskWriteEventBus,
  committedTaskWriteEventBus,
} from '../task-write-buffered-event-bus';

export interface TaskAgentMutationAuthority {
  readonly connectionId: string;
  authorize(tx: IElectronDatabaseTransaction): Promise<void>;
}
export class TaskAgentMutationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const ReceiptRowSchema = z.object({ input_digest: z.string(), result_json: z.string() });
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function value<T>(result: Result<T>): T {
  if (!result.ok) throw new TaskAgentMutationError(result.error.code);
  return result.data;
}

/** One Task owner transaction covers mutations, Goal outbox and durable replay. */
export function createTaskPowerSyncAgentMutations(
  db: IElectronDatabase,
  timePort: UserTimeContextPort,
  goalReadFactory?: (tx: IElectronDatabaseTransaction) => TaskGoalMeasurementReadPort,
  events: IEventBus = committedTaskWriteEventBus,
) {
  async function mutate(
    input: { idempotencyKey: string },
    capability: string,
    cx: ExecutionContext,
    authority: TaskAgentMutationAuthority,
    work: (
      services: ReturnType<typeof owner>,
      identityId: IdentityId,
    ) => Promise<TaskAgentReceipt['result']>,
  ): Promise<TaskAgentReceipt> {
    if (!cx.identityId || !authority.connectionId) throw new TaskAgentMutationError('FORBIDDEN');
    const identityId = brandedId<IdentityId>(ID_PREFIXES.IdentityId).parse(cx.identityId);
    const receiptId = hash([identityId, authority.connectionId, capability, input.idempotencyKey]);
    const digest = hash(input);
    // Resolve Product Time before the write lock; owner calls use this snapshot.
    const timeContext = await timePort.getUserTimeContext(identityId);
    const fixedTime: UserTimeContextPort = { getUserTimeContext: async () => timeContext };
    const buffered = new BufferedTaskWriteEventBus();
    const receipt = await db.writeTransaction(async (tx) => {
      await authority.authorize(tx);
      const row = await tx.getOptional<unknown>(
        'SELECT input_digest, result_json FROM task_agent_mutation_receipts WHERE id = ? AND identity_id = ?',
        [receiptId, identityId],
      );
      if (row) {
        const saved = ReceiptRowSchema.parse(row);
        if (saved.input_digest !== digest) throw new TaskAgentMutationError('CONFLICT');
        return TaskAgentReceiptSchema.parse(JSON.parse(saved.result_json));
      }
      const result = await work(owner(tx, fixedTime, buffered), identityId);
      const saved = TaskAgentReceiptSchema.parse({ receiptId, result });
      await tx.execute(
        'INSERT INTO task_agent_mutation_receipts (id,identity_id,connection_id,capability,idempotency_key,input_digest,result_json,created_at) VALUES (?,?,?,?,?,?,?,?)',
        [
          receiptId,
          identityId,
          authority.connectionId,
          capability,
          input.idempotencyKey,
          digest,
          JSON.stringify(saved),
          new Date().toISOString(),
        ],
      );
      return saved;
    });
    await buffered.flush(events);
    return receipt;
  }
  function owner(
    tx: IElectronDatabaseTransaction,
    time: UserTimeContextPort,
    buffered: BufferedTaskWriteEventBus,
  ) {
    const planRepository = new PowerSyncTaskPlanRepository(tx, buffered);
    const occurrenceRepository = new PowerSyncTaskOccurrenceRepository(tx, buffered);
    const transactionDb: IElectronDatabase = { ...tx, writeTransaction: (work) => work(tx) };
    const runner = new PowerSyncTaskWriteTransactionRunner(transactionDb, buffered);
    const goals = goalReadFactory?.(tx);
    return {
      plans: planRepository,
      occurrences: occurrenceRepository,
      create: new CreateTaskPlanUseCase(planRepository, occurrenceRepository, runner, time, goals),
      update: new UpdateTaskPlanUseCase(
        planRepository,
        occurrenceRepository,
        runner,
        time,
        Date.now,
        goals,
      ),
      complete: new CompleteTaskOccurrenceUseCase(
        occurrenceRepository,
        planRepository,
        runner,
        new TaskOccurrenceProjectionService(time),
      ),
    };
  }
  return {
    create(input: unknown, cx: ExecutionContext, authority: TaskAgentMutationAuthority) {
      const parsed = TaskAgentCreateSchema.parse(input);
      return mutate(parsed, 'task.plan.create.v1', cx, authority, async (owner, identityId) => ({
        kind: 'plan',
        ...value(await owner.create.execute({ ...parsed.plan, identityId })),
      }));
    },
    update(input: unknown, cx: ExecutionContext, authority: TaskAgentMutationAuthority) {
      const parsed = TaskAgentUpdateSchema.parse(input);
      return mutate(parsed, 'task.plan.update.v1', cx, authority, async (owner, identityId) => ({
        kind: 'plan',
        plan: value(await owner.update.execute(parsed.planId, identityId, parsed.changes)),
      }));
    },
    complete(input: unknown, cx: ExecutionContext, authority: TaskAgentMutationAuthority) {
      const parsed = TaskAgentCompleteSchema.parse(input);
      return mutate(
        parsed,
        'task.occurrence.complete.v1',
        cx,
        authority,
        async (owner, identityId) => {
          const occurrence = await owner.occurrences.findByIdForIdentity(
            identityId,
            parsed.occurrenceId,
          );
          if (
            !occurrence ||
            !(await owner.plans.findByIdForIdentity(identityId, String(occurrence.planId)))
          )
            throw new TaskAgentMutationError('NOT_FOUND');
          if (occurrence.version !== parsed.expectedVersion)
            throw new TaskAgentMutationError('CONFLICT');
          const result = value(
            await owner.complete.execute(parsed.occurrenceId, identityId, {
              ...parsed.details,
              ...(parsed.completion.decision === 'record'
                ? { goalMeasurement: parsed.completion.measurement }
                : {}),
            }),
          );
          return { kind: 'occurrence', occurrence: result.occurrence };
        },
      );
    },
  };
}
