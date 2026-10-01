import { describe, expect, it, vi } from 'vitest';
import type {
  DesktopUpdateInstallReceipt,
  DesktopUpdateInstallReceiptStore,
} from './desktop-update-install-receipt';
import { verifyPendingDesktopUpdateInstall } from './verify-pending-update-install';

function storeHarness(receipt: DesktopUpdateInstallReceipt | null) {
  return {
    read: vi.fn(async () => receipt),
    write: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  } satisfies DesktopUpdateInstallReceiptStore;
}

const receipt: DesktopUpdateInstallReceipt = {
  previousVersion: '1.2.2',
  expectedVersion: '1.2.3',
  requestedAt: '2026-09-30T08:30:00.000Z',
  stage: 'installer-handoff',
};

describe('verifyPendingDesktopUpdateInstall', () => {
  it('returns none when there is no pending receipt', async () => {
    const store = storeHarness(null);

    await expect(verifyPendingDesktopUpdateInstall('1.2.3', store)).resolves.toEqual({
      kind: 'none',
    });
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('verifies the expected version and clears a successful receipt', async () => {
    const store = storeHarness(receipt);

    await expect(verifyPendingDesktopUpdateInstall('1.2.3', store)).resolves.toEqual({
      kind: 'applied',
      receipt,
    });
    expect(store.clear).toHaveBeenCalledTimes(1);
  });

  it('reports a version mismatch without deleting recovery evidence', async () => {
    const store = storeHarness(receipt);

    await expect(verifyPendingDesktopUpdateInstall('1.2.2', store)).resolves.toEqual({
      kind: 'not-applied',
      receipt,
      currentVersion: '1.2.2',
    });
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('never blocks startup when the receipt store cannot be read', async () => {
    const store = storeHarness(null);
    store.read.mockRejectedValueOnce(new Error('/private/shared/update unavailable'));

    await expect(verifyPendingDesktopUpdateInstall('1.2.2', store)).resolves.toEqual({
      kind: 'none',
    });
  });

  it('does not convert a newer unexpected current version into a false success', async () => {
    const store = storeHarness(receipt);

    await expect(verifyPendingDesktopUpdateInstall('1.2.4', store)).resolves.toMatchObject({
      kind: 'not-applied',
      currentVersion: '1.2.4',
    });
    expect(store.clear).not.toHaveBeenCalled();
  });
});
