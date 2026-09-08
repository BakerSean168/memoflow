import type { IScheduleExecutionRepository } from '../../../domain/repositories/i-schedule-execution-repository';
import { ScheduleExecution } from '../../../domain/entities/schedule-execution';
import {
  PowerSyncScheduleExecutionMapper,
  type PowerSyncScheduleExecutionRow,
} from './mappers/powersync-schedule-execution.mapper';

type Queryable = {
  getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]>;
  getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null>;
  execute(sql: string, parameters?: unknown[]): Promise<unknown>;
};

export class PowerSyncScheduleExecutionRepository implements IScheduleExecutionRepository {
  constructor(private readonly db: Queryable) {}

  async save(execution: ScheduleExecution): Promise<void> {
    const data = PowerSyncScheduleExecutionMapper.toPersistence(execution);
    const existing = await this.db.getOptional<{ id: string }>(
      'SELECT id FROM schedule_executions WHERE id = ? LIMIT 1',
      [data.id],
    );

    if (existing) {
      await this.db.execute(
        `UPDATE schedule_executions
         SET status = ?,
             duration = ?,
             result = ?,
             error = ?,
             retry_count = ?
         WHERE id = ?`,
        [data.status, data.duration, data.result, data.error, data.retryCount, data.id],
      );
    } else {
      await this.db.execute(
        `INSERT INTO schedule_executions (
          id, task_id, identity_id, execution_time, status, duration, result, error, retry_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.id,
          data.taskId,
          data.identityId,
          data.executionTime,
          data.status,
          data.duration,
          data.result,
          data.error,
          data.retryCount,
          data.createdAt,
        ],
      );
    }
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<ScheduleExecution | null> {
    const row = await this.db.getOptional<PowerSyncScheduleExecutionRow>(
      'SELECT * FROM schedule_executions WHERE id = ? AND identity_id = ? LIMIT 1',
      [id, identityId],
    );
    return row ? PowerSyncScheduleExecutionMapper.toDomain(row) : null;
  }

  async findByTaskId(identityId: string, taskId: string): Promise<ScheduleExecution[]> {
    const rows = await this.db.getAll<PowerSyncScheduleExecutionRow>(
      'SELECT * FROM schedule_executions WHERE identity_id = ? AND task_id = ? ORDER BY execution_time DESC',
      [identityId, taskId],
    );
    return rows.map((row) => PowerSyncScheduleExecutionMapper.toDomain(row));
  }
}
