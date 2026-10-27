import {
  runExternalMutation,
  ExternalMutationError,
  type ExternalMutationAuthority,
} from '@memoflow/database/transaction';
import type { Prisma, PrismaClient } from '@memoflow/database';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { brandedId, ID_PREFIXES, type IdentityId } from '@memoflow/contracts/primitives';
import {
  CreateTaskPlanSchema,
  TaskAgentCreateSchema,
  TaskAgentUpdateSchema,
  TaskAgentCompleteSchema,
  TaskAgentPersistedResultSchema,
  TaskAgentPersistedReceiptSchema,
  type TaskAgentReceipt,
} from '@memoflow/task-contracts';
import type { Result } from '@memoflow/contracts/result';
import type { UserTimeContextPort } from '@memoflow/time';
import type { IEventBus } from '@memoflow/patterns';
import type { TaskGoalMeasurementReadPort } from '../../../application/ports/task-workspace-read.ports';
import { CreateTaskPlanUseCase } from '../../../application/use-cases/commands/create-task-plan.use-case';
import { UpdateTaskPlanUseCase } from '../../../application/use-cases/commands/update-task-plan.use-case';
import { CompleteTaskOccurrenceUseCase } from '../../../application/use-cases/commands/complete-task-occurrence.use-case';
import { TaskOccurrenceProjectionService } from '../../../application/services/task-occurrence-projection.service';
import { PrismaTaskWriteTransactionRunner } from './prisma-task-write-transaction-runner';
import { TaskPlanPrismaRepository } from './task-plan-prisma.repository';
import { TaskOccurrencePrismaRepository } from './task-occurrence-prisma.repository';
import {
  BufferedTaskWriteEventBus,
  committedTaskWriteEventBus,
} from '../task-write-buffered-event-bus';
function value<T>(result: Result<T>): T {
  if (!result.ok) throw new ExternalMutationError(result.error.code);
  return result.data;
}
/** One owner transaction covers Task facts, existing Goal outbox, and result replay. */
export function createTaskPrismaAgentMutations(
  db: PrismaClient,
  timePort: UserTimeContextPort,
  goalReadFactory?: (tx: Prisma.TransactionClient) => TaskGoalMeasurementReadPort & {
    assertGoalOwnership(goalId: string, identityId: string): Promise<boolean>;
  },
  events: IEventBus = committedTaskWriteEventBus,
  options: { creationId?: string } = {},
) {
  async function mutate(
    input: { idempotencyKey: string },
    capability: string,
    cx: ExecutionContext,
    authority: ExternalMutationAuthority,
    work: (
      services: ReturnType<typeof owner>,
      identityId: IdentityId,
    ) => Promise<TaskAgentReceipt['result']>,
  ) {
    const identityId = brandedId<IdentityId>(ID_PREFIXES.IdentityId).parse(cx.identityId);
    const timeContext = await timePort.getUserTimeContext(identityId);
    const fixedTime: UserTimeContextPort = { getUserTimeContext: async () => timeContext };
    const buffered = new BufferedTaskWriteEventBus();
    const receipt = await runExternalMutation(
      db,
      identityId,
      authority,
      capability,
      input,
      TaskAgentPersistedReceiptSchema,
      async (tx) => ({
        // Persist only the projection the response returns; the full plan or
        // occurrence read body never enters the durable receipt.
        result: TaskAgentPersistedResultSchema.parse(
          await work(owner(tx, fixedTime, buffered), identityId),
        ),
      }),
    );
    await buffered.flush(events);
    return receipt;
  }
  function owner(
    tx: Prisma.TransactionClient,
    time: UserTimeContextPort,
    buffered: BufferedTaskWriteEventBus,
  ) {
    const planRepository = new TaskPlanPrismaRepository(tx, buffered);
    const occurrenceRepository = new TaskOccurrencePrismaRepository(tx, buffered);
    const runner = new PrismaTaskWriteTransactionRunner(tx, buffered);
    const goals = goalReadFactory?.(tx);
    return {
      plans: planRepository,
      occurrences: occurrenceRepository,
      goals,
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
    create(input: unknown, cx: ExecutionContext, authority: ExternalMutationAuthority) {
      const parsed = TaskAgentCreateSchema.parse(input);
      // Workflow host pins the canonical reviewed identity; external clients still
      // cannot supply IDs through TaskAgentCreateSchema.
      const id =
        options.creationId === undefined
          ? undefined
          : CreateTaskPlanSchema.shape.id.unwrap().parse(options.creationId);
      return mutate(
        { ...parsed, ...(id ? { ownerPlanId: id } : {}) },
        'task.plan.create.v1',
        cx,
        authority,
        async (owner, identityId) => {
          if (
            parsed.plan.goalBinding &&
            (!owner.goals ||
              !(await owner.goals.assertGoalOwnership(parsed.plan.goalBinding.goalId, identityId)))
          )
            throw new ExternalMutationError('NOT_FOUND');
          return {
            kind: 'plan',
            ...value(
              await owner.create.execute({ ...parsed.plan, ...(id ? { id } : {}), identityId }),
            ),
          };
        },
      );
    },
    update(input: unknown, cx: ExecutionContext, authority: ExternalMutationAuthority) {
      const parsed = TaskAgentUpdateSchema.parse(input);
      return mutate(parsed, 'task.plan.update.v1', cx, authority, async (owner, identityId) => {
        if (
          parsed.changes.goalBinding &&
          (!owner.goals ||
            !(await owner.goals.assertGoalOwnership(parsed.changes.goalBinding.goalId, identityId)))
        )
          throw new ExternalMutationError('NOT_FOUND');
        return {
          kind: 'plan',
          plan: value(await owner.update.execute(parsed.planId, identityId, parsed.changes)),
        };
      });
    },
    complete(input: unknown, cx: ExecutionContext, authority: ExternalMutationAuthority) {
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
            throw new ExternalMutationError('NOT_FOUND');
          if (occurrence.version !== parsed.expectedVersion)
            throw new ExternalMutationError('CONFLICT');
          const result = value(
            await owner.complete.execute(parsed.occurrenceId, identityId, {
              ...parsed.details,
              expectedVersion: parsed.expectedVersion,
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
