import type {
  IScheduleTaskQueryOptions,
  IScheduleTaskRepository,
} from '../../../domain/repositories/i-schedule-task-repository';
import { ScheduleTask } from '../../../domain/aggregates/schedule-task';
import {
  ScheduleTaskStatus,
  type ScheduleEventMap,
  type SchedulingOwner,
  type SchedulingReconcileReceipt,
  type SourceModule,
} from '@memoflow/contracts/schedule';
import { createTypedEventPublisher, eventBus, flushDomainEvents } from '@memoflow/utils/domain';
import { createLogger } from '@memoflow/utils/logger';
import {
  PowerSyncScheduleTaskMapper,
  type PowerSyncScheduleTaskRow,
} from './mappers/powersync-schedule-task.mapper';
import type { PowerSyncScheduleExecutionRow } from './mappers/powersync-schedule-execution.mapper';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';

const logger = createLogger('ScheduleTaskPowerSyncRepo');
const scheduleEventPublisher = createTypedEventPublisher<ScheduleEventMap>(eventBus);

export class PowerSyncScheduleTaskRepository implements IScheduleTaskRepository {
  constructor(
    private readonly db: IElectronDatabase,
    private readonly transaction: IElectronDatabaseTransaction | null = null,
    private readonly transactionDeferredAggregates: Set<ScheduleTask> | null = null,
  ) {}

  private get queryDb(): IElectronDatabaseTransaction {
    return this.transaction ?? this.db;
  }

  async save(task: ScheduleTask): Promise<void> {
    const data = PowerSyncScheduleTaskMapper.toPersistence(task);
    const pendingDomainEvents = task.domainEvents.map((event) => event.eventType);

    logger.info('[Schedule][Repo] Saving task', {
      taskId: String(task.id),
      identityId: task.identityId,
      sourceModule: task.sourceModule,
      sourceEntityId: task.sourceEntityId,
      status: task.status,
      enabled: task.enabled,
      nextRunAt: task.nextRunAt?.toISOString() ?? null,
      executionCount: task.executionCount,
      pendingDomainEvents,
    });

    if (this.transaction) {
      await this.saveWithin(this.transaction, task, data);
      this.transactionDeferredAggregates?.add(task);
      return;
    }

    // 任务与其执行记录多条写入放进单事务，避免半持久化。
    await this.db.writeTransaction(async (tx: IElectronDatabaseTransaction) => {
      await this.saveWithin(tx, task, data);
    });

    if (pendingDomainEvents.length > 0) {
      // 事件在事务成功提交后派发；send 已具备 per-handler 错误隔离，派发失败不回滚业务。
      flushDomainEvents(scheduleEventPublisher, task);
      logger.info('[Schedule][Repo] Published domain events after PowerSync save', {
        taskId: String(task.id),
        publishedDomainEvents: pendingDomainEvents,
      });
    } else {
      logger.warn('[Schedule][Repo] PowerSync save completed without domain events to publish', {
        taskId: String(task.id),
      });
    }
  }

  private async saveWithin(
    tx: IElectronDatabaseTransaction,
    task: ScheduleTask,
    data: ReturnType<typeof PowerSyncScheduleTaskMapper.toPersistence>,
  ): Promise<void> {
    const existingTask = await tx.getOptional<{ id: string }>(
      'SELECT id FROM schedule_tasks WHERE id = ? LIMIT 1',
      [data.id],
    );

    if (existingTask) {
      await tx.execute(
        `UPDATE schedule_tasks
         SET name = ?,
             description = ?,
             source_module = ?,
             source_entity_id = ?,
             scheduling_key = ?,
             owner_type = ?,
             owner_id = ?,
             handler_key = ?,
             payload_version = ?,
             source_revision = ?,
             status = ?,
             enabled = ?,
             cron_expression = ?,
             timezone = ?,
             start_date = ?,
             end_date = ?,
             max_executions = ?,
             next_run_at = ?,
             last_run_at = ?,
             execution_count = ?,
             last_execution_status = ?,
             last_execution_duration = ?,
             consecutive_failures = ?,
             max_retries = ?,
             initial_delay_ms = ?,
             max_delay_ms = ?,
             backoff_multiplier = ?,
             retryable_statuses = ?,
             payload = ?,
             tags = ?,
             priority = ?,
             timeout = ?,
             version = ?,
             updated_at = ?,
             deleted_at = ?
         WHERE id = ?`,
        [
          data.name,
          data.description,
          data.sourceModule,
          data.sourceEntityId,
          data.schedulingKey,
          data.ownerType,
          data.ownerId,
          data.handlerKey,
          data.payloadVersion,
          data.sourceRevision,
          data.status,
          data.enabled,
          data.cronExpression,
          data.timezone,
          data.startDate,
          data.endDate,
          data.maxExecutions,
          data.nextRunAt,
          data.lastRunAt,
          data.executionCount,
          data.lastExecutionStatus,
          data.lastExecutionDuration,
          data.consecutiveFailures,
          data.maxRetries,
          data.initialDelayMs,
          data.maxDelayMs,
          data.backoffMultiplier,
          data.retryableStatuses,
          data.payload,
          data.tags,
          data.priority,
          data.timeout,
          data.version,
          data.updatedAt,
          data.deletedAt,
          data.id,
        ],
      );
    } else {
      await tx.execute(
        `INSERT INTO schedule_tasks (
          id, identity_id, name, description, source_module, source_entity_id,
          scheduling_key, owner_type, owner_id, handler_key, payload_version, source_revision,
          status, enabled, cron_expression, timezone, start_date, end_date, max_executions,
          next_run_at, last_run_at, execution_count, last_execution_status, last_execution_duration,
          consecutive_failures, max_retries, initial_delay_ms, max_delay_ms, backoff_multiplier,
          retryable_statuses, payload, tags, priority, timeout, version, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.id,
          data.identityId,
          data.name,
          data.description,
          data.sourceModule,
          data.sourceEntityId,
          data.schedulingKey,
          data.ownerType,
          data.ownerId,
          data.handlerKey,
          data.payloadVersion,
          data.sourceRevision,
          data.status,
          data.enabled,
          data.cronExpression,
          data.timezone,
          data.startDate,
          data.endDate,
          data.maxExecutions,
          data.nextRunAt,
          data.lastRunAt,
          data.executionCount,
          data.lastExecutionStatus,
          data.lastExecutionDuration,
          data.consecutiveFailures,
          data.maxRetries,
          data.initialDelayMs,
          data.maxDelayMs,
          data.backoffMultiplier,
          data.retryableStatuses,
          data.payload,
          data.tags,
          data.priority,
          data.timeout,
          data.version,
          data.createdAt,
          data.updatedAt,
          data.deletedAt,
        ],
      );
    }

    const executions = task.executions ?? [];
    for (const execution of executions) {
      const existingExecution = await tx.getOptional<{ id: string }>(
        'SELECT id FROM schedule_executions WHERE id = ? LIMIT 1',
        [execution.id],
      );

      if (existingExecution) {
        await tx.execute(
          `UPDATE schedule_executions
           SET status = ?,
               duration = ?,
               result = ?,
               error = ?,
               retry_count = ?
           WHERE id = ?`,
          [
            execution.status,
            execution.duration ?? null,
            execution.result ? JSON.stringify(execution.result) : null,
            execution.error ?? null,
            execution.retryCount,
            execution.id,
          ],
        );
      } else {
        await tx.execute(
          `INSERT INTO schedule_executions (
            id, task_id, identity_id, execution_time, status, duration, result, error, retry_count, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            execution.id,
            execution.taskId,
            execution.identityId ?? null,
            new Date(execution.executionTime).toISOString(),
            execution.status,
            execution.duration ?? null,
            execution.result ? JSON.stringify(execution.result) : null,
            execution.error ?? null,
            execution.retryCount,
            execution.createdAt.toISOString(),
          ],
        );
      }
    }
  }

  async findById(id: string): Promise<ScheduleTask | null> {
    const row = await this.queryDb.getOptional<PowerSyncScheduleTaskRow>(
      'SELECT * FROM schedule_tasks WHERE id = ? LIMIT 1',
      [id],
    );
    if (!row) return null;
    const executions = await this.loadExecutions(row.id, 10);
    return PowerSyncScheduleTaskMapper.toDomain(row, executions);
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<ScheduleTask | null> {
    const row = await this.queryDb.getOptional<PowerSyncScheduleTaskRow>(
      'SELECT * FROM schedule_tasks WHERE id = ? AND identity_id = ? LIMIT 1',
      [id, identityId],
    );
    if (!row) return null;
    const executions = await this.loadExecutions(row.id, 10);
    return PowerSyncScheduleTaskMapper.toDomain(row, executions);
  }

  async deleteById(identityId: string, id: string): Promise<void> {
    const existing = await this.findByIdForIdentity(identityId, id);
    if (!existing) {
      throw new Error('Schedule task not found for the current identity.');
    }
    await this.queryDb.execute('DELETE FROM schedule_tasks WHERE id = ? AND identity_id = ?', [
      id,
      identityId,
    ]);
  }

  async findByIdentityId(identityId: string): Promise<ScheduleTask[]> {
    return this.queryRows(
      'SELECT * FROM schedule_tasks WHERE identity_id = ? ORDER BY next_run_at ASC',
      [identityId],
    );
  }

  async findBySourceModule(module: SourceModule, identityId: string): Promise<ScheduleTask[]> {
    return this.queryRows(
      `SELECT * FROM schedule_tasks WHERE source_module = ? AND identity_id = ? ORDER BY next_run_at ASC`,
      [module, identityId],
    );
  }

  async findBySourceEntity(
    module: SourceModule,
    entityId: string,
    identityId: string,
  ): Promise<ScheduleTask[]> {
    return this.queryRows(
      `SELECT * FROM schedule_tasks WHERE source_module = ? AND source_entity_id = ? AND identity_id = ? ORDER BY next_run_at ASC`,
      [module, entityId, identityId],
    );
  }

  async findBySchedulingOwner(owner: SchedulingOwner): Promise<ScheduleTask[]> {
    return this.queryRows(
      `SELECT * FROM schedule_tasks
       WHERE identity_id = ? AND owner_type = ? AND owner_id = ? AND scheduling_key IS NOT NULL
       ORDER BY next_run_at ASC`,
      [owner.identityId, owner.type, owner.id],
    );
  }

  async listSchedulingOwners(ownerType?: string): Promise<SchedulingOwner[]> {
    const rows = await this.queryDb.getAll<{ identity_id: string; owner_type: string; owner_id: string }>(
      `SELECT DISTINCT identity_id, owner_type, owner_id
       FROM schedule_tasks
       WHERE scheduling_key IS NOT NULL AND owner_type IS NOT NULL AND owner_id IS NOT NULL
       ${ownerType ? 'AND owner_type = ?' : ''}
       ORDER BY identity_id, owner_type, owner_id`,
      ownerType ? [ownerType] : [],
    );
    return rows.map((row) => ({
      identityId: row.identity_id,
      type: row.owner_type,
      id: row.owner_id,
    }));
  }

  async appendSchedulingReconcileReceipt(receipt: SchedulingReconcileReceipt): Promise<void> {
    await this.queryDb.execute(
      `INSERT INTO scheduling_reconcile_operations (
        id, identity_id, owner_type, owner_id, status, desired_count, created_count,
        updated_count, deleted_count, unchanged_count, failure_code, failure_message,
        failure_retryable, started_at, finished_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        receipt.operationId,
        receipt.owner.identityId,
        receipt.owner.type,
        receipt.owner.id,
        receipt.status,
        receipt.desiredCount,
        receipt.createdCount,
        receipt.updatedCount,
        receipt.deletedCount,
        receipt.unchangedCount,
        receipt.failure?.code ?? null,
        receipt.failure?.message ?? null,
        receipt.failure?.retryable === undefined ? null : receipt.failure.retryable ? 1 : 0,
        new Date(receipt.startedAt).toISOString(),
        new Date(receipt.finishedAt).toISOString(),
        new Date(receipt.finishedAt).toISOString(),
      ],
    );
  }

  async findByStatus(status: ScheduleTaskStatus, identityId: string): Promise<ScheduleTask[]> {
    return this.queryRows(
      `SELECT * FROM schedule_tasks WHERE status = ? AND identity_id = ? ORDER BY next_run_at ASC`,
      [status, identityId],
    );
  }

  async findEnabled(identityId?: string): Promise<ScheduleTask[]> {
    return this.queryRows(
      `SELECT * FROM schedule_tasks WHERE enabled = 1 AND status = ?${identityId ? ' AND identity_id = ?' : ''} ORDER BY next_run_at ASC`,
      identityId ? [ScheduleTaskStatus.Active, identityId] : [ScheduleTaskStatus.Active],
    );
  }

  async claimForExecution(id: string, expectedNextRunAt: Date): Promise<boolean> {
    const claim = async (tx: IElectronDatabaseTransaction): Promise<boolean> => {
      const result = await tx.execute(
        `UPDATE schedule_tasks
         SET last_run_at = ?
         WHERE id = ? AND status = ? AND enabled = 1 AND next_run_at = ?`,
        [new Date().toISOString(), id, ScheduleTaskStatus.Active, expectedNextRunAt.toISOString()],
      );
      return result.rowsAffected > 0;
    };

    if (this.transaction) {
      return claim(this.transaction);
    }
    let claimed = false;
    await this.db.writeTransaction(async (tx) => {
      claimed = await claim(tx);
    });
    return claimed;
  }

  async findDueTasksForExecution(beforeTime: Date, limit?: number): Promise<ScheduleTask[]> {
    return this.queryRows(
      `SELECT * FROM schedule_tasks
       WHERE enabled = 1 AND status = ? AND next_run_at <= ?
       ORDER BY next_run_at ASC${limit ? ' LIMIT ?' : ''}`,
      limit
        ? [ScheduleTaskStatus.Active, beforeTime.toISOString(), limit]
        : [ScheduleTaskStatus.Active, beforeTime.toISOString()],
    );
  }

  async query(options: IScheduleTaskQueryOptions): Promise<ScheduleTask[]> {
    const clauses: string[] = ['identity_id = ?'];
    const params: unknown[] = [options.identityId];

    if (options.sourceModule) {
      clauses.push('source_module = ?');
      params.push(options.sourceModule);
    }
    if (options.sourceEntityId) {
      clauses.push('source_entity_id = ?');
      params.push(options.sourceEntityId);
    }
    if (options.status) {
      clauses.push('status = ?');
      params.push(options.status);
    }
    if (options.isEnabled !== undefined) {
      clauses.push('enabled = ?');
      params.push(options.isEnabled ? 1 : 0);
    }

    let sql = `SELECT * FROM schedule_tasks WHERE ${clauses.join(' AND ')}`;
    sql += ' ORDER BY next_run_at ASC';
    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    return this.queryRows(sql, params);
  }

  async count(options: IScheduleTaskQueryOptions): Promise<number> {
    const clauses: string[] = ['identity_id = ?'];
    const params: unknown[] = [options.identityId];

    if (options.sourceModule) {
      clauses.push('source_module = ?');
      params.push(options.sourceModule);
    }
    if (options.sourceEntityId) {
      clauses.push('source_entity_id = ?');
      params.push(options.sourceEntityId);
    }
    if (options.status) {
      clauses.push('status = ?');
      params.push(options.status);
    }
    if (options.isEnabled !== undefined) {
      clauses.push('enabled = ?');
      params.push(options.isEnabled ? 1 : 0);
    }

    const sql = `SELECT COUNT(*) as count FROM schedule_tasks WHERE ${clauses.join(' AND ')}`;
    const row = await this.queryDb.getOptional<{ count: number }>(sql, params);
    return Number(row?.count ?? 0);
  }

  async saveBatch(tasks: ScheduleTask[]): Promise<void> {
    for (const task of tasks) {
      await this.save(task);
    }
  }

  async deleteBatch(identityId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    await this.queryDb.execute(
      `DELETE FROM schedule_tasks WHERE identity_id = ? AND id IN (${placeholders})`,
      [identityId, ...ids],
    );
  }

  async withTransaction<T>(fn: (repo: IScheduleTaskRepository) => Promise<T>): Promise<T> {
    if (this.transaction) {
      return fn(this);
    }

    const deferredAggregates = new Set<ScheduleTask>();
    const result = await this.db.writeTransaction(async (tx) => {
      const txRepository = new PowerSyncScheduleTaskRepository(
        this.db,
        tx,
        deferredAggregates,
      );
      return fn(txRepository);
    });

    // Match Prisma semantics: domain events become visible only after commit.
    for (const aggregate of deferredAggregates) {
      if (aggregate.domainEvents.length > 0) {
        flushDomainEvents(scheduleEventPublisher, aggregate);
      }
    }
    return result;
  }

  private async queryRows(sql: string, params: unknown[]): Promise<ScheduleTask[]> {
    const rows = await this.queryDb.getAll<PowerSyncScheduleTaskRow>(sql, params);
    return Promise.all(
      rows.map(async (row) => {
        const executions = await this.loadExecutions(row.id, 10);
        return PowerSyncScheduleTaskMapper.toDomain(row, executions);
      }),
    );
  }

  private async loadExecutions(
    taskId: string,
    limit: number,
  ): Promise<PowerSyncScheduleExecutionRow[]> {
    return this.queryDb.getAll<PowerSyncScheduleExecutionRow>(
      'SELECT * FROM schedule_executions WHERE task_id = ? ORDER BY created_at DESC LIMIT ?',
      [taskId, limit],
    );
  }
}
