import { expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nativeIdentity, nativeModelVisibilityContext } from './native-identity';

it('fences changed provider configuration or accounts while tolerating identified OAuth refresh', async () => {
  const home = await mkdtemp(join(tmpdir(), 'memoflow-native-identity-'));
  try {
    const file = join(home, 'auth.json');
    await writeFile(
      file,
      JSON.stringify({
        tokens: { account_id: 'account-a', access_token: 'first', refresh_token: 'first' },
      }),
    );
    const first = await nativeIdentity('codex', home, { email: 'a@example.test' });
    const connection = {
      id: 'test',
      driver: 'codex' as const,
      name: 'Test',
      executablePath: 'codex',
      homePath: home,
      enabled: true,
      writeScopes: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    };
    const context = nativeModelVisibilityContext(connection, first);
    await writeFile(
      file,
      JSON.stringify({
        tokens: { account_id: 'account-a', access_token: 'second', refresh_token: 'second' },
      }),
    );
    const refreshed = await nativeIdentity('codex', home, { email: 'a@example.test' });
    expect(refreshed).toBe(first);
    expect(nativeModelVisibilityContext(connection, refreshed)).toBe(context);
    await writeFile(join(home, 'config.toml'), 'model_provider = "another"');
    expect(await nativeIdentity('codex', home, { email: 'a@example.test' })).not.toBe(first);
    await rm(join(home, 'config.toml'));
    await writeFile(
      file,
      JSON.stringify({ tokens: { account_id: 'account-b', access_token: 'second' } }),
    );
    const changedAccount = await nativeIdentity('codex', home, { email: 'a@example.test' });
    expect(changedAccount).not.toBe(first);
    expect(nativeModelVisibilityContext(connection, changedAccount)).not.toBe(context);
    expect(context).toMatch(/^mvc1:[0-9a-f]{64}$/);
    expect(context).not.toContain(home);
    expect(context).not.toContain('a@example.test');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

it('fences DSH ACP sessions when their native Profile configuration changes', async () => {
  const home = await mkdtemp(join(tmpdir(), 'memoflow-dsh-profile-'));
  try {
    const profile = join(home, 'profiles', 'acp');
    await mkdir(profile, { recursive: true });
    await writeFile(join(profile, 'cordis.yml'), '- dsh-acp');
    const first = await nativeIdentity('dsh', home);
    expect(await nativeIdentity('dsh', home)).toBe(first);
    await writeFile(join(profile, 'cordis.patch.yml'), 'some-profile-config: new-model-route');
    expect(await nativeIdentity('dsh', home)).not.toBe(first);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

it('keeps AGY identity stable across native cache rewrites but fences new authorization', async () => {
  const home = await mkdtemp(join(tmpdir(), 'memoflow-agy-identity-'));
  try {
    const dir = join(home, 'antigravity-acp');
    await mkdir(dir);
    const cache = join(dir, 'acp_token.json');
    await writeFile(
      cache,
      JSON.stringify({
        client_id: 'fixture-client',
        refresh_token: 'fixture-account-a',
        access_token: 'first',
      }),
    );
    const first = await nativeIdentity('antigravity', home);
    await writeFile(
      cache,
      JSON.stringify(
        {
          client_id: 'fixture-client',
          refresh_token: 'fixture-account-a',
          access_token: 'refreshed',
          expiry: 99,
        },
        null,
        2,
      ),
    );
    expect(await nativeIdentity('antigravity', home)).toBe(first);
    await writeFile(
      cache,
      JSON.stringify({ client_id: 'fixture-client', refresh_token: 'fixture-account-b' }),
    );
    expect(await nativeIdentity('antigravity', home)).not.toBe(first);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain('fixture-account');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
