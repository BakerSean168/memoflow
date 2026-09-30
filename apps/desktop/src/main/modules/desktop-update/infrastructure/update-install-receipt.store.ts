import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createLogger } from '@memoflow/utils/logger';
import type {
  DesktopUpdateInstallReceipt,
  DesktopUpdateInstallReceiptStage,
  DesktopUpdateInstallReceiptStore,
} from '../application/desktop-update-install-receipt';

const logger = createLogger('DesktopUpdateInstallReceiptStore');
const RECEIPT_FILE_NAME = 'install-receipt.json';

const STAGES = new Set<DesktopUpdateInstallReceiptStage>([
  'restart-requested',
  'shutdown-complete',
  'installer-handoff',
]);

function isReceipt(value: unknown): value is DesktopUpdateInstallReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Record<string, unknown>;
  return (
    typeof receipt.previousVersion === 'string' &&
    receipt.previousVersion.length > 0 &&
    typeof receipt.expectedVersion === 'string' &&
    receipt.expectedVersion.length > 0 &&
    typeof receipt.requestedAt === 'string' &&
    !Number.isNaN(Date.parse(receipt.requestedAt)) &&
    typeof receipt.stage === 'string' &&
    STAGES.has(receipt.stage as DesktopUpdateInstallReceiptStage) &&
    Object.keys(receipt).every((key) =>
      ['previousVersion', 'expectedVersion', 'requestedAt', 'stage'].includes(key),
    )
  );
}

/**
 * Device-local, Profile-independent receipt store for cross-process update
 * verification. The file intentionally lives under shared/update rather than
 * any Profile database or PowerSync-owned directory.
 */
export class FileDesktopUpdateInstallReceiptStore implements DesktopUpdateInstallReceiptStore {
  readonly directory: string;
  readonly receiptPath: string;

  constructor(rootDir: string) {
    this.directory = path.join(rootDir, 'shared', 'update');
    this.receiptPath = path.join(this.directory, RECEIPT_FILE_NAME);
  }

  async read(): Promise<DesktopUpdateInstallReceipt | null> {
    let raw: string;
    try {
      raw = await fs.readFile(this.receiptPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }

    try {
      const value: unknown = JSON.parse(raw);
      if (!isReceipt(value)) throw new Error('invalid receipt shape');
      return Object.freeze({ ...value });
    } catch (error) {
      logger.warn('Ignoring corrupted Desktop update install receipt', {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      await this.removeCorruptedReceiptBestEffort();
      return null;
    }
  }

  async write(receipt: DesktopUpdateInstallReceipt): Promise<void> {
    if (!isReceipt(receipt)) {
      throw new Error('Invalid Desktop update install receipt');
    }

    await fs.mkdir(this.directory, { recursive: true });

    const temporaryPath = path.join(
      this.directory,
      `.${RECEIPT_FILE_NAME}.${process.pid}.${Date.now()}.tmp`,
    );

    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await fs.rename(temporaryPath, this.receiptPath);
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  async clear(): Promise<void> {
    await fs.rm(this.receiptPath, { force: true });
  }

  private async removeCorruptedReceiptBestEffort(): Promise<void> {
    try {
      await this.clear();
    } catch (error) {
      logger.warn('Unable to remove corrupted Desktop update install receipt', {
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
  }
}
