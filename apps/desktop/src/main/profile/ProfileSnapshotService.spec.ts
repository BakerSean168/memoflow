import {
  createSharedPathResolver,
  createProfilePathResolver,
  resolveDesktopStorageRoots,
} from '../paths';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedPathResolver, ProfilePathResolver } from '../paths';
import { ProfileSnapshotService } from './profile-snapshot-service';
import type { ProfileDescriptor } from './profile-registry';

function createSqliteBuffer(): Buffer {
  return Buffer.concat([Buffer.from('SQLite format 3\u0000', 'utf8'), Buffer.alloc(256)]);
}

function createSharedResolver(rootDir: string): SharedPathResolver {
  return createSharedPathResolver(
    resolveDesktopStorageRoots({
      platform: 'linux',
      channel: 'test',
      home: rootDir,
      env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: rootDir },
    }),
  );
}

function createProfileResolver(rootDir: string, profileId: string): ProfilePathResolver {
  return createProfilePathResolver(
    resolveDesktopStorageRoots({
      platform: 'linux',
      channel: 'test',
      home: rootDir,
      env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: rootDir },
    }),
    profileId,
  );
}

describe('ProfileSnapshotService', () => {
  const originalApiUrl = process.env.MEMOFLOW_API_URL;
  let rootDir: string;
  let sharedResolver: SharedPathResolver;
  let profileResolver: ProfilePathResolver;
  let descriptor: ProfileDescriptor;

  beforeEach(async () => {
    rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'desktop-snapshot-'));
    sharedResolver = createSharedResolver(rootDir);
    profileResolver = createProfileResolver(rootDir, 'p_test');
    descriptor = {
      profileId: 'p_test',
      displayName: 'Test User',
      identifier: 'test@example.com',
      lastActiveAt: Date.now(),
      createdAt: Date.now(),
      hasSnapshot: false,
      lastSnapshotVersion: null,
      lastSnapshotHydratedAt: null,
      status: 'pending',
    };
    process.env.MEMOFLOW_API_URL = 'https://example.com/api/v1';
  });

  afterEach(async () => {
    if (originalApiUrl === undefined) {
      delete process.env.MEMOFLOW_API_URL;
    } else {
      process.env.MEMOFLOW_API_URL = originalApiUrl;
    }
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  });

  it('hydrates a new profile database from a remote snapshot', async () => {
    const sqliteBuffer = createSqliteBuffer();
    const checksum = await import('node:crypto').then(({ createHash }) =>
      createHash('sha256').update(sqliteBuffer).digest('hex'),
    );
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes('/powersync/profile-snapshot')) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              available: true,
              version: '2026-05-18T00:00:00Z',
              downloadUrl: '/snapshots/profile.sqlite',
              checksumSha256: checksum,
              generatedAt: '2026-05-18T00:00:00Z',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(sqliteBuffer, { status: 200 });
    });

    const service = new ProfileSnapshotService(fetchMock);
    const result = await service.hydrateIfNeeded({
      sharedResolver,
      profileResolver,
      descriptor,
      accessToken: 'token-123',
    });

    expect(result.hydrated).toBe(true);
    expect(result.metadata?.version).toBe('2026-05-18T00:00:00Z');
    expect(await fs.promises.readFile(profileResolver.dbPath)).toEqual(sqliteBuffer);

    const meta = JSON.parse(
      await fs.promises.readFile(profileResolver.snapshotMetaPath, 'utf8'),
    ) as {
      version: string;
      sourceUrl: string;
    };
    expect(meta.version).toBe('2026-05-18T00:00:00Z');
    expect(meta.sourceUrl).toBe('https://example.com/snapshots/profile.sqlite');
  });

  it('falls back cleanly when checksum validation fails', async () => {
    const sqliteBuffer = createSqliteBuffer();
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes('/powersync/profile-snapshot')) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              available: true,
              version: 'bad',
              downloadUrl: '/snapshots/profile.sqlite',
              checksumSha256: 'deadbeef',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(sqliteBuffer, { status: 200 });
    });

    const service = new ProfileSnapshotService(fetchMock);
    const result = await service.hydrateIfNeeded({
      sharedResolver,
      profileResolver,
      descriptor,
      accessToken: 'token-123',
    });

    expect(result.hydrated).toBe(false);
    expect(result.skippedReason).toBe('snapshot-checksum-mismatch');
    expect(fs.existsSync(profileResolver.dbPath)).toBe(false);
    expect(fs.existsSync(profileResolver.snapshotMetaPath)).toBe(false);
  });

  it('skips hydration when local database already exists', async () => {
    await fs.promises.mkdir(profileResolver.dbDir, { recursive: true });
    await fs.promises.writeFile(profileResolver.dbPath, 'existing-data', 'utf8');

    const fetchMock = vi.fn<typeof fetch>();
    const service = new ProfileSnapshotService(fetchMock);
    const result = await service.hydrateIfNeeded({
      sharedResolver,
      profileResolver,
      descriptor,
      accessToken: 'token-123',
    });

    expect(result.hydrated).toBe(false);
    expect(result.skippedReason).toBe('local-db-exists');
    expect(result.metadata).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips hydration when access token is missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const service = new ProfileSnapshotService(fetchMock);

    for (const token of [null, undefined, '']) {
      const result = await service.hydrateIfNeeded({
        sharedResolver,
        profileResolver,
        descriptor,
        accessToken: token as string | null,
      });

      expect(result.hydrated).toBe(false);
      expect(result.skippedReason).toBe('missing-access-token');
      expect(result.metadata).toBeNull();
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips hydration when snapshot is unavailable from API', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          ok: true,
          data: { available: false, version: null, downloadUrl: null },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const service = new ProfileSnapshotService(fetchMock);
    const result = await service.hydrateIfNeeded({
      sharedResolver,
      profileResolver,
      descriptor,
      accessToken: 'token-123',
    });

    expect(result.hydrated).toBe(false);
    expect(result.skippedReason).toBe('snapshot-unavailable');
    expect(result.metadata).toBeNull();
  });

  it('falls back gracefully when manifest fetch returns non-200', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response('Internal Server Error', { status: 500 });
    });

    const service = new ProfileSnapshotService(fetchMock);
    const result = await service.hydrateIfNeeded({
      sharedResolver,
      profileResolver,
      descriptor,
      accessToken: 'token-123',
    });

    expect(result.hydrated).toBe(false);
    expect(result.skippedReason).toBe('snapshot-unavailable');
  });

  it('fails closed when manifest omits the data envelope (no raw dual-track body)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          available: true,
          version: 'v1',
          downloadUrl: '/snapshots/profile.sqlite',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const service = new ProfileSnapshotService(fetchMock);
    const result = await service.hydrateIfNeeded({
      sharedResolver,
      profileResolver,
      descriptor,
      accessToken: 'token-123',
    });

    expect(result.hydrated).toBe(false);
    expect(result.skippedReason).toBe('snapshot-unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back gracefully when download fetch throws a network error', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes('/powersync/profile-snapshot')) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              available: true,
              version: 'v1',
              downloadUrl: '/snapshots/profile.sqlite',
              checksumSha256: null,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error('ERR_CONNECTION_REFUSED');
    });

    const service = new ProfileSnapshotService(fetchMock);
    const result = await service.hydrateIfNeeded({
      sharedResolver,
      profileResolver,
      descriptor,
      accessToken: 'token-123',
    });

    expect(result.hydrated).toBe(false);
    expect(result.skippedReason).toBe('ERR_CONNECTION_REFUSED');
    expect(fs.existsSync(profileResolver.dbPath)).toBe(false);
  });

  it('falls back gracefully when download returns non-200 HTTP status', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes('/powersync/profile-snapshot')) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              available: true,
              version: 'v1',
              downloadUrl: '/snapshots/profile.sqlite',
              checksumSha256: null,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not Found', { status: 404 });
    });

    const service = new ProfileSnapshotService(fetchMock);
    const result = await service.hydrateIfNeeded({
      sharedResolver,
      profileResolver,
      descriptor,
      accessToken: 'token-123',
    });

    expect(result.hydrated).toBe(false);
    expect(result.skippedReason).toBe('snapshot-download-failed:404');
    expect(fs.existsSync(profileResolver.dbPath)).toBe(false);
  });

  it('falls back when downloaded buffer has invalid SQLite header', async () => {
    const invalidBuffer = Buffer.alloc(256, 0x42); // Not a valid SQLite file
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes('/powersync/profile-snapshot')) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              available: true,
              version: 'v1',
              downloadUrl: '/snapshots/profile.sqlite',
              checksumSha256: null,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(invalidBuffer, { status: 200 });
    });

    const service = new ProfileSnapshotService(fetchMock);
    const result = await service.hydrateIfNeeded({
      sharedResolver,
      profileResolver,
      descriptor,
      accessToken: 'token-123',
    });

    expect(result.hydrated).toBe(false);
    expect(result.skippedReason).toBe('snapshot-invalid-sqlite-header');
    expect(fs.existsSync(profileResolver.dbPath)).toBe(false);
  });

  it('falls back when downloaded buffer is too small to be a SQLite file', async () => {
    const tinyBuffer = Buffer.alloc(4, 0x00);
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes('/powersync/profile-snapshot')) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              available: true,
              version: 'v1',
              downloadUrl: '/snapshots/profile.sqlite',
              checksumSha256: null,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(tinyBuffer, { status: 200 });
    });

    const service = new ProfileSnapshotService(fetchMock);
    const result = await service.hydrateIfNeeded({
      sharedResolver,
      profileResolver,
      descriptor,
      accessToken: 'token-123',
    });

    expect(result.hydrated).toBe(false);
    expect(result.skippedReason).toBe('snapshot-buffer-too-small');
    expect(fs.existsSync(profileResolver.dbPath)).toBe(false);
  });
});
