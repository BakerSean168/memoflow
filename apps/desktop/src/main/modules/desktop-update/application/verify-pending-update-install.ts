import { createLogger } from '@memoflow/utils/logger';
import type {
  DesktopUpdateInstallReceipt,
  DesktopUpdateInstallReceiptStore,
} from '../application/desktop-update-install-receipt';

const logger = createLogger('DesktopUpdateStartupVerification');

export type DesktopUpdateStartupVerification =
  | { readonly kind: 'none' }
  | { readonly kind: 'applied'; readonly receipt: DesktopUpdateInstallReceipt }
  | {
      readonly kind: 'not-applied';
      readonly receipt: DesktopUpdateInstallReceipt;
      readonly currentVersion: string;
    };

/**
 * Verify a pending cross-process install receipt before any Profile is opened.
 * A verification problem is diagnostic only and must never block Desktop
 * startup or local Profile access.
 */
export async function verifyPendingDesktopUpdateInstall(
  currentVersion: string,
  store: DesktopUpdateInstallReceiptStore,
): Promise<DesktopUpdateStartupVerification> {
  let receipt: DesktopUpdateInstallReceipt | null;
  try {
    receipt = await store.read();
  } catch (error) {
    logger.warn('Unable to read pending Desktop update install receipt', {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return { kind: 'none' };
  }

  if (!receipt) return { kind: 'none' };

  if (currentVersion === receipt.expectedVersion) {
    try {
      await store.clear();
    } catch (error) {
      logger.warn('Desktop update applied but receipt cleanup failed', {
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }

    logger.info('Desktop update install verified', {
      previousVersion: receipt.previousVersion,
      expectedVersion: receipt.expectedVersion,
      stage: receipt.stage,
    });
    return { kind: 'applied', receipt };
  }

  logger.warn('Pending Desktop update was not applied', {
    previousVersion: receipt.previousVersion,
    expectedVersion: receipt.expectedVersion,
    currentVersion,
    stage: receipt.stage,
  });
  return {
    kind: 'not-applied',
    receipt,
    currentVersion,
  };
}
