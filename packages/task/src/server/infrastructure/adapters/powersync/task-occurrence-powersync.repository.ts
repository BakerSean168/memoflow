import type {
  ITaskOccurrenceRepository,
  TaskPlanInstanceStats,
} from '../../../domain/repositories/i-task-occurrence-repository';
import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import { TaskOccurrence } from '../../../domain/aggregates/task-occurrence';
import { OptimisticConcurrencyError } from '../../../domain/errors/optimistic-concurrency.error';
import type { TaskOccurrenceStatus } from '@memoflow/contracts/task';
import { AggregateRepositoryBase, createEventBusAdapter, type IEventBus } from '@memoflow/patterns';
import { eventBus } from '@memoflow/utils/domain';
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

  protected async persist(instance: TaskOccurrence): Promise<void> {
    const data = PowerSyncTaskOccurrenceMapper.toPersistence(instance);
    const existing = await this.db.getOptional<{ id: string; version: number }>(
      'SELECT id, version FROM task_instances WHERE id = ? LIMIT 1',
      [data.id],
    );

    // TASK-2204: prevent a second desktop occurrence for the same plan/local day.
    // Prisma also has a unique constraint; PowerSync schema has no portable unique-index
    // declaration, so keep the deterministic occurrence key and enforce the same rule here.
    if (!existing && data.occurrenceKey) {
      const existingOccurrence = await this.db.getOptional<{ id: string }>(
        'SELECT id FROM task_instances WHERE template_id = ? AND identity_id = ? AND occurrence_key = ? AND deleted_at IS NULL LIMIT 1',
        [data.templateId, data.identityId, data.occurrenceKey],
      );
      if (existingOccurrence) return;
    }

    if (existing) {
      const expectedVersion = data.version - 1;
      const updated = await this.db.execute(
        `UPDATE task_instances
         SET template_id = ?,
             identity_id = ?,
             instance_date = ?,
             occurrence_key = ?,
             status = ?,
             importance = ?,
             time_config = ?,
             actual_start_time = ?,
             actual_end_time = ?,
             comment = ?,
             version = ?,
             updated_at = ?,
             deleted_at = ?
         WHERE id = ? AND identity_id = ? AND version = ?`,
        [
          data.templateId,
          data.identityId,
          data.instanceDate,
          data.occurrenceKey,
          data.status,
          data.importance,
          data.timeConfig,
          data.actualStartTime,
          data.actualEndTime,
          data.comment,
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
          'SELECT version FROM task_instances WHERE id = ? AND identity_id = ? LIMIT 1',
          [data.id, data.identityId],
        );
        throw new OptimisticConcurrencyError(
          'TaskOccurrence',
          String(data.id),
          expectedVersion,
          current?.version ?? existing.version,
        );
      }
    } else {
      await this.db.execute(
        `INSERT INTO task_instances (
          id, template_id, identity_id, instance_date, occurrence_key, status, importance, time_config,
          actual_start_time, actual_end_time, comment, version, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.id,
          data.templateId,
          data.identityId,
          data.instanceDate,
          data.occurrenceKey,
          data.status,
          data.importance,
          data.timeConfig,
          data.actualStartTime,
          data.actualEndTime,
          data.comment,
          data.version,
          data.createdAt,
          data.updatedAt,
          data.deletedAt,
        ],
      );
    }
  }

  async saveMany(instances: TaskOccurrence[]): Promise<void> {
    for (const instance of instances) {
      await this.save(instance);
    }
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<TaskOccurrence | null> {
    const row = await this.db.getOptional<PowerSyncTaskOccurrenceRow>(
      'SELECT * FROM task_instances WHERE id = ? AND identity_id = ? LIMIT 1',
      [id, identityId],
    );
    return row ? PowerSyncTaskOccurrenceMapper.toDomain(row) : null;
  }

  async findByTemplateId(templateId: string, identityId: string): Promise<TaskOccurrence[]> {
    return this.query(
      'SELECT * FROM task_instances WHERE template_id = ? AND identity_id = ? AND deleted_at IS NULL ORDER BY instance_date DESC',
      [templateId, identityId],
    );
  }

  async findByIdentityId(identityId: string): Promise<TaskOccurrence[]> {
    return this.query(
      'SELECT * FROM task_instances WHERE identity_id = ? AND deleted_at IS NULL ORDER BY instance_date DESC',
      [identityId],
    );
  }

  async findByDateRange(
    identityId: string,
    startDate: number,
    endDate: number,
  ): Promise<TaskOccurrence[]> {
    return this.query(
      `SELECT * FROM task_instances WHERE identity_id = ? AND instance_date >= ? AND instance_date <= ? AND deleted_at IS NULL ORDER BY instance_date ASC`,
      [identityId, new Date(startDate).toISOString(), new Date(endDate).toISOString()],
    );
  }

  async findByStatus(identityId: string, status: TaskOccurrenceStatus): Promise<TaskOccurrence[]> {
    return this.query(
      'SELECT * FROM task_instances WHERE identity_id = ? AND status = ? AND deleted_at IS NULL ORDER BY instance_date DESC',
      [identityId, status],
    );
  }

  async findOverdueInstances(identityId: string): Promise<TaskOccurrence[]> {
    return this.query(
      `SELECT * FROM task_instances WHERE identity_id = ? AND status IN ('Pending', 'InProgress') AND instance_date < ? AND deleted_at IS NULL ORDER BY instance_date ASC`,
      [identityId, new Date().toISOString()],
    );
  }

  async delete(identityId: string, id: string): Promise<void> {
    const existing = await this.findByIdForIdentity(identityId, id);
    if (!existing) {
      throw new Error('Task instance not found for the current identity.');
    }
    await this.db.execute('DELETE FROM task_instances WHERE id = ? AND identity_id = ?', [
      id,
      identityId,
    ]);
  }

  async deleteMany(identityId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    await this.db.execute(
      `DELETE FROM task_instances WHERE identity_id = ? AND id IN (${placeholders})`,
      [identityId, ...ids],
    );
  }

  async deleteByTemplateId(templateId: string, identityId: string): Promise<void> {
    await this.db.execute('DELETE FROM task_instances WHERE template_id = ? AND identity_id = ?', [
      templateId,
      identityId,
    ]);
  }

  async countFutureInstances(
    templateId: string,
    identityId: string,
    fromDate: number = Date.now(),
  ): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM task_instances WHERE template_id = ? AND identity_id = ? AND instance_date >= ?',
      [templateId, identityId, new Date(fromDate).toISOString()],
    );
    return Number(row.count ?? 0);
  }

  async findByTemplateIdAndDateRange(
    templateId: string,
    identityId: string,
    startDate: number,
    endDate: number,
  ): Promise<TaskOccurrence[]> {
    return this.query(
      `SELECT * FROM task_instances WHERE template_id = ? AND identity_id = ? AND instance_date >= ? AND instance_date <= ? AND deleted_at IS NULL ORDER BY instance_date ASC`,
      [templateId, identityId, new Date(startDate).toISOString(), new Date(endDate).toISOString()],
    );
  }

  async getTemplateStats(
    templateIds: string[],
    identityId: string,
    window: { windowStart: number; asOf: number },
  ): Promise<Record<string, TaskPlanInstanceStats>> {
    if (templateIds.length === 0) {
      return {};
    }

    const placeholders = templateIds.map(() => '?').join(', ');
    const completionWindowDays = 30 as const;
    const windowStart = new Date(window.windowStart).toISOString();
    const windowEnd = new Date(window.asOf).toISOString();
    const rows = await this.db.getAll<{
      templateId: string;
      instanceCount: number;
      completedInstanceCount: number;
      pendingInstanceCount: number;
      dueInstanceCount: number;
      completedDueInstanceCount: number;
      futurePendingInstanceCount: number;
      singleInstanceStatus: TaskOccurrenceStatus | null;
    }>(
      `SELECT template_id as templateId,
              COUNT(*) as instanceCount,
              SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completedInstanceCount,
              SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pendingInstanceCount,
              SUM(CASE WHEN instance_date >= ? AND instance_date <= ? THEN 1 ELSE 0 END) as dueInstanceCount,
              SUM(CASE WHEN status = 'Completed' AND instance_date >= ? AND instance_date <= ? THEN 1 ELSE 0 END) as completedDueInstanceCount,
              SUM(CASE WHEN status = 'Pending' AND instance_date > ? THEN 1 ELSE 0 END) as futurePendingInstanceCount,
              CASE WHEN COUNT(*) = 1 THEN MAX(status) ELSE NULL END as singleInstanceStatus
         FROM task_instances
        WHERE template_id IN (${placeholders})
          AND identity_id = ?
          AND deleted_at IS NULL
        GROUP BY template_id`,
      [windowStart, windowEnd, windowStart, windowEnd, windowEnd, ...templateIds, identityId],
    );

    const stats: Record<string, TaskPlanInstanceStats> = {};

    for (const templateId of templateIds) {
      stats[templateId] = {
        templateId,
        instanceCount: 0,
        completedInstanceCount: 0,
        pendingInstanceCount: 0,
        dueInstanceCount: 0,
        completedDueInstanceCount: 0,
        completionWindowDays,
        futurePendingInstanceCount: 0,
        singleInstanceStatus: null,
        completionRate: 0,
      };
    }

    for (const row of rows) {
      const stat = stats[row.templateId];
      if (!stat) {
        continue;
      }

      stat.instanceCount = Number(row.instanceCount ?? 0);
      stat.completedInstanceCount = Number(row.completedInstanceCount ?? 0);
      stat.pendingInstanceCount = Number(row.pendingInstanceCount ?? 0);
      stat.dueInstanceCount = Number(row.dueInstanceCount ?? 0);
      stat.completedDueInstanceCount = Number(row.completedDueInstanceCount ?? 0);
      stat.futurePendingInstanceCount = Number(row.futurePendingInstanceCount ?? 0);
      stat.singleInstanceStatus = row.singleInstanceStatus ?? null;
      stat.completionRate =
        stat.dueInstanceCount > 0
          ? Math.round((stat.completedDueInstanceCount / stat.dueInstanceCount) * 100)
          : 0;
    }

    return stats;
  }

  async deleteIncompleteInstancesFrom(
    templateId: string,
    identityId: string,
    fromDate: number,
  ): Promise<number> {
    const before = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count
         FROM task_instances
        WHERE template_id = ?
          AND identity_id = ?
          AND instance_date >= ?
          AND status IN ('Pending', 'InProgress')`,
      [templateId, identityId, new Date(fromDate).toISOString()],
    );

    await this.db.execute(
      `DELETE FROM task_instances
        WHERE template_id = ?
          AND identity_id = ?
          AND instance_date >= ?
          AND status IN ('Pending', 'InProgress')`,
      [templateId, identityId, new Date(fromDate).toISOString()],
    );

    return Number(before?.count ?? 0);
  }

  private async query(sql: string, params: unknown[]): Promise<TaskOccurrence[]> {
    const rows = await this.db.getAll<PowerSyncTaskOccurrenceRow>(sql, params);
    return rows.map((row) => PowerSyncTaskOccurrenceMapper.toDomain(row));
  }
}
