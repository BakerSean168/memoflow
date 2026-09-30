import { createLogger } from '@memoflow/utils/logger';
import type {
  DesktopUpdateFailureDTO,
  DesktopUpdateSnapshotDTO,
} from '@memoflow/contracts/electron';
import type { DesktopShutdownCoordinator } from '../../../lifecycle/desktop-shutdown-coordinator';
import type {
  DesktopUpdateInstallReceipt,
  DesktopUpdateInstallReceiptStore,
} from './desktop-update-install-receipt';

const logger = createLogger('UpdateInstallCoordinator');

export interface DesktopUpdateInstallUpdatePort {
  getSnapshot(): DesktopUpdateSnapshotDTO;
  beginRestartAndInstall(): DesktopUpdateSnapshotDTO;
  handoffInstall(): void;
  failInstall(failure: DesktopUpdateFailureDTO): DesktopUpdateSnapshotDTO;
}

export interface UpdateInstallCoordinatorOptions {
  readonly update: DesktopUpdateInstallUpdatePort;
  readonly shutdown: DesktopShutdownCoordinator;
  readonly receiptStore: DesktopUpdateInstallReceiptStore;
  readonly forceExit: () => void;
  readonly now?: () => Date;
  readonly handoffWatchdogMs?: number;
}

function installFailure(
  code: DesktopUpdateFailureDTO['code'],
  message: string,
  retryable: boolean,
): DesktopUpdateFailureDTO {
  return { code, message, retryable };
}

/**
 * The sole Restart-to-Update terminal path.
 *
 * Once destructive shutdown begins, this coordinator owns the process terminal
 * action. Normal quit may observe the same cleanup settlement but cannot steal
 * updater handoff. Duplicate requests share one install flight.
 */
export class UpdateInstallCoordinator {
  private readonly update: DesktopUpdateInstallUpdatePort;
  private readonly shutdown: DesktopShutdownCoordinator;
  private readonly receiptStore: DesktopUpdateInstallReceiptStore;
  private readonly forceExit: () => void;
  private readonly now: () => Date;
  private readonly handoffWatchdogMs: number;

  private installPromise: Promise<DesktopUpdateSnapshotDTO> | null = null;
  private handoffWatchdog: ReturnType<typeof setTimeout> | null = null;
  private destructiveShutdownStarted = false;
  private handoffStarted = false;
  private destroyed = false;

  constructor(options: UpdateInstallCoordinatorOptions) {
    this.update = options.update;
    this.shutdown = options.shutdown;
    this.receiptStore = options.receiptStore;
    this.forceExit = options.forceExit;
    this.now = options.now ?? (() => new Date());
    this.handoffWatchdogMs = options.handoffWatchdogMs ?? 15_000;

    if (!Number.isFinite(this.handoffWatchdogMs) || this.handoffWatchdogMs <= 0) {
      throw new Error('Desktop Update handoffWatchdogMs must be a positive finite number');
    }
  }

  requestRestartAndInstall(): Promise<DesktopUpdateSnapshotDTO> {
    if (this.destroyed) {
      throw new Error('Desktop Update install coordinator has been destroyed');
    }
    if (this.installPromise) return this.installPromise;

    this.installPromise = this.performRestartAndInstall().finally(() => {
      // Before destructive shutdown begins, a bounded failure can be retried
      // from the recovered Ready state. After cleanup begins, the process must
      // terminate rather than open a second install path.
      if (!this.destructiveShutdownStarted && !this.handoffStarted) {
        this.installPromise = null;
      }
    });

    return this.installPromise;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearHandoffWatchdog();
  }

  private async performRestartAndInstall(): Promise<DesktopUpdateSnapshotDTO> {
    const ready = this.update.getSnapshot();
    if (ready.state.type !== 'ready') {
      return ready;
    }

    const receipt: DesktopUpdateInstallReceipt = {
      previousVersion: ready.currentVersion,
      expectedVersion: ready.state.release.version,
      requestedAt: this.now().toISOString(),
      stage: 'restart-requested',
    };

    this.update.beginRestartAndInstall();

    try {
      await this.receiptStore.write(receipt);
      logger.info('Desktop update install receipt persisted', {
        previousVersion: receipt.previousVersion,
        expectedVersion: receipt.expectedVersion,
      });
    } catch (error) {
      logger.error('Failed to persist Desktop update install receipt', undefined, {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      return this.update.failInstall(
        installFailure(
          'install-receipt-failed',
          'Unable to record the pending update before restart.',
          true,
        ),
      );
    }

    this.destructiveShutdownStarted = true;
    logger.info('Desktop update requesting shared shutdown');
    const settlement = await this.shutdown.request('update-install');
    logger.info('Desktop update shared shutdown settled', {
      reason: settlement.reason,
      status: settlement.status,
    });

    if (settlement.reason !== 'update-install') {
      // Normal quit acquired ownership first. It will own terminal exit; never
      // race it with a second installer handoff.
      return this.update.failInstall(
        installFailure(
          'shutdown-failed',
          'Application shutdown is already owned by another quit request.',
          true,
        ),
      );
    }

    if (settlement.status !== 'completed') {
      const failed = this.update.failInstall(
        installFailure(
          'shutdown-failed',
          'Unable to complete application cleanup before installing the update.',
          true,
        ),
      );
      this.terminateAfterDestructiveFailure();
      return failed;
    }

    // The restart-requested receipt is already durable. Later stage writes are
    // diagnostic enrichment and must never insert unbounded I/O between
    // destructive cleanup and installer handoff.
    void this.writePostShutdownStages(receipt);

    // quitAndInstall may synchronously emit before-quit. Authorize the terminal
    // process exit immediately before handoff so the lifecycle bridge cannot
    // re-enter cleanup or block the updater.
    this.shutdown.beginTerminalExit('update-install');
    this.armHandoffWatchdog();
    this.handoffStarted = true;

    try {
      logger.info('Desktop update handing off to installer');
      this.update.handoffInstall();
      logger.info('Desktop update installer handoff dispatched');
      return this.update.getSnapshot();
    } catch (error) {
      this.clearHandoffWatchdog();
      logger.error('Desktop update installer handoff failed', undefined, {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      const failed = this.update.failInstall(
        installFailure(
          'install-handoff-failed',
          'Unable to hand off the update to the installer.',
          true,
        ),
      );
      this.forceExit();
      return failed;
    }
  }

  private async writePostShutdownStages(receipt: DesktopUpdateInstallReceipt): Promise<void> {
    for (const stage of ['shutdown-complete', 'installer-handoff'] as const) {
      try {
        await this.receiptStore.write({ ...receipt, stage });
      } catch (error) {
        // restart-requested was already durably written before cleanup. A later
        // stage update is diagnostic enrichment and must not strand a fully
        // cleaned process before installer handoff.
        logger.warn('Unable to advance Desktop update install receipt stage', {
          stage,
          errorName: error instanceof Error ? error.name : typeof error,
        });
        return;
      }
    }
  }

  private terminateAfterDestructiveFailure(): void {
    if (!this.shutdown.shouldAllowProcessExit) {
      this.shutdown.beginTerminalExit('update-install');
    }
    this.forceExit();
  }

  private armHandoffWatchdog(): void {
    this.clearHandoffWatchdog();
    this.handoffWatchdog = setTimeout(() => {
      logger.error('Desktop update installer handoff watchdog expired', undefined, {
        timeoutMs: this.handoffWatchdogMs,
      });
      this.forceExit();
    }, this.handoffWatchdogMs);
  }

  private clearHandoffWatchdog(): void {
    if (!this.handoffWatchdog) return;
    clearTimeout(this.handoffWatchdog);
    this.handoffWatchdog = null;
  }
}
