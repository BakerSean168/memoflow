import { describe, expect, it } from 'vitest';
import type {
  DesktopUpdateReleaseDTO,
  DesktopUpdateSnapshotDTO,
  DesktopUpdateStateDTO,
} from '@memoflow/contracts/electron';
import { presentDesktopUpdateShellIndicator } from './desktop-update-shell-indicator.presentation';

const release: DesktopUpdateReleaseDTO = {
  version: '1.3.0',
  channel: 'stable',
  publishedAt: null,
  releaseNotes: null,
  releaseNotesUrl: null,
};

function snapshot(state: DesktopUpdateStateDTO): DesktopUpdateSnapshotDTO {
  return {
    state,
    currentVersion: '1.2.0',
    channel: 'stable',
    owner: 'memoflow-direct',
    capabilities: {
      canCheck: true,
      canBackgroundCheck: true,
      canDownload: true,
      canSelfInstall: true,
      canAutoDownload: true,
      installAuthority: 'memoflow',
    },
  };
}

describe('presentDesktopUpdateShellIndicator', () => {
  it('surfaces a verified Ready release', () => {
    expect(
      presentDesktopUpdateShellIndicator(
        snapshot({ type: 'ready', intent: 'background', release }),
      ),
    ).toEqual({
      kind: 'ready',
      labelKey: 'shell.update.ready',
      version: '1.3.0',
    });
  });

  it('surfaces only retryable install failures that recover to Ready', () => {
    expect(
      presentDesktopUpdateShellIndicator(
        snapshot({
          type: 'failed',
          operation: 'install',
          failure: {
            code: 'install-handoff-failed',
            message: 'Installer handoff failed.',
            retryable: true,
          },
          recoverableTo: 'ready',
          release,
        }),
      ),
    ).toEqual({
      kind: 'attention',
      labelKey: 'shell.update.attention',
      version: '1.3.0',
    });

    expect(
      presentDesktopUpdateShellIndicator(
        snapshot({
          type: 'failed',
          operation: 'check',
          failure: {
            code: 'network-unavailable',
            message: 'Network unavailable.',
            retryable: true,
          },
          recoverableTo: 'idle',
        }),
      ),
    ).toBeNull();
  });

  it('keeps a missing snapshot silent', () => {
    expect(presentDesktopUpdateShellIndicator(null)).toBeNull();
  });

  it.each<DesktopUpdateStateDTO>([
    {
      type: 'failed',
      operation: 'install',
      failure: { code: 'install-handoff-failed', message: 'Failed', retryable: false },
      recoverableTo: 'ready',
      release,
    },
    {
      type: 'failed',
      operation: 'install',
      failure: { code: 'install-handoff-failed', message: 'Failed', retryable: true },
      recoverableTo: 'idle',
      release,
    },
    {
      type: 'failed',
      operation: 'download',
      failure: { code: 'download-failed', message: 'Failed', retryable: true },
      recoverableTo: 'available',
      release,
    },
  ])('keeps non-actionable failure %# silent', (state) => {
    expect(presentDesktopUpdateShellIndicator(snapshot(state))).toBeNull();
  });

  it.each<DesktopUpdateStateDTO>([
    { type: 'uninitialized' },
    { type: 'disabled', reason: 'development-build' },
    { type: 'downloaded', intent: 'background', release },
    { type: 'restarting', release },
    {
      type: 'idle',
      currentVersion: '1.2.0',
      lastCheckedAt: null,
      lastOutcome: null,
    },
    {
      type: 'checking',
      intent: 'background',
      startedAt: '2026-09-30T12:00:00.000Z',
    },
    {
      type: 'available',
      intent: 'background',
      release,
      autoDownloadEligible: true,
    },
    {
      type: 'downloading',
      intent: 'background',
      release,
      progress: {
        percent: 50,
        transferredBytes: 500,
        totalBytes: 1000,
        bytesPerSecond: 100,
      },
    },
    {
      type: 'preparing',
      intent: 'background',
      release,
    },
  ])('keeps background state $type out of the shell', (state) => {
    expect(presentDesktopUpdateShellIndicator(snapshot(state))).toBeNull();
  });
});
