/**
 * Capability Registry
 *
 * The single owner of the five desktop platform capability ports. It constructs
 * each capability through its Electron-first factory, records availability, and
 * exposes the typed ports so consumers never touch Electron APIs directly.
 *
 * Degradation gate:
 *   Registering a capability runs its factory; if the factory throws (or returns
 *   a guard-marked "unavailable" sentinel), the registry marks the capability
 *   `unavailable` instead of propagating the failure. Consumers ask for a port
 *   through `get()` and receive `null` when the capability is unavailable, so a
 *   missing/failed capability degrades the product instead of crashing startup.
 *
 * Lifecycle:
 *   - `register(id, factory)` — install one capability; idempotent per id.
 *   - `get(id)` / `getTray()` / ... — read the typed port (null when unavailable).
 *   - `isAvailable(id)` / `getUnavailable()` — query degradation state.
 *   - `shutdown()` — dispose all ready ports in reverse registration order.
 *
 * @module capabilities/capability-registry
 */

import { createLogger } from '@memoflow/utils/logger';
import type {
  AutoLaunchPort,
  CapabilityId,
  ExternalEditorPort,
  NotificationPort,
  ShortcutPort,
  TrayPort,
} from './ports';

const logger = createLogger('CapabilityRegistry');

/**
 * Sentinel returned by a factory when a capability is structurally unavailable
 * on this host (e.g. unsupported platform, missing optional dependency). The
 * registry treats it as an availability boundary without logging an error.
 */
export const UNAVAILABLE = Symbol('capability.unavailable');

/** A factory may resolve to a port or to the unavailable sentinel. */
export type CapabilityFactoryResult<P> = P | typeof UNAVAILABLE;

/** Factory that constructs an Electron-first capability port. */
export type CapabilityFactory<P> = () =>
  | CapabilityFactoryResult<P>
  | Promise<CapabilityFactoryResult<P>>;

type CapabilityRecord = {
  id: CapabilityId;
  status: 'ready' | 'unavailable';
  port: unknown;
  /** Best-effort dispose hook; absent when the port has no resources to free. */
  dispose?: () => Promise<void> | void;
};

/** Maps capability id to its typed port for the typed accessors. */
interface CapabilityPortMap {
  tray: TrayPort;
  shortcut: ShortcutPort;
  autolaunch: AutoLaunchPort;
  notification: NotificationPort;
  'external-editor': ExternalEditorPort;
}

/**
 * Registry that owns desktop capability ports and gates degradation.
 *
 * Construct once per desktop main-process lifecycle (in the composition root)
 * and pass the ports it returns to consumers.
 */
export class CapabilityRegistry {
  private readonly records = new Map<CapabilityId, CapabilityRecord>();
  /** Registration order, so shutdown disposes newest-first. */
  private readonly order: CapabilityId[] = [];

  /**
   * Install a capability by running its Electron-first factory.
   *
   * On success the capability is `ready`; if the factory resolves to
   * {@link UNAVAILABLE} or throws, it is recorded as `unavailable` and the
   * failure is degraded (logged, not thrown). Idempotent per id: re-registering
   * an id replaces the previous record.
   *
   * @param id Capability identifier.
   * @param factory Electron-first factory producing the port.
   * @param dispose Optional dispose hook invoked by {@link shutdown}.
   */
  async register<P>(
    id: CapabilityId,
    factory: CapabilityFactory<P>,
    dispose?: (port: P) => Promise<void> | void,
  ): Promise<boolean> {
    let status: CapabilityRecord['status'] = 'ready';
    let port: unknown = null;

    try {
      const result = await factory();
      if (result === UNAVAILABLE) {
        status = 'unavailable';
        logger.info(`Capability '${id}' is unavailable on this host`);
      } else {
        port = result;
      }
    } catch (error) {
      status = 'unavailable';
      logger.error(`Failed to construct capability '${id}'; degrading`, { error });
    }

    this.records.set(id, {
      id,
      status,
      port,
      dispose: dispose && port ? () => dispose(port as P) : undefined,
    });
    if (!this.order.includes(id)) {
      this.order.push(id);
    }
    return status === 'ready';
  }

  /** Whether a capability constructed successfully. */
  isAvailable(id: CapabilityId): boolean {
    return this.records.get(id)?.status === 'ready';
  }

  /** Typed port accessor (null when the capability is unavailable/unregistered). */
  get<K extends CapabilityId>(id: K): CapabilityPortMap[K] | null {
    const record = this.records.get(id);
    if (!record || record.status !== 'ready') return null;
    return record.port as CapabilityPortMap[K];
  }

  /** Convenience accessor — tray port. */
  getTray(): TrayPort | null {
    return this.get('tray');
  }

  /** Convenience accessor — shortcut port. */
  getShortcut(): ShortcutPort | null {
    return this.get('shortcut');
  }

  /** Convenience accessor — auto-launch port. */
  getAutoLaunch(): AutoLaunchPort | null {
    return this.get('autolaunch');
  }

  /** Convenience accessor — notification port. */
  getNotification(): NotificationPort | null {
    return this.get('notification');
  }

  /** Convenience accessor — external editor port. */
  getExternalEditor(): ExternalEditorPort | null {
    return this.get('external-editor');
  }

  /** Capabilities that failed or are unsupported on this host. */
  getUnavailable(): CapabilityId[] {
    return this.order.filter((id) => !this.isAvailable(id));
  }

  /**
   * Dispose every ready port (newest registration first). Errors are logged and
   * never abort the remaining shutdown.
   */
  async shutdown(): Promise<void> {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const id = this.order[i];
      const record = this.records.get(id);
      if (!record?.dispose) continue;
      try {
        await record.dispose();
      } catch (error) {
        logger.error(`Disposing capability '${id}' failed`, { error });
      }
    }
  }
}
