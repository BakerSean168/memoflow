import { describe, expect, it } from 'vitest';
import {
  DesktopUpdateCapabilitiesSchema,
  DesktopUpdateDiagnosticsSchema,
  DesktopUpdateChannels,
  DesktopUpdateSnapshotSchema,
  DesktopUpdateStateSchema,
} from './index';

const release = {
  version: '1.2.3',
  channel: 'stable' as const,
  publishedAt: '2026-09-30T00:00:00.000Z',
  releaseNotes: 'A release',
  releaseNotesUrl: 'https://example.test/releases/1.2.3',
};

const capabilities = {
  canCheck: true,
  canBackgroundCheck: true,
  canDownload: true,
  canSelfInstall: true,
  canAutoDownload: true,
  installAuthority: 'memoflow' as const,
};

const diagnostics = {
  currentVersion: '1.2.2',
  targetVersion: null,
  owner: 'memoflow-direct',
  capabilities,
  feedClass: 'github',
  lastCheckedAt: null,
  lastCheckResult: null,
  state: 'idle',
  failure: null,
  installReceipt: { status: 'none', requestedAt: null },
};

describe('Desktop Update contract', () => {
  it('accepts bounded diagnostics and rejects secret fields at every object boundary', () => {
    expect(DesktopUpdateDiagnosticsSchema.safeParse(diagnostics).success).toBe(true);
    for (const key of ['feedUrl', 'path', 'error', 'provider', 'releaseNotes', 'message']) {
      expect(
        DesktopUpdateDiagnosticsSchema.safeParse({ ...diagnostics, [key]: 'secret' }).success,
      ).toBe(false);
      expect(
        DesktopUpdateDiagnosticsSchema.safeParse({
          ...diagnostics,
          installReceipt: { ...diagnostics.installReceipt, [key]: 'secret' },
        }).success,
      ).toBe(false);
      expect(
        DesktopUpdateDiagnosticsSchema.safeParse({
          ...diagnostics,
          failure: {
            operation: 'check',
            code: 'feed-unavailable',
            retryable: true,
            recoverableTo: 'idle',
            [key]: 'secret',
          },
        }).success,
      ).toBe(false);
    }
  });
  it('owns the narrow replayable IPC surface introduced by ADR-114', () => {
    expect(DesktopUpdateChannels).toEqual({
      GET_SNAPSHOT: 'desktop-update:get-snapshot',
      GET_DIAGNOSTICS: 'desktop-update:get-diagnostics',
      CHECK: 'desktop-update:check',
      RESTART_AND_INSTALL: 'desktop-update:restart-and-install',
      STATE_CHANGED: 'desktop-update:state-changed',
    });
  });

  it('accepts a ready snapshot without provider-specific fields', () => {
    expect(
      DesktopUpdateSnapshotSchema.parse({
        state: {
          type: 'ready',
          intent: 'background',
          release,
        },
        currentVersion: '1.2.2',
        channel: 'stable',
        owner: 'memoflow-direct',
        capabilities,
      }),
    ).toEqual({
      state: {
        type: 'ready',
        intent: 'background',
        release,
      },
      currentVersion: '1.2.2',
      channel: 'stable',
      owner: 'memoflow-direct',
      capabilities,
    });
  });

  it('makes progress legal only in downloading state', () => {
    expect(
      DesktopUpdateStateSchema.safeParse({
        type: 'downloading',
        intent: 'explicit',
        release,
        progress: {
          percent: 42,
          transferredBytes: 42,
          totalBytes: 100,
          bytesPerSecond: 10,
        },
      }).success,
    ).toBe(true);

    expect(
      DesktopUpdateStateSchema.safeParse({
        type: 'ready',
        intent: 'explicit',
        release,
        progress: {
          percent: 100,
          transferredBytes: 100,
          totalBytes: 100,
          bytesPerSecond: 0,
        },
      }).success,
    ).toBe(false);
  });

  it('keeps installation authority independent from OS/platform vocabulary', () => {
    expect(
      DesktopUpdateCapabilitiesSchema.parse({
        canCheck: true,
        canBackgroundCheck: false,
        canDownload: false,
        canSelfInstall: false,
        canAutoDownload: false,
        installAuthority: 'package-manager',
      }),
    ).toEqual({
      canCheck: true,
      canBackgroundCheck: false,
      canDownload: false,
      canSelfInstall: false,
      canAutoDownload: false,
      installAuthority: 'package-manager',
    });
  });

  it('fails closed on renderer-unsafe extra fields', () => {
    expect(
      DesktopUpdateSnapshotSchema.safeParse({
        state: {
          type: 'idle',
          currentVersion: '1.2.2',
          lastCheckedAt: null,
          lastOutcome: null,
        },
        currentVersion: '1.2.2',
        channel: 'stable',
        owner: 'memoflow-direct',
        capabilities,
        provider: 'github',
      }).success,
    ).toBe(false);
  });

  it('normalizes failures to bounded renderer-safe codes', () => {
    expect(
      DesktopUpdateStateSchema.parse({
        type: 'failed',
        operation: 'download',
        failure: {
          code: 'download-failed',
          message: 'Unable to download the update.',
          retryable: true,
        },
        recoverableTo: 'available',
        release,
      }),
    ).toEqual({
      type: 'failed',
      operation: 'download',
      failure: {
        code: 'download-failed',
        message: 'Unable to download the update.',
        retryable: true,
      },
      recoverableTo: 'available',
      release,
    });
  });
});
