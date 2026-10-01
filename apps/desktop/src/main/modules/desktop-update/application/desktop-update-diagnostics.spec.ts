import { describe, expect, it, vi } from 'vitest';
import type { DesktopUpdateSnapshotDTO } from '@memoflow/contracts/electron';
import { capabilitiesForInstallationOwner } from '../domain/installation-ownership';
import type {
  DesktopUpdateInstallReceipt,
  DesktopUpdateInstallReceiptStore,
} from './desktop-update-install-receipt';
import { DesktopUpdateDiagnosticsService } from './desktop-update-diagnostics';

const release = {
  version: '1.3.0',
  channel: 'stable' as const,
  publishedAt: null,
  releaseNotes: 'private release notes',
  releaseNotesUrl: 'https://secret.test/token',
};
const receipt: DesktopUpdateInstallReceipt = {
  previousVersion: '1.1.0',
  expectedVersion: '1.2.0',
  requestedAt: '2026-10-01T12:00:00.000Z',
  stage: 'installer-handoff',
};

function harness(
  state: DesktopUpdateSnapshotDTO['state'] = {
    type: 'idle',
    currentVersion: '1.2.0',
    lastCheckedAt: null,
    lastOutcome: null,
  },
) {
  const store: DesktopUpdateInstallReceiptStore = {
    read: vi.fn(async () => null),
    write: vi.fn(),
    clear: vi.fn(),
  };
  const update = {
    getSnapshot: (): DesktopUpdateSnapshotDTO => ({
      currentVersion: '1.2.0',
      channel: 'stable',
      owner: 'memoflow-direct',
      capabilities: capabilitiesForInstallationOwner('memoflow-direct'),
      state,
    }),
    getDiagnosticsObservation: () =>
      Object.freeze({
        feedClass: 'github' as const,
        lastCheckedAt: '2026-10-01T12:00:00.000Z',
        lastCheckResult: 'update-available' as const,
      }),
  };
  return { store, service: new DesktopUpdateDiagnosticsService(update, store) };
}

describe('DesktopUpdateDiagnosticsService', () => {
  it('projects Windows direct/github diagnostics without receipt or secrets', async () => {
    const { service, store } = harness();
    expect(await service.getDiagnostics()).toEqual({
      currentVersion: '1.2.0',
      targetVersion: null,
      owner: 'memoflow-direct',
      capabilities: capabilitiesForInstallationOwner('memoflow-direct'),
      state: 'idle',
      feedClass: 'github',
      lastCheckedAt: '2026-10-01T12:00:00.000Z',
      lastCheckResult: 'update-available',
      failure: null,
      installReceipt: { status: 'none', requestedAt: null },
    });
    expect(store.read).toHaveBeenCalledWith({ repairCorruption: false });
    expect(store.clear).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
  });

  it('prefers the canonical release over receipt fallback', async () => {
    const { service, store } = harness({ type: 'ready', intent: 'explicit', release });
    vi.mocked(store.read).mockResolvedValue(receipt);
    const diagnostics = await service.getDiagnostics();
    expect(diagnostics.targetVersion).toBe('1.3.0');
    expect(diagnostics.installReceipt).toEqual({
      status: receipt.stage,
      requestedAt: receipt.requestedAt,
    });
    expect(JSON.stringify(diagnostics)).not.toMatch(/secret|https:|releaseNotes/);
  });

  it('falls back to the valid receipt target when the state has no release', async () => {
    const { service, store } = harness();
    vi.mocked(store.read).mockResolvedValue(receipt);
    expect((await service.getDiagnostics()).targetVersion).toBe('1.2.0');
  });

  it('projects receipt read failures as unavailable without exposing errors', async () => {
    const { service, store } = harness();
    vi.mocked(store.read).mockRejectedValue(new Error('/private/secret?token=hidden'));
    const diagnostics = await service.getDiagnostics();
    expect(diagnostics.installReceipt).toEqual({ status: 'unavailable', requestedAt: null });
    expect(diagnostics.targetVersion).toBeNull();
    expect(JSON.stringify(diagnostics)).not.toMatch(/private|secret|token|hidden/);
  });

  it('projects only bounded failure fields and keeps the state release target', async () => {
    const { service } = harness({
      type: 'failed',
      operation: 'download',
      recoverableTo: 'available',
      release,
      failure: {
        code: 'download-failed',
        retryable: true,
        message: '/private/secret https://secret.test',
      },
    });
    const diagnostics = await service.getDiagnostics();
    expect(diagnostics.failure).toEqual({
      operation: 'download',
      code: 'download-failed',
      retryable: true,
      recoverableTo: 'available',
    });
    expect(diagnostics.targetVersion).toBe('1.3.0');
    expect(JSON.stringify(diagnostics)).not.toMatch(/private|secret|message|https:/);
  });
});
