import { createGoalPrismaAgentMutations, createGoalPrismaAgentReadPort } from '@memoflow/goal';
import { createTaskPrismaAgentMutations } from '@memoflow/task';
import { ExternalMutationError } from '@memoflow/database/transaction';
import type { PrismaClient } from '@memoflow/database';
import {
  GatewayReadError,
  type GatewayWritePort,
  type GatewayWriteAuthority,
} from '@memoflow/agent-gateway';
import {
  GatewayFailureCodeSchema,
  GatewayGoalCreateSchema,
  GatewayGoalUpdateSchema,
  GatewayKeyResultCreateSchema,
  GatewayKeyResultUpdateSchema,
  GatewayTaskCreateSchema,
  GatewayTaskUpdateSchema,
  GatewayTaskCompleteSchema,
} from '@memoflow/contracts/agent-gateway';
import type { UserTimeContextPort } from '@memoflow/time';
import { ResultErrorException } from '@memoflow/contracts/result';
import { z } from 'zod';
/** API composition binds application operations, never exposes business repositories to MCP. */
export function bindGatewayWrites(db: PrismaClient, time: UserTimeContextPort): GatewayWritePort {
  const goals = createGoalPrismaAgentMutations(db);
  const tasks = createTaskPrismaAgentMutations(db, time, createGoalPrismaAgentReadPort);
  function scope(authority: GatewayWriteAuthority, required: string) {
    if (!authority.scopes.includes(required)) throw new GatewayReadError('FORBIDDEN');
  }
  const bind = <T>(work: () => Promise<T>) =>
    Promise.resolve().then(work).catch((error: unknown) => {
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
    goalCreate: (input, cx, authority) =>
      bind(() => goals.create(GatewayGoalCreateSchema.parse(input), cx, authority)),
    goalUpdate: (input, cx, authority) =>
      bind(() => goals.update(GatewayGoalUpdateSchema.parse(input), cx, authority)),
    keyResultCreate: (input, cx, authority) =>
      bind(() => goals.createKeyResult(GatewayKeyResultCreateSchema.parse(input), cx, authority)),
    keyResultUpdate: (input, cx, authority) =>
      bind(() => goals.updateKeyResult(GatewayKeyResultUpdateSchema.parse(input), cx, authority)),
    taskCreate: (input, cx, authority) =>
      bind(async () => {
        const parsed = GatewayTaskCreateSchema.parse(input);
        if (parsed.plan.goalBinding) scope(authority, 'goals:write');
        return tasks.create(parsed, cx, authority);
      }),
    taskUpdate: (input, cx, authority) =>
      bind(async () => {
        const parsed = GatewayTaskUpdateSchema.parse(input);
        if (parsed.changes.goalBinding !== undefined) scope(authority, 'goals:write');
        return tasks.update(parsed, cx, authority);
      }),
    taskComplete: (input, cx, authority) =>
      bind(async () => {
        const parsed = GatewayTaskCompleteSchema.parse(input);
        if (parsed.completion.decision === 'record') scope(authority, 'goals:read');
        return tasks.complete(parsed, cx, authority);
      }),
  };
}
