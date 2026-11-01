import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProfilePasswordStore } from './profile-password-store';

describe('ProfilePasswordStore', () => {
  let rootDir: string;
  let store: ProfilePasswordStore;

  beforeEach(async () => {
    rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'profile-password-'));
    store = new ProfilePasswordStore(rootDir);
  });

  afterEach(async () => fs.promises.rm(rootDir, { recursive: true, force: true }));

  it('wraps and unwraps the same Profile key with Argon2id and AES-GCM', async () => {
    const profileKey = Buffer.alloc(32, 7);
    await store.setCredential('profile-1', 'correct horse', profileKey);

    expect(await store.hasCredential('profile-1')).toBe(true);
    expect(await store.unlock('profile-1', 'correct horse')).toEqual(profileKey);
  });

  it('stores the envelope under shared/secure/profile-passwords without the password', async () => {
    await store.setCredential('profile-1', 'plaintext-secret', Buffer.alloc(32, 3));

    const envelopePath = path.join(
      rootDir,
      'shared',
      'secure',
      'profile-passwords',
      'profile-1.json',
    );
    expect(JSON.parse(await fs.promises.readFile(envelopePath, 'utf8'))).toMatchObject({
      version: 1,
      kdf: 'argon2id',
    });
    expect(await fs.promises.readFile(envelopePath, 'utf8')).not.toContain('plaintext-secret');
  });

  it('rejects an incorrect password without modifying the envelope', async () => {
    await store.setCredential('profile-1', 'correct horse', Buffer.alloc(32, 9));
    await expect(store.unlock('profile-1', 'wrong horse')).rejects.toThrow('密码不正确');
    expect(await store.unlock('profile-1', 'correct horse')).toEqual(Buffer.alloc(32, 9));
  });

  it('backs off exponentially after five consecutive failures', async () => {
    await store.setCredential('profile-1', 'correct horse', Buffer.alloc(32, 1));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(store.unlock('profile-1', 'wrong horse')).rejects.toThrow('密码不正确');
    }
    await expect(store.unlock('profile-1', 'correct horse')).rejects.toThrow('尝试次数过多');
  });

  it('accepts any 8–100 character password and rejects shorter or longer ones', async () => {
    await expect(store.setCredential('p', 'short', Buffer.alloc(32))).rejects.toThrow('8–100');
    await expect(store.setCredential('p', 'a'.repeat(101), Buffer.alloc(32))).rejects.toThrow(
      '8–100',
    );
    await expect(store.setCredential('p', '12345678', Buffer.alloc(32))).resolves.toBeUndefined();
    await expect(
      store.setCredential('p', 'correct horse battery staple', Buffer.alloc(32)),
    ).resolves.toBeUndefined();
  });

  it('replaces the wrapped key on password change and removes the credential', async () => {
    const firstKey = Buffer.alloc(32, 5);
    const rotatedKey = Buffer.alloc(32, 6);
    await store.setCredential('profile-1', 'first password', firstKey);
    await store.setCredential('profile-1', 'second password', rotatedKey);

    await expect(store.unlock('profile-1', 'first password')).rejects.toThrow('密码不正确');
    expect(await store.unlock('profile-1', 'second password')).toEqual(rotatedKey);

    await store.remove('profile-1');
    expect(await store.hasCredential('profile-1')).toBe(false);
  });
});
