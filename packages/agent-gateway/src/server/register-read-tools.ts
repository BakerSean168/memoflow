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
  RoutineGetOutputSchema,
  RoutineListOutputSchema,
  RoutineUpcomingOutputSchema,
  NotificationGetOutputSchema,
  NotificationListOutputSchema,
  NotificationUnreadCountOutputSchema,
  ScheduleGetOutputSchema,
  ScheduleListOutputSchema,
} from '../contracts';
import { GoalPagePositionSchema, type GoalClientDTO } from '@memoflow/goal-contracts';
import { TaskPlanPositionSchema, TaskOccurrencePositionSchema } from '@memoflow/task-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import {
  GatewayReadError as ControlledError,
  type GoalReadPort,
  type TaskReadPort,
  type RoutineReadPort,
  type NotificationReadPort,
  type ScheduleReadPort,
  type GatewayReadBudget,
} from '../ports';
const MAX_BYTES = 256 * 1024;
export interface ReadToolCall {
  <T extends object>(
    name:
      | GatewayReadToolName
      | import('../write-tool-descriptors').GatewayWriteToolName
      | import('../assisted-tool-descriptors').GatewayAssistedToolName,
    scope:
      | 'goals:read'
      | 'tasks:read'
      | 'routines:read'
      | 'notifications:read'
      | 'schedules:read'
      | 'goals:write'
      | 'tasks:write'
      | 'routines:write',
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
const RoutineCursorSchema = z.strictObject({
  identityId: z.string(),
  tool: z.enum(['routine_list', 'routine_upcoming', 'notification_list', 'schedule_list']),
  binding: z.string().max(1000),
  expiresAt: z.number().int(),
  offset: z.number().int().min(0).max(499),
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
  options: {
    cursorSecret: string;
    goals: GoalReadPort;
    tasks?: TaskReadPort;
    routines?: RoutineReadPort;
    notifications?: NotificationReadPort;
    schedules?: ScheduleReadPort;
  },
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
  function encodeRoutineCursor(input: z.infer<typeof RoutineCursorSchema>) {
    const payload = Buffer.from(JSON.stringify(RoutineCursorSchema.parse(input))).toString(
      'base64url',
    );
    return `${payload}.${sign(payload)}`;
  }
  function decodeRoutineCursor(
    cursor: string,
    identityId: string,
    tool: z.infer<typeof RoutineCursorSchema>['tool'],
    binding: string,
  ): number {
    try {
      const [payload, signature, extra] = cursor.split('.');
      if (!payload || !signature || extra) throw new Error('shape');
      const expected = Buffer.from(sign(payload));
      const actual = Buffer.from(signature);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
        throw new Error('signature');
      const parsed = RoutineCursorSchema.parse(
        JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
      );
      if (
        parsed.identityId !== identityId ||
        parsed.tool !== tool ||
        parsed.binding !== binding ||
        parsed.expiresAt <= Date.now()
      )
        throw new Error('binding');
      return parsed.offset;
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
  if (options.routines && scopes.includes('routines:read')) {
    const routines = options.routines;
    server.registerTool('routine_get', readToolDescriptors.routine_get.definition, ({ id }) =>
      call('routine_get', 'routines:read', async () => {
        const snapshot = await routines.getConfigurationSnapshot(context.identityId, budget);
        const routine = snapshot.definitions.find((definition) => definition.id === id);
        if (!routine) throw new ControlledError('NOT_FOUND');
        return RoutineGetOutputSchema.parse({ routine });
      }),
    );
    server.registerTool(
      'routine_list',
      readToolDescriptors.routine_list.definition,
      ({ query, limit, cursor }) =>
        call('routine_list', 'routines:read', async () => {
          const binding = JSON.stringify({ query, limit });
          const offset = cursor
            ? decodeRoutineCursor(cursor, context.identityId, 'routine_list', binding)
            : 0;
          const snapshot = await routines.getConfigurationSnapshot(context.identityId, budget);
          const needle = query.toLocaleLowerCase();
          const definitions = snapshot.definitions
            .filter(
              (definition) =>
                !needle ||
                definition.name.toLocaleLowerCase().includes(needle) ||
                (definition.description ?? '').toLocaleLowerCase().includes(needle),
            )
            .sort(
              (left, right) =>
                right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
            );
          const { items, truncated } = fitPage(definitions.slice(offset, offset + limit));
          const hasMore = definitions.length > offset + items.length;
          const nextCursor = hasMore
            ? encodeRoutineCursor({
                tool: 'routine_list',
                binding,
                identityId: context.identityId,
                offset: offset + items.length,
                expiresAt: Date.now() + 86400000,
              })
            : null;
          return RoutineListOutputSchema.parse({
            items,
            hasMore,
            nextCursor,
            ...(truncated ? { truncated: 'response-budget' as const } : {}),
          });
        }),
    );
    server.registerTool(
      'routine_upcoming',
      readToolDescriptors.routine_upcoming.definition,
      ({ start, end, includeElapsed, limit, cursor }) =>
        call('routine_upcoming', 'routines:read', async () => {
          const binding = JSON.stringify({ start, end, includeElapsed, limit });
          const offset = cursor
            ? decodeRoutineCursor(cursor, context.identityId, 'routine_upcoming', binding)
            : 0;
          if (offset + limit > 500) throw new ControlledError('INVALID_CURSOR');
          const response = await routines.getUpcomingOccurrences(
            context.identityId,
            {
              start,
              end,
              includeElapsed,
              limit: Math.min(500, offset + limit + 1),
            },
            budget,
          );
          const page = response.occurrences
            .slice(offset, offset + limit)
            .map(({ identityId: _identityId, ...occurrence }) => occurrence);
          const { items, truncated } = fitPage(page);
          const hasMore = response.occurrences.length > offset + items.length;
          const nextCursor = hasMore
            ? encodeRoutineCursor({
                tool: 'routine_upcoming',
                binding,
                identityId: context.identityId,
                offset: offset + items.length,
                expiresAt: Date.now() + 86400000,
              })
            : null;
          return RoutineUpcomingOutputSchema.parse({
            items,
            hasMore,
            nextCursor,
            ...(truncated ? { truncated: 'response-budget' as const } : {}),
          });
        }),
    );
  }
  if (options.notifications && scopes.includes('notifications:read')) {
    const notifications = options.notifications;
    server.registerTool(
      'notification_get',
      readToolDescriptors.notification_get.definition,
      ({ id }) =>
        call('notification_get', 'notifications:read', async () => {
          const notification = await notifications.getNotification(id, context, budget);
          if (!notification) throw new ControlledError('NOT_FOUND');
          return NotificationGetOutputSchema.parse({ notification });
        }),
    );
    server.registerTool(
      'notification_list',
      readToolDescriptors.notification_list.definition,
      ({ isRead, category, limit, cursor }) =>
        call('notification_list', 'notifications:read', async () => {
          const binding = JSON.stringify({ isRead, category, limit });
          const offset = cursor
            ? decodeRoutineCursor(cursor, context.identityId, 'notification_list', binding)
            : 0;
          if (offset + limit > 500) throw new ControlledError('INVALID_CURSOR');
          const result = await notifications.listNotifications(
            { isRead, category, limit, offset },
            context,
            budget,
          );
          const { items, truncated } = fitPage(result.items);
          const hasMore = result.hasMore || truncated;
          const nextCursor = hasMore
            ? encodeRoutineCursor({
                tool: 'notification_list',
                binding,
                identityId: context.identityId,
                offset: offset + items.length,
                expiresAt: Date.now() + 86400000,
              })
            : null;
          return NotificationListOutputSchema.parse({
            items,
            hasMore,
            nextCursor,
            ...(truncated ? { truncated: 'response-budget' as const } : {}),
          });
        }),
    );
    server.registerTool(
      'notification_unread_count',
      readToolDescriptors.notification_unread_count.definition,
      () =>
        call('notification_unread_count', 'notifications:read', async () => {
          const unreadCount = await notifications.getUnreadCount(context, budget);
          return NotificationUnreadCountOutputSchema.parse({ unreadCount });
        }),
    );
  }
  if (options.schedules && scopes.includes('schedules:read')) {
    const schedules = options.schedules;
    server.registerTool('schedule_get', readToolDescriptors.schedule_get.definition, ({ id }) =>
      call('schedule_get', 'schedules:read', async () => {
        const schedule = await schedules.getSchedule(id, context, budget);
        if (!schedule) throw new ControlledError('NOT_FOUND');
        return ScheduleGetOutputSchema.parse({ schedule });
      }),
    );
    server.registerTool(
      'schedule_list',
      readToolDescriptors.schedule_list.definition,
      ({ startTime, endTime, limit, cursor }) =>
        call('schedule_list', 'schedules:read', async () => {
          const binding = JSON.stringify({ startTime, endTime, limit });
          const offset = cursor
            ? decodeRoutineCursor(cursor, context.identityId, 'schedule_list', binding)
            : 0;
          if (offset + limit > 500) throw new ControlledError('INVALID_CURSOR');
          const result = await schedules.listSchedules(
            { startTime, endTime, limit, offset },
            context,
            budget,
          );
          const { items, truncated } = fitPage(result.items);
          const hasMore = result.hasMore || truncated;
          const nextCursor = hasMore
            ? encodeRoutineCursor({
                tool: 'schedule_list',
                binding,
                identityId: context.identityId,
                offset: offset + items.length,
                expiresAt: Date.now() + 86400000,
              })
            : null;
          return ScheduleListOutputSchema.parse({
            items,
            hasMore,
            nextCursor,
            ...(truncated ? { truncated: 'response-budget' as const } : {}),
          });
        }),
    );
  }
}
