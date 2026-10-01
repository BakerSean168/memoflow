import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DesktopUpdateSnapshotDTO } from '@memoflow/contracts/electron';
import type { DesktopUpdateInstallReceiptStore } from '../application/desktop-update-install-receipt';
import {
  resolveDesktopUpdateE2EConfig,
  runDesktopUpdateE2EHarness,
  type DesktopUpdateE2EInstallPort,
  type DesktopUpdateE2EUpdatePort,
} from './desktop-update-e2e-harness';

const capabilities = {
  canCheck: true,
  canBackgroundCheck: true,
  canDownload: true,
  canSelfInstall: true,
  canAutoDownload: true,
  installAuthority: 'memoflow' as const,
};

function idleSnapshot(version = '1.2.2'): DesktopUpdateSnapshotDTO {
  return {
    state: {
      type: 'idle',
      currentVersion: version,
      lastCheckedAt: null,
      lastOutcome: null,
    },
    currentVersion: version,
    channel: 'stable',
    owner: 'memoflow-direct',
    capabilities,
  };
}

function readySnapshot(version = '1.2.2', target = '1.2.3'): DesktopUpdateSnapshotDTO {
  return {
    state: {
      type: 'ready',
      intent: 'explicit',
      release: {
        version: target,
        channel: 'stable',
        publishedAt: null,
        releaseNotes: null,
        releaseNotesUrl: null,
      },
    },
    currentVersion: version,
    channel: 'stable',
    owner: 'memoflow-direct',
    capabilities,
  };
}

function receiptStore(
  readValue: Awaited<ReturnType<DesktopUpdateInstallReceiptStore['read']>> = null,
) {
  return {
    read: vi.fn(async () => readValue),
    write: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  } satisfies DesktopUpdateInstallReceiptStore;
}

function statusPath(root: string): string {
  return path.join(root, 'status', 'desktop-update.json');
}

async function readStatus(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('resolveDesktopUpdateE2EConfig', () => {
  it('is impossible to enable for a normal production launch', () => {
    expect(
      resolveDesktopUpdateE2EConfig({
        isPackaged: true,
        env: {
          CI: 'false',
          MEMOFLOW_DESKTOP_UPDATE_E2E: '1',
          MEMOFLOW_DESKTOP_UPDATE_E2E_EXPECTED_VERSION: '1.2.3',
          MEMOFLOW_DESKTOP_UPDATE_E2E_STATUS_PATH: '/tmp/status.json',
          MEMOFLOW_DESKTOP_UPDATE_E2E_FEED_URL: 'http://127.0.0.1:4567',
        },
      }),
    ).toBeNull();
  });

  it('builds a generic localhost feed only for packaged CI opt-in', () => {
    const config = resolveDesktopUpdateE2EConfig({
      isPackaged: true,
      env: {
        CI: 'true',
        MEMOFLOW_DESKTOP_UPDATE_E2E: '1',
        MEMOFLOW_DESKTOP_UPDATE_E2E_EXPECTED_VERSION: '1.2.3',
        MEMOFLOW_DESKTOP_UPDATE_E2E_STATUS_PATH: './tmp/update-status.json',
        MEMOFLOW_DESKTOP_UPDATE_E2E_FEED_URL: 'http://127.0.0.1:4567/',
      },
    });

    expect(config).toMatchObject({
      expectedVersion: '1.2.3',
      feed: {
        provider: 'generic',
        url: 'http://127.0.0.1:4567',
        channel: 'latest',
      },
      readyTimeoutMs: 120_000,
    });
    expect(path.isAbsolute(config!.statusPath)).toBe(true);
  });

  it('fails closed when an enabled E2E control plane is incomplete', () => {
    expect(() =>
      resolveDesktopUpdateE2EConfig({
        isPackaged: true,
        env: {
          CI: 'true',
          MEMOFLOW_DESKTOP_UPDATE_E2E: '1',
        },
      }),
    ).toThrow(/requires expected version, status path, and feed URL/u);
  });
});

describe('runDesktopUpdateE2EHarness', () => {
  it('verifies the relaunched candidate only after the startup receipt has cleared', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memoflow-update-e2e-'));
    try {
      const snapshot = idleSnapshot('1.2.3');
      const update: DesktopUpdateE2EUpdatePort = {
        getSnapshot: () => snapshot,
        check: vi.fn(async () => snapshot),
        subscribe: vi.fn(() => () => undefined),
      };
      const install: DesktopUpdateE2EInstallPort = {
        requestRestartAndInstall: vi.fn(async () => snapshot),
      };
      const quitVerifiedCandidate = vi.fn();
      const failProcess = vi.fn();
      const filePath = statusPath(root);

      await runDesktopUpdateE2EHarness({
        config: {
          expectedVersion: '1.2.3',
          statusPath: filePath,
          feed: { provider: 'generic', url: 'http://127.0.0.1:4567', channel: 'latest' },
          readyTimeoutMs: 1_000,
        },
        currentVersion: '1.2.3',
        update,
        install,
        receiptStore: receiptStore(null),
        quitVerifiedCandidate,
        failProcess,
        now: () => new Date('2026-09-30T09:30:00.000Z'),
      });

      expect(await readStatus(filePath)).toMatchObject({
        phase: 'candidate-verified',
        currentVersion: '1.2.3',
        expectedVersion: '1.2.3',
        recordedAt: '2026-09-30T09:30:00.000Z',
      });
      expect(quitVerifiedCandidate).toHaveBeenCalledTimes(1);
      expect(failProcess).not.toHaveBeenCalled();
      expect(install.requestRestartAndInstall).not.toHaveBeenCalled();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('drives the base process from explicit check through the sole install use case', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memoflow-update-e2e-'));
    try {
      let snapshot = idleSnapshot();
      const listeners = new Set<(snapshot: DesktopUpdateSnapshotDTO) => void>();
      const update: DesktopUpdateE2EUpdatePort = {
        getSnapshot: () => snapshot,
        check: vi.fn(async () => {
          snapshot = readySnapshot();
          for (const listener of listeners) listener(snapshot);
          return snapshot;
        }),
        subscribe: vi.fn((listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        }),
      };
      const install: DesktopUpdateE2EInstallPort = {
        requestRestartAndInstall: vi.fn(async () => snapshot),
      };
      const failProcess = vi.fn();
      const filePath = statusPath(root);

      await runDesktopUpdateE2EHarness({
        config: {
          expectedVersion: '1.2.3',
          statusPath: filePath,
          feed: { provider: 'generic', url: 'http://127.0.0.1:4567', channel: 'latest' },
          readyTimeoutMs: 1_000,
        },
        currentVersion: '1.2.2',
        update,
        install,
        receiptStore: receiptStore(null),
        quitVerifiedCandidate: vi.fn(),
        failProcess,
      });

      expect(update.check).toHaveBeenCalledWith('explicit');
      expect(install.requestRestartAndInstall).toHaveBeenCalledTimes(1);
      expect(await readStatus(filePath)).toMatchObject({
        phase: 'install-requested',
        currentVersion: '1.2.2',
        expectedVersion: '1.2.3',
      });
      expect(failProcess).not.toHaveBeenCalled();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('writes a bounded failed result instead of installing an unexpected release', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memoflow-update-e2e-'));
    try {
      let snapshot = idleSnapshot();
      const update: DesktopUpdateE2EUpdatePort = {
        getSnapshot: () => snapshot,
        check: vi.fn(async () => {
          snapshot = readySnapshot('1.2.2', '1.2.4');
          return snapshot;
        }),
        subscribe: vi.fn(() => () => undefined),
      };
      const install: DesktopUpdateE2EInstallPort = {
        requestRestartAndInstall: vi.fn(async () => snapshot),
      };
      const failProcess = vi.fn();
      const filePath = statusPath(root);

      await runDesktopUpdateE2EHarness({
        config: {
          expectedVersion: '1.2.3',
          statusPath: filePath,
          feed: { provider: 'generic', url: 'http://127.0.0.1:4567', channel: 'latest' },
          readyTimeoutMs: 1_000,
        },
        currentVersion: '1.2.2',
        update,
        install,
        receiptStore: receiptStore(null),
        quitVerifiedCandidate: vi.fn(),
        failProcess,
      });

      expect(await readStatus(filePath)).toMatchObject({
        phase: 'failed',
        detail: 'unexpected update version 1.2.4; expected 1.2.3',
      });
      expect(install.requestRestartAndInstall).not.toHaveBeenCalled();
      expect(failProcess).toHaveBeenCalledTimes(1);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('fails candidate verification when cross-process receipt evidence remains', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memoflow-update-e2e-'));
    try {
      const snapshot = idleSnapshot('1.2.3');
      const update: DesktopUpdateE2EUpdatePort = {
        getSnapshot: () => snapshot,
        check: vi.fn(async () => snapshot),
        subscribe: vi.fn(() => () => undefined),
      };
      const failProcess = vi.fn();
      const filePath = statusPath(root);

      await runDesktopUpdateE2EHarness({
        config: {
          expectedVersion: '1.2.3',
          statusPath: filePath,
          feed: { provider: 'generic', url: 'http://127.0.0.1:4567', channel: 'latest' },
          readyTimeoutMs: 1_000,
        },
        currentVersion: '1.2.3',
        update,
        install: { requestRestartAndInstall: vi.fn(async () => snapshot) },
        receiptStore: receiptStore({
          previousVersion: '1.2.2',
          expectedVersion: '1.2.3',
          requestedAt: '2026-09-30T09:00:00.000Z',
          stage: 'installer-handoff',
        }),
        quitVerifiedCandidate: vi.fn(),
        failProcess,
      });

      expect(await readStatus(filePath)).toMatchObject({
        phase: 'failed',
        detail: 'candidate started but install receipt remains at stage installer-handoff',
      });
      expect(failProcess).toHaveBeenCalledTimes(1);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
