/**
 * Electron Bootstrapper
 *
 * Chain-registers `IElectronModule` instances, providing each with a shared
 * context (PowerSync-backed business database). Mirrors the API-side `ApiBootstrapper`.
 *
 * Usage:
 * ```ts
 * const bootstrapper = new ElectronBootstrapper(db);
 * await bootstrapper
 *   .register(GoalElectronModule)
 *   .register(TaskElectronModule)
 *   .init();
 * ```
 *
 * @module bootstrap
 */

import type { PowerSyncDatabase } from '@powersync/node';
import type { IElectronModule, IElectronModuleContext } from '@memoflow/desktop-contracts';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('ElectronBootstrapper');

export class ElectronBootstrapper {
  private readonly modules: IElectronModule[] = [];
  readonly db: IElectronModuleContext['db'];

  constructor(db: PowerSyncDatabase) {
    this.db = db as unknown as IElectronModuleContext['db'];
  }

  /**
   * Queue a module for registration.
   * Supports both object literals and factory functions.
   */
  public register(module: IElectronModule): this {
    this.modules.push(module);
    return this;
  }

  /**
   * Execute all queued module registrations sequentially.
   * Host runtimes assemble feature modules (see apps/desktop/src/main/runtime),
   * then register the already-bound handles here; each module only wires its
   * transport (IPC) and lifecycle (start/dispose) against the shared context.
   */
  public async init(authProvider: IElectronModuleContext['auth']): Promise<void> {
    const context: IElectronModuleContext = {
      db: this.db,
      auth: authProvider,
    };

    logger.info(`Starting module registration (${this.modules.length} modules)...`);

    for (const mod of this.modules) {
      try {
        logger.info(`  Loading [${mod.name}]...`);
        await mod.register(context);
        logger.info(`  [${mod.name}] loaded`);
      } catch (err) {
        logger.error(`  [${mod.name}] failed to load`, err);
        throw err;
      }
    }

    logger.info(`${this.modules.length} module(s) registered`);
  }

  /**
   * Graceful shutdown — destroy modules in reverse registration order.
   */
  public async destroy(): Promise<void> {
    logger.info('Destroying modules...');

    for (let i = this.modules.length - 1; i >= 0; i--) {
      const mod = this.modules[i];
      if (mod.destroy) {
        try {
          await mod.destroy();
          logger.info(`  [${mod.name}] destroyed`);
        } catch (err) {
          logger.error(`  [${mod.name}] destroy failed`, err);
        }
      }
    }

    logger.info('All modules destroyed');
  }

  /** Returns the list of registered module names (for diagnostics). */
  public getModuleNames(): string[] {
    return this.modules.map((m) => m.name);
  }
}
