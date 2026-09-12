/**
 * Notification PowerSync module — convenience factory.
 * 通知 PowerSync 模块 — 便捷工厂。
 *
 * Creates a NotificationModuleInstance pre-wired with PowerSync repositories
 * and a durable SQLite outbox worker for Electron desktop database access.
 *
 * 创建预先绑定 PowerSync 仓储和持久 SQLite outbox worker 的 NotificationModuleInstance。
 * 由 Electron 入口点用于桌面数据库访问。
 */

import { randomUUID } from 'crypto';
import {
  createNotificationModule,
  type NotificationModuleInstance,
  type NotificationRuntimeContributionsInput,
} from './notification.module';
import {
  createNotificationDurableRuntime,
  type NotificationDurableRuntimePort,
  type ChannelCapabilitySpec,
  type NotificationReliableOperationPort,
} from './runtime/notification.runtime';
import {
  PowerSyncNotificationRepository,
  PowerSyncNotificationPreferenceRepository,
  PowerSyncNotificationTemplateRepository,
  PowerSyncNotificationReliableAdapter,
  NotificationRequestedPowerSyncWriterAdapter,
} from './adapters/powersync';
import type { NotificationMetricsService } from '../domain/services/notification-metrics-service';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { UserTimeContextPort } from '@memoflow/time';
import type { INotificationRepository, INotificationPreferenceRepository, INotificationTemplateRepository } from '../domain/repositories';
import type { NotificationRequestedWriterPort } from '@memoflow/contracts/notification';

export interface CreateNotificationPowerSyncModuleOptions {
  readonly userTimeContextPort: UserTimeContextPort;
  readonly runtimeContributions?: NotificationRuntimeContributionsInput;
  readonly durableRuntime?: NotificationDurableRuntimePort;
  readonly transport?: unknown;
  readonly channelCapabilities?: ChannelCapabilitySpec[];
  readonly metricsService?: NotificationMetricsService;
}

/**
 * Host-facing notification repository set for the PowerSync lane.
 * 面向宿主暴露的 PowerSync lane 通知仓储集合。
 *
 * Contains the three domain repositories and the reliable-operation adapter
 * (the durable-runtime ingredient). `closureChecker` is intentionally NOT part
 * of the set: it is a host-owned port that desktop composers build from the
 * profile DB via `createPowerSyncClosureChecker` and pass explicitly.
 *
 * 包含三个领域仓储与可靠操作适配器（durable-runtime 原料）。
 * `closureChecker` 刻意不在此列：它是宿主持有的 Port，桌面 composer 通过
 * `createPowerSyncClosureChecker` 基于 profile DB 构建后显式传入。
 */
export interface NotificationPowerSyncRepositorySet {
  readonly notificationRepository: INotificationRepository;
  readonly notificationPreferenceRepository: INotificationPreferenceRepository;
  readonly notificationTemplateRepository: INotificationTemplateRepository;
  readonly reliableAdapter: NotificationReliableOperationPort;
  /**
   * Durable NotificationRequested writer for business handlers (NOTIF-3301).
   * Enqueues `notification.requested` envelopes into the shared outbox_messages
   * table consumed by the desktop durable runtime.
   */
  readonly requestedWriter: NotificationRequestedWriterPort;
}

/**
 * Creates PowerSync-backed notification repositories.
 * 创建基于 PowerSync 的通知仓储。
 *
 * Electron counterpart of createNotificationPrismaRepositories(): selects the
 * PowerSync adapters and returns the repository Port shape.
 *
 * 与 createNotificationPrismaRepositories() 对应的 Electron 版本：选择 PowerSync
 * 适配器并返回仓储 Port 形状。
 *
 * @param db - Electron database adapter owned by the desktop main runtime. 桌面主进程持有的 Electron 数据库适配器。
 * @param metricsService - Optional metrics service; defaults to the global instance. 可选指标服务；默认使用全局实例。
 * @returns Repository set backed by the PowerSync adapters.
 *          返回基于 PowerSync 适配器的仓储集合。
 */
export function createNotificationPowerSyncRepositories(
  db: IElectronDatabase,
  metricsService?: NotificationMetricsService,
): NotificationPowerSyncRepositorySet {
  return {
    notificationRepository: new PowerSyncNotificationRepository(db, metricsService),
    notificationPreferenceRepository: new PowerSyncNotificationPreferenceRepository(db),
    notificationTemplateRepository: new PowerSyncNotificationTemplateRepository(db),
    reliableAdapter: new PowerSyncNotificationReliableAdapter(db, metricsService),
    requestedWriter: new NotificationRequestedPowerSyncWriterAdapter(db),
  };
}

export interface DesktopTransportAckRecord {
  readonly ackId: string;
  readonly status: 'delivering' | 'delivered' | 'failed';
  readonly timestamp: number;
  readonly error?: string;
  readonly payloadJson?: string;
}

export interface DesktopTransportAckStore {
  getAck(idempotencyKey: string): Promise<DesktopTransportAckRecord | null> | DesktopTransportAckRecord | null;
  saveAck(idempotencyKey: string, record: DesktopTransportAckRecord): Promise<void> | void;
}

export class MemoryDesktopTransportAckStore implements DesktopTransportAckStore {
  private readonly acks = new Map<string, DesktopTransportAckRecord>();

  getAck(idempotencyKey: string): DesktopTransportAckRecord | null {
    return this.acks.get(idempotencyKey) ?? null;
  }

  saveAck(idempotencyKey: string, record: DesktopTransportAckRecord): void {
    this.acks.set(idempotencyKey, record);
  }
}

export class PowerSyncDesktopTransportAckStore implements DesktopTransportAckStore {
  private readonly memoryStore = new MemoryDesktopTransportAckStore();
  private tableInitialized = false;

  constructor(private readonly db: IElectronDatabase) {}

  private async ensureTable(): Promise<void> {
    if (this.tableInitialized) return;
    try {
      await this.db.execute(`
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
      this.tableInitialized = true;
    } catch {
      // Ignore if table is created externally
    }
  }

  async getAck(idempotencyKey: string): Promise<DesktopTransportAckRecord | null> {
    const mem = this.memoryStore.getAck(idempotencyKey);
    if (mem) return mem;

    await this.ensureTable();

    try {
      const row = await this.db.getOptional<{
        idempotency_key: string;
        status: string;
        ack_id: string | null;
        payload_json: string | null;
        error: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT idempotency_key, status, ack_id, payload_json, error, created_at, updated_at
         FROM desktop_delivery_acks
         WHERE idempotency_key = ?
         LIMIT 1`,
        [idempotencyKey],
      );

      if (row) {
        const statusStr = row.status;
        const rec: DesktopTransportAckRecord = {
          ackId: row.ack_id ?? '',
          status:
            statusStr === 'delivering'
              ? 'delivering'
              : statusStr === 'delivered'
                ? 'delivered'
                : 'failed',
          timestamp: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
          error: row.error ?? undefined,
          payloadJson: row.payload_json ?? undefined,
        };
        this.memoryStore.saveAck(idempotencyKey, rec);
        return rec;
      }
    } catch {
      // Fall back if query fails
    }

    return null;
  }

  async saveAck(idempotencyKey: string, record: DesktopTransportAckRecord): Promise<void> {
    this.memoryStore.saveAck(idempotencyKey, record);

    await this.ensureTable();

    const nowIso = new Date().toISOString();
    const result = await this.db.execute(
      `INSERT INTO desktop_delivery_acks (idempotency_key, status, ack_id, payload_json, error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(idempotency_key) DO UPDATE SET
         status = excluded.status,
         ack_id = excluded.ack_id,
         payload_json = COALESCE(excluded.payload_json, desktop_delivery_acks.payload_json),
         error = excluded.error,
         updated_at = excluded.updated_at`,
      [
        idempotencyKey,
        record.status,
        record.ackId ?? null,
        record.payloadJson ?? null,
        record.error ?? null,
        nowIso,
        nowIso,
      ],
    );

    if (result.rowsAffected === 0) {
      throw new Error(`Failed to save desktop delivery ack for idempotencyKey '${idempotencyKey}': 0 rows affected`);
    }
  }
}

/**
 * Default desktop transport for Electron main process.
 * Calls Electron's native Notification if available and returns a verifiable delivery ack.
 *
 * Fail-closed: the native side effect (Notification.show()) must actually succeed for
 * the ack to be `delivered`. Any failure — electron module unavailable, Notification
 * unsupported, or show() throwing — returns `status: 'failed'` with the error instead of
 * a fabricated success. Consumers (RealDesktopChannelDeliverer) treat anything other than
 * a valid `delivered` ack as a failed delivery (retry/failed), never as success.
 */
export function createDefaultElectronDesktopTransport(optionsOrDb?: unknown): unknown {
  let ackStore: DesktopTransportAckStore;
  let renderer: ((dto: unknown, context?: unknown) => boolean | Promise<boolean>) | null = null;
  if (optionsOrDb && typeof optionsOrDb === 'object') {
    const opts = optionsOrDb as Record<string, unknown>;
    if (typeof opts.renderer === 'function') {
      renderer = opts.renderer as (dto: unknown, context?: unknown) => boolean | Promise<boolean>;
    }
    if ('getAck' in opts && 'saveAck' in opts) {
      ackStore = opts as unknown as DesktopTransportAckStore;
    } else if ('ackStore' in opts && opts.ackStore) {
      ackStore = opts.ackStore as DesktopTransportAckStore;
    } else if ('execute' in opts && typeof opts.execute === 'function') {
      ackStore = new PowerSyncDesktopTransportAckStore(opts as unknown as IElectronDatabase);
    } else if ('db' in opts && opts.db) {
      ackStore = new PowerSyncDesktopTransportAckStore(opts.db as IElectronDatabase);
    } else {
      ackStore = new MemoryDesktopTransportAckStore();
    }
  } else {
    ackStore = new MemoryDesktopTransportAckStore();
  }

  return {
    getAckStore() {
      return ackStore;
    },
    async getAck(idempotencyKey: string) {
      return ackStore.getAck(idempotencyKey);
    },
    async deliver(dto: unknown, context?: unknown) {
      const deliveryCtx = context as { idempotencyKey?: string; deliveryId?: string; identityId?: string } | undefined;
      const idempotencyKey = deliveryCtx?.idempotencyKey;

      if (idempotencyKey) {
        const existing = await ackStore.getAck(idempotencyKey);
        if (existing?.status === 'delivered') {
          return {
            ackId: existing.ackId,
            status: 'delivered',
            timestamp: existing.timestamp,
          };
        }
      }

      const ackId = randomUUID();
      const timestamp = Date.now();

      if (idempotencyKey) {
        await ackStore.saveAck(idempotencyKey, {
          ackId,
          status: 'delivering',
          timestamp,
        });
      }

      try {
        if (renderer) {
          const rendered = await renderer(dto, context);
          if (!rendered) {
            throw new Error('Desktop notification renderer is unavailable or declined delivery');
          }
          const deliveredAck = {
            ackId,
            status: 'delivered' as const,
            timestamp,
          };
          if (idempotencyKey) {
            await ackStore.saveAck(idempotencyKey, deliveredAck);
          }
          return deliveredAck;
        }

        // Fallback for hosts without an injected renderer: use Electron native Notification.
        const electron = require('electron');
        if (
          electron &&
          electron.Notification &&
          typeof electron.Notification.isSupported === 'function' &&
          electron.Notification.isSupported()
        ) {
          const data = dto as Record<string, unknown>;
          const notif = new electron.Notification({
            title: String(data.title ?? 'Notification'),
            body: String(data.content ?? ''),
          });
          notif.show();
          const deliveredAck = {
            ackId,
            status: 'delivered' as const,
            timestamp,
          };
          if (idempotencyKey) {
            await ackStore.saveAck(idempotencyKey, deliveredAck);
          }
          return deliveredAck;
        }
        const failedAck = {
          ackId,
          status: 'failed' as const,
          timestamp,
          error:
            'Electron native Notification unavailable (electron module missing or Notification.isSupported() is false)',
        };
        if (idempotencyKey) {
          await ackStore.saveAck(idempotencyKey, failedAck);
        }
        return failedAck;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const failedAck = {
          ackId,
          status: 'failed' as const,
          timestamp,
          error: errorMsg,
        };
        if (idempotencyKey) {
          await ackStore.saveAck(idempotencyKey, failedAck);
        }
        return failedAck;
      }
    },
  };
}

/**
 * Creates a notification module instance backed by PowerSync repositories and SQLite durable worker.
 * 创建由 PowerSync 仓储和 SQLite 持久 worker 支持的通知模块实例。
 */

/**
 * Desktop PowerSync closure gate (see reminder createPowerSyncClosureChecker).
 * Fails closed when the local Account row is missing/not Active or a local
 * closure-request marker exists (requested/revoking window).
 */
export function createPowerSyncClosureChecker(db: IElectronDatabase): (identityId: string) => Promise<boolean> {
  return async (identityId: string): Promise<boolean> => {
    try {
      const row = await db.getOptional<{ status: string }>(
        'SELECT status FROM accounts WHERE id = ? LIMIT 1',
        [identityId],
      );
      if (!row || row.status !== 'Active') {
        return true;
      }
      const marker = await db.getOptional<{ identity_id: string }>(
        'SELECT identity_id FROM account_closure_requested WHERE identity_id = ? LIMIT 1',
        [identityId],
      );
      return marker !== null;
    } catch {
      return true; // fail-closed on query failure
    }
  };
}

export function createNotificationPowerSyncModule(
  db: IElectronDatabase,
  options?: NotificationRuntimeContributionsInput | CreateNotificationPowerSyncModuleOptions,
): NotificationModuleInstance {
  let runtimeContributions: NotificationRuntimeContributionsInput | undefined;
  let durableRuntime: NotificationDurableRuntimePort | undefined;
  let transport: unknown | undefined;
  let channelCapabilities: ChannelCapabilitySpec[] | undefined;
  let metricsService: NotificationMetricsService | undefined;
  let userTimeContextPort: UserTimeContextPort | undefined;

  if (options) {
    if (
      'durableRuntime' in options ||
      'runtimeContributions' in options ||
      'transport' in options ||
      'channelCapabilities' in options ||
      'metricsService' in options ||
      'userTimeContextPort' in options
    ) {
      const opts = options as CreateNotificationPowerSyncModuleOptions;
      durableRuntime = opts.durableRuntime;
      runtimeContributions = opts.runtimeContributions;
      transport = opts.transport;
      channelCapabilities = opts.channelCapabilities;
      metricsService = opts.metricsService;
      userTimeContextPort = opts.userTimeContextPort;
    } else if (Array.isArray(options)) {
      runtimeContributions = options as NotificationRuntimeContributionsInput;
    }
  }

  if (!userTimeContextPort) {
    throw new Error('[FAIL-CLOSED] createNotificationPowerSyncModule requires userTimeContextPort');
  }

  const repositories = createNotificationPowerSyncRepositories(db, metricsService);
  const notificationRepository = repositories.notificationRepository;
  const closureChecker = createPowerSyncClosureChecker(db);

  if (!durableRuntime) {
    // Preserve the historical desktop default: InApp + Desktop capabilities
    // and a fail-closed PowerSync closure checker. Hosts may override both by
    // passing explicit `channelCapabilities` / `transport` / `durableRuntime`.
    const powerSyncReliableAdapter = repositories.reliableAdapter;
    const desktopTransport = transport ?? createDefaultElectronDesktopTransport(db);
    durableRuntime = createNotificationDurableRuntime({
      notificationRepository,
      preferenceRepository: repositories.notificationPreferenceRepository,
      closureChecker,
      userTimeContextPort,
      reliableAdapter: powerSyncReliableAdapter,
      channelCapabilities: channelCapabilities ?? [
        { channelType: 'InApp', status: 'available' },
        { channelType: 'Desktop', status: 'available' },
      ],
      transport: desktopTransport,
      metricsService,
    });
  }

  return createNotificationModule({
    notificationRepository,
    preferenceRepository: repositories.notificationPreferenceRepository,
    templateRepository: repositories.notificationTemplateRepository,
    durableRuntime,
    runtimeContributions: runtimeContributions ?? [durableRuntime],
    closureChecker,
    userTimeContextPort,
  });
}

// Re-export adapters for consumers that need direct access.
export {
  PowerSyncNotificationRepository,
  PowerSyncNotificationPreferenceRepository,
  PowerSyncNotificationTemplateRepository,
  PowerSyncNotificationReliableAdapter,
  NotificationRequestedPowerSyncWriterAdapter,
};
