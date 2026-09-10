import { describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { IElectronDatabase, IElectronDatabaseQueryResult } from '@memoflow/contracts/electron';
import { PowerSyncNotificationReliableAdapter } from '../power-sync-notification-reliable.adapter';
import { PowerSyncNotificationRepository } from '../notification-powersync.repository';
import {
  createNotificationPowerSyncModule,
  createDefaultElectronDesktopTransport,
} from '../../../powersync';
import { CreateNotificationUseCase } from '../../../../application/use-cases/commands/create-notification.use-case';
import { RealDesktopChannelDeliverer } from '../../deliverers/real-channel-deliverers';
import { NotificationChannelType } from '@memoflow/contracts/notification';
import { NotificationPreference } from '../../../../domain/aggregates/notification-preference';
import { DoNotDisturbConfig } from '../../../../domain/value-objects/do-not-disturb-config';
import { RateLimit } from '../../../../domain/value-objects/rate-limit';
import { PowerSyncNotificationPreferenceRepository } from '../notification-preference-powersync.repository';
import { Notification } from '../../../../domain/aggregates/notification';
import { NotificationChannel } from '../../../../domain/entities/notification-channel';
import { buildIdempotencyKeyString } from '@memoflow/contracts/reliable-messaging';
import { createTimeContext } from '@memoflow/time';

const TEST_TIME_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const TEST_USER_TIME_CONTEXT_PORT = {
  getUserTimeContext: vi.fn().mockResolvedValue(TEST_TIME_CONTEXT),
};

function createTestSqliteDatabase(): IElectronDatabase {
  const sqlite = new Database(':memory:');
  const wrapper: IElectronDatabase = {
    async execute(sql: string, parameters?: unknown[]): Promise<IElectronDatabaseQueryResult> {
      const stmt = sqlite.prepare(sql);
      const info = stmt.run(...(parameters ?? []));
      return { rowsAffected: info.changes };
    },
    async getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]> {
      const stmt = sqlite.prepare(sql);
      return stmt.all(...(parameters ?? [])) as T[];
    },
    async getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null> {
      const stmt = sqlite.prepare(sql);
      const row = stmt.get(...(parameters ?? []));
      return (row as T) ?? null;
    },
    async get<T>(sql: string, parameters?: unknown[]): Promise<T> {
      const stmt = sqlite.prepare(sql);
      const row = stmt.get(...(parameters ?? []));
      if (!row) throw new Error(`Query returned no rows: ${sql}`);
      return row as T;
    },
    async writeTransaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
      sqlite.exec('BEGIN');
      try {
        const result = await callback(wrapper);
        sqlite.exec('COMMIT');
        return result;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };

  // Initialize notifications schema
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      workflow_key TEXT NOT NULL,
      topic TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      importance TEXT,
      urgency TEXT,
      is_read INTEGER DEFAULT 0,
      read_at TEXT,
      related_entity_type TEXT,
      related_entity_id TEXT,
      navigation_intent TEXT,
      correlation_id TEXT,
      causation_id TEXT,
      metadata TEXT,
      actions TEXT,
      expires_at TEXT,
      version INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE(identity_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS notification_channels (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      notification_id TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      status TEXT NOT NULL,
      recipient TEXT NOT NULL,
      max_retries INTEGER NOT NULL DEFAULT 3,
      retry_count INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT,
      failed_at TEXT,
      error TEXT,
      response TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notification_preferences (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL UNIQUE,
      global_channels TEXT NOT NULL DEFAULT '{}',
      workflow_overrides TEXT NOT NULL DEFAULT '{}',
      do_not_disturb TEXT,
      rate_limit TEXT,
      version INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notification_templates (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      title_template TEXT NOT NULL,
      content_template TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      default_channels TEXT NOT NULL,
      variables TEXT,
      is_active INTEGER DEFAULT 1,
      version INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notification_dispatch_outbox (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      notification_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'notification',
      occurrence_key TEXT NOT NULL,
      channel TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 0,
      owner_token TEXT,
      claim_id TEXT,
      fencing_token INTEGER NOT NULL DEFAULT 0,
      lease_expires_at TEXT,
      last_heartbeat_at TEXT,
      heartbeat_interval_ms INTEGER,
      last_error TEXT,
      next_retry_at TEXT,
      dead_letter_at TEXT,
      correlation_id TEXT,
      causation_id TEXT,
      attempts_history_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS outbox_messages (
      id TEXT PRIMARY KEY,
      aggregate_type TEXT NOT NULL DEFAULT 'shared',
      aggregate_id TEXT NOT NULL DEFAULT 'shared',
      message_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      owner_token TEXT,
      claim_id TEXT,
      fencing_token INTEGER NOT NULL DEFAULT 0,
      lease_expires_at TEXT,
      last_error TEXT,
      next_retry_at TEXT,
      identity_id TEXT,
      idempotency_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      correlation_id TEXT NOT NULL DEFAULT '',
      causation_id TEXT,
      schema_version INTEGER NOT NULL DEFAULT 1,
      dispatched_at TEXT
    );
    CREATE TABLE IF NOT EXISTS desktop_delivery_acks (
      idempotency_key TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      ack_id TEXT,
      payload_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return wrapper;
}

function createFileSqliteDatabase(dbPath: string): { db: IElectronDatabase; close: () => void } {
  const sqlite = new Database(dbPath);
  const wrapper: IElectronDatabase = {
    async execute(sql: string, parameters?: unknown[]): Promise<IElectronDatabaseQueryResult> {
      const stmt = sqlite.prepare(sql);
      const info = stmt.run(...(parameters ?? []));
      return { rowsAffected: info.changes };
    },
    async getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]> {
      const stmt = sqlite.prepare(sql);
      return stmt.all(...(parameters ?? [])) as T[];
    },
    async getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null> {
      const stmt = sqlite.prepare(sql);
      const row = stmt.get(...(parameters ?? []));
      return (row as T) ?? null;
    },
    async get<T>(sql: string, parameters?: unknown[]): Promise<T> {
      const stmt = sqlite.prepare(sql);
      const row = stmt.get(...(parameters ?? []));
      if (!row) throw new Error(`Query returned no rows: ${sql}`);
      return row as T;
    },
    async writeTransaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
      sqlite.exec('BEGIN');
      try {
        const result = await callback(wrapper);
        sqlite.exec('COMMIT');
        return result;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      workflow_key TEXT NOT NULL,
      topic TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      importance TEXT,
      urgency TEXT,
      is_read INTEGER DEFAULT 0,
      read_at TEXT,
      related_entity_type TEXT,
      related_entity_id TEXT,
      navigation_intent TEXT,
      correlation_id TEXT,
      causation_id TEXT,
      metadata TEXT,
      actions TEXT,
      expires_at TEXT,
      version INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE(identity_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS notification_channels (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      notification_id TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      status TEXT NOT NULL,
      recipient TEXT NOT NULL,
      max_retries INTEGER NOT NULL DEFAULT 3,
      retry_count INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT,
      failed_at TEXT,
      error TEXT,
      response TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notification_preferences (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL UNIQUE,
      global_channels TEXT NOT NULL DEFAULT '{}',
      workflow_overrides TEXT NOT NULL DEFAULT '{}',
      do_not_disturb TEXT,
      rate_limit TEXT,
      version INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notification_templates (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      title_template TEXT NOT NULL,
      content_template TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      default_channels TEXT NOT NULL,
      variables TEXT,
      is_active INTEGER DEFAULT 1,
      version INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notification_dispatch_outbox (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      notification_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'notification',
      occurrence_key TEXT NOT NULL,
      channel TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 0,
      owner_token TEXT,
      claim_id TEXT,
      fencing_token INTEGER NOT NULL DEFAULT 0,
      lease_expires_at TEXT,
      last_heartbeat_at TEXT,
      heartbeat_interval_ms INTEGER,
      last_error TEXT,
      next_retry_at TEXT,
      dead_letter_at TEXT,
      correlation_id TEXT,
      causation_id TEXT,
      attempts_history_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS outbox_messages (
      id TEXT PRIMARY KEY,
      aggregate_type TEXT NOT NULL DEFAULT 'shared',
      aggregate_id TEXT NOT NULL DEFAULT 'shared',
      message_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      owner_token TEXT,
      claim_id TEXT,
      fencing_token INTEGER NOT NULL DEFAULT 0,
      lease_expires_at TEXT,
      last_error TEXT,
      next_retry_at TEXT,
      identity_id TEXT,
      idempotency_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      correlation_id TEXT NOT NULL DEFAULT '',
      causation_id TEXT,
      schema_version INTEGER NOT NULL DEFAULT 1,
      dispatched_at TEXT
    );

    CREATE TABLE IF NOT EXISTS desktop_delivery_acks (
      idempotency_key TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      ack_id TEXT,
      payload_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return {
    db: wrapper,
    close: () => sqlite.close(),
  };
}

describe('PowerSync Notification Durable Worker & Composition Root', () => {
  it('PowerSyncNotificationReliableAdapter persists outbox and handles lease claim and receipt recording', async () => {
    const db = createTestSqliteDatabase();
    const adapter = new PowerSyncNotificationReliableAdapter(db);

    const operationId = randomUUID();
    const notificationId = randomUUID();
    const occurrenceKey = `occ:${notificationId}`;
    const idempotencyKey = buildIdempotencyKeyString({
      source: 'notification',
      occurrenceKey,
      identityId: 'user-123',
    });

    // 1. Dispatch outbox
    const receipt = await adapter.dispatchOutbox(
      {
        operationId,
        identityId: 'user-123',
        source: 'notification',
        occurrenceKey,
        channel: 'Desktop',
        payloadJson: JSON.stringify({ notificationId, title: 'Test Desktop Notif' }),
        idempotencyKey,
      },
      { notificationId },
    );

    expect(receipt.operationId).toBe(operationId);
    expect(receipt.status).toBe('pending');

    // 2. Claim outbox dispatch
    const claims = await adapter.claimOutboxDispatch({
      ownerToken: 'worker-1',
      leaseDurationMs: 10000,
      limit: 10,
    });

    expect(claims.length).toBe(1);
    expect(claims[0].claimed).toBe(true);
    expect(claims[0].lease?.ownerToken).toBe('worker-1');
    expect(claims[0].lease?.fencingToken).toBe(1);

    // 3. Record delivery receipt with terminal status
    const updatedReceipt = {
      ...claims[0].receipt,
      status: 'succeeded' as const,
      lease: null,
      finishedAt: new Date().toISOString(),
    };

    const finalReceipt = await adapter.recordDeliveryReceipt(updatedReceipt, {
      ownerToken: 'worker-1',
      fencingToken: 1,
    });

    expect(finalReceipt.status).toBe('succeeded');
    expect((finalReceipt as unknown as Record<string, unknown>).applied).toBe(true);
    expect(finalReceipt.lease).toBeNull();

    // 4. Query receipts
    const receipts = await adapter.queryReceipts('user-123');
    expect(receipts.length).toBe(1);
    expect(receipts[0].status).toBe('succeeded');
  });

  it('createNotificationPowerSyncModule registers production durable worker with real transport ack', async () => {
    const db = createTestSqliteDatabase();
    const transportDeliverSpy = vi.fn().mockResolvedValue({
      ackId: 'ack-test-123',
      status: 'delivered',
      timestamp: Date.now(),
    });

    const moduleInstance = createNotificationPowerSyncModule(db, {
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      transport: { deliver: transportDeliverSpy },
    });

    // Verify durable worker port is exposed on moduleInstance
    const durableRuntime = moduleInstance.durableRuntime;
    expect(durableRuntime).toBeDefined();

    // Create notification using UseCase
    const useCase = new CreateNotificationUseCase(
      moduleInstance.notificationRepository,
      moduleInstance.preferenceRepository,
      async () => false,
      TEST_USER_TIME_CONTEXT_PORT,
    );

    const createResult = await useCase.execute({
      identityId: 'user-456',
      title: 'Desktop Alert',
      content: 'Important message for desktop',
      type: 'Info',
      category: 'System',
      channels: [NotificationChannelType.Desktop],
    });

    expect(createResult.ok).toBe(true);
    const notificationDTO = createResult.data;

    // Verify outbox entry is in SQLite DB
    const outboxRows = await db.getAll<{ id: string; status: string; channel: string }>(
      `SELECT * FROM notification_dispatch_outbox WHERE identity_id = ?`,
      ['user-456'],
    );
    expect(outboxRows.length).toBe(1);
    expect(outboxRows[0].status).toBe('pending');
    expect(outboxRows[0].channel).toBe('Desktop');

    // Worker tick: claims from SQLite outbox -> calls transport -> records receipt with ack
    await durableRuntime.tick();

    // Verify transport was invoked
    expect(transportDeliverSpy).toHaveBeenCalledTimes(1);

    // Verify SQLite outbox item is now succeeded
    const updatedOutboxRows = await db.getAll<{ id: string; status: string }>(
      `SELECT * FROM notification_dispatch_outbox WHERE identity_id = ?`,
      ['user-456'],
    );
    expect(updatedOutboxRows[0].status).toBe('succeeded');

    // Verify notification_channels in SQLite has transport response ack
    const channelRows = await db.getAll<{ status: string; response: string }>(
      `SELECT * FROM notification_channels WHERE notification_id = ?`,
      [notificationDTO.id],
    );
    expect(channelRows.length).toBe(1);
    expect(channelRows[0].response).toContain('ack-test-123');

    moduleInstance.dispose();
  });

  it('RealDesktopChannelDeliverer handles transport ack and sets channel response', async () => {
    const deliverer = new RealDesktopChannelDeliverer({
      async deliver(_dto: unknown, context: unknown) {
        return {
          ackId: 'ack-999',
          status: 'delivered',
          timestamp: 123456789,
        };
      },
    });

    expect(deliverer.isAvailable()).toBe(true);

    const mockNotification: any = {
      toServerDTO() {
        return {
          id: 'notif-1',
          identityId: 'user-1',
          title: 'Title',
          content: 'Content',
          category: 'System',
          type: 'Info',
          importance: 'Normal',
        };
      },
    };

    const channelObj: any = {
      status: 'Pending',
      setResponse(r: any) {
        this.response = r;
      },
    };

    const idempotencyKey = buildIdempotencyKeyString({
      source: 'notification',
      occurrenceKey: 'occ-1',
      identityId: 'user-1',
    });

    await deliverer.deliver(mockNotification, channelObj, {
      deliveryId: 'deliv-1',
      idempotencyKey,
      identityId: 'user-1',
    });

    expect(channelObj.response).toBeDefined();
    const respDTO = typeof channelObj.response.toDTO === 'function' ? channelObj.response.toDTO() : channelObj.response;
    expect((respDTO.data as any).ack.ackId).toBe('ack-999');
  });

  it('createDefaultElectronDesktopTransport fail-closes until the late-bound renderer succeeds and then deduplicates by ack', async () => {
    const renderer = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const transport: any = createDefaultElectronDesktopTransport({ renderer });
    const context = {
      deliveryId: 'delivery-renderer-1',
      identityId: 'user-renderer-1',
      idempotencyKey: 'notification:user-renderer-1:desktop-1',
    };

    const unavailable = await transport.deliver(
      { title: 'Late-bound', content: 'Not ready yet' },
      context,
    );
    expect(unavailable.status).toBe('failed');

    const delivered = await transport.deliver(
      { title: 'Late-bound', content: 'Ready now' },
      context,
    );
    expect(delivered.status).toBe('delivered');

    const replay = await transport.deliver(
      { title: 'Late-bound', content: 'Must not render twice' },
      context,
    );
    expect(replay).toMatchObject({
      status: 'delivered',
      ackId: delivered.ackId,
    });
    expect(renderer).toHaveBeenCalledTimes(2);
  });

  it('createDefaultElectronDesktopTransport fail-closes when electron native Notification is unavailable', async () => {
    // Security property: without a working electron Notification the default transport MUST
    // return status 'failed' (no fabricated delivered ack). The delivered-success path is
    // exercised at deliverer level via injected transport stubs (see RealDesktopChannelDeliverer tests).
    const transport: any = createDefaultElectronDesktopTransport();
    const result = await transport.deliver({ title: 'Test', content: 'Body' });
    expect(result).toBeDefined();
    expect(result.status).toBe('failed');
    expect(result.ackId).toBeDefined();
  });
  it('PowerSyncAppSchema notification tables contain the repository-required columns', async () => {
    const { PowerSyncAppSchema } = await import('@memoflow/powersync-schema') as unknown as { PowerSyncAppSchema: Record<string, unknown> };
    const tables = (PowerSyncAppSchema.props ?? PowerSyncAppSchema.tables ?? PowerSyncAppSchema) as Record<string, unknown>;

    const channels = tables?.notification_channels;
    expect(channels).toBeDefined();
    const channelCols = (channels?.options?.columns ?? []).map((c: any) => c.name).join(',');
    for (const col of ['identity_id', 'notification_id', 'channel_type', 'status', 'recipient',
      'max_retries', 'retry_count', 'attempts', 'sent_at', 'failed_at', 'error', 'response',
      'created_at', 'updated_at']) {
      expect(channelCols).toContain(col);
    }

    const outbox = tables?.notification_dispatch_outbox;
    expect(outbox).toBeDefined();
    const outboxCols = (outbox?.options?.columns ?? []).map((c: any) => c.name).join(',');
    for (const col of ['identity_id', 'notification_id', 'source', 'occurrence_key', 'channel',
      'payload_json', 'idempotency_key', 'status', 'attempt', 'owner_token', 'claim_id',
      'fencing_token', 'lease_expires_at', 'created_at', 'updated_at']) {
      expect(outboxCols).toContain(col);
    }
  });

  it('save() rolls back atomically when a mid-transaction write fails', async () => {
    const db = createTestSqliteDatabase();
    const repo = new PowerSyncNotificationRepository(db as any);

    const failingNotification = Notification.create({
      identityId: 'user-rb' as any,
      workflowKey: 'system.general',
      topic: 'system.general',
      idempotencyKey: 'rollback-test',
      title: 'Rollback Test',
      content: 'Should not persist',
      type: 'Info' as any,
      category: 'System' as any,
    });
    failingNotification.addChannel(NotificationChannel.create({
      notificationId: failingNotification.id,
      channelType: 'InApp' as any,
      recipient: 'user-rb',
    }));

    // Force the second write inside save() to throw (bad outbox payload that
    // fails schema validation AFTER the notification row is written).
    const badOutbox = [{
      operationId: 'op-rb-1',
      identityId: 'user-rb',
      source: 'notification',
      occurrenceKey: 'notif_rb:InApp',
      channel: 'InApp',
      payloadJson: 'not-json',
      idempotencyKey: 'v1:7:user-rb:notif_rb:InApp',
    }];

    let threw = false;
    try {
      await repo.save(failingNotification, badOutbox as any);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    const rows = await db.getAll<{ id: string }>('SELECT id FROM notifications WHERE id = ?', [String(failingNotification.id)]);
    expect(rows.length).toBe(0);
  });

  it('Fault Injection (a): crash between native show() and receipt write -> re-claim hits durable ack without repeated side effect', async () => {
    const testDbFile = path.join(os.tmpdir(), `memoflow-test-durable-a-${randomUUID()}.db`);
    try {
      const instance1 = createFileSqliteDatabase(testDbFile);
      let nativeShowCallCount = 0;

      const transport1 = createDefaultElectronDesktopTransport({ db: instance1.db }) as unknown as {
        getAckStore: () => { getAck: (k: string) => Promise<unknown>; saveAck: (k: string, r: unknown) => Promise<void> };
      };
      const transportDeliverSpy1 = vi.fn().mockImplementation(async (_dto: unknown, context?: unknown) => {
        const ackId = randomUUID();
        const ackStore = transport1.getAckStore();
        const idempotencyKey = (context as Record<string, unknown>)?.idempotencyKey as string | undefined;
        if (idempotencyKey) {
          const existing = (await ackStore.getAck(idempotencyKey)) as { ackId?: string; status?: string; timestamp?: number } | null;
          if (existing?.status === 'delivered') {
            return { ackId: existing.ackId, status: 'delivered', timestamp: existing.timestamp };
          }
          await ackStore.saveAck(idempotencyKey, { ackId, status: 'delivering', timestamp: Date.now() });
        }

        nativeShowCallCount++;

        const deliveredAck = { ackId, status: 'delivered' as const, timestamp: Date.now() };
        if (idempotencyKey) {
          await ackStore.saveAck(idempotencyKey, deliveredAck);
        }
        return deliveredAck;
      });

      const mockTransportObj1 = {
        deliver: transportDeliverSpy1,
        getAckStore: () => transport1.getAckStore(),
        getAck: (k: string) => transport1.getAckStore().getAck(k),
      };

      const moduleInstance1 = createNotificationPowerSyncModule(instance1.db, {
        userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
        transport: mockTransportObj1,
      });

      const useCase1 = new CreateNotificationUseCase(
        moduleInstance1.notificationRepository,
        moduleInstance1.preferenceRepository,
        async () => false,
        TEST_USER_TIME_CONTEXT_PORT,
      );

      const createRes = await useCase1.execute({
        identityId: 'user-crash-a',
        title: 'Crash A Test',
        content: 'Testing crash before receipt write',
        type: 'Info',
        category: 'System',
        channels: [NotificationChannelType.Desktop],
      });
      expect(createRes.ok).toBe(true);

      const adapter1 = new PowerSyncNotificationReliableAdapter(instance1.db);
      const claims1 = await adapter1.claimOutboxDispatch({ ownerToken: 'worker-a', leaseDurationMs: 1, limit: 1 });
      expect(claims1.length).toBe(1);

      const deliverer1 = new RealDesktopChannelDeliverer(mockTransportObj1);
      const notif1 = await moduleInstance1.notificationRepository.findByIdForIdentity('user-crash-a', createRes.data.id);
      const ch1 = notif1?.notificationChannels?.[0];
      expect(ch1).toBeDefined();

      const deliveryContext1 = {
        deliveryId: claims1[0].outbox.id,
        idempotencyKey: claims1[0].outbox.idempotencyKey,
        identityId: 'user-crash-a',
      };

      await deliverer1.deliver(notif1!, ch1!, deliveryContext1);
      expect(nativeShowCallCount).toBe(1);

      // Verify durable ack record is written into SQLite DB instance1
      const ackInDb1 = await instance1.db.getOptional<{ status: string; ack_id: string }>(
        'SELECT status, ack_id FROM desktop_delivery_acks WHERE idempotency_key = ?',
        [claims1[0].outbox.idempotencyKey],
      );
      expect(ackInDb1?.status).toBe('delivered');
      expect(ackInDb1?.ack_id).toBeDefined();

      // CRASH (a): Process crashed before recordDeliveryReceipt!
      moduleInstance1.dispose();
      instance1.close();

      // RESTART: Create fresh DB connection instance2 to SAME sqlite file + fresh transport & runtime
      const instance2 = createFileSqliteDatabase(testDbFile);
      const transport2 = createDefaultElectronDesktopTransport({ db: instance2.db }) as unknown as {
        getAckStore: () => { getAck: (k: string) => Promise<unknown>; saveAck: (k: string, r: unknown) => Promise<void> };
      };
      let nativeShowCallCount2 = 0;
      const transportDeliverSpy2 = vi.fn().mockImplementation(async (_dto: unknown, context?: unknown) => {
        const ackId = randomUUID();
        const ackStore = transport2.getAckStore();
        const idempotencyKey = (context as Record<string, unknown>)?.idempotencyKey as string | undefined;
        if (idempotencyKey) {
          const existing = (await ackStore.getAck(idempotencyKey)) as { ackId?: string; status?: string; timestamp?: number } | null;
          if (existing?.status === 'delivered') {
            return { ackId: existing.ackId, status: 'delivered', timestamp: existing.timestamp };
          }
          await ackStore.saveAck(idempotencyKey, { ackId, status: 'delivering', timestamp: Date.now() });
        }

        nativeShowCallCount2++;

        const deliveredAck = { ackId, status: 'delivered' as const, timestamp: Date.now() };
        if (idempotencyKey) {
          await ackStore.saveAck(idempotencyKey, deliveredAck);
        }
        return deliveredAck;
      });

      const mockTransportObj2 = {
        deliver: transportDeliverSpy2,
        getAckStore: () => transport2.getAckStore(),
        getAck: (k: string) => transport2.getAckStore().getAck(k),
      };

      const moduleInstance2 = createNotificationPowerSyncModule(instance2.db, {
        userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
        transport: mockTransportObj2,
      });

      // Wait for 1ms lease to expire
      await new Promise((r) => setTimeout(r, 10));

      // Re-claim and run durable worker tick on new runtime instance2
      await moduleInstance2.durableRuntime.tick();

      // Verify native show() was NOT called on fresh transport #2 (durable ack hit!)
      expect(nativeShowCallCount2).toBe(0);
      expect(nativeShowCallCount).toBe(1);

      const outboxes2 = await instance2.db.getAll<{ status: string }>(
        'SELECT status FROM notification_dispatch_outbox WHERE id = ?',
        [claims1[0].outbox.id],
      );
      expect(outboxes2[0].status).toBe('succeeded');

      moduleInstance2.dispose();
      instance2.close();
    } finally {
      if (fs.existsSync(testDbFile)) {
        fs.unlinkSync(testDbFile);
      }
    }
  });

  it('Fault Injection (b): crash after receipt recording but before channel response saving -> recovery projection populates channel response', async () => {
    const testDbFile = path.join(os.tmpdir(), `memoflow-test-durable-b-${randomUUID()}.db`);
    try {
      const instance1 = createFileSqliteDatabase(testDbFile);
      const transport1 = createDefaultElectronDesktopTransport({ db: instance1.db }) as unknown as {
        getAckStore: () => { getAck: (k: string) => Promise<unknown>; saveAck: (k: string, r: unknown) => Promise<void> };
      };
      const deliverSpy1 = vi.fn().mockImplementation(async (_dto: unknown, context: unknown) => {
        const ackId = randomUUID();
        const timestamp = Date.now();
        const idempotencyKey = (context as Record<string, unknown>)?.idempotencyKey as string | undefined;
        const record = { ackId, status: 'delivered' as const, timestamp };
        if (idempotencyKey) {
          await transport1.getAckStore().saveAck(idempotencyKey, record);
        }
        return record;
      });
      const mockTransportObj1 = {
        deliver: deliverSpy1,
        getAckStore: () => transport1.getAckStore(),
        getAck: (k: string) => transport1.getAckStore().getAck(k),
      };

      const moduleInstance1 = createNotificationPowerSyncModule(instance1.db, {
        userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
        transport: mockTransportObj1,
      });

      const useCase1 = new CreateNotificationUseCase(
        moduleInstance1.notificationRepository,
        moduleInstance1.preferenceRepository,
        async () => false,
        TEST_USER_TIME_CONTEXT_PORT,
      );

      const createRes = await useCase1.execute({
        identityId: 'user-crash-b',
        title: 'Crash B Test',
        content: 'Testing crash before channel save',
        type: 'Info',
        category: 'System',
        channels: [NotificationChannelType.Desktop],
      });
      expect(createRes.ok).toBe(true);

      const notificationId = createRes.data.id;
      const adapter1 = new PowerSyncNotificationReliableAdapter(instance1.db);
      const claims = await adapter1.claimOutboxDispatch({ ownerToken: 'worker-b', leaseDurationMs: 10000, limit: 1 });
      expect(claims.length).toBe(1);

      const outbox = claims[0].outbox;
      const idempotencyKey = outbox.idempotencyKey;

      const deliverer1 = new RealDesktopChannelDeliverer(mockTransportObj1);
      const notif1 = await moduleInstance1.notificationRepository.findByIdForIdentity('user-crash-b', notificationId);
      const ch1 = notif1?.notificationChannels?.[0];
      await deliverer1.deliver(notif1!, ch1!, {
        deliveryId: outbox.id,
        idempotencyKey,
        identityId: 'user-crash-b',
      });

      const updatedReceipt = {
        ...claims[0].receipt,
        status: 'succeeded' as const,
        lease: null,
        finishedAt: new Date().toISOString(),
      };
      await adapter1.recordDeliveryReceipt(updatedReceipt, { ownerToken: 'worker-b', fencingToken: claims[0].lease!.fencingToken });

      const outboxRows1 = await instance1.db.getAll<{ status: string }>('SELECT status FROM notification_dispatch_outbox WHERE id = ?', [outbox.id]);
      expect(outboxRows1[0].status).toBe('succeeded');

      // CRASH (b): saveNotificationChannels was skipped/prevented before crash.
      const channelRowsBefore = await instance1.db.getAll<{ status: string; response: string | null }>(
        'SELECT status, response FROM notification_channels WHERE notification_id = ?',
        [notificationId],
      );
      expect(channelRowsBefore[0].status).toBe('Pending');
      expect(channelRowsBefore[0].response).toBeNull();

      moduleInstance1.dispose();
      instance1.close();

      // RESTART: Create fresh DB instance2 to SAME sqlite file + fresh moduleInstance2 & fresh transport2
      const instance2 = createFileSqliteDatabase(testDbFile);
      const transport2 = createDefaultElectronDesktopTransport({ db: instance2.db }) as unknown as {
        getAckStore: () => { getAck: (k: string) => Promise<unknown>; saveAck: (k: string, r: unknown) => Promise<void> };
      };
      const mockTransportObj2 = {
        deliver: vi.fn(),
        getAckStore: () => transport2.getAckStore(),
        getAck: (k: string) => transport2.getAckStore().getAck(k),
      };

      const moduleInstance2 = createNotificationPowerSyncModule(instance2.db, {
        userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
        transport: mockTransportObj2,
      });

      // Process restarts / Recovery projection runs during tick() on fresh moduleInstance2
      await moduleInstance2.durableRuntime.tick();

      // Verify recovery projection populated channel response and status 'Delivered' in DB instance2!
      const channelRowsAfter = await instance2.db.getAll<{ status: string; response: string | null }>(
        'SELECT status, response FROM notification_channels WHERE notification_id = ?',
        [notificationId],
      );
      expect(channelRowsAfter[0].status).toBe('Delivered');
      expect(channelRowsAfter[0].response).not.toBeNull();
      expect(channelRowsAfter[0].response).toContain(idempotencyKey);

      moduleInstance2.dispose();
      instance2.close();
    } finally {
      if (fs.existsSync(testDbFile)) {
        fs.unlinkSync(testDbFile);
      }
    }
  });
  it('persists DND/rate policy configuration through the PowerSync preference repository', async () => {
    const db = createTestSqliteDatabase();
    const repository = new PowerSyncNotificationPreferenceRepository(db);
    const preference = NotificationPreference.create({
      identityId: 'user-policy-pref' as never,
    });
    preference.setGlobalChannel(NotificationChannelType.InApp, true);
    preference.setDoNotDisturb(
      DoNotDisturbConfig.create({
        enabled: true,
        startTime: '22:00',
        endTime: '08:00',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      }),
    );
    preference.setRateLimit(RateLimit.create({ enabled: true, maxPerHour: 2, maxPerDay: 9 }));

    await repository.save(preference);
    const loaded = await repository.findByIdentityId('user-policy-pref');

    expect(loaded?.doNotDisturb?.toDTO()).toEqual(preference.doNotDisturb?.toDTO());
    expect(loaded?.rateLimit?.toDTO()).toEqual(preference.rateLimit?.toDTO());
  });

  it('stores deferred policy outcomes and does not claim deferred outbox work before retryAt', async () => {
    const db = createTestSqliteDatabase();
    const repository = new PowerSyncNotificationRepository(db);
    const notification = Notification.create({
      identityId: 'user-deferred' as never,
      workflowKey: 'system.general',
      topic: 'system.general',
      idempotencyKey: 'deferred-test',
      title: 'Deferred delivery',
      content: 'Quiet hours',
      type: 'Info',
      category: 'System',
    });
    const channel = NotificationChannel.create({
      notificationId: notification.id,
      channelType: NotificationChannelType.InApp,
      recipient: 'user-deferred',
    });
    notification.addChannel(channel);

    const occurrenceKey = `${notification.id}:${NotificationChannelType.InApp}`;
    const idempotencyKey = buildIdempotencyKeyString({
      identityId: 'user-deferred',
      source: 'notification',
      occurrenceKey,
    });
    const retryAt = new Date(Date.now() + 60_000);

    await repository.save(
      notification,
      [
        {
          operationId: randomUUID(),
          identityId: 'user-deferred',
          source: 'notification',
          occurrenceKey,
          channel: NotificationChannelType.InApp,
          payloadJson: JSON.stringify({ notificationId: String(notification.id) }),
          idempotencyKey,
          deferUntil: retryAt,
        },
      ],
      [
        {
          channel: NotificationChannelType.InApp,
          outcome: 'deferred',
          reason: 'dnd_active',
          retryAt,
        },
      ],
    );

    const outbox = await db.get<{ status: string; next_retry_at: string | null }>(
      'SELECT status, next_retry_at FROM notification_dispatch_outbox WHERE idempotency_key = ?',
      [idempotencyKey],
    );
    expect(outbox.status).toBe('retryable');
    expect(outbox.next_retry_at).toBe(retryAt.toISOString());

    const decision = await db.get<{
      channel: string;
      outcome: string;
      reason: string;
      retry_at: string | null;
    }>(
      `SELECT channel, outcome, reason, retry_at
         FROM notification_delivery_decisions
        WHERE notification_id = ? AND channel = ?`,
      [String(notification.id), NotificationChannelType.InApp],
    );
    expect(decision).toEqual({
      channel: NotificationChannelType.InApp,
      outcome: 'deferred',
      reason: 'dnd_active',
      retry_at: retryAt.toISOString(),
    });

    const adapter = new PowerSyncNotificationReliableAdapter(db);
    const claims = await adapter.claimOutboxDispatch({ ownerToken: 'worker-before-dnd-end', limit: 1 });
    expect(claims).toHaveLength(0);
  });

});