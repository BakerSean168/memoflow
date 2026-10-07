import { Prisma, type PrismaClient } from '@memoflow/database/prisma';
import {
  TaskPlanReadQuerySchema,
  TaskOccurrenceReadQuerySchema,
  TaskPlanReadIdSchema,
  TaskOccurrenceReadIdSchema,
  TaskReadPlanSchema,
  TaskReadOccurrenceSchema,
} from '@memoflow/contracts/task';
import { ok, error } from '@memoflow/contracts/result';
import { createTimeFacade, type UserTimeContextPort } from '@memoflow/time';
import { PrismaTaskPlanMapper, PrismaTaskOccurrenceMapper } from './mappers';

class TaskReadLimitError extends Error {}
class TaskReadCursorError extends Error {}
interface Budget {
  deadlineAt: number;
  signal: AbortSignal;
}

/** Bounded Task owner application queries. Reads never generate occurrences or events.
 * @param db - Host-owned PostgreSQL client.
 * @param timePort - Current identity's Product Time authority.
 * @returns Explicit plan/occurrence queries with atomic read snapshots and deadlines.
 */
export function createTaskPrismaReadQueries(db: PrismaClient, timePort: UserTimeContextPort) {
  async function bounded<T>(
    identityId: string,
    operation: (
      tx: Prisma.TransactionClient,
      time: Awaited<ReturnType<UserTimeContextPort['getUserTimeContext']>>,
    ) => Promise<T>,
    budget?: Budget,
  ) {
    const deadlineAt = budget?.deadlineAt ?? Date.now() + 30000;
    if (budget?.signal.aborted || Date.now() >= deadlineAt)
      return error('TIMEOUT', 'Task read cancelled');
    try {
      const time = await timePort.getUserTimeContext(identityId, { deadlineAt, signal: budget?.signal ?? new AbortController().signal });
      if (budget?.signal.aborted || Date.now() >= deadlineAt)
        return error('TIMEOUT', 'Task read cancelled');
      const remaining = Math.min(30000, Math.max(1, deadlineAt - Date.now()));
      const data = await db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT set_config('statement_timeout', ${String(Math.max(1, Math.min(remaining, deadlineAt - Date.now())))}, true)`;
          const result = await operation(tx, time);
          if (budget?.signal.aborted) throw new Error('cancelled');
          return result;
        },
        {
          isolationLevel: 'RepeatableRead',
          timeout: remaining,
          maxWait: Math.min(remaining, 2000),
        },
      );
      return ok(data);
    } catch (cause) {
      if (cause instanceof TaskReadCursorError)
        return error('INVALID_CURSOR', 'Account time zone changed');
      if (cause instanceof TaskReadLimitError)
        return error('RESPONSE_TOO_LARGE', 'Task aggregate exceeds read budget');
      if (budget?.signal.aborted || Date.now() >= deadlineAt)
        return error('TIMEOUT', 'Task read deadline exceeded');
      throw cause;
    }
  }
  async function plans(tx: Prisma.TransactionClient, ids: string[]) {
    if (!ids.length) return [];
    const large = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM task_plans WHERE id IN (${Prisma.join(ids)}) AND (octet_length(name)>4096 OR octet_length(COALESCE(description,''))+octet_length(schedule::text)+octet_length(COALESCE(reminder_config,''))+octet_length(COALESCE(checklist,''))+octet_length(COALESCE(abandoned_reason,''))>32768) LIMIT 1`;
    if (large.length) throw new TaskReadLimitError();
    return tx.taskPlan.findMany({
      where: { id: { in: ids } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
  async function occurrences(tx: Prisma.TransactionClient, ids: string[]) {
    if (!ids.length) return [];
    const large = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM task_occurrences WHERE id IN (${Prisma.join(ids)}) AND octet_length(schedule_timing)+octet_length(COALESCE(result,''))+octet_length(checklist_state)>32768 LIMIT 1`;
    if (large.length) throw new TaskReadLimitError();
    return tx.taskOccurrence.findMany({
      where: { id: { in: ids } },
      orderBy: [{ scheduleDate: 'asc' }, { id: 'asc' }],
    });
  }
  return {
    getTaskPlan(identityId: string, id: string, budget?: Budget) {
      const parsed = TaskPlanReadIdSchema.parse(id);
      return bounded(
        identityId,
        async (tx, time) => {
          const row = await tx.taskPlan.findFirst({
            where: { id: parsed, identityId, deletedAt: null },
            select: { id: true },
          });
          const values = await plans(tx, row ? [row.id] : []);
          return values[0]
            ? TaskReadPlanSchema.parse(PrismaTaskPlanMapper.toDomain(values[0]).toClientDTOAt(time))
            : null;
        },
        budget,
      );
    },
    searchTaskPlans(identityId: string, input: unknown, budget?: Budget) {
      const q = TaskPlanReadQuerySchema.parse(input);
      const search = q.query.replace(/[\\%_]/g, (character) => `\\${character}`);
      return bounded(
        identityId,
        async (tx, time) => {
          const rows = await tx.taskPlan.findMany({
            where: {
              identityId,
              deletedAt: null,
              archivedAt: null,
              ...(q.query ? { name: { contains: search, mode: 'insensitive' } } : {}),
              ...(q.after
                ? {
                    OR: [
                      { createdAt: { lt: new Date(q.after.createdAt) } },
                      { createdAt: new Date(q.after.createdAt), id: { lt: q.after.id } },
                    ],
                  }
                : {}),
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: q.limit + 1,
            select: { id: true },
          });
          const values = await plans(
            tx,
            rows.slice(0, q.limit).map((r) => r.id),
          );
          return {
            items: values.map((r) =>
              TaskReadPlanSchema.parse(PrismaTaskPlanMapper.toDomain(r).toClientDTOAt(time)),
            ),
            hasMore: rows.length > q.limit,
          };
        },
        budget,
      );
    },
    getTaskOccurrence(identityId: string, id: string, budget?: Budget) {
      const parsed = TaskOccurrenceReadIdSchema.parse(id);
      return bounded(
        identityId,
        async (tx, time) => {
          const row = await tx.taskOccurrence.findFirst({
            where: {
              id: parsed,
              identityId,
              deletedAt: null,
              plan: { identityId, deletedAt: null },
            },
            select: { id: true },
          });
          const values = await occurrences(tx, row ? [row.id] : []);
          return values[0]
            ? TaskReadOccurrenceSchema.parse(
                PrismaTaskOccurrenceMapper.toDomain(values[0]).toClientDTOAt(time),
              )
            : null;
        },
        budget,
      );
    },
    listTaskOccurrences(identityId: string, input: unknown, budget?: Budget) {
      const q = TaskOccurrenceReadQuerySchema.parse(input);
      return bounded(
        identityId,
        async (tx, time) => {
          if (q.timeZone && q.timeZone !== time.timeZone) throw new TaskReadCursorError();
          const facade = createTimeFacade({ context: time });
          const start = facade.calendar.toYmd(q.startDate),
            end = facade.calendar.toYmd(q.endDate);
          const asOf = q.asOf ?? Date.now();
          const range: Prisma.TaskOccurrenceWhereInput = {
            OR: [
              { scheduleDate: { gte: start, lte: end } },
              ...(q.includeOverdueOpen
                ? [{ scheduleDate: { lt: start }, status: { in: ['Pending', 'InProgress'] } }]
                : []),
            ],
          };
          const rows = await tx.taskOccurrence.findMany({
            where: {
              identityId,
              deletedAt: null,
              plan: { identityId, deletedAt: null },
              AND: [
                range,
                ...(q.after
                  ? [
                      {
                        OR: [
                          { scheduleDate: { gt: q.after.scheduleDate } },
                          { scheduleDate: q.after.scheduleDate, id: { gt: q.after.id } },
                        ],
                      },
                    ]
                  : []),
              ],
            },
            orderBy: [{ scheduleDate: 'asc' }, { id: 'asc' }],
            take: q.limit + 1,
            select: { id: true },
          });
          const values = await occurrences(
            tx,
            rows.slice(0, q.limit).map((r) => r.id),
          );
          return {
            items: values.map((r) =>
              TaskReadOccurrenceSchema.parse(
                PrismaTaskOccurrenceMapper.toDomain(r).toClientDTOAt(time, asOf),
              ),
            ),
            hasMore: rows.length > q.limit,
            timeZone: String(time.timeZone),
            asOf,
          };
        },
        budget,
      );
    },
  };
}
