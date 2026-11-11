import type { LocalAgentStatus } from '@memoflow/ai-contracts';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalAgentSqlite } from '../../testing/local-agent-sqlite';
import { LocalAgentRepository } from '../infrastructure/adapters/powersync/local-agent.repository';
import type { NativeAgentEvent } from './codex-driver';
import { LocalAgentRuntime, type LocalAgentSnapshotChange } from './local-agent-runtime';
import { nativeIdentity, nativeModelVisibilityContext } from './native-identity';

const databases: ReturnType<typeof createLocalAgentSqlite>[] = [];
const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  databases.splice(0).forEach((db) => db.close());
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function connectionFixture(driver: 'codex' | 'antigravity' = 'codex') {
  const db = createLocalAgentSqlite();
  databases.push(db);
  const store = new LocalAgentRepository(db);
  const home = await mkdtemp(join(tmpdir(), 'mf-snapshot-home-'));
  const cwd = await mkdtemp(join(tmpdir(), 'mf-snapshot-cwd-'));
  directories.push(home, cwd);
  const connection = await store.createConnection('owner', {
    driver,
    name: 'Fixture',
    executablePath: driver === 'antigravity' ? '/fake/agy' : '/fake/codex',
    homePath: home,
    enabled: true,
    writeScopes: [],
  });
  return { store, home, cwd, connection };
}

function runtimeWith(
  store: LocalAgentRepository,
  cwd: string,
  probe: () => Promise<LocalAgentStatus>,
) {
  return new LocalAgentRuntime({
    store,
    cwd,
    createDriver: () => ({
      probe,
      async *run(): AsyncGenerator<NativeAgentEvent> {
        throw new Error('Snapshot tests never run inference');
      },
      respond: () => false,
      cancel() {},
      async close() {},
    }),
  });
}

function catalogPath(cwd: string, identityId: string, connectionId: string) {
  const key = createHash('sha256')
    .update(JSON.stringify([identityId, connectionId]))
    .digest('hex');
  return join(cwd, 'model-catalog', `${key}.json`);
}

async function storedSnapshot(cwd: string, identityId: string, connectionId: string) {
  const text = await readFile(catalogPath(cwd, identityId, connectionId), 'utf8');
  return JSON.parse(text) as Record<string, unknown>;
}

async function writeSnapshot(
  cwd: string,
  connection: Awaited<ReturnType<typeof connectionFixture>>['connection'],
  status: LocalAgentStatus,
  checkedAt: number,
  extra: Record<string, unknown> = {},
) {
  const identity = await nativeIdentity(connection.driver, connection.homePath);
  await mkdir(join(cwd, 'model-catalog'), { recursive: true });
  await writeFile(
    catalogPath(cwd, 'owner', connection.id),
    JSON.stringify({
      schemaVersion: 2,
      revision: connection.revision,
      driver: connection.driver,
      executablePath: connection.executablePath,
      homePath: connection.homePath ?? null,
      identity,
      checkedAt,
      status,
      ...extra,
    }),
    { mode: 0o600 },
  );
}

describe('native discovery snapshot persistence', () => {
  it.each([
    ['unavailable', 'no_models'],
    ['login_required', 'login'],
    ['not_installed', 'not_installed'],
  ] as const)('persists a %s probe result with its stable reason', async (status, reason) => {
    const { store, cwd, connection } = await connectionFixture();
    const runtime = runtimeWith(store, cwd, async () => ({
      status,
      message: `${status} fixture`,
    }));

    await expect(runtime.probeConnection('owner', connection.id)).resolves.toMatchObject({
      status,
    });

    const stored = await storedSnapshot(cwd, 'owner', connection.id);
    expect(stored).toMatchObject({
      schemaVersion: 2,
      driver: 'codex',
      status: { status, message: `${status} fixture` },
      reason,
    });
    expect(await runtime.cachedCatalogConnection('owner', connection.id)).toMatchObject({ status });
    await runtime.dispose();
  });

  it('strips account labels, token text and execution failures from a ready snapshot', async () => {
    const { store, cwd, connection } = await connectionFixture();
    const context = nativeModelVisibilityContext(connection, 'a'.repeat(64));
    const runtime = runtimeWith(store, cwd, async () => ({
      status: 'ready' as const,
      models: [{ id: 'model', name: 'Model' }],
      version: '1.2.3',
      account: { email: 'person@example.com', planType: 'pro' },
      modelVisibilityContext: context,
      lastExecutionFailure: {
        code: 'LOCAL_AGENT_RATE_LIMITED',
        modelId: 'model',
        occurredAt: 1,
      },
    }));

    await runtime.probeConnection('owner', connection.id);
    const text = await readFile(catalogPath(cwd, 'owner', connection.id), 'utf8');
    const stored = JSON.parse(text) as Record<string, unknown>;
    expect(stored).toMatchObject({
      schemaVersion: 2,
      status: {
        status: 'ready',
        models: [{ id: 'model', name: 'Model' }],
        version: '1.2.3',
        modelVisibilityContext: context,
      },
    });
    expect(text).not.toContain('person@example.com');
    expect(text).not.toContain('lastExecutionFailure');
    expect(text).not.toContain('"account"');
    await runtime.dispose();
  });

  it('reads a v1 snapshot as a ready observation and keeps serving it', async () => {
    const { store, cwd, home, connection } = await connectionFixture();
    const identity = await nativeIdentity('codex', home);
    const v1 = {
      revision: connection.revision,
      driver: 'codex',
      executablePath: connection.executablePath,
      homePath: home,
      identity,
      checkedAt: Date.now(),
      status: { status: 'ready', models: [{ id: 'legacy-model', name: 'Legacy' }] },
    };
    await mkdir(join(cwd, 'model-catalog'), { recursive: true });
    await writeFile(catalogPath(cwd, 'owner', connection.id), JSON.stringify(v1), { mode: 0o600 });
    const runtime = runtimeWith(store, cwd, async () => {
      throw new Error('A v1 snapshot must be served without probing');
    });

    expect(await runtime.cachedCatalogConnection('owner', connection.id)).toMatchObject({
      status: 'ready',
      models: [{ id: 'legacy-model' }],
    });
    await runtime.dispose();
  });

  it('never replaces a newer checkedAt with an older observation', async () => {
    const { store, cwd, connection } = await connectionFixture();
    let probed = 0;
    const runtime = runtimeWith(store, cwd, async () => {
      probed++;
      return {
        status: 'ready' as const,
        models: [{ id: probed === 1 ? 'first' : 'second', name: 'Model' }],
      };
    });

    const now = vi.spyOn(Date, 'now').mockReturnValue(5_000);
    await runtime.probeConnection('owner', connection.id);
    now.mockReturnValue(4_000);
    await runtime.probeConnection('owner', connection.id);
    now.mockRestore();

    expect(await storedSnapshot(cwd, 'owner', connection.id)).toMatchObject({
      checkedAt: 5_000,
      status: { models: [{ id: 'first' }] },
    });
    await runtime.dispose();
  });

  it('does not delete an unreadable snapshot file', async () => {
    const { store, cwd, home, connection } = await connectionFixture();
    await mkdir(join(cwd, 'model-catalog'), { recursive: true });
    const path = catalogPath(cwd, 'owner', connection.id);
    await writeFile(path, '{ not json', { mode: 0o600 });
    // A resolvable executable plus credentials keep the cheap layer on the full-probe
    // path, so the unreadable file survives until the background probe completes.
    const executable = join(cwd, 'codex');
    await writeFile(executable, '', { mode: 0o700 });
    await writeFile(join(home, 'auth.json'), '{}');
    await store.updateConnection('owner', connection.id, connection.revision, {
      driver: 'codex',
      name: connection.name,
      executablePath: executable,
      homePath: home,
      enabled: true,
      writeScopes: [],
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runtime = new LocalAgentRuntime({
      store,
      cwd,
      createDriver: () => ({
        async probe(): Promise<LocalAgentStatus> {
          await gate;
          return { status: 'unavailable', message: 'stopped' };
        },
        async *run(): AsyncGenerator<NativeAgentEvent> {
          throw new Error('Snapshot tests never run inference');
        },
        respond: () => false,
        cancel: release,
        async close() {
          release();
        },
      }),
    });

    expect(await runtime.cachedCatalogConnection('owner', connection.id)).toBeNull();
    expect(await readFile(path, 'utf8')).toBe('{ not json');
    await runtime.dispose();
  });

  it('serves a 25h snapshot and joins twenty reads into one full probe flight', async () => {
    const { store, cwd, home, connection } = await connectionFixture();
    const executable = join(cwd, 'codex');
    await writeFile(executable, '', { mode: 0o700 });
    await writeFile(join(home, 'auth.json'), '{}');
    await store.updateConnection('owner', connection.id, connection.revision, {
      driver: 'codex',
      name: connection.name,
      executablePath: executable,
      homePath: home,
      enabled: true,
      writeScopes: [],
    });
    const active = await store.getConnection('owner', connection.id);
    const now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    await writeSnapshot(
      cwd,
      active,
      { status: 'ready', models: [{ id: 'stale-model', name: 'Stale' }] },
      now - 25 * 60 * 60_000,
    );
    let probes = 0;
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const runtime = new LocalAgentRuntime({
      store,
      cwd,
      createDriver: () => ({
        async probe(): Promise<LocalAgentStatus> {
          probes++;
          if (probes === 1) await firstGate;
          return { status: 'ready', models: [{ id: 'fresh-model', name: 'Fresh' }] };
        },
        async *run(): AsyncGenerator<NativeAgentEvent> {
          throw new Error('Snapshot tests never run inference');
        },
        respond: () => false,
        cancel() {},
        async close() {},
      }),
    });

    const firstReads = await Promise.all(
      Array.from({ length: 20 }, () => runtime.cachedCatalogConnection('owner', connection.id)),
    );
    // Time no longer invalidates: every read still sees the last ready directory.
    expect(firstReads.every((status) => status?.status === 'ready')).toBe(true);
    await vi.waitFor(() => expect(probes).toBe(1));
    releaseFirst();
    await vi.waitFor(async () =>
      expect(await storedSnapshot(cwd, 'owner', connection.id)).toMatchObject({ checkedAt: now }),
    );

    await Promise.all(
      Array.from({ length: 20 }, () => runtime.cachedCatalogConnection('owner', connection.id)),
    );
    expect(probes).toBe(1);

    clock.mockReturnValue(now + 25 * 60 * 60_000);
    await Promise.all(
      Array.from({ length: 20 }, () => runtime.cachedCatalogConnection('owner', connection.id)),
    );
    await vi.waitFor(() => expect(probes).toBe(2));
    clock.mockRestore();
    await runtime.dispose();
  });

  it('backs off a failed refresh before scheduling another probe', async () => {
    const { store, cwd, home, connection } = await connectionFixture();
    const executable = join(cwd, 'codex');
    await writeFile(executable, '', { mode: 0o700 });
    await writeFile(join(home, 'auth.json'), '{}');
    await store.updateConnection('owner', connection.id, connection.revision, {
      driver: 'codex',
      name: connection.name,
      executablePath: executable,
      homePath: home,
      enabled: true,
      writeScopes: [],
    });
    const active = await store.getConnection('owner', connection.id);
    const now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    await writeSnapshot(
      cwd,
      active,
      { status: 'ready', models: [{ id: 'stale-model', name: 'Stale' }] },
      now - 25 * 60 * 60_000,
    );
    let probes = 0;
    const runtime = new LocalAgentRuntime({
      store,
      cwd,
      createDriver: () => ({
        async probe(): Promise<LocalAgentStatus> {
          probes++;
          throw new Error('fixture spawn failure');
        },
        async *run(): AsyncGenerator<NativeAgentEvent> {
          throw new Error('Snapshot tests never run inference');
        },
        respond: () => false,
        cancel() {},
        async close() {},
      }),
    });

    await Promise.all(
      Array.from({ length: 20 }, () => runtime.cachedCatalogConnection('owner', connection.id)),
    );
    await vi.waitFor(() => expect(probes).toBe(1));
    await vi.waitFor(async () =>
      expect(await storedSnapshot(cwd, 'owner', connection.id)).toMatchObject({
        status: { status: 'unavailable' },
        reason: 'spawn_failed',
      }),
    );
    await Promise.all(
      Array.from({ length: 20 }, () => runtime.cachedCatalogConnection('owner', connection.id)),
    );
    expect(probes).toBe(1);

    clock.mockReturnValue(now + 30_000);
    await runtime.cachedCatalogConnection('owner', connection.id);
    await vi.waitFor(() => expect(probes).toBe(2));
    clock.mockRestore();
    await runtime.dispose();
  });

  it('emits a catalog change only when the status content changes', async () => {
    const { store, cwd, connection } = await connectionFixture();
    const changes: LocalAgentSnapshotChange[] = [];
    let observed: LocalAgentStatus = {
      status: 'ready',
      models: [{ id: 'model', name: 'Model' }],
    };
    const runtime = new LocalAgentRuntime({
      store,
      cwd,
      onSnapshotChange: (change) => changes.push(change),
      createDriver: () => ({
        async probe(): Promise<LocalAgentStatus> {
          return observed;
        },
        async *run(): AsyncGenerator<NativeAgentEvent> {
          throw new Error('Snapshot tests never run inference');
        },
        respond: () => false,
        cancel() {},
        async close() {},
      }),
    });

    await runtime.probeConnection('owner', connection.id);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ key: connection.id, status: { status: 'ready' } });
    // Same content with a new checkedAt must not wake renderers.
    await runtime.probeConnection('owner', connection.id);
    expect(changes).toHaveLength(1);

    observed = { status: 'login_required', message: 'Sign in' };
    await runtime.probeConnection('owner', connection.id);
    expect(changes).toHaveLength(2);
    expect(changes[1]).toMatchObject({ key: connection.id, status: { status: 'login_required' } });

    await runtime.deleteConnection('owner', connection.id);
    expect(changes.at(-1)).toEqual({ key: connection.id, status: null });
    await runtime.dispose();
  });

  it('serves a non-ready AGY snapshot without applying the ready-only visibility gate', async () => {
    const { store, cwd, connection } = await connectionFixture('antigravity');
    await writeSnapshot(
      cwd,
      connection,
      { status: 'login_required', message: 'Google sign-in' },
      Date.now(),
    );
    const runtime = new LocalAgentRuntime({
      store,
      cwd,
      createDriver: () => {
        throw new Error('A non-ready snapshot must be served without probing');
      },
    });

    expect(await runtime.cachedCatalogConnection('owner', connection.id)).toMatchObject({
      status: 'login_required',
    });
    await runtime.dispose();
  });

  it('rejects a ready AGY snapshot whose visibility context no longer matches', async () => {
    const { store, cwd, connection } = await connectionFixture('antigravity');
    const mismatched = nativeModelVisibilityContext(connection, 'b'.repeat(64));
    await writeSnapshot(
      cwd,
      connection,
      {
        status: 'ready',
        models: [{ id: 'gemini', name: 'Gemini' }],
        modelVisibilityContext: mismatched,
      },
      Date.now(),
      { visibilityContext: mismatched },
    );
    const runtime = new LocalAgentRuntime({
      store,
      cwd,
      createDriver: () => {
        throw new Error('A mismatched snapshot must be discarded');
      },
    });

    expect(await runtime.cachedCatalogConnection('owner', connection.id)).toBeNull();
    await runtime.dispose();
  });
});
