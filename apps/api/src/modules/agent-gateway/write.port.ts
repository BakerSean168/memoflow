import { createGoalPrismaAgentMutations, createGoalPrismaAgentReadPort } from '@memoflow/goal';
import { createRoutinePrismaAgentMutations } from '@memoflow/reminder';
import { isScopedPatAuthorityCurrent } from '@memoflow/cloud-auth/server';
import { createAccountPrismaActiveQuery } from '@memoflow/account';
import { createTaskPrismaAgentMutations } from '@memoflow/task';
import {
  ExternalMutationError,
  type ExternalMutationAuthority,
} from '@memoflow/database/transaction';
import type { PrismaClient } from '@memoflow/database';
import {
  GatewayReadError,
  type GatewayWritePort,
  type GatewayWriteAuthority,
} from '@memoflow/agent-gateway';
import {
  GatewayFailureCodeSchema,
  GatewayRoutineCreateSchema,
  GatewayGoalCreateSchema,
  GatewayGoalUpdateSchema,
  GatewayKeyResultCreateSchema,
  GatewayKeyResultUpdateSchema,
  GatewayTaskCreateSchema,
  GatewayTaskUpdateSchema,
  GatewayTaskCompleteSchema,
} from '@memoflow/contracts/agent-gateway';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { UserTimeContextPort } from '@memoflow/time';
import { ResultErrorException } from '@memoflow/contracts/result';
import { z } from 'zod';
/** API composition binds application operations, never exposes business repositories to MCP. */
export function bindGatewayWrites(
  db: PrismaClient,
  time: UserTimeContextPort,
  options: { routineWriteEnabled?: boolean; assistedGuard?: { handleId: string; pendingJson: string } } = {},
): GatewayWritePort {
  const goals = createGoalPrismaAgentMutations(db);
  const tasks = createTaskPrismaAgentMutations(db, time, createGoalPrismaAgentReadPort);
  function scope(authority: GatewayWriteAuthority, required: string) {
    if (!authority.scopes.includes(required)) throw new GatewayReadError('FORBIDDEN');
  }
  function currentAuthority(
    cx: ExecutionContext,
    authority: GatewayWriteAuthority,
    requiredScope: string,
  ): ExternalMutationAuthority {
    scope(authority, requiredScope);
    return {
      ...authority,
      authorizeInTransaction: async (tx) => {
        if (options.assistedGuard) {
          const guard = options.assistedGuard;
          await tx.$queryRaw`SELECT id FROM ai_assisted_workflows WHERE id = ${guard.handleId} FOR SHARE`;
          const binding = await tx.aiAssistedWorkflow.findFirst({ where: {
            id: guard.handleId, identityId: cx.identityId, connectionId: authority.connectionId,
            pendingJson: guard.pendingJson,
          } });
          if (!binding) throw new GatewayReadError('FORBIDDEN');
        }
        if (
          !(await isScopedPatAuthorityCurrent(
            tx,
            {
              identityId: cx.identityId,
              credentialId: authority.connectionId,
              scopes: authority.scopes,
            },
            createAccountPrismaActiveQuery(tx),
            requiredScope,
          ))
        )
          throw new GatewayReadError('FORBIDDEN');
      },
    };
  }
  const bind = <T>(work: () => Promise<T>) =>
    Promise.resolve()
      .then(work)
      .catch((error: unknown) => {
        if (error instanceof GatewayReadError) throw error;
        if (error instanceof ResultErrorException && error.statusCode === 400)
          throw new GatewayReadError('VALIDATION_ERROR');
        if (error instanceof z.ZodError) throw new GatewayReadError('VALIDATION_ERROR');
        if (error instanceof ExternalMutationError) {
          const code = GatewayFailureCodeSchema.safeParse(
            error.code === 'BAD_REQUEST' ? 'VALIDATION_ERROR' : error.code,
          );
          throw new GatewayReadError(code.success ? code.data : 'INTERNAL_ERROR');
        }
        throw error;
      });
  return {
    ...(options.routineWriteEnabled
      ? {
          routineCreate: (input: unknown, cx: ExecutionContext, authority: GatewayWriteAuthority) =>
            bind(async () => {
              scope(authority, 'routines:write');
              return createRoutinePrismaAgentMutations(db).create(
                GatewayRoutineCreateSchema.parse(input),
                cx,
                currentAuthority(cx, authority, 'routines:write'),
              );
            }),
        }
      : {}),
    goalCreate: (input, cx, authority) =>
      bind(() =>
        goals.create(
          GatewayGoalCreateSchema.parse(input),
          cx,
          currentAuthority(cx, authority, 'goals:write'),
        ),
      ),
    goalUpdate: (input, cx, authority) =>
      bind(() =>
        goals.update(
          GatewayGoalUpdateSchema.parse(input),
          cx,
          currentAuthority(cx, authority, 'goals:write'),
        ),
      ),
    keyResultCreate: (input, cx, authority) =>
      bind(() =>
        goals.createKeyResult(
          GatewayKeyResultCreateSchema.parse(input),
          cx,
          currentAuthority(cx, authority, 'goals:write'),
        ),
      ),
    keyResultUpdate: (input, cx, authority) =>
      bind(() =>
        goals.updateKeyResult(
          GatewayKeyResultUpdateSchema.parse(input),
          cx,
          currentAuthority(cx, authority, 'goals:write'),
        ),
      ),
    taskCreate: (input, cx, authority) =>
      bind(async () => {
        const parsed = GatewayTaskCreateSchema.parse(input);
        if (parsed.plan.goalBinding) scope(authority, 'goals:write');
        return tasks.create(parsed, cx, currentAuthority(cx, authority, 'tasks:write'));
      }),
    taskUpdate: (input, cx, authority) =>
      bind(async () => {
        const parsed = GatewayTaskUpdateSchema.parse(input);
        if (parsed.changes.goalBinding !== undefined) scope(authority, 'goals:write');
        return tasks.update(parsed, cx, currentAuthority(cx, authority, 'tasks:write'));
      }),
    taskComplete: (input, cx, authority) =>
      bind(async () => {
        const parsed = GatewayTaskCompleteSchema.parse(input);
        if (parsed.completion.decision === 'record') scope(authority, 'goals:read');
        return tasks.complete(parsed, cx, currentAuthority(cx, authority, 'tasks:write'));
      }),
  };
}
