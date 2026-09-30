import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('DesktopShutdownCoordinator');

export type DesktopShutdownReason = 'normal-quit' | 'update-install';
export type DesktopShutdownStatus = 'completed' | 'failed' | 'timed-out';

export interface DesktopShutdownSettlement {
  readonly reason: DesktopShutdownReason;
  readonly status: DesktopShutdownStatus;
  readonly startedAt: string;
  readonly settledAt: string;
}

export interface DesktopShutdownCoordinatorOptions {
  readonly cleanup: (reason: DesktopShutdownReason) => Promise<void>;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
}

type DesktopShutdownPhase = 'idle' | 'cleaning' | 'settled' | 'terminal-exit';

/**
 * Process-level owner for destructive Desktop shutdown cleanup.
 *
 * The first caller owns a shutdown attempt. Concurrent normal-quit and
 * update-install requests share the same settlement so cleanup can never race
 * itself. A terminal process exit is a separate, explicit transition:
 * - normal quit marks it immediately before calling app.quit();
 * - update install marks it immediately before updater handoff.
 */
export class DesktopShutdownCoordinator {
  private readonly cleanup: (reason: DesktopShutdownReason) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly now: () => Date;

  private phase: DesktopShutdownPhase = 'idle';
  private ownerReason: DesktopShutdownReason | null = null;
  private settlement: DesktopShutdownSettlement | null = null;
  private inFlight: Promise<DesktopShutdownSettlement> | null = null;

  constructor(options: DesktopShutdownCoordinatorOptions) {
    this.cleanup = options.cleanup;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.now = options.now ?? (() => new Date());

    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error('Desktop shutdown timeoutMs must be a positive finite number');
    }
  }

  get currentPhase(): DesktopShutdownPhase {
    return this.phase;
  }

  get currentOwnerReason(): DesktopShutdownReason | null {
    return this.ownerReason;
  }

  get shouldAllowProcessExit(): boolean {
    return this.phase === 'terminal-exit';
  }

  request(reason: DesktopShutdownReason): Promise<DesktopShutdownSettlement> {
    if (this.inFlight) return this.inFlight;
    if (this.settlement) return Promise.resolve(this.settlement);

    this.ownerReason = reason;
    this.phase = 'cleaning';
    const startedAt = this.now().toISOString();

    this.inFlight = this.runCleanup(reason, startedAt).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /**
   * Authorize the process's terminal quit after destructive cleanup settled.
   *
   * This is deliberately separate from request(): callers must not let a
   * before-quit event bypass an update-install handoff while cleanup is still
   * running.
   */
  beginTerminalExit(reason: DesktopShutdownReason): void {
    if (!this.settlement || this.phase !== 'settled') {
      throw new Error('Desktop shutdown cannot enter terminal exit before cleanup settles');
    }
    if (this.settlement.reason !== reason || this.ownerReason !== reason) {
      throw new Error(
        `Desktop shutdown terminal exit owner mismatch: ${reason} != ${this.ownerReason ?? 'none'}`,
      );
    }

    this.phase = 'terminal-exit';
  }

  private async runCleanup(
    reason: DesktopShutdownReason,
    startedAt: string,
  ): Promise<DesktopShutdownSettlement> {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const cleanupOutcome = (async (): Promise<'completed' | 'failed'> => {
      try {
        // Start destructive cleanup immediately when request() acquires ownership;
        // do not insert a microtask gap where phase='cleaning' but cleanup has not begun.
        await this.cleanup(reason);
        return 'completed';
      } catch (error) {
        logger.error('Desktop shutdown cleanup failed', undefined, {
          reason,
          errorName: error instanceof Error ? error.name : typeof error,
        });
        return 'failed';
      }
    })();

    const timeoutOutcome = new Promise<'timed-out'>((resolve) => {
      timeoutHandle = setTimeout(() => resolve('timed-out'), this.timeoutMs);
      if (typeof timeoutHandle === 'object' && timeoutHandle !== null && 'unref' in timeoutHandle) {
        (timeoutHandle as { unref(): void }).unref();
      }
    });

    const status = await Promise.race([cleanupOutcome, timeoutOutcome]);

    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (status === 'timed-out') {
      logger.warn('Desktop shutdown cleanup timed out', {
        reason,
        timeoutMs: this.timeoutMs,
      });
    }

    this.settlement = Object.freeze({
      reason,
      status,
      startedAt,
      settledAt: this.now().toISOString(),
    });
    this.phase = 'settled';
    return this.settlement;
  }
}
