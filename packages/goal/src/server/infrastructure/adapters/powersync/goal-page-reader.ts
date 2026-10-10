import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import type { GoalClientDTO, GoalPageQuery } from '@memoflow/contracts/goal';
import { ok, error, type Result } from '@memoflow/contracts/result';
import { SearchGoalPageUseCase } from '../../../application/use-cases/queries/search-goal-page.use-case';
import { PowerSyncGoalMapper } from './mappers/powersync-goal.mapper';

class ReadLimitError extends Error {}
interface Budget {
  deadlineAt: number;
  signal: AbortSignal;
}
const goalColumns =
  'id, identity_id, name, summary, status, version, created_at, updated_at, deleted_at, archived_at, start_kind, start_date, target_kind, target_end_date, completed_at, sort_order';
const krColumns =
  'id, goal_id, title, unit, initial_value, current_value, tracking_base_value, target_value, aggregation_method, target_kind, target_end_date, weight, "order", created_at, updated_at';
/** Local owner queries share Goal's projection and page semantics with the hosted lane. */
export function createGoalPowerSyncPageQuery(db: IElectronDatabase) {
  async function rows(
    tx: IElectronDatabaseTransaction,
    owner: string,
    where: string,
    params: unknown[],
    limit: number,
  ): Promise<GoalClientDTO[]> {
    const metadata = await tx.getAll<{ id: string; oversized: number }>(
      `SELECT id, (length(CAST(name AS BLOB)) > 4096 OR length(CAST(COALESCE(summary, '') AS BLOB)) > 16384) AS oversized FROM goals WHERE identity_id = ? AND deleted_at IS NULL ${where} ORDER BY created_at DESC, id DESC LIMIT ?`,
      [owner, ...params, limit],
    );
    if (metadata.some((r) => r.oversized)) throw new ReadLimitError();
    const result: GoalClientDTO[] = [];
    for (const { id } of metadata) {
      const children = await tx.getAll<{ id: string; oversized: number }>(
        'SELECT id, (length(CAST(title AS BLOB)) > 4096 OR length(CAST(COALESCE(unit, \'\') AS BLOB)) > 1024) AS oversized FROM key_results WHERE goal_id = ? ORDER BY "order", id LIMIT 101',
        [id],
      );
      if (children.length > 100 || children.some((r) => r.oversized)) throw new ReadLimitError();
      const row = await tx.get<Record<string, unknown>>(
        `SELECT ${goalColumns} FROM goals WHERE id = ? AND identity_id = ?`,
        [id, owner],
      );
      const keyResults = await tx.getAll<Record<string, unknown>>(
        `SELECT ${krColumns} FROM key_results WHERE goal_id = ? ORDER BY "order", id LIMIT 100`,
        [id],
      );
      result.push(
        PowerSyncGoalMapper.toDomain(row, {
          keyResults: keyResults.map(PowerSyncGoalMapper.mapKeyResultRow),
          goalReviews: [],
          weightSnapshots: [],
        }).toClientDTO(true),
      );
    }
    return result;
  }
  async function bounded<T>(
    work: (tx: IElectronDatabaseTransaction) => Promise<Result<T>>,
    budget?: Budget,
  ): Promise<Result<T>> {
    const expired = () => budget && (budget.signal.aborted || Date.now() >= budget.deadlineAt);
    if (expired()) return error('TIMEOUT', 'Goal read cancelled');
    try {
      return await db.writeTransaction(async (tx) => {
        if (expired()) return error('TIMEOUT', 'Goal read cancelled');
        const result = await work(tx);
        return expired() ? error('TIMEOUT', 'Goal read cancelled') : result;
      });
    } catch (cause) {
      if (cause instanceof ReadLimitError)
        return error('RESPONSE_TOO_LARGE', 'Goal projection exceeds owner limits');
      throw cause;
    }
  }
  return {
    searchGoalPage(identityId: string, input: unknown, budget?: Budget) {
      return bounded(
        (tx) =>
          new SearchGoalPageUseCase({
            readPage(owner: string, q: GoalPageQuery) {
              let where = 'AND archived_at IS NULL';
              const params: unknown[] = [];
              if (q.query) {
                where += " AND (name LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\')";
                const literal = `%${q.query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
                params.push(literal, literal);
              }
              if (q.after) {
                where += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
                const date = new Date(q.after.createdAt).toISOString();
                params.push(date, date, q.after.id);
              }
              return rows(tx, owner, where, params, q.limit);
            },
          }).execute(identityId, input),
        budget,
      );
    },
    getGoal(identityId: string, id: string, budget?: Budget) {
      return bounded(
        async (tx) => ok((await rows(tx, identityId, 'AND id = ?', [id], 1))[0] ?? null),
        budget,
      );
    },
  };
}
