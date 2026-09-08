import { afterEach, describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import type {
  IElectronDatabase,
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { TaskGoalBindingTrigger, TaskPlanOutcome, TaskType } from '@memoflow/contracts/task';
import { eventBus } from '@memoflow/utils/domain';
import { TaskTemplate } from '../../../domain/aggregates/task-template';
import { RecurrenceRule, TaskInstanceId, TaskTimeConfig } from '../../../domain/value-objects';
import { anIdentityId } from '../../../../testing';
import { createTaskPowerSyncModule } from '../../powersync';
import { PowerSyncTaskInstanceRepository } from './task-instance-powersync.repository';
import { PowerSyncTaskWriteTransactionRunner } from './powersync-task-write-transaction-runner';

type TemplateRecord = { id: string };
type InstanceRecord = { id: string; templateId: string };
type OutboxRecord = { id: string };
type StateSnapshot = {
  templates: Map<string, TemplateRecord>;
  instances: Map<string, InstanceRecord>;
  outbox: Map<string, OutboxRecord>;
};

class FakePowerSyncTaskDb implements IElectronDatabase {
  failOutbox = false;
  private state: StateSnapshot = {
    templates: new Map(),
    instances: new Map(),
    outbox: new Map(),
  };

  get templateCount(): number {
    return this.state.templates.size;
  }

  get instanceCount(): number {
    return this.state.instances.size;
  }

  get outboxCount(): number {
    return this.state.outbox.size;
  }

  async execute(sql: string, parameters?: unknown[]): Promise<IElectronDatabaseQueryResult> {
    return this.executeAgainst(this.state, sql, parameters);
  }

  async getAll<T>(_sql: string, _parameters?: unknown[]): Promise<T[]> {
    return [] as T[];
  }

  async getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null> {
    return this.getOptionalAgainst(this.state, sql, parameters);
  }

  async get<T>(sql: string, parameters?: unknown[]): Promise<T> {
    const row = await this.getOptional<T>(sql, parameters);
    if (row === null) {
      throw new Error(`No row found for query: ${sql}`);
    }

    return row;
  }

  async writeTransaction<T>(
    callback: (tx: IElectronDatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    const staged = this.cloneState(this.state);
    const tx: IElectronDatabaseTransaction = {
      execute: (sql, parameters) => this.executeAgainst(staged, sql, parameters),
      getAll: async <T>() => [] as T[],
      getOptional: <T>(sql: string, parameters?: unknown[]) =>
        this.getOptionalAgainst<T>(staged, sql, parameters),
      get: async <T>(sql: string, parameters?: unknown[]) => {
        const row = await this.getOptionalAgainst<T>(staged, sql, parameters);
        if (row === null) {
          throw new Error(`No row found for query: ${sql}`);
        }

        return row;
      },
    };

    const result = await callback(tx);
    this.state = staged;
    return result;
  }

  private cloneState(source: StateSnapshot): StateSnapshot {
    return {
      templates: new Map(source.templates),
      instances: new Map(source.instances),
      outbox: new Map(source.outbox),
    };
  }

  private async executeAgainst(
    state: StateSnapshot,
    sql: string,
    parameters?: unknown[],
  ): Promise<IElectronDatabaseQueryResult> {
    if (sql.includes('INSERT OR IGNORE INTO task_goal_outbox')) {
      expect(sql).toContain('task_goal_outbox (id, identity_id');
      expect(sql).not.toContain('event_id');
      if (this.failOutbox) {
        throw new Error('PowerSync outbox write failure simulation');
      }
      const id = String(parameters?.[0]);
      state.outbox.set(id, { id });
      return { rowsAffected: 1 };
    }

    if (sql.includes('INSERT INTO task_templates')) {
      const id = String(parameters?.[0]);
      state.templates.set(id, { id, _params: parameters ?? [] });
      return { rowsAffected: 1 };
    }

    if (sql.includes('UPDATE task_templates')) {
      const id = String(parameters?.[(parameters?.length ?? 1) - 1]);
      state.templates.set(id, { id });
      return { rowsAffected: 1 };
    }

    if (sql.includes('DELETE FROM task_templates WHERE id = ?')) {
      state.templates.delete(String(parameters?.[0]));
      return { rowsAffected: 1 };
    }

    if (sql.includes('INSERT INTO task_instances')) {
      const id = String(parameters?.[0]);
      const templateId = String(parameters?.[1]);
      const identityId = String(parameters?.[2]);
      const instanceDate = String(parameters?.[3]);
      const occurrenceKey = parameters?.[4] == null ? null : String(parameters[4]);
      const status = String(parameters?.[5]);
      const importance = parameters?.[6] == null ? null : String(parameters[6]);
      const timeConfig = String(parameters?.[7]);
      state.instances.set(id, {
        id,
        template_id: templateId,
        identity_id: identityId,
        instance_date: instanceDate,
        occurrence_key: occurrenceKey,
        status,
        importance,
        time_config: timeConfig,
        actual_start_time: parameters?.[8] ?? null,
        actual_end_time: parameters?.[9] ?? null,
        comment: parameters?.[10] ?? null,
        version: Number(parameters?.[11] ?? 1),
        created_at: String(parameters?.[12] ?? instanceDate),
        updated_at: String(parameters?.[13] ?? instanceDate),
        deleted_at: parameters?.[14] ?? null,
      });
      return { rowsAffected: 1 };
    }

    if (sql.includes('UPDATE task_instances')) {
      const id = String(parameters?.[(parameters?.length ?? 1) - 1]);
      const existing = state.instances.get(id);
      if (existing) {
        // Apply the status update (status follows occurrence_key in TASK-2204) so the
        // rollback assertion is a REAL proof, not a vacuous one.
        const status = parameters?.[4] == null ? (existing as { status?: string }).status : String(parameters[4]);
        state.instances.set(id, { ...existing, status });
      } else {
        state.instances.set(id, { id, template_id: String(parameters?.[0]), status: 'Pending' });
      }
      return { rowsAffected: 1 };
    }

    if (sql.includes('DELETE FROM task_instances WHERE template_id = ?')) {
      const templateId = String(parameters?.[0]);
      for (const [id, record] of state.instances.entries()) {
        if (record.templateId === templateId) {
          state.instances.delete(id);
        }
      }
      return { rowsAffected: 1 };
    }

    if (sql.includes('DELETE FROM task_instances WHERE id = ?')) {
      state.instances.delete(String(parameters?.[0]));
      return { rowsAffected: 1 };
    }

    if (sql.includes('DELETE FROM task_instances WHERE id IN')) {
      for (const id of parameters ?? []) {
        state.instances.delete(String(id));
      }
      return { rowsAffected: Array.isArray(parameters) ? parameters.length : 0 };
    }

    throw new Error(`Unsupported execute SQL in test double: ${sql}`);
  }

  private async getOptionalAgainst<T>(
    state: StateSnapshot,
    sql: string,
    parameters?: unknown[],
  ): Promise<T | null> {
    if (sql.includes('SELECT id FROM task_templates WHERE id = ?')) {
      const id = String(parameters?.[0]);
      return (state.templates.has(id) ? { id } : null) as T | null;
    }

    if (sql.includes('FROM task_templates WHERE id = ? AND identity_id = ?')) {
      const id = String(parameters?.[0]);
      const row = state.templates.get(id);
      if (row) {
        // Rebuild a row from the stored INSERT parameters so goal binding fields survive.
        const prm = (row as { _params?: unknown[] })._params ?? [];
        const rowShape: Record<string, unknown> = {
          id,
          identity_id: String(prm[1] ?? ''),
          name: String(prm[2] ?? ''),
          description: prm[3] ?? null,
          status: String(prm[4] ?? 'Active'),
          outcome: String(prm[5] ?? 'Open'),
          completion_policy: String(prm[6] ?? 'AllowCorrection'),
          closed_at: prm[7] ?? null,
          archived_at: prm[8] ?? null,
          abandoned_reason: prm[9] ?? null,
          importance: prm[10] == null ? null : String(prm[10]),
          time_config_type: prm[11] ?? null,
          time_config_start_time: prm[12] ?? null,
          time_config_end_time: prm[13] ?? null,
          time_config_duration_minutes: prm[14] ?? null,
          time_config_time_point: prm[15] ?? null,
          time_config_time_range_start: prm[16] ?? null,
          time_config_time_range_end: prm[17] ?? null,
          recurrence_rule_type: prm[18] ?? null,
          recurrence_rule_interval: prm[19] ?? null,
          recurrence_rule_days_of_week: prm[20] ?? null,
          recurrence_rule_end_date: prm[21] ?? null,
          recurrence_rule_count: prm[22] ?? null,
          reminder_config_enabled: prm[23] ?? null,
          reminder_config_time_offset_minutes: prm[24] ?? null,
          reminder_config_unit: prm[25] ?? null,
          reminder_config_channel: prm[26] ?? null,
          last_generated_date: prm[27] ?? null,
          generate_ahead_days: prm[28] ?? null,
          goal_id: prm[29] ?? null,
          key_result_id: prm[30] ?? null,
          goal_record_value: prm[31] ?? null,
          goal_progress_trigger: prm[32] ?? null,
          checklist: prm[33] ?? null,
          version: Number(prm[34] ?? 1),
          updated_at: prm[35] ?? new Date().toISOString(),
          deleted_at: prm[36] ?? null,
          created_at: prm[37] ?? new Date().toISOString(),
        };
        return rowShape as unknown as T;
      }
      return null;
    }

    if (sql.includes('SELECT id FROM task_instances WHERE template_id = ? AND identity_id = ? AND occurrence_key = ?')) {
      const [templateId, identityId, occurrenceKey] = (parameters ?? []).map(String);
      const match = Array.from(state.instances.values()).find((row) =>
        String((row as any).template_id) === templateId &&
        String((row as any).identity_id) === identityId &&
        String((row as any).occurrence_key) === occurrenceKey &&
        (row as any).deleted_at == null,
      ) as { id?: string } | undefined;
      return (match?.id ? { id: match.id } : null) as T | null;
    }

    if (sql.includes('SELECT id FROM task_instances WHERE id = ?')) {
      const id = String(parameters?.[0]);
      return (state.instances.has(id) ? { id } : null) as T | null;
    }

    if (sql.includes('SELECT status FROM task_instances WHERE id = ?')) {
      const id = String(parameters?.[0]);
      const row = state.instances.get(id);
      return (row ? { status: (row as { status?: string }).status ?? 'pending' } : null) as T | null;
    }

    if (sql.includes('FROM task_instances WHERE id = ? AND identity_id = ?')) {
      const id = String(parameters?.[0]);
      const identityId = String(parameters?.[1]);
      const row = state.instances.get(id);
      if (row && (row as { identity_id?: string }).identity_id === identityId) {
        return row as unknown as T;
      }
      return null;
    }

    return null;
  }
}

describe('PowerSyncTaskWriteTransactionRunner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('publishes buffered domain events only after the write transaction commits', async () => {
    const db = new FakePowerSyncTaskDb();
    const runner = new PowerSyncTaskWriteTransactionRunner(db);
    const dispatchSpy = vi.spyOn(eventBus, 'dispatch').mockResolvedValue(undefined);
    const template = TaskTemplate.create({
      identityId: anIdentityId(),
      title: 'PowerSync write',
      taskType: TaskType.Recurring,
      timeConfig: TaskTimeConfig.createAllDay(new Date()),
      recurrenceRule: RecurrenceRule.createDaily(1),
      importance: ImportanceLevel.Moderate,
    });

    let sentBeforeCommit = false;

    await runner.run(async ({ templateRepository }) => {
      await templateRepository.save(template);
      sentBeforeCommit = dispatchSpy.mock.calls.length > 0;
    });

    expect(sentBeforeCommit).toBe(false);
    expect(db.templateCount).toBe(1);
    // W5 metadata contract: the reliable delivery adapter passes envelope metadata
    // (aggregateId / occurredAt / optional idempotencyKey) as the 3rd arg.
    expect(dispatchSpy).toHaveBeenCalledWith(
      'task:created',
      expect.objectContaining({ templateId: template.id }),
      expect.objectContaining({
        aggregateId: expect.any(String),
        occurredAt: expect.any(Date),
      }),
    );
  });

  it('rolls back task module writes and publishes nothing when instance persistence fails', async () => {
    const db = new FakePowerSyncTaskDb();
    const module = createTaskPowerSyncModule(db);
    const dispatchSpy = vi.spyOn(eventBus, 'dispatch').mockResolvedValue(undefined);
    vi.spyOn(PowerSyncTaskInstanceRepository.prototype, 'saveMany').mockRejectedValue(
      new Error('saveMany failed'),
    );

    const result = await module.api.createTaskTemplate({
      identityId: anIdentityId(),
      name: 'Daily Review',
      taskType: TaskType.Recurring,
      timeConfig: {
        timeType: 'AllDay',
        startDate: Date.now(),
        timePoint: null,
        timeRange: null,
      },
      recurrenceRule: {
        frequency: 'Daily',
        interval: 1,
        daysOfWeek: [],
        endDate: null,
        occurrences: null,
      },
      importance: ImportanceLevel.Moderate,
    });

    expect(result).toBeErrorWithCode('INTERNAL_ERROR');
    expect(db.templateCount).toBe(0);
    expect(db.instanceCount).toBe(0);
    expect(dispatchSpy).not.toHaveBeenCalled();

    module.dispose();
  });

  it('persists PlanCompletion outcome settlement through the same PowerSync transaction boundary', async () => {
    const db = new FakePowerSyncTaskDb();
    const module = createTaskPowerSyncModule(db);
    const identityId = anIdentityId();
    const template = TaskTemplate.create({
      identityId,
      title: 'PowerSync finite plan',
      taskType: TaskType.Recurring,
      timeConfig: TaskTimeConfig.createAllDay(new Date()),
      recurrenceRule: RecurrenceRule.createDaily(1).setOccurrences(15),
      importance: ImportanceLevel.Moderate,
      goalBinding: {
        goalId: 'goal-1',
        keyResultId: 'kr-1',
        contribution: { value: 1, trigger: TaskGoalBindingTrigger.PlanCompletion },
      },
    });
    await module.taskTemplateRepository.save(template);

    const runner = new PowerSyncTaskWriteTransactionRunner(db);
    await runner.run(async ({ templateRepository }) => {
      template.applyPlanOutcome(TaskPlanOutcome.Succeeded, {
        triggeringTaskInstanceId: TaskInstanceId.generate(),
      });
      await templateRepository.save(template);
    });

    expect(db.outboxCount).toBe(1);
    module.dispose();
  });

  it('rolls back task module writes, outbox and publishes nothing when task_goal_outbox insert fails', async () => {
    const db = new FakePowerSyncTaskDb();
    const module = createTaskPowerSyncModule(db);
    const dispatchSpy = vi.spyOn(eventBus, 'dispatch').mockResolvedValue(undefined);

    const identityId = anIdentityId();
    const createRes = await module.api.createTaskTemplate({
      identityId,
      name: 'Goal Task',
      taskType: TaskType.Recurring,
      timeConfig: {
        timeType: 'AllDay',
        startDate: Date.now(),
        timePoint: null,
        timeRange: null,
      },
      recurrenceRule: {
        frequency: 'Daily',
        interval: 1,
        daysOfWeek: [],
        endDate: null,
        occurrences: null,
      },
      importance: ImportanceLevel.Moderate,
      goalBinding: {
        goalId: 'goal-1',
        keyResultId: 'kr-1',
        contribution: { value: 1, trigger: TaskGoalBindingTrigger.EachCompletion },
      },
    });
    expect(createRes.ok).toBe(true);
    if (!createRes.ok) return;

    expect(db.instanceCount).toBeGreaterThan(0);
    const instanceId = Array.from((db as any).state.instances.keys())[0] as string;

    dispatchSpy.mockClear();

    db.failOutbox = true;

    const result = await module.api.completeTaskInstance(instanceId, identityId);

    expect(result).toBeErrorWithCode('INTERNAL_ERROR');
    expect(db.templateCount).toBe(1);
    expect(db.outboxCount).toBe(0);
    expect(dispatchSpy).not.toHaveBeenCalled();

    // The completed instance must have ROLLED BACK to its pre-complete status
    const instanceRow = await db.getOptional<{ status: string }>(
      'SELECT status FROM task_instances WHERE id = ?',
      [instanceId],
    );
    expect(instanceRow?.status).toBe('Pending');

    module.dispose();
  });
});
