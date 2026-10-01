import {
  DesktopUpdateDiagnosticsSchema,
  type DesktopUpdateDiagnosticsDTO,
  type DesktopUpdateSnapshotDTO,
} from '@memoflow/contracts/electron';
import { createLogger } from '@memoflow/utils/logger';
import type { DesktopUpdateDiagnosticsObservation } from './desktop-update-coordinator';
import type { DesktopUpdateInstallReceiptStore } from './desktop-update-install-receipt';

const logger = createLogger('DesktopUpdateDiagnostics');

export interface DesktopUpdateDiagnosticsPort {
  getSnapshot(): DesktopUpdateSnapshotDTO;
  getDiagnosticsObservation(): Readonly<DesktopUpdateDiagnosticsObservation>;
}

/** Read-only process-level projection; canonical state stays in the coordinator. */
export class DesktopUpdateDiagnosticsService {
  constructor(
    private readonly update: DesktopUpdateDiagnosticsPort,
    private readonly receiptStore: DesktopUpdateInstallReceiptStore,
  ) {}

  async getDiagnostics(): Promise<DesktopUpdateDiagnosticsDTO> {
    let receiptTarget: string | null = null;
    let installReceipt: DesktopUpdateDiagnosticsDTO['installReceipt'] = {
      status: 'none',
      requestedAt: null,
    };
    try {
      const receipt = await this.receiptStore.read({ repairCorruption: false });
      if (receipt) {
        receiptTarget = receipt.expectedVersion;
        installReceipt = { status: receipt.stage, requestedAt: receipt.requestedAt };
      }
    } catch (error) {
      logger.warn('Desktop Update diagnostics receipt unavailable', {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      installReceipt = { status: 'unavailable', requestedAt: null };
    }

    const snapshot = this.update.getSnapshot();
    const state = snapshot.state;
    const observation = this.update.getDiagnosticsObservation();
    return DesktopUpdateDiagnosticsSchema.parse({
      currentVersion: snapshot.currentVersion,
      targetVersion: ('release' in state ? state.release?.version : null) ?? receiptTarget,
      owner: snapshot.owner,
      capabilities: snapshot.capabilities,
      feedClass: observation.feedClass,
      lastCheckedAt: observation.lastCheckedAt,
      lastCheckResult: observation.lastCheckResult,
      state: state.type,
      failure:
        state.type === 'failed'
          ? {
              operation: state.operation,
              code: state.failure.code,
              retryable: state.failure.retryable,
              recoverableTo: state.recoverableTo,
            }
          : null,
      installReceipt,
    });
  }
}
