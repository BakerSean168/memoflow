import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NsisUpdater, NoOpLogger } from 'electron-updater';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError, type CancellationToken } from 'builder-util-runtime';
import type { AppUpdater } from 'electron-updater';
import { GitHubProvider } from 'electron-updater/out/providers/GitHubProvider';
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider';
import { SemVer } from 'semver';
import { PublishedGitHubProvider } from './published-github.provider';

const BASE = 'https://github.com/owner/repo/releases/download/';
const API = 'https://api.github.com/repos/owner/repo/releases';
const CURRENT = '0.23.0-nightly.20261116.134';
const COMPLETE = '0.23.0-nightly.20261118.140';
const INCOMPLETE = '0.23.0-nightly.20261120.146';
const SHA512 = Buffer.alloc(64, 7).toString('base64');
const filename = (version: string) => `MemoFlow-Windows-${version}-Setup.exe`;
const asset = (name: string) => ({ name, state: 'uploaded', size: 123 });
const metadata = (version: string, file = filename(version)) => ({
  version,
  files: [{ url: file, sha512: SHA512, size: 123 }],
});
const release = (version: string, overrides = {}) => ({
  tag_name: `v${version}`,
  draft: false,
  prerelease: version.includes('-'),
  published_at: '2026-11-20T00:00:00Z',
  assets: [asset('latest.yml'), asset(filename(version))],
  ...overrides,
});

function harness(
  responses: Record<string, unknown>,
  channel = 'nightly',
  platform: ProviderRuntimeOptions['platform'] = 'win32',
) {
  const request = vi.fn(
    async (
      options: { protocol: string; hostname: string; path: string },
      _cancellationToken?: CancellationToken,
    ) => {
      const url = `${options.protocol}//${options.hostname}${options.path}`;
      if (!(url in responses)) throw new HttpError(404, 'missing fixture');
      const value = responses[url];
      if (value instanceof Error) throw value;
      return typeof value === 'string' ? value : JSON.stringify(value);
    },
  );
  const runtime = {
    platform,
    isUseMultipleRangeRequest: true,
    executor: { request },
  } as unknown as ProviderRuntimeOptions;
  const updater = {
    currentVersion: new SemVer(CURRENT),
    allowPrerelease: true,
  } as AppUpdater;
  const github = {
    provider: 'github' as const,
    owner: 'owner',
    repo: 'repo',
    channel,
    tagNamePrefix: 'v',
  };
  const provider = new PublishedGitHubProvider({ provider: 'custom', github }, updater, runtime);
  return { provider, request, runtime, updater, github };
}

afterEach(() => vi.useRealTimers());

describe('published GitHub update discovery', () => {
  it('reproduces the Atom tag failure and discovers the complete published Nightly instead', async () => {
    const responses = {
      'https://github.com/owner/repo/releases.atom': `<feed><entry><link href="https://github.com/owner/repo/releases/tag/v${INCOMPLETE}"/><title>draft tag</title></entry></feed>`,
      [`${API}?per_page=100&page=1`]: [
        release(INCOMPLETE, { draft: true, published_at: null, assets: [] }),
        release(COMPLETE),
      ],
      [`${BASE}v${COMPLETE}/latest.yml`]: metadata(COMPLETE),
    };
    const h = harness(responses);
    const oldProvider = new GitHubProvider(h.github, h.updater, h.runtime);
    await expect(oldProvider.getLatestVersion()).rejects.toMatchObject({
      code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND',
    });
    h.request.mockClear();
    const info = await h.provider.getLatestVersion();
    expect(info.version).toBe(COMPLETE);
    expect(h.provider.resolveFiles(info)[0]).toMatchObject({
      url: new URL(`${BASE}v${COMPLETE}/${filename(COMPLETE)}`),
      info: { sha512: SHA512 },
    });
    expect(h.provider.isUseMultipleRangeRequest).toBe(false);
    expect(h.request).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(h.request.mock.calls)).not.toContain('.atom');
    expect(JSON.stringify(h.request.mock.calls)).not.toMatch(/Authorization|Bearer/);
  });

  it.each([
    [CURRENT, true],
    [COMPLETE, false],
    [INCOMPLETE, false],
  ] as const)(
    'lets the real SDK compare installed %s without allowing a downgrade',
    async (current, available) => {
      const root = await mkdtemp(path.join(tmpdir(), 'memoflow-update-provider-'));
      try {
        const h = harness({
          [`${API}?per_page=100&page=1`]: [release(COMPLETE)],
          [`${BASE}v${COMPLETE}/latest.yml`]: metadata(COMPLETE),
        });
        const sdk = new NsisUpdater(null, {
          version: current,
          name: 'MemoFlow',
          isPackaged: true,
          userDataPath: root,
          baseCachePath: root,
          appUpdateConfigPath: path.join(root, 'app-update.yml'),
          whenReady: async () => {},
          relaunch() {},
          quit() {},
          onQuit() {},
        });
        Object.assign(sdk, {
          httpExecutor: h.runtime.executor,
          _testOnlyOptions: { platform: 'win32' },
        });
        sdk.logger = new NoOpLogger();
        sdk.autoDownload = false;
        sdk.allowDowngrade = false;
        sdk.setFeedURL({
          provider: 'custom',
          updateProvider: PublishedGitHubProvider,
          github: h.github,
        });
        const result = await sdk.checkForUpdates();
        expect(result?.isUpdateAvailable).toBe(available);
        expect(result?.updateInfo.version).toBe(COMPLETE);
        expect(result?.downloadPromise ?? null).toBeNull();
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it('ignores unpublished, incomplete and other-channel releases and orders eligible versions', async () => {
    const h = harness({
      [`${API}?per_page=100&page=1`]: [
        release(CURRENT),
        release(INCOMPLETE, { assets: [asset('candidate-set-v1.json')] }),
        release('9.0.0'),
        release('9.0.0-beta.1'),
        release('9.0.0-nightly.20261121.999', { published_at: null }),
        release(COMPLETE),
      ],
      [`${BASE}v${COMPLETE}/latest.yml`]: metadata(COMPLETE),
    });
    expect((await h.provider.getLatestVersion()).version).toBe(COMPLETE);
  });

  it('skips metadata whose installer is not yet uploaded, using the previous complete release', async () => {
    const h = harness({
      [`${API}?per_page=100&page=1`]: [
        release(INCOMPLETE, { assets: [asset('latest.yml')] }),
        release(COMPLETE),
      ],
      [`${BASE}v${INCOMPLETE}/latest.yml`]: metadata(INCOMPLETE),
      [`${BASE}v${COMPLETE}/latest.yml`]: metadata(COMPLETE),
    });
    expect((await h.provider.getLatestVersion()).version).toBe(COMPLETE);
  });

  it.each([
    { version: CURRENT },
    { files: [null] },
    { files: 'malformed' },
    { files: [{ url: 'https://evil.example/installer.exe', sha512: SHA512 }] },
    { files: [{ url: '../installer.exe', sha512: SHA512 }] },
    { files: [{ url: filename(COMPLETE), sha512: 'invalid' }] },
    { files: [{ url: filename(COMPLETE), sha512: SHA512, size: 999 }] },
  ])(
    'rejects inconsistent metadata instead of silently reporting no update: %j',
    async (invalid) => {
      const h = harness({
        [`${API}?per_page=100&page=1`]: [release(COMPLETE)],
        [`${BASE}v${COMPLETE}/latest.yml`]: {
          ...metadata(COMPLETE),
          ...invalid,
        },
      });
      await expect(h.provider.getLatestVersion()).rejects.toMatchObject({
        code: 'ERR_UPDATER_INVALID_UPDATE_INFO',
        releaseTag: `v${COMPLETE}`,
      });
    },
  );

  it('bounds inconsistent metadata requests even when a whole page advertises installers', async () => {
    const versions = Array.from(
      { length: 8 },
      (_, index) => `0.23.0-nightly.20261120.${200 + index}`,
    );
    const responses: Record<string, unknown> = {
      [`${API}?per_page=100&page=1`]: versions.map((version) => release(version)),
    };
    for (const version of versions)
      responses[`${BASE}v${version}/latest.yml`] = metadata(version, 'missing.exe');
    const h = harness(responses);
    await expect(h.provider.getLatestVersion()).rejects.toMatchObject({
      code: 'ERR_UPDATER_RELEASE_LOOKUP_LIMIT',
    });
    expect(h.request).toHaveBeenCalledTimes(6);
  });

  it('uses GitHub latest for stable even when recent release pages contain only Nightlies', async () => {
    const h = harness(
      {
        [`${API}/latest`]: release('0.23.0'),
        [`${BASE}v0.23.0/latest.yml`]: metadata('0.23.0'),
      },
      'latest',
    );
    expect((await h.provider.getLatestVersion()).version).toBe('0.23.0');
    expect(h.request).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['linux', 'latest-linux.yml', `MemoFlow-Linux-${COMPLETE}.AppImage`],
    ['darwin', `latest-mac-${process.arch}.yml`, `MemoFlow-macOS-${process.arch}-${COMPLETE}.zip`],
  ] as const)(
    'uses the shared %s release lane without invented channel suffixes',
    async (platform, name, file) => {
      const h = harness(
        {
          [`${API}?per_page=100&page=1`]: [
            release(COMPLETE, { assets: [asset(name), asset(file)] }),
          ],
          [`${BASE}v${COMPLETE}/${name}`]: metadata(COMPLETE, file),
        },
        'nightly',
        platform,
      );
      expect((await h.provider.getLatestVersion()).version).toBe(COMPLETE);
    },
  );

  it('bounds pagination and does not claim up-to-date when the request budget is exhausted', async () => {
    const otherChannel = Array.from({ length: 100 }, () => release('1.0.0-beta.1'));
    const h = harness(
      Object.fromEntries(
        [1, 2, 3].map((page) => [`${API}?per_page=100&page=${page}`, otherChannel]),
      ),
    );
    await expect(h.provider.getLatestVersion()).rejects.toMatchObject({
      code: 'ERR_UPDATER_RELEASE_LOOKUP_LIMIT',
    });
    expect(h.request).toHaveBeenCalledTimes(3);
  });

  it('continues to the next page when the first has no matching complete release', async () => {
    const h = harness({
      [`${API}?per_page=100&page=1`]: Array.from({ length: 100 }, () => release('1.0.0-beta.1')),
      [`${API}?per_page=100&page=2`]: [release(COMPLETE)],
      [`${BASE}v${COMPLETE}/latest.yml`]: metadata(COMPLETE),
    });
    expect((await h.provider.getLatestVersion()).version).toBe(COMPLETE);
  });

  it('briefly caches successful discovery but refreshes after the cache expires', async () => {
    vi.useFakeTimers();
    const h = harness({
      [`${API}?per_page=100&page=1`]: [release(COMPLETE)],
      [`${BASE}v${COMPLETE}/latest.yml`]: metadata(COMPLETE),
    });
    await h.provider.getLatestVersion();
    await h.provider.getLatestVersion();
    expect(h.request).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_001);
    await h.provider.getLatestVersion();
    expect(h.request).toHaveBeenCalledTimes(4);
  });

  it('aborts a stalled Electron request after 15 seconds and cleans up its timer', async () => {
    vi.useFakeTimers();
    const h = harness({});
    const abort = vi.fn();
    h.request.mockImplementationOnce((_options, token) =>
      token!.createPromise<string>((_resolve, _reject, onCancel) => onCancel(abort)),
    );
    const pending = expect(h.provider.getLatestVersion()).rejects.toMatchObject({
      code: 'ERR_UPDATER_REQUEST_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(abort).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not infer structured codes from raw Chromium messages or expose their contents', async () => {
    const h = harness({
      [`${API}?per_page=100&page=1`]: new Error(
        'net::ERR_NETWORK_CHANGED at private-url?token=secret',
      ),
    });
    await expect(h.provider.getLatestVersion()).rejects.toMatchObject({
      code: 'ERR_UPDATER_RELEASE_REQUEST_FAILED',
    });
    await expect(h.provider.getLatestVersion()).rejects.not.toThrow('secret');
  });

  it.each([403, 429])(
    'preserves HTTP %s and avoids retrying during a quota window',
    async (status) => {
      vi.useFakeTimers();
      const h = harness({
        [`${API}?per_page=100&page=1`]: new HttpError(status, 'private response with token=secret'),
      });
      await expect(h.provider.getLatestVersion()).rejects.toMatchObject({
        httpStatus: status,
      });
      await expect(h.provider.getLatestVersion()).rejects.not.toThrow('secret');
      expect(h.request).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(60 * 60_000 + 1);
      await expect(h.provider.getLatestVersion()).rejects.toMatchObject({
        httpStatus: status,
      });
      expect(h.request).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    new HttpError(500),
    new Error('timeout'),
    '{broken json',
    { message: 'not a release list' },
    [],
  ])(
    'does not turn network failures or invalid feeds into a fabricated current version',
    async (response) => {
      const h = harness({ [`${API}?per_page=100&page=1`]: response });
      await expect(h.provider.getLatestVersion()).rejects.toThrow();
    },
  );
});
