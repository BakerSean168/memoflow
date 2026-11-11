import type { LocalAgentConnection } from '@memoflow/ai-contracts';
import { win32 } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cheapVerdict,
  nativeExecutableExists,
  resolveEffectiveExecutable,
  type CheapCheckEnvironment,
  type CheapSnapshotFacts,
} from './snapshot-cheap-check';

function connection(overrides: Partial<LocalAgentConnection> = {}): LocalAgentConnection {
  return {
    id: 'connection',
    driver: 'codex',
    name: 'Fixture',
    executablePath: 'codex',
    homePath: '/home/u/.codex',
    enabled: true,
    writeScopes: [],
    revision: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function environment(overrides: CheapCheckEnvironment = {}): CheapCheckEnvironment {
  return {
    platform: 'linux',
    env: { PATH: '/usr/bin' },
    now: 10_000,
    isFile: (path) => path === '/usr/bin/codex',
    stat: () => ({ size: 10, mtimeMs: 20 }),
    readText: async () => null,
    identity: async () => 'identity-a',
    ...overrides,
  };
}

const facts = (overrides: Partial<CheapSnapshotFacts> = {}): CheapSnapshotFacts => ({
  identity: 'identity-a',
  executableSignature: '10:20',
  checkedAt: 10_000,
  ...overrides,
});

describe('effective executable resolution', () => {
  it('resolves a bare command through PATH on POSIX', () => {
    const options = environment({
      env: { PATH: '/first:/second' },
      isFile: (path) => path === '/second/codex',
    });
    expect(resolveEffectiveExecutable(connection(), options)).toBe('/second/codex');
    expect(nativeExecutableExists(connection(), options)).toBe(true);
  });

  it('reuses the Windows shim resolver for .cmd launchers', () => {
    const directory = 'C:\\tools';
    const shim = win32.join(directory, 'codex.cmd');
    const npmEntry = win32.join(directory, 'node_modules/@openai/codex/bin/codex.js');
    const options = environment({
      platform: 'win32',
      env: { PATH: directory },
      isFile: (path) => path === shim || path === npmEntry,
    });
    expect(resolveEffectiveExecutable(connection(), options)).toBe(npmEntry);
  });

  it('reports not installed when no candidate file exists', () => {
    const options = environment({ isFile: () => false });
    expect(nativeExecutableExists(connection(), options)).toBe(false);
    expect(() => resolveEffectiveExecutable(connection(), options)).toThrowError(
      expect.objectContaining({ code: 'LOCAL_AGENT_NOT_INSTALLED' }),
    );
  });
});

describe('cheap availability verdicts', () => {
  it('downgrades a missing executable before touching credentials', async () => {
    const options = environment({ isFile: () => false });
    await expect(cheapVerdict(connection(), facts(), options)).resolves.toMatchObject({
      kind: 'not_installed',
    });
  });

  it('requires login for Codex when auth.json and OPENAI_API_KEY are absent', async () => {
    await expect(cheapVerdict(connection(), facts(), environment())).resolves.toMatchObject({
      kind: 'login_required',
    });
  });

  it('does not claim login is missing when Codex config declares a credential source', async () => {
    const options = environment({
      readText: async (path) =>
        path.endsWith('config.toml') ? '[model_providers.custom]\nbase_url = "x"' : null,
    });
    await expect(cheapVerdict(connection(), facts(), options)).resolves.toMatchObject({
      kind: 'unchanged',
    });
  });

  it('reports unchanged only while identity, signature and the 24h TTL agree', async () => {
    const options = environment({
      readText: async (path) => (path.endsWith('auth.json') ? '{}' : null),
    });
    await expect(cheapVerdict(connection(), facts(), options)).resolves.toEqual({
      kind: 'unchanged',
    });
    await expect(
      cheapVerdict(connection(), facts({ identity: 'identity-b' }), options),
    ).resolves.toEqual({ kind: 'changed', reason: 'identity' });
    await expect(
      cheapVerdict(connection(), facts({ executableSignature: '11:20' }), options),
    ).resolves.toEqual({ kind: 'changed', reason: 'executable' });
    await expect(
      cheapVerdict(connection(), facts({ checkedAt: 10_000 - 25 * 60 * 60_000 }), options),
    ).resolves.toEqual({ kind: 'changed', reason: 'stale' });
  });

  it('checks the strong Claude credential signals without a process', async () => {
    const claude = connection({
      driver: 'claude',
      executablePath: 'claude',
      homePath: '/home/u/.claude',
    });
    const base = { isFile: (path: string) => path === '/usr/bin/claude' };
    await expect(
      cheapVerdict(claude, facts(), environment({ ...base, readText: async () => null })),
    ).resolves.toMatchObject({ kind: 'login_required' });
    await expect(
      cheapVerdict(
        claude,
        facts(),
        environment({
          ...base,
          readText: async (path) =>
            path.endsWith('settings.json') ? '{"apiKeyHelper":"fetch"}' : null,
        }),
      ),
    ).resolves.toEqual({ kind: 'unchanged' });
    await expect(
      cheapVerdict(
        claude,
        facts(),
        environment({
          ...base,
          env: { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'key' },
          readText: async () => null,
        }),
      ),
    ).resolves.toEqual({ kind: 'unchanged' });
  });

  it('only downgrades Pi when auth.json is absent and models declare no apiKey', async () => {
    const pi = connection({ driver: 'pi', executablePath: 'pi', homePath: '/home/u/.pi/agent' });
    const base = { isFile: (path: string) => path === '/usr/bin/pi' };
    await expect(
      cheapVerdict(
        pi,
        facts(),
        environment({
          ...base,
          readText: async (path) => (path.endsWith('models.json') ? '{"providers":[]}' : null),
        }),
      ),
    ).resolves.toMatchObject({ kind: 'login_required' });
    await expect(
      cheapVerdict(
        pi,
        facts(),
        environment({
          ...base,
          readText: async (path) =>
            path.endsWith('models.json') ? '{"providers":[{"apiKey":"fixture"}]}' : null,
        }),
      ),
    ).resolves.toEqual({ kind: 'unchanged' });
  });

  it('keeps dsh on the full probe path because it has no login signal', async () => {
    const dsh = connection({ driver: 'dsh', executablePath: 'dsh', homePath: '/home/u/.dsh' });
    await expect(
      cheapVerdict(dsh, null, environment({ isFile: (path) => path === '/usr/bin/dsh' })),
    ).resolves.toEqual({ kind: 'unknown' });
  });

  it('downgrades antigravity without cached auth but never promotes it', async () => {
    const antigravity = connection({
      driver: 'antigravity',
      executablePath: 'agy_acp_server',
      homePath: '/home/u/.gemini',
    });
    const options = environment({
      antigravityExecutable: () => '/opt/agy_acp_server',
      stat: () => ({ size: 100, mtimeMs: 200 }),
    });
    await expect(
      cheapVerdict(antigravity, facts(), { ...options, hasCachedAuth: () => false }),
    ).resolves.toMatchObject({ kind: 'login_required' });
    await expect(
      cheapVerdict(antigravity, null, { ...options, hasCachedAuth: () => true }),
    ).resolves.toEqual({ kind: 'unknown' });
  });
});
