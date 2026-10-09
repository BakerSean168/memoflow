import { expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nativeIdentity } from './native-identity';

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
    await writeFile(
      file,
      JSON.stringify({
        tokens: { account_id: 'account-a', access_token: 'second', refresh_token: 'second' },
      }),
    );
    expect(await nativeIdentity('codex', home, { email: 'a@example.test' })).toBe(first);
    await writeFile(join(home, 'config.toml'), 'model_provider = "another"');
    expect(await nativeIdentity('codex', home, { email: 'a@example.test' })).not.toBe(first);
    await rm(join(home, 'config.toml'));
    await writeFile(
      file,
      JSON.stringify({ tokens: { account_id: 'account-b', access_token: 'second' } }),
    );
    expect(await nativeIdentity('codex', home, { email: 'a@example.test' })).not.toBe(first);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
