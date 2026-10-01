export type DesktopUpdateInstallReceiptStage =
  'restart-requested' | 'shutdown-complete' | 'installer-handoff';

export interface DesktopUpdateInstallReceipt {
  readonly previousVersion: string;
  readonly expectedVersion: string;
  readonly requestedAt: string;
  readonly stage: DesktopUpdateInstallReceiptStage;
}

export interface DesktopUpdateInstallReceiptStore {
  read(options?: {
    readonly repairCorruption?: boolean;
  }): Promise<DesktopUpdateInstallReceipt | null>;
  write(receipt: DesktopUpdateInstallReceipt): Promise<void>;
  clear(): Promise<void>;
}
