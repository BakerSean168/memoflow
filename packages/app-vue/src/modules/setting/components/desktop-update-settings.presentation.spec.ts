import { describe, expect, it } from 'vitest';
import type {
  DesktopUpdateReleaseDTO,
  DesktopUpdateSnapshotDTO,
  DesktopUpdateStateDTO,
} from '@memoflow/contracts/electron';
import {
  presentDesktopUpdateSettings,
  type DesktopUpdateSettingsKind,
} from './desktop-update-settings.presentation';

const release: DesktopUpdateReleaseDTO = {
  version: '1.3.0',
  channel: 'stable',
  publishedAt: '2026-09-30T12:00:00.000Z',
  releaseNotes: 'A safer update path.',
  releaseNotesUrl: 'https://example.com/releases/1.3.0',
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

describe('presentDesktopUpdateSettings', () => {
  const fixtures: ReadonlyArray<{
    name: string;
    state: DesktopUpdateStateDTO;
    expected: DesktopUpdateSettingsKind;
  }> = [
    {
      name: 'uninitialized',
      state: { type: 'uninitialized' },
      expected: 'loading',
    },
    {
      name: 'disabled',
      state: { type: 'disabled', reason: 'updates-disabled' },
      expected: 'disabled',
    },
    {
      name: 'idle',
      state: {
        type: 'idle',
        currentVersion: '1.2.0',
        lastCheckedAt: null,
        lastOutcome: null,
      },
      expected: 'idle',
    },
    {
      name: 'checking',
      state: {
        type: 'checking',
        intent: 'explicit',
        startedAt: '2026-09-30T12:00:00.000Z',
      },
      expected: 'checking',
    },
    {
      name: 'available',
      state: {
        type: 'available',
        intent: 'background',
        release,
        autoDownloadEligible: true,
      },
      expected: 'available',
    },
    {
      name: 'downloading',
      state: {
        type: 'downloading',
        intent: 'background',
        release,
        progress: {
          percent: 42.5,
          transferredBytes: 425,
          totalBytes: 1000,
          bytesPerSecond: 100,
        },
      },
      expected: 'downloading',
    },
    {
      name: 'downloaded',
      state: {
        type: 'downloaded',
        intent: 'background',
        release,
      },
      expected: 'preparing',
    },
    {
      name: 'preparing',
      state: {
        type: 'preparing',
        intent: 'background',
        release,
      },
      expected: 'preparing',
    },
    {
      name: 'ready',
      state: {
        type: 'ready',
        intent: 'background',
        release,
      },
      expected: 'ready',
    },
    {
      name: 'restarting',
      state: {
        type: 'restarting',
        release,
      },
      expected: 'restarting',
    },
    {
      name: 'failed',
      state: {
        type: 'failed',
        operation: 'check',
        failure: {
          code: 'network-unavailable',
          message: 'Unable to reach the update service.',
          retryable: true,
        },
        recoverableTo: 'idle',
      },
      expected: 'failed',
    },
  ];

  for (const fixture of fixtures) {
    it(`maps ${fixture.name} to the canonical settings presentation`, () => {
      expect(presentDesktopUpdateSettings(snapshot(fixture.state)).kind).toBe(fixture.expected);
    });
  }

  it('shows explicit up-to-date feedback only after an explicit successful check', () => {
    const current = snapshot({
      type: 'idle',
      currentVersion: '1.2.0',
      lastCheckedAt: '2026-09-30T12:00:00.000Z',
      lastOutcome: 'up-to-date',
    });

    expect(presentDesktopUpdateSettings(current, false).kind).toBe('idle');
    expect(presentDesktopUpdateSettings(current, true).kind).toBe('up-to-date');
  });

  it('uses restart retry only for a retryable Ready recovery surface', () => {
    const failed = snapshot({
      type: 'failed',
      operation: 'install',
      failure: {
        code: 'install-handoff-failed',
        message: 'Unable to hand off the update.',
        retryable: true,
      },
      recoverableTo: 'ready',
      release,
    });

    expect(presentDesktopUpdateSettings(failed).action).toBe('restart');
  });
});
