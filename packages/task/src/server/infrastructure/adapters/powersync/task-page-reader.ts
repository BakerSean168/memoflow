import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
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
import {
  PowerSyncTaskPlanMapper,
  type PowerSyncTaskPlanRow,
} from './mappers/powersync-task-plan.mapper';
import {
  PowerSyncTaskOccurrenceMapper,
  type PowerSyncTaskOccurrenceRow,
} from './mappers/powersync-task-occurrence.mapper';

class ReadLimitError extends Error {}
class ReadCursorError extends Error {}
interface Budget {
  deadlineAt: number;
  signal: AbortSignal;
}
type Time = Awaited<ReturnType<UserTimeContextPort['getUserTimeContext']>>;
const planColumns =
  'id, identity_id, name, status, outcome, completion_policy, importance, schedule, version, created_at, updated_at, deleted_at, archived_at, NULL AS description, NULL AS closed_at, NULL AS abandoned_reason, NULL AS reminder_config, NULL AS goal_id, NULL AS key_result_id, NULL AS goal_record_value, NULL AS goal_progress_trigger, NULL AS checklist';
const occurrenceColumns =
  "id, plan_id, identity_id, occurrence_key, schedule_date, schedule_timing, importance_snapshot, status, actual_start_at, version, created_at, updated_at, deleted_at, NULL AS result, '[]' AS checklist_state";
/** Task owner read snapshots: bounded SQL, current Product Time, no occurrence generation. */
export function createTaskPowerSyncReadQueries(
  db: IElectronDatabase,
  timePort: UserTimeContextPort,
) {
  async function bounded<T>(
    owner: string,
    work: (tx: IElectronDatabaseTransaction, time: Time) => Promise<T>,
    budget?: Budget,
  ) {
    const deadlineAt = budget?.deadlineAt ?? Date.now() + 30_000;
    const signal = budget?.signal ?? new AbortController().signal;
    const expired = () => signal.aborted || Date.now() >= deadlineAt;
    if (expired()) return error('TIMEOUT', 'Task read cancelled');
    try {
      const time = await timePort.getUserTimeContext(owner, { deadlineAt, signal });
      const result = await db.writeTransaction(async (tx) => {
        if (expired()) throw new Error('cancelled');
        return work(tx, time);
      });
      return expired() ? error('TIMEOUT', 'Task read cancelled') : ok(result);
    } catch (cause) {
      if (expired()) return error('TIMEOUT', 'Task read cancelled');
      if (cause instanceof ReadLimitError)
        return error('RESPONSE_TOO_LARGE', 'Task projection exceeds owner limits');
      if (cause instanceof ReadCursorError)
        return error('INVALID_CURSOR', 'Task time context changed');
      throw cause;
    }
  }
  async function plans(
    tx: IElectronDatabaseTransaction,
    owner: string,
    where: string,
    params: unknown[],
    limit: number,
    time: Time,
  ) {
    const metadata = await tx.getAll<{ id: string; oversized: number }>(
      `SELECT id, (length(CAST(name AS BLOB)) > 4096 OR length(CAST(schedule AS BLOB)) > 32768) AS oversized FROM task_plans WHERE identity_id = ? AND deleted_at IS NULL ${where} ORDER BY created_at DESC, id DESC LIMIT ?`,
      [owner, ...params, limit],
    );
    if (metadata.some((row) => row.oversized)) throw new ReadLimitError();
    const result = [];
    for (const { id } of metadata) {
      const row = await tx.get<PowerSyncTaskPlanRow>(
        `SELECT ${planColumns} FROM task_plans WHERE identity_id = ? AND id = ?`,
        [owner, id],
      );
      result.push(
        TaskReadPlanSchema.parse(PowerSyncTaskPlanMapper.toDomain(row).toClientDTOAt(time)),
      );
    }
    return result;
  }
  async function occurrences(
    tx: IElectronDatabaseTransaction,
    owner: string,
    where: string,
    params: unknown[],
    limit: number,
    time: Time,
    asOf?: number,
  ) {
    const metadata = await tx.getAll<{ id: string; oversized: number }>(
      `SELECT o.id, (length(CAST(o.schedule_timing AS BLOB)) > 32768) AS oversized FROM task_occurrences o JOIN task_plans p ON p.id = o.plan_id AND p.identity_id = o.identity_id AND p.deleted_at IS NULL WHERE o.identity_id = ? AND o.deleted_at IS NULL ${where} ORDER BY o.schedule_date ASC, o.id ASC LIMIT ?`,
      [owner, ...params, limit],
    );
    if (metadata.some((row) => row.oversized)) throw new ReadLimitError();
    const result = [];
    for (const { id } of metadata) {
      const row = await tx.get<PowerSyncTaskOccurrenceRow>(
        `SELECT ${occurrenceColumns} FROM task_occurrences WHERE identity_id = ? AND id = ?`,
        [owner, id],
      );
      result.push(
        TaskReadOccurrenceSchema.parse(
          PowerSyncTaskOccurrenceMapper.toDomain(row).toClientDTOAt(time, asOf),
        ),
      );
    }
    return result;
  }
  return {
    getTaskPlan(owner: string, id: string, budget?: Budget) {
      const parsed = TaskPlanReadIdSchema.parse(id);
      return bounded(
        owner,
        async (tx, time) => (await plans(tx, owner, 'AND id = ?', [parsed], 1, time))[0] ?? null,
        budget,
      );
    },
    searchTaskPlans(owner: string, input: unknown, budget?: Budget) {
      const q = TaskPlanReadQuerySchema.parse(input);
      return bounded(
        owner,
        async (tx, time) => {
          let where = 'AND archived_at IS NULL';
          const params: unknown[] = [];
          if (q.query) {
            where += " AND name LIKE ? ESCAPE '\\'";
            params.push(`%${q.query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
          }
          if (q.after) {
            where += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
            const date = new Date(q.after.createdAt).toISOString();
            params.push(date, date, q.after.id);
          }
          const values = await plans(tx, owner, where, params, q.limit + 1, time);
          return { items: values.slice(0, q.limit), hasMore: values.length > q.limit };
        },
        budget,
      );
    },
    getTaskOccurrence(owner: string, id: string, budget?: Budget) {
      const parsed = TaskOccurrenceReadIdSchema.parse(id);
      return bounded(
        owner,
        async (tx, time) =>
          (await occurrences(tx, owner, 'AND o.id = ?', [parsed], 1, time))[0] ?? null,
        budget,
      );
    },
    listTaskOccurrences(owner: string, input: unknown, budget?: Budget) {
      const q = TaskOccurrenceReadQuerySchema.parse(input);
      return bounded(
        owner,
        async (tx, time) => {
          if (q.timeZone && q.timeZone !== time.timeZone) throw new ReadCursorError();
          const facade = createTimeFacade({ context: time });
          const start = facade.calendar.toYmd(q.startDate),
            end = facade.calendar.toYmd(q.endDate);
          const asOf = q.asOf ?? Date.now();
          let where = 'AND ((o.schedule_date >= ? AND o.schedule_date <= ?)';
          const params: unknown[] = [start, end];
          if (q.includeOverdueOpen) {
            where += " OR (o.schedule_date < ? AND o.status IN ('Pending', 'InProgress'))";
            params.push(start);
          }
          where += ')';
          if (q.after) {
            where += ' AND (o.schedule_date > ? OR (o.schedule_date = ? AND o.id > ?))';
            params.push(q.after.scheduleDate, q.after.scheduleDate, q.after.id);
          }
          const values = await occurrences(tx, owner, where, params, q.limit + 1, time, asOf);
          return {
            items: values.slice(0, q.limit),
            hasMore: values.length > q.limit,
            timeZone: String(time.timeZone),
            asOf,
          };
        },
        budget,
      );
    },
  };
}
