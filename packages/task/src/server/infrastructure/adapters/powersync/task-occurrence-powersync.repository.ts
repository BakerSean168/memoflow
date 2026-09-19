import type { Ymd } from '@memoflow/contracts/primitives';
import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import type { TaskOccurrenceStatus } from '@memoflow/contracts/task';
import { AggregateRepositoryBase, createEventBusAdapter, type IEventBus } from '@memoflow/patterns';
import { eventBus } from '@memoflow/utils/domain';
import { TaskOccurrence } from '../../../domain/aggregates/task-occurrence';
import { OptimisticConcurrencyError } from '../../../domain/errors/optimistic-concurrency.error';
import type {
  ITaskOccurrenceRepository,
  TaskPlanOccurrenceStats,
  TaskPlanStatsWindow,
  TaskOccurrenceStatusCounts,
} from '../../../domain/repositories/i-task-occurrence-repository';
import {
  PowerSyncTaskOccurrenceMapper,
  type PowerSyncTaskOccurrenceRow,
} from './mappers/powersync-task-occurrence.mapper';

const eventBusAdapter = createEventBusAdapter(eventBus);

export class PowerSyncTaskOccurrenceRepository
  extends AggregateRepositoryBase<TaskOccurrence>
  implements ITaskOccurrenceRepository
{
  constructor(
    private readonly db: IElectronDatabaseTransaction,
    eventBus: IEventBus = eventBusAdapter,
  ) {
    super(eventBus);
  }

  protected async persist(occurrence: TaskOccurrence): Promise<void> {
    const data = PowerSyncTaskOccurrenceMapper.toPersistence(occurrence);
    const existing = await this.db.getOptional<{ id: string; version: number }>(
      'SELECT id, version FROM task_occurrences WHERE id = ? LIMIT 1',
      [data.id],
    );

    if (!existing) {
      const duplicate = await this.db.getOptional<{ id: string }>(
        'SELECT id FROM task_occurrences WHERE plan_id = ? AND identity_id = ? AND occurrence_key = ? AND deleted_at IS NULL LIMIT 1',
        [data.planId, data.identityId, data.occurrenceKey],
      );
      if (duplicate) return;
    }

    if (existing) {
      const expectedVersion = data.version - 1;
      const updated = await this.db.execute(
        `UPDATE task_occurrences
         SET plan_id = ?,
             identity_id = ?,
             occurrence_key = ?,
             schedule_date = ?,
             schedule_timing = ?,
             importance_snapshot = ?,
             status = ?,
             actual_start_at = ?,
             result = ?,
             checklist_state = ?,
             version = ?,
             updated_at = ?,
             deleted_at = ?
         WHERE id = ? AND identity_id = ? AND version = ?`,
        [
          data.planId,
          data.identityId,
          data.occurrenceKey,
          data.scheduleDate,
          data.scheduleTiming,
          data.importanceSnapshot,
          data.status,
          data.actualStartAt,
          data.result,
          data.checklistState,
          data.version,
          data.updatedAt,
          data.deletedAt,
          data.id,
          data.identityId,
          expectedVersion,
        ],
      );
      if (updated.rowsAffected !== 1) {
        const current = await this.db.getOptional<{ version: number }>(
          'SELECT version FROM task_occurrences WHERE id = ? AND identity_id = ? LIMIT 1',
          [data.id, data.identityId],
        );
        throw new OptimisticConcurrencyError(
          'TaskOccurrence',
          data.id,
          expectedVersion,
          current?.version ?? existing.version,
        );
      }
      return;
    }

    await this.db.execute(
      `INSERT INTO task_occurrences (
        id, plan_id, identity_id, occurrence_key, schedule_date, schedule_timing,
        importance_snapshot, status, actual_start_at, result, checklist_state,
        version, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.planId,
        data.identityId,
        data.occurrenceKey,
        data.scheduleDate,
        data.scheduleTiming,
        data.importanceSnapshot,
        data.status,
        data.actualStartAt,
        data.result,
        data.checklistState,
        data.version,
        data.createdAt,
        data.updatedAt,
        data.deletedAt,
      ],
    );
  }

  async saveMany(occurrences: TaskOccurrence[]): Promise<void> {
    for (const occurrence of occurrences) await this.save(occurrence);
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<TaskOccurrence | null> {
    const row = await this.db.getOptional<PowerSyncTaskOccurrenceRow>(
      'SELECT * FROM task_occurrences WHERE id = ? AND identity_id = ? LIMIT 1',
      [id, identityId],
    );
    return row ? PowerSyncTaskOccurrenceMapper.toDomain(row) : null;
  }

  async findByPlanId(planId: string, identityId: string): Promise<TaskOccurrence[]> {
    return this.query(
      'SELECT * FROM task_occurrences WHERE plan_id = ? AND identity_id = ? AND deleted_at IS NULL ORDER BY schedule_date DESC',
      [planId, identityId],
    );
  }

  async findByIdentityId(identityId: string): Promise<TaskOccurrence[]> {
    return this.query(
      'SELECT * FROM task_occurrences WHERE identity_id = ? AND deleted_at IS NULL ORDER BY schedule_date DESC',
      [identityId],
    );
  }

  async findByDateRange(
    identityId: string,
    startDate: Ymd,
    endDate: Ymd,
  ): Promise<TaskOccurrence[]> {
    return this.query(
      'SELECT * FROM task_occurrences WHERE identity_id = ? AND schedule_date >= ? AND schedule_date <= ? AND deleted_at IS NULL ORDER BY schedule_date ASC',
      [identityId, startDate, endDate],
    );
  }

  async findByStatus(identityId: string, status: TaskOccurrenceStatus): Promise<TaskOccurrence[]> {
    return this.query(
      'SELECT * FROM task_occurrences WHERE identity_id = ? AND status = ? AND deleted_at IS NULL ORDER BY schedule_date DESC',
      [identityId, status],
    );
  }

  async findOverdueOccurrences(identityId: string): Promise<TaskOccurrence[]> {
    return this.query(
      `SELECT * FROM task_occurrences
       WHERE identity_id = ? AND status IN ('Pending', 'InProgress') AND deleted_at IS NULL
       ORDER BY schedule_date ASC`,
      [identityId],
    );
  }

  async delete(identityId: string, id: string): Promise<void> {
    const existing = await this.findByIdForIdentity(identityId, id);
    if (!existing) throw new Error('Task occurrence not found for the current identity.');
    await this.db.execute('DELETE FROM task_occurrences WHERE id = ? AND identity_id = ?', [
      id,
      identityId,
    ]);
  }

  async deleteMany(identityId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    await this.db.execute(
      `DELETE FROM task_occurrences WHERE identity_id = ? AND id IN (${placeholders})`,
      [identityId, ...ids],
    );
  }

  async deleteByPlanId(planId: string, identityId: string): Promise<void> {
    await this.db.execute('DELETE FROM task_occurrences WHERE plan_id = ? AND identity_id = ?', [
      planId,
      identityId,
    ]);
  }

  async countFutureOccurrences(
    planId: string,
    identityId: string,
    fromDate: Ymd,
  ): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM task_occurrences WHERE plan_id = ? AND identity_id = ? AND schedule_date >= ? AND deleted_at IS NULL',
      [planId, identityId, fromDate],
    );
    return Number(row.count ?? 0);
  }

  async findByPlanIdAndDateRange(
    planId: string,
    identityId: string,
    startDate: Ymd,
    endDate: Ymd,
  ): Promise<TaskOccurrence[]> {
    return this.query(
      'SELECT * FROM task_occurrences WHERE plan_id = ? AND identity_id = ? AND schedule_date >= ? AND schedule_date <= ? AND deleted_at IS NULL ORDER BY schedule_date ASC',
      [planId, identityId, startDate, endDate],
    );
  }

  async getPlanStats(
    planIds: string[],
    identityId: string,
    window: TaskPlanStatsWindow,
  ): Promise<Record<string, TaskPlanOccurrenceStats>> {
    if (planIds.length === 0) return {};
    const placeholders = planIds.map(() => '?').join(', ');
    const rows = await this.db.getAll<{
      planId: string;
      occurrenceCount: number;
      completedOccurrenceCount: number;
      pendingOccurrenceCount: number;
      dueOccurrenceCount: number;
      completedDueOccurrenceCount: number;
      futurePendingOccurrenceCount: number;
      singleOccurrenceStatus: TaskOccurrenceStatus | null;
    }>(
      `SELECT plan_id as planId,
              COUNT(*) as occurrenceCount,
              SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completedOccurrenceCount,
              SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pendingOccurrenceCount,
              SUM(CASE WHEN schedule_date >= ? AND schedule_date <= ? THEN 1 ELSE 0 END) as dueOccurrenceCount,
              SUM(CASE WHEN status = 'Completed' AND schedule_date >= ? AND schedule_date <= ? THEN 1 ELSE 0 END) as completedDueOccurrenceCount,
              SUM(CASE WHEN status = 'Pending' AND schedule_date > ? THEN 1 ELSE 0 END) as futurePendingOccurrenceCount,
              CASE WHEN COUNT(*) = 1 THEN MAX(status) ELSE NULL END as singleOccurrenceStatus
         FROM task_occurrences
        WHERE plan_id IN (${placeholders}) AND identity_id = ? AND deleted_at IS NULL
        GROUP BY plan_id`,
      [
        window.windowStart,
        window.asOf,
        window.windowStart,
        window.asOf,
        window.asOf,
        ...planIds,
        identityId,
      ],
    );

    const completionWindowDays = 30 as const;
    const stats: Record<string, TaskPlanOccurrenceStats> = {};
    for (const planId of planIds) {
      stats[planId] = {
        planId,
        occurrenceCount: 0,
        completedOccurrenceCount: 0,
        pendingOccurrenceCount: 0,
        dueOccurrenceCount: 0,
        completedDueOccurrenceCount: 0,
        completionWindowDays,
        futurePendingOccurrenceCount: 0,
        singleOccurrenceStatus: null,
        completionRate: 0,
      };
    }
    for (const row of rows) {
      const stat = stats[row.planId];
      if (!stat) continue;
      stat.occurrenceCount = Number(row.occurrenceCount ?? 0);
      stat.completedOccurrenceCount = Number(row.completedOccurrenceCount ?? 0);
      stat.pendingOccurrenceCount = Number(row.pendingOccurrenceCount ?? 0);
      stat.dueOccurrenceCount = Number(row.dueOccurrenceCount ?? 0);
      stat.completedDueOccurrenceCount = Number(row.completedDueOccurrenceCount ?? 0);
      stat.futurePendingOccurrenceCount = Number(row.futurePendingOccurrenceCount ?? 0);
      stat.singleOccurrenceStatus = row.singleOccurrenceStatus ?? null;
      stat.completionRate =
        stat.dueOccurrenceCount > 0
          ? Math.round((stat.completedDueOccurrenceCount / stat.dueOccurrenceCount) * 100)
          : 0;
    }
    return stats;
  }

  async getStatusCountsForPlan(planId: string, identityId: string): Promise<TaskOccurrenceStatusCounts> {
    const rows = await this.db.getAll<{ status: TaskOccurrenceStatus; count: number }>(
      `SELECT status, COUNT(*) as count FROM task_occurrences
       WHERE plan_id = ? AND identity_id = ? AND deleted_at IS NULL GROUP BY status`,
      [planId, identityId],
    );
    const counts: TaskOccurrenceStatusCounts = { total: 0, completed: 0, missed: 0, skipped: 0, pending: 0, inProgress: 0 };
    for (const row of rows) {
      const count = Number(row.count ?? 0);
      counts.total += count;
      if (row.status === 'Completed') counts.completed = count;
      if (row.status === 'Missed') counts.missed = count;
      if (row.status === 'Skipped') counts.skipped = count;
      if (row.status === 'Pending') counts.pending = count;
      if (row.status === 'InProgress') counts.inProgress = count;
    }
    return counts;
  }

  async findRecentByPlan(planId: string, identityId: string, limit: number): Promise<TaskOccurrence[]> {
    return this.query(
      'SELECT * FROM task_occurrences WHERE plan_id = ? AND identity_id = ? AND deleted_at IS NULL ORDER BY schedule_date DESC, updated_at DESC LIMIT ?',
      [planId, identityId, limit],
    );
  }

  async deleteIncompleteOccurrencesFrom(
    planId: string,
    identityId: string,
    fromDate: Ymd,
  ): Promise<number> {
    const before = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM task_occurrences
       WHERE plan_id = ? AND identity_id = ? AND schedule_date >= ?
         AND status IN ('Pending', 'InProgress')`,
      [planId, identityId, fromDate],
    );
    await this.db.execute(
      `DELETE FROM task_occurrences
       WHERE plan_id = ? AND identity_id = ? AND schedule_date >= ?
         AND status IN ('Pending', 'InProgress')`,
      [planId, identityId, fromDate],
    );
    return Number(before?.count ?? 0);
  }

  private async query(sql: string, params: unknown[]): Promise<TaskOccurrence[]> {
    const rows = await this.db.getAll<PowerSyncTaskOccurrenceRow>(sql, params);
    return rows.map((row) => PowerSyncTaskOccurrenceMapper.toDomain(row));
  }
}
