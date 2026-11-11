import type { LocalAgentStatus } from '@memoflow/ai-contracts';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalAgentSqlite } from '../../testing/local-agent-sqlite';
import { LocalAgentRepository } from '../infrastructure/adapters/powersync/local-agent.repository';
import type { NativeAgentEvent } from './codex-driver';
import { LocalAgentRuntime } from './local-agent-runtime';
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
    expect(await runtime.cachedCatalogConnection('owner', connection.id)).toBeNull();
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
    const { store, cwd, connection } = await connectionFixture();
    await mkdir(join(cwd, 'model-catalog'), { recursive: true });
    const path = catalogPath(cwd, 'owner', connection.id);
    await writeFile(path, '{ not json', { mode: 0o600 });
    const runtime = runtimeWith(store, cwd, async () => {
      throw new Error('Unreadable snapshots are refreshed in the background later');
    });

    expect(await runtime.cachedCatalogConnection('owner', connection.id)).toBeNull();
    expect(await readFile(path, 'utf8')).toBe('{ not json');
    await runtime.dispose();
  });
});
