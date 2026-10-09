import { createHmac, timingSafeEqual } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { readToolDescriptors, type GatewayReadToolName } from '../read-tool-descriptors';
import {
  ExternalGoalSchema,
  GoalGetOutputSchema,
  GoalSearchOutputSchema,
  TaskPlanGetOutputSchema,
  TaskPlanSearchOutputSchema,
  TaskOccurrenceGetOutputSchema,
  TaskOccurrenceListOutputSchema,
} from '@memoflow/contracts/agent-gateway';
import { GoalPagePositionSchema, type GoalClientDTO } from '@memoflow/contracts/goal';
import { TaskPlanPositionSchema, TaskOccurrencePositionSchema } from '@memoflow/contracts/task';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import {
  GatewayReadError as ControlledError,
  type GoalReadPort,
  type TaskReadPort,
  type GatewayReadBudget,
} from '../ports';
const MAX_BYTES = 256 * 1024;
export interface ReadToolCall {
  <T extends object>(
    name: GatewayReadToolName,
    scope: 'goals:read' | 'tasks:read',
    work: () => Promise<T>,
  ): Promise<{
    content: { type: 'text'; text: string }[];
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  }>;
}
const CursorSchema = z.strictObject({
  identityId: z.string(),
  query: z.string().max(200),
  limit: z.number().int().min(1).max(100),
  order: z.literal('createdAt-desc/id-desc'),
  expiresAt: z.number().int(),
  after: GoalPagePositionSchema,
});
const TaskCursorSchema = z.strictObject({
  identityId: z.string(),
  tool: z.enum(['task_plan_search', 'task_occurrence_list']),
  binding: z.string().max(1000),
  expiresAt: z.number().int(),
  after: z.union([TaskPlanPositionSchema, TaskOccurrencePositionSchema]),
  timeZone: z.string().max(100).optional(),
  asOf: z.number().int().nonnegative().optional(),
});
function fitPage<T>(values: readonly T[]) {
  const items = [...values];
  let truncated = false;
  while (items.length > 1 && Buffer.byteLength(JSON.stringify(items)) > MAX_BYTES - 4096) {
    items.pop();
    truncated = true;
  }
  return { items, truncated };
}

function projectGoal(goal: GoalClientDTO) {
  if ((goal.keyResults?.length ?? 0) > 100) throw new ControlledError('RESPONSE_TOO_LARGE');
  return ExternalGoalSchema.parse({
    id: goal.id,
    name: goal.name,
    summary: goal.summary,
    status: goal.status,
    version: goal.version,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
    overallProgress: goal.overallProgress,
    keyResults: (goal.keyResults ?? []).map((kr) => ({
      id: kr.id,
      title: kr.title,
      progress: kr.progress,
      progressPercentage: kr.progressPercentage,
      isCompleted: kr.isCompleted,
    })),
  });
}
/** Shared native MCP definitions; each host retains authentication, deadlines and audit. */
export function registerReadTools(
  server: McpServer,
  options: { cursorSecret: string; goals: GoalReadPort; tasks?: TaskReadPort },
  context: ExecutionContext,
  budget: GatewayReadBudget,
  scopes: readonly string[],
  call: ReadToolCall,
): void {
  const sign = (payload: string) =>
    createHmac('sha256', options.cursorSecret).update(payload).digest('base64url');
  function decodeCursor(cursor: string, identityId: string, query: string, limit: number) {
    try {
      const [payload, signature, extra] = cursor.split('.');
      if (!payload || !signature || extra) throw new Error('shape');
      const expected = Buffer.from(sign(payload));
      const actual = Buffer.from(signature);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
        throw new Error('signature');
      const parsed = CursorSchema.parse(
        JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
      );
      if (
        parsed.identityId !== identityId ||
        parsed.query !== query ||
        parsed.limit !== limit ||
        parsed.expiresAt <= Date.now()
      )
        throw new Error('binding');
      return parsed.after;
    } catch {
      throw new ControlledError('INVALID_CURSOR');
    }
  }
  function encodeTaskCursor(input: z.infer<typeof TaskCursorSchema>) {
    const payload = Buffer.from(JSON.stringify(TaskCursorSchema.parse(input))).toString(
      'base64url',
    );
    return `${payload}.${sign(payload)}`;
  }
  function decodeTaskCursor(
    cursor: string,
    identityId: string,
    tool: z.infer<typeof TaskCursorSchema>['tool'],
    binding: string,
  ) {
    try {
      const [payload, signature, extra] = cursor.split('.');
      if (!payload || !signature || extra) throw new Error('shape');
      const expected = Buffer.from(sign(payload)),
        actual = Buffer.from(signature);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
        throw new Error('signature');
      const parsed = TaskCursorSchema.parse(
        JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
      );
      if (
        parsed.identityId !== identityId ||
        parsed.tool !== tool ||
        parsed.binding !== binding ||
        parsed.expiresAt <= Date.now()
      )
        throw new Error('binding');
      return parsed;
    } catch {
      throw new ControlledError('INVALID_CURSOR');
    }
  }
  if (scopes.includes('goals:read')) {
    server.registerTool('goal_get', readToolDescriptors.goal_get.definition, ({ id }) =>
      call('goal_get', 'goals:read', async () => {
        const goal = await options.goals.getGoal(id, context, budget);
        if (!goal) throw new ControlledError('NOT_FOUND');
        return GoalGetOutputSchema.parse({ goal: projectGoal(goal) });
      }),
    );
    server.registerTool(
      'goal_search',
      readToolDescriptors.goal_search.definition,
      ({ query, limit, cursor }) =>
        call('goal_search', 'goals:read', async () => {
          const after = cursor ? decodeCursor(cursor, context.identityId, query, limit) : undefined;
          const page = await options.goals.searchGoalPage(
            { query, limit, ...(after ? { after } : {}) },
            context,
            budget,
          );
          const { items, truncated } = fitPage(page.items.map(projectGoal));
          const hasMore = page.hasMore || truncated;
          const last = page.items[items.length - 1];
          let nextCursor: string | null = null;
          if (hasMore && last) {
            const payload = Buffer.from(
              JSON.stringify(
                CursorSchema.parse({
                  identityId: context.identityId,
                  query,
                  limit,
                  order: 'createdAt-desc/id-desc',
                  expiresAt: Date.now() + 86400000,
                  after: { createdAt: last.createdAt, id: last.id },
                }),
              ),
            ).toString('base64url');
            nextCursor = `${payload}.${sign(payload)}`;
          }
          return GoalSearchOutputSchema.parse({
            items,
            hasMore,
            ...(truncated ? { truncated: 'response-budget' as const } : {}),
            nextCursor,
          });
        }),
    );
  }
  if (options.tasks && scopes.includes('tasks:read')) {
    const tasks = options.tasks;
    server.registerTool('task_plan_get', readToolDescriptors.task_plan_get.definition, ({ id }) =>
      call('task_plan_get', 'tasks:read', async () => {
        const plan = await tasks.getTaskPlan(id, context, budget);
        if (!plan) throw new ControlledError('NOT_FOUND');
        return TaskPlanGetOutputSchema.parse({ plan });
      }),
    );
    server.registerTool(
      'task_plan_search',
      readToolDescriptors.task_plan_search.definition,
      ({ query, limit, cursor }) =>
        call('task_plan_search', 'tasks:read', async () => {
          const binding = JSON.stringify({ query, limit });
          const decoded = cursor
            ? decodeTaskCursor(cursor, context.identityId, 'task_plan_search', binding)
            : undefined;
          const page = await tasks.searchTaskPlans(
            {
              query,
              limit,
              ...(decoded ? { after: TaskPlanPositionSchema.parse(decoded.after) } : {}),
            },
            context,
            budget,
          );
          const { items, truncated } = fitPage(page.items);
          const hasMore = page.hasMore || truncated;
          const last = items[items.length - 1];
          const nextCursor =
            hasMore && last
              ? encodeTaskCursor({
                  tool: 'task_plan_search',
                  binding,
                  identityId: context.identityId,
                  after: { createdAt: last.createdAt, id: last.id },
                  expiresAt: Date.now() + 86400000,
                })
              : null;
          return TaskPlanSearchOutputSchema.parse({
            items,
            hasMore,
            nextCursor,
            ...(truncated ? { truncated: 'response-budget' } : {}),
          });
        }),
    );
    server.registerTool(
      'task_occurrence_get',
      readToolDescriptors.task_occurrence_get.definition,
      ({ id }) =>
        call('task_occurrence_get', 'tasks:read', async () => {
          const occurrence = await tasks.getTaskOccurrence(id, context, budget);
          if (!occurrence) throw new ControlledError('NOT_FOUND');
          return TaskOccurrenceGetOutputSchema.parse({ occurrence });
        }),
    );
    server.registerTool(
      'task_occurrence_list',
      readToolDescriptors.task_occurrence_list.definition,
      ({ startDate, endDate, includeOverdueOpen, limit, cursor }) =>
        call('task_occurrence_list', 'tasks:read', async () => {
          const binding = JSON.stringify({
            startDate,
            endDate,
            includeOverdueOpen,
            limit,
          });
          const decoded = cursor
            ? decodeTaskCursor(cursor, context.identityId, 'task_occurrence_list', binding)
            : undefined;
          if (decoded && (!decoded.timeZone || decoded.asOf === undefined))
            throw new ControlledError('INVALID_CURSOR');
          const page = await tasks.listTaskOccurrences(
            {
              startDate,
              endDate,
              includeOverdueOpen,
              limit,
              ...(decoded
                ? {
                    after: TaskOccurrencePositionSchema.parse(decoded.after),
                    timeZone: decoded.timeZone,
                    asOf: decoded.asOf,
                  }
                : {}),
            },
            context,
            budget,
          );
          const { items, truncated } = fitPage(page.items);
          const hasMore = page.hasMore || truncated;
          const last = items[items.length - 1];
          const nextCursor =
            hasMore && last
              ? encodeTaskCursor({
                  tool: 'task_occurrence_list',
                  binding,
                  identityId: context.identityId,
                  after: { scheduleDate: last.scheduleSnapshot.date, id: last.id },
                  timeZone: page.timeZone,
                  asOf: page.asOf,
                  expiresAt: Date.now() + 86400000,
                })
              : null;
          return TaskOccurrenceListOutputSchema.parse({
            items,
            hasMore,
            nextCursor,
            timeZone: page.timeZone,
            asOf: page.asOf,
            ...(truncated ? { truncated: 'response-budget' } : {}),
          });
        }),
    );
  }
}
