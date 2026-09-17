import { describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type {
  IElectronDatabase,
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from '@memoflow/contracts/electron';
import { NotificationChannelType } from '@memoflow/contracts/notification';
import { buildIdempotencyKeyString } from '@memoflow/contracts/reliable-messaging';
import { asHm, createTimeContext, requireTimeZoneId } from '@memoflow/time';
import { PowerSyncNotificationReliableAdapter } from '../power-sync-notification-reliable.adapter';
import { PowerSyncNotificationRepository } from '../notification-powersync.repository';
import { PowerSyncNotificationPreferenceRepository } from '../notification-preference-powersync.repository';
import {
  createDefaultElectronDesktopTransport,
  createNotificationPowerSyncModule,
} from '../../../powersync';
import { CreateNotificationUseCase } from '../../../../application/use-cases/commands/create-notification.use-case';
import { Notification } from '../../../../domain/aggregates/notification';
import { NotificationPreference } from '../../../../domain/aggregates/notification-preference';
import { QuietHours } from '../../../../domain/value-objects/quiet-hours';
import { RealDesktopChannelDeliverer } from '../../deliverers/real-channel-deliverers';

const TEST_TIME_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const TEST_USER_TIME_CONTEXT_PORT = {
  getUserTimeContext: vi.fn().mockResolvedValue(TEST_TIME_CONTEXT),
};

function initializeSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE notifications (
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
      archived_at TEXT,
      UNIQUE(identity_id, idempotency_key)
    );
    CREATE TABLE notification_preferences (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL UNIQUE,
      global_channels TEXT NOT NULL DEFAULT '{}',
      workflow_overrides TEXT NOT NULL DEFAULT '{}',
      quiet_hours TEXT,
      version INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE notification_delivery_decisions (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      notification_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      outcome TEXT NOT NULL,
      reason TEXT NOT NULL,
      preference_source TEXT,
      retry_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(notification_id, channel)
    );
    CREATE TABLE notification_dispatch_outbox (
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
    CREATE TABLE desktop_delivery_acks (
      idempotency_key TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      ack_id TEXT,
      payload_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function wrap(sqlite: Database.Database): IElectronDatabase {
  const db: IElectronDatabase = {
    async execute(sql: string, parameters: unknown[] = []): Promise<IElectronDatabaseQueryResult> {
      const info = sqlite.prepare(sql).run(...parameters);
      return { rowsAffected: info.changes };
    },
    async getAll<T>(sql: string, parameters: unknown[] = []): Promise<T[]> {
      return sqlite.prepare(sql).all(...parameters) as T[];
    },
    async getOptional<T>(sql: string, parameters: unknown[] = []): Promise<T | null> {
      return (sqlite.prepare(sql).get(...parameters) as T | undefined) ?? null;
    },
    async get<T>(sql: string, parameters: unknown[] = []): Promise<T> {
      const row = sqlite.prepare(sql).get(...parameters) as T | undefined;
      if (!row) throw new Error(`Query returned no rows: ${sql}`);
      return row;
    },
    async writeTransaction<T>(callback: (tx: IElectronDatabaseTransaction) => Promise<T>) {
      sqlite.exec('BEGIN');
      try {
        const result = await callback(db as IElectronDatabaseTransaction);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return db;
}

function createTestDb(): { db: IElectronDatabase; sqlite: Database.Database } {
  const sqlite = new Database(':memory:');
  initializeSchema(sqlite);
  return { db: wrap(sqlite), sqlite };
}

function fact(identityId: string, key: string): Notification {
  return Notification.create({
    identityId: identityId as never,
    workflowKey: 'system.general',
    topic: 'system.general',
    idempotencyKey: key,
    title: 'Fact',
    content: 'Content',
    type: 'Info',
    category: 'System',
  });
}

describe('PowerSync Notification delivery execution', () => {
  it('persists, claims and completes an outbox receipt with lease fencing', async () => {
    const { db, sqlite } = createTestDb();
    try {
      const adapter = new PowerSyncNotificationReliableAdapter(db);
      const notificationId = randomUUID();
      const occurrenceKey = `occ:${notificationId}`;
      const idempotencyKey = buildIdempotencyKeyString({
        identityId: 'user-123',
        source: 'notification',
        occurrenceKey,
      });
      const receipt = await adapter.dispatchOutbox(
        {
          operationId: randomUUID(),
          identityId: 'user-123',
          source: 'notification',
          occurrenceKey,
          channel: NotificationChannelType.Desktop,
          payloadJson: JSON.stringify({ notificationId }),
          idempotencyKey,
        },
        { notificationId },
      );
      expect(receipt.status).toBe('pending');

      const [claim] = await adapter.claimOutboxDispatch({
        ownerToken: 'worker-1',
        leaseDurationMs: 10_000,
        limit: 1,
      });
      expect(claim.claimed).toBe(true);
      expect(claim.lease?.fencingToken).toBe(1);

      const completed = await adapter.recordDeliveryReceipt(
        {
          ...claim.receipt,
          status: 'succeeded',
          lease: null,
          finishedAt: new Date().toISOString(),
        },
        { ownerToken: 'worker-1', fencingToken: claim.lease!.fencingToken },
      );
      expect(completed.status).toBe('succeeded');
      expect(await adapter.queryReceipts('user-123')).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });

  it('executes Desktop delivery from decision/outbox truth and records the transport ack', async () => {
    const { db, sqlite } = createTestDb();
    try {
      const transportDeliver = vi.fn().mockResolvedValue({
        ackId: 'ack-test-123',
        status: 'delivered',
        timestamp: Date.now(),
      });
      const moduleInstance = createNotificationPowerSyncModule(db, {
        userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
        transport: { deliver: transportDeliver },
      });
      const useCase = new CreateNotificationUseCase(
        moduleInstance.notificationRepository,
        moduleInstance.preferenceRepository,
        async () => false,
        TEST_USER_TIME_CONTEXT_PORT,
      );

      const result = await useCase.execute({
        identityId: 'user-456',
        workflowKey: 'system.general',
        title: 'Desktop Alert',
        content: 'Important message',
        channels: [NotificationChannelType.Desktop],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.data).not.toHaveProperty('notificationChannels');

      const decision = await db.get<{ outcome: string; channel: string }>(
        'SELECT outcome, channel FROM notification_delivery_decisions WHERE notification_id = ?',
        [result.data.id],
      );
      expect(decision).toEqual({ outcome: 'enqueued', channel: 'Desktop' });

      await moduleInstance.durableRuntime.tick();
      expect(transportDeliver).toHaveBeenCalledTimes(1);
      const outbox = await db.get<{ status: string }>(
        'SELECT status FROM notification_dispatch_outbox WHERE notification_id = ?',
        [result.data.id],
      );
      expect(outbox.status).toBe('succeeded');
      expect(
        await db.getOptional('SELECT name FROM sqlite_master WHERE type = ? AND name = ?', [
          'table',
          'notification_channels',
        ]),
      ).toBeNull();
      moduleInstance.dispose();
    } finally {
      sqlite.close();
    }
  });

  it('validates native Desktop acknowledgement without mutating a channel entity', async () => {
    const transportDeliver = vi.fn().mockResolvedValue({
      ackId: 'ack-999',
      status: 'delivered',
      timestamp: 123456789,
    });
    const deliverer = new RealDesktopChannelDeliverer({ deliver: transportDeliver });
    const notification = fact('user-1', 'desktop-ack');
    const idempotencyKey = buildIdempotencyKeyString({
      source: 'notification',
      occurrenceKey: 'occ-1',
      identityId: 'user-1',
    });

    await expect(
      deliverer.deliver(
        notification,
        { channelType: 'Desktop', recipient: 'user-1' },
        { deliveryId: 'delivery-1', idempotencyKey, identityId: 'user-1' },
      ),
    ).resolves.toBeUndefined();
    expect(transportDeliver).toHaveBeenCalledTimes(1);
    expect(notification.toServerDTO()).not.toHaveProperty('notificationChannels');
  });

  it('keeps renderer delivery idempotent through the durable ack store', async () => {
    const { db, sqlite } = createTestDb();
    try {
      const renderer = vi.fn().mockReturnValue(true);
      const transport = createDefaultElectronDesktopTransport({ db, renderer }) as {
        deliver: (dto: unknown, context: unknown) => Promise<{ ackId: string; status: string }>;
      };
      const context = {
        deliveryId: 'delivery-renderer-1',
        identityId: 'user-renderer-1',
        idempotencyKey: 'notification:user-renderer-1:desktop-1',
      };
      const first = await transport.deliver({ title: 'Hello', content: 'World' }, context);
      const replay = await transport.deliver({ title: 'Hello', content: 'World' }, context);
      expect(first.status).toBe('delivered');
      expect(replay).toMatchObject({ status: 'delivered', ackId: first.ackId });
      expect(renderer).toHaveBeenCalledTimes(1);
    } finally {
      sqlite.close();
    }
  });

  it('fail-closes when the native Electron notification transport is unavailable', async () => {
    const transport = createDefaultElectronDesktopTransport() as {
      deliver: (dto: unknown, context?: unknown) => Promise<{ ackId: string; status: string }>;
    };
    const result = await transport.deliver({ title: 'Unavailable', content: 'Body' });
    expect(result.status).toBe('failed');
    expect(result.ackId).toBeDefined();
  });

  it('preserves Product-Time QuietHours in PowerSync while system guards stay outside preferences', async () => {
    const { db, sqlite } = createTestDb();
    try {
      const repository = new PowerSyncNotificationPreferenceRepository(db);
      const preference = NotificationPreference.create({ identityId: 'user-policy-pref' as never });
      preference.setGlobalChannel(NotificationChannelType.InApp, true);
      preference.setQuietHours(QuietHours.create({
        enabled: true,
        timeZone: requireTimeZoneId('Asia/Tokyo'),
        weeklyWindows: [{
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          start: asHm('22:00'),
          end: asHm('08:00'),
        }],
      }));

      await repository.save(preference);
      const loaded = await repository.findByIdentityId('user-policy-pref');
      expect(loaded?.quietHours?.toDTO()).toEqual(preference.quietHours?.toDTO());
      expect(loaded?.toServerDTO()).not.toHaveProperty('rateLimit');
    } finally {
      sqlite.close();
    }
  });

  it('PowerSync schema exposes decision/outbox truth and no NotificationChannel table', async () => {
    const { PowerSyncAppSchema } = (await import('@memoflow/powersync-schema')) as unknown as {
      PowerSyncAppSchema: Record<string, any>;
    };
    const tables = (PowerSyncAppSchema.props ?? PowerSyncAppSchema.tables ?? PowerSyncAppSchema) as Record<
      string,
      any
    >;
    expect(tables.notification_channels).toBeUndefined();
    expect(tables.notification_delivery_decisions).toBeDefined();
    expect(tables.notification_dispatch_outbox).toBeDefined();
  });

  it('rolls back the Fact when an outbox write fails inside the same transaction', async () => {
    const { db, sqlite } = createTestDb();
    try {
      const repo = new PowerSyncNotificationRepository(db);
      const notification = fact('user-rb', 'rollback-test');
      await expect(
        repo.save(notification, [
          {
            operationId: 'op-rb-1',
            identityId: 'user-rb',
            source: 'notification',
            occurrenceKey: 'notif-rb:InApp',
            channel: NotificationChannelType.InApp,
            payloadJson: 'not-json',
            idempotencyKey: 'invalid-key',
          },
        ]),
      ).rejects.toThrow();
      expect(
        await db.getOptional('SELECT id FROM notifications WHERE id = ?', [String(notification.id)]),
      ).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it('stores a deferred decision and keeps its outbox unclaimable before retryAt', async () => {
    const { db, sqlite } = createTestDb();
    try {
      const repository = new PowerSyncNotificationRepository(db);
      const notification = fact('user-deferred', 'deferred-test');
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

      expect(
        await db.get<{ outcome: string; retry_at: string | null }>(
          'SELECT outcome, retry_at FROM notification_delivery_decisions WHERE notification_id = ?',
          [String(notification.id)],
        ),
      ).toEqual({ outcome: 'deferred', retry_at: retryAt.toISOString() });
      const adapter = new PowerSyncNotificationReliableAdapter(db);
      expect(
        await adapter.claimOutboxDispatch({ ownerToken: 'before-retry', limit: 1 }),
      ).toHaveLength(0);
    } finally {
      sqlite.close();
    }
  });
});
