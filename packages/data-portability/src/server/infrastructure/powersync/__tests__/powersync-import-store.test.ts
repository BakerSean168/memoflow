import { describe, expect, it, vi } from 'vitest';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import { PowerSyncDataPortabilityImportStore } from '../powersync-import-store';

interface ExecutedStatement {
  sql: string;
  parameters: unknown[] | undefined;
}

function createFakeDb(options: { existing?: Record<string, unknown> | null } = {}) {
  const statements: ExecutedStatement[] = [];
  const tx: IElectronDatabaseTransaction = {
    execute: vi.fn(async (sql, parameters) => {
      statements.push({ sql, parameters });
      return { rowsAffected: 1 };
    }),
    getAll: vi.fn(async () => []),
    get: vi.fn(async () => ({})),
    getOptional: vi.fn(async () => options.existing ?? null),
  };

  const db: IElectronDatabase = {
    ...tx,
    writeTransaction: vi.fn(async (callback) => callback(tx)),
  };

  return { db, tx, statements };
}

describe('PowerSyncDataPortabilityImportStore', () => {
  it('wraps import work in a write transaction', async () => {
    const { db } = createFakeDb();
    const store = new PowerSyncDataPortabilityImportStore(db);

    await store.transaction(async () => 'done');

    expect(db.writeTransaction).toHaveBeenCalledTimes(1);
  });

  it('writes repository data with snake_case columns and JSON stringified values', async () => {
    const { db, statements } = createFakeDb();
    const store = new PowerSyncDataPortabilityImportStore(db);

    await store.transaction((tx) =>
      tx.createRepository({
        id: 'repo-1',
        identityId: 'identity-1',
        name: 'Knowledge',
        type: 'local',
        path: '/knowledge',
        description: null,
        config: { layout: 'tree' },
        status: 'ACTIVE',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      }),
    );

    const insert = statements.find((statement) =>
      statement.sql.includes('INSERT INTO repositories'),
    );
    expect(insert?.sql).toContain('identity_id');
    expect(insert?.sql).toContain('created_at');
    expect(insert?.sql).not.toContain('identityId');
    expect(insert?.parameters).toContain(JSON.stringify({ layout: 'tree' }));
    expect(insert?.parameters).toContain('2024-01-01T00:00:00.000Z');
    expect(insert?.parameters).toContain('2024-01-02T00:00:00.000Z');
  });

  it('converts booleans to integers and arrays to JSON for task templates', async () => {
    const { db, statements } = createFakeDb();
    const store = new PowerSyncDataPortabilityImportStore(db);

    await store.transaction((tx) =>
      tx.createTaskPlan({
        id: 'task-1',
        identityId: 'identity-1',
        name: 'Write tests',
        description: null,
        status: 'Active',
        outcome: 'Open',
        completionPolicy: 'AllowCorrection',
        closedAt: null,
        archivedAt: null,
        abandonedReason: null,
        importance: 'moderate',
        color: null,
        tags: JSON.stringify(['qa']),
        timeConfigType: 'FixedTime',
        timeConfigStartTime: null,
        timeConfigEndTime: null,
        timeConfigDurationMinutes: null,
        timeConfigTimePoint: 540,
        timeConfigTimeRangeStart: null,
        timeConfigTimeRangeEnd: null,
        recurrenceRuleType: null,
        recurrenceRuleInterval: null,
        recurrenceRuleDaysOfWeek: null,
        recurrenceRuleEndDate: null,
        recurrenceRuleCount: null,
        reminderConfigEnabled: true,
        reminderConfigTimeOffsetMinutes: 15,
        reminderConfigUnit: 'Minute',
        reminderConfigChannel: 'system',
        goalId: 'goal-1',
        keyResultId: 'kr-1',
        goalRecordValue: 2.5,
        goalProgressTrigger: 'EachCompletion',
        checklist: JSON.stringify([{ title: 'cover IPC', order: 0 }]),
      }),
    );

    const insert = statements.find((statement) =>
      statement.sql.includes('INSERT INTO task_templates'),
    );
    expect(insert?.sql).toContain('time_config_type');
    expect(insert?.sql).toContain('reminder_config_enabled');
    expect(insert?.sql).toContain('goal_id');
    expect(insert?.sql).toContain('key_result_id');
    expect(insert?.sql).toContain('goal_record_value');
    expect(insert?.sql).toContain('goal_progress_trigger');
    expect(insert?.sql).not.toContain('goal_binding');
    expect(insert?.sql).not.toContain('is_blocked');
    expect(insert?.sql).not.toContain('timeConfigType');
    expect(insert?.parameters).toContain(JSON.stringify(['qa']));
    expect(insert?.parameters).toContain('goal-1');
    expect(insert?.parameters).toContain('kr-1');
    expect(insert?.parameters).toContain(2.5);
    expect(insert?.parameters).toContain('EachCompletion');
    expect(insert?.parameters).toContain(1);
  });

  it('updates singleton rows instead of inserting when they already exist', async () => {
    const { db, statements } = createFakeDb({ existing: { id: 'settings-1' } });
    const store = new PowerSyncDataPortabilityImportStore(db);

    await store.transaction((tx) =>
      tx.upsertUserPreferences({
        identityId: 'identity-1',
        presentation: { theme: 'dark', language: 'en-US' },
        regional: { timeZone: 'UTC', dateStyle: 'medium', timeStyle: '24h', weekStartsOn: 1 },
      }),
    );

    expect(statements).toHaveLength(2);
    expect(statements.every((statement) => statement.sql.includes('UPDATE user_preference_records'))).toBe(true);
    expect(statements[0]?.parameters).toContain(JSON.stringify({ theme: 'dark', language: 'en-US' }));
    expect(statements[1]?.parameters).toContain(JSON.stringify({ timeZone: 'UTC', dateStyle: 'medium', timeStyle: '24h', weekStartsOn: 1 }));
  });

  it('writes schedule task scheduler fields and imported timestamps', async () => {
    const { db, statements } = createFakeDb();
    const store = new PowerSyncDataPortabilityImportStore(db);

    await store.transaction((tx) =>
      tx.createScheduleTask({
        id: 'schedule-task-1',
        identityId: 'identity-1',
        name: 'Daily sync',
        description: null,
        sourceModule: 'task',
        sourceEntityId: 'task-1',
        status: 'Active',
        outcome: 'Open',
        completionPolicy: 'AllowCorrection',
        closedAt: null,
        archivedAt: null,
        abandonedReason: null,
        enabled: true,
        cronExpression: '0 8 * * *',
        timezone: 'Asia/Shanghai',
        startDate: '2024-02-01T00:00:00.000Z',
        endDate: null,
        maxExecutions: 10,
        nextRunAt: '2024-02-02T00:00:00.000Z',
        lastRunAt: '2024-02-01T00:00:00.000Z',
        executionCount: 3,
        lastExecutionStatus: 'success',
        lastExecutionDuration: 120,
        consecutiveFailures: 0,
        maxRetries: 5,
        initialDelayMs: 500,
        maxDelayMs: 60_000,
        backoffMultiplier: 2.5,
        retryableStatuses: JSON.stringify(['timeout']),
        payload: JSON.stringify({ source: 'import' }),
        tags: JSON.stringify(['sync']),
        priority: 'high',
        timeout: 30_000,
        createdAt: '2024-02-01T00:00:00.000Z',
        updatedAt: '2024-02-01T01:00:00.000Z',
      }),
    );

    const insert = statements.find((statement) =>
      statement.sql.includes('INSERT INTO schedule_tasks'),
    );
    expect(insert?.sql).toContain('cron_expression');
    expect(insert?.sql).toContain('retryable_statuses');
    expect(insert?.sql).toContain('timeout');
    expect(insert?.parameters).toContain('0 8 * * *');
    expect(insert?.parameters).toContain('Asia/Shanghai');
    expect(insert?.parameters).toContain(JSON.stringify(['timeout']));
    expect(insert?.parameters).toContain('2024-02-01T00:00:00.000Z');
    expect(insert?.parameters).toContain('2024-02-01T01:00:00.000Z');
  });

  it('uses the imported generated id for reminder responses', async () => {
    const { db, statements } = createFakeDb();
    const store = new PowerSyncDataPortabilityImportStore(db);

    await store.transaction((tx) =>
      tx.createReminderResponse({
        id: 'response-1',
        identityId: 'identity-1',
        templateId: 'template-1',
        action: 'dismiss',
        responseTime: 1_700_000_000,
        timestamp: '2024-03-01T00:00:00.000Z',
      }),
    );

    const insert = statements.find((statement) =>
      statement.sql.includes('INSERT INTO reminder_responses'),
    );
    expect(insert?.parameters?.[0]).toBe('response-1');
  });

  it('propagates transaction failures', async () => {
    const { db } = createFakeDb();
    const store = new PowerSyncDataPortabilityImportStore(db);
    const error = new Error('boom');

    await expect(
      store.transaction(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });
});
