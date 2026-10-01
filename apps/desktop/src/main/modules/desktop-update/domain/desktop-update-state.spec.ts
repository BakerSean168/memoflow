import { describe, expect, it } from 'vitest';
import type {
  DesktopUpdateFailureDTO,
  DesktopUpdateReleaseDTO,
} from '@memoflow/contracts/electron';
import {
  InvalidDesktopUpdateTransitionError,
  completeDesktopUpdateCheckWithRelease,
  completeDesktopUpdateCheckWithoutRelease,
  completeDesktopUpdateDownload,
  createUninitializedDesktopUpdateState,
  failDesktopUpdate,
  initializeDesktopUpdateState,
  markDesktopUpdateReady,
  recoverDesktopUpdateFailure,
  reportDesktopUpdateDownloadProgress,
  requestDesktopUpdateRestart,
  startDesktopUpdateCheck,
  startDesktopUpdateDownload,
  startDesktopUpdatePreparation,
} from './desktop-update-state';

const release: DesktopUpdateReleaseDTO = {
  version: '1.2.3',
  channel: 'stable',
  publishedAt: '2026-09-30T00:00:00.000Z',
  releaseNotes: 'Release',
  releaseNotesUrl: 'https://example.test/releases/1.2.3',
};

const retryableFailure: DesktopUpdateFailureDTO = {
  code: 'download-failed',
  message: 'download failed',
  retryable: true,
};

function checking() {
  const uninitialized = createUninitializedDesktopUpdateState();
  const idle = initializeDesktopUpdateState(uninitialized, '1.2.2');
  return startDesktopUpdateCheck(idle, 'background', '2026-09-30T01:00:00.000Z');
}

describe('Desktop Update state machine', () => {
  it('walks the happy path from uninitialized to restarting', () => {
    const uninitialized = createUninitializedDesktopUpdateState();
    const idle = initializeDesktopUpdateState(uninitialized, '1.2.2');
    const checkingState = startDesktopUpdateCheck(idle, 'background', '2026-09-30T01:00:00.000Z');
    const available = completeDesktopUpdateCheckWithRelease(checkingState, release, true);
    const downloading = startDesktopUpdateDownload(available);
    const progressing = reportDesktopUpdateDownloadProgress(downloading, {
      percent: 50,
      transferredBytes: 50,
      totalBytes: 100,
      bytesPerSecond: 10,
    });
    const downloaded = completeDesktopUpdateDownload(progressing);
    const preparing = startDesktopUpdatePreparation(downloaded);
    const ready = markDesktopUpdateReady(preparing);
    const restarting = requestDesktopUpdateRestart(ready);

    expect([
      uninitialized.type,
      idle.type,
      checkingState.type,
      available.type,
      downloading.type,
      progressing.type,
      downloaded.type,
      preparing.type,
      ready.type,
      restarting.type,
    ]).toEqual([
      'uninitialized',
      'idle',
      'checking',
      'available',
      'downloading',
      'downloading',
      'downloaded',
      'preparing',
      'ready',
      'restarting',
    ]);

    expect(restarting.release.version).toBe('1.2.3');
  });

  it('preserves the explicit/background intent through the download/preparation path', () => {
    const idle = initializeDesktopUpdateState(createUninitializedDesktopUpdateState(), '1.2.2');
    const check = startDesktopUpdateCheck(idle, 'explicit', '2026-09-30T01:00:00.000Z');
    const available = completeDesktopUpdateCheckWithRelease(check, release, true);
    const downloading = startDesktopUpdateDownload(available);
    const downloaded = completeDesktopUpdateDownload(downloading);
    const preparing = startDesktopUpdatePreparation(downloaded);
    const ready = markDesktopUpdateReady(preparing);

    expect(available.intent).toBe('explicit');
    expect(downloading.intent).toBe('explicit');
    expect(downloaded.intent).toBe('explicit');
    expect(preparing.intent).toBe('explicit');
    expect(ready.intent).toBe('explicit');
  });

  it('returns to idle with a concrete up-to-date outcome when no release exists', () => {
    const idle = completeDesktopUpdateCheckWithoutRelease(
      checking(),
      '1.2.2',
      '2026-09-30T01:00:01.000Z',
    );

    expect(idle).toEqual({
      type: 'idle',
      currentVersion: '1.2.2',
      lastCheckedAt: '2026-09-30T01:00:01.000Z',
      lastOutcome: 'up-to-date',
    });
  });

  it('rejects illegal operations instead of silently manufacturing state', () => {
    const idle = initializeDesktopUpdateState(createUninitializedDesktopUpdateState(), '1.2.2');

    expect(() => startDesktopUpdateDownload(idle)).toThrow(InvalidDesktopUpdateTransitionError);
    expect(() => requestDesktopUpdateRestart(idle)).toThrow(
      "Desktop Update cannot request restart from 'idle'",
    );
  });

  it('maps a check failure to idle recovery', () => {
    const failed = failDesktopUpdate(checking(), 'check', {
      code: 'network-unavailable',
      message: 'offline',
      retryable: true,
    });

    expect(failed.recoverableTo).toBe('idle');

    const recovered = recoverDesktopUpdateFailure(failed, {
      currentVersion: '1.2.2',
      recoveredAt: '2026-09-30T01:05:00.000Z',
      intent: 'explicit',
    });

    expect(recovered).toEqual({
      type: 'idle',
      currentVersion: '1.2.2',
      lastCheckedAt: '2026-09-30T01:05:00.000Z',
      lastOutcome: 'failed',
    });
  });

  it('maps a download failure back to an available release without automatic retry', () => {
    const available = completeDesktopUpdateCheckWithRelease(checking(), release, true);
    const downloading = startDesktopUpdateDownload(available);
    const failed = failDesktopUpdate(downloading, 'download', retryableFailure);

    expect(failed).toMatchObject({
      type: 'failed',
      recoverableTo: 'available',
      release,
    });

    const recovered = recoverDesktopUpdateFailure(failed, {
      currentVersion: '1.2.2',
      recoveredAt: '2026-09-30T01:05:00.000Z',
      intent: 'explicit',
    });

    expect(recovered).toEqual({
      type: 'available',
      intent: 'explicit',
      release,
      autoDownloadEligible: false,
    });
  });

  it('maps install/shutdown failure back to ready', () => {
    const ready = markDesktopUpdateReady(
      startDesktopUpdatePreparation(
        completeDesktopUpdateDownload(
          startDesktopUpdateDownload(
            completeDesktopUpdateCheckWithRelease(checking(), release, true),
          ),
        ),
      ),
    );
    const restarting = requestDesktopUpdateRestart(ready);
    const failed = failDesktopUpdate(restarting, 'install', {
      code: 'shutdown-failed',
      message: 'cleanup failed',
      retryable: true,
    });

    expect(failed.recoverableTo).toBe('ready');

    expect(
      recoverDesktopUpdateFailure(failed, {
        currentVersion: '1.2.2',
        recoveredAt: '2026-09-30T01:05:00.000Z',
        intent: 'explicit',
      }),
    ).toEqual({
      type: 'ready',
      intent: 'explicit',
      release,
    });
  });

  it('returns frozen state objects so transitions remain replacement-based', () => {
    const idle = initializeDesktopUpdateState(createUninitializedDesktopUpdateState(), '1.2.2');
    const state = startDesktopUpdateCheck(idle, 'background', '2026-09-30T01:00:00.000Z');

    expect(Object.isFrozen(state)).toBe(true);
  });
});
