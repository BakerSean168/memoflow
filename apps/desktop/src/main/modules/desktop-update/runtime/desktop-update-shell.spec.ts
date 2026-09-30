import { describe, expect, it, vi } from 'vitest';
import type {
  DesktopUpdateEngine,
  DesktopUpdateEngineCheckResult,
  DesktopUpdateEngineEvent,
  DesktopUpdateEngineInitOptions,
} from '../application/desktop-update-engine';
import {
  collectDesktopInstallationEvidence,
  composeDesktopUpdateShellRuntime,
} from './desktop-update-shell';

class FakeEngine implements DesktopUpdateEngine {
  readonly initialize = vi.fn(async (_options: DesktopUpdateEngineInitOptions) => undefined);
  readonly check = vi.fn<() => Promise<DesktopUpdateEngineCheckResult>>(async () => ({
    kind: 'up-to-date',
  }));
  readonly download = vi.fn(async () => undefined);
  readonly prepare = vi.fn(async () => undefined);
  readonly quitAndInstall = vi.fn();
  readonly destroy = vi.fn();

  subscribe(_listener: (event: DesktopUpdateEngineEvent) => void): () => void {
    return () => undefined;
  }
}

describe('Desktop Update shell composition', () => {
  it('keeps development builds fail-closed without initializing electron-updater', async () => {
    const engine = new FakeEngine();
    const runtime = composeDesktopUpdateShellRuntime(
      {
        currentVersion: '0.14.1',
        isPackaged: false,
        platform: 'win32',
        env: {},
      },
      { engine, policy: { mode: 'manual' } },
    );

    const snapshot = await runtime.coordinator.initialize();

    expect(runtime.installation).toMatchObject({
      owner: 'unsupported',
      reason: 'development-build',
    });
    expect(snapshot.state).toEqual({
      type: 'disabled',
      reason: 'development-build',
    });
    expect(engine.initialize).not.toHaveBeenCalled();
  });

  it('grants self-update authority to the packaged Windows NSIS lane', async () => {
    const engine = new FakeEngine();
    const runtime = composeDesktopUpdateShellRuntime(
      {
        currentVersion: '0.14.1',
        isPackaged: true,
        platform: 'win32',
        env: {},
      },
      { engine, policy: { mode: 'manual' } },
    );

    await runtime.coordinator.initialize();

    expect(runtime.installation).toMatchObject({
      owner: 'memoflow-direct',
      reason: 'direct-nsis',
      capabilities: {
        canCheck: true,
        canDownload: true,
        canSelfInstall: true,
      },
    });
    expect(engine.initialize).toHaveBeenCalledTimes(1);
    expect(engine.initialize).toHaveBeenCalledWith({
      channel: 'stable',
      feed: {
        provider: 'github',
        owner: 'BakerSean168',
        repo: 'memoflow',
        channel: 'latest',
        tagNamePrefix: 'v',
      },
    });
  });

  it('accepts a CI-only feed override without changing installation ownership', async () => {
    const engine = new FakeEngine();
    const runtime = composeDesktopUpdateShellRuntime(
      {
        currentVersion: '1.2.2',
        isPackaged: true,
        platform: 'win32',
        env: {},
      },
      {
        engine,
        feedOverride: {
          provider: 'generic',
          url: 'http://127.0.0.1:4567',
          channel: 'latest',
        },
        policy: { mode: 'manual' },
      },
    );

    await runtime.coordinator.initialize();

    expect(runtime.installation.owner).toBe('memoflow-direct');
    expect(engine.initialize).toHaveBeenCalledWith({
      channel: 'stable',
      feed: {
        provider: 'generic',
        url: 'http://127.0.0.1:4567',
        channel: 'latest',
      },
    });
  });

  it('recognizes Windows Store and portable ownership before direct NSIS', () => {
    expect(
      collectDesktopInstallationEvidence({
        currentVersion: '0.14.1',
        isPackaged: true,
        platform: 'win32',
        isWindowsStore: true,
        env: {},
      }),
    ).toMatchObject({
      isWindowsStore: true,
      portableExecutable: false,
    });

    const portable = composeDesktopUpdateShellRuntime(
      {
        currentVersion: '0.14.1',
        isPackaged: true,
        platform: 'win32',
        env: {
          PORTABLE_EXECUTABLE_FILE: 'C:\\MemoFlow.exe',
        },
      },
      { engine: new FakeEngine(), policy: { mode: 'manual' } },
    );

    expect(portable.installation.owner).toBe('portable');
  });

  it('recognizes AppImage as self-managed and Snap as package-manager owned', () => {
    const appImage = composeDesktopUpdateShellRuntime(
      {
        currentVersion: '0.14.1',
        isPackaged: true,
        platform: 'linux',
        env: { APPIMAGE: '/home/user/MemoFlow.AppImage' },
      },
      { engine: new FakeEngine(), policy: { mode: 'manual' } },
    );

    const snap = composeDesktopUpdateShellRuntime(
      {
        currentVersion: '0.14.1',
        isPackaged: true,
        platform: 'linux',
        env: { SNAP: '/snap/memoflow/current' },
      },
      { engine: new FakeEngine(), policy: { mode: 'manual' } },
    );

    expect(appImage.installation).toMatchObject({
      owner: 'memoflow-direct',
      reason: 'direct-appimage',
    });
    expect(snap.installation).toMatchObject({
      owner: 'package-manager',
      reason: 'package-manager',
      capabilities: {
        canCheck: true,
        canDownload: false,
        canSelfInstall: false,
      },
    });
  });

  it('fails closed for deb/rpm-shaped Linux installs until durable package provenance exists', () => {
    const runtime = composeDesktopUpdateShellRuntime(
      {
        currentVersion: '0.14.1',
        isPackaged: true,
        platform: 'linux',
        env: {},
      },
      { engine: new FakeEngine(), policy: { mode: 'manual' } },
    );

    expect(runtime.installation).toMatchObject({
      owner: 'unsupported',
      reason: 'unknown-installation',
    });
  });

  it('does not claim direct macOS auto-update readiness without signed/notarized provenance', () => {
    const runtime = composeDesktopUpdateShellRuntime(
      {
        currentVersion: '0.14.1',
        isPackaged: true,
        platform: 'darwin',
        env: {},
      },
      { engine: new FakeEngine(), policy: { mode: 'manual' } },
    );

    expect(runtime.installation).toMatchObject({
      owner: 'unsupported',
      reason: 'untrusted-macos',
    });
  });

  it('honors Mac App Store ownership even before direct-signing provenance exists', () => {
    const runtime = composeDesktopUpdateShellRuntime(
      {
        currentVersion: '0.14.1',
        isPackaged: true,
        platform: 'darwin',
        isMacAppStore: true,
        env: {},
      },
      { engine: new FakeEngine(), policy: { mode: 'manual' } },
    );

    expect(runtime.installation).toMatchObject({
      owner: 'system-store',
      reason: 'system-store',
    });
  });
});
