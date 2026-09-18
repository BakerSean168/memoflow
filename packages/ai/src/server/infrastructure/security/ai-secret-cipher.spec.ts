import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AISecretCipher } from './ai-secret-cipher';

describe('AISecretCipher', () => {
  const managedEnvKeys = [
    'AI_PROVIDER_ENCRYPTION_KEY',
    'AI_PROVIDER_ENCRYPTION_KEY_ID',
    'AI_PROVIDER_ENCRYPTION_PREVIOUS_KEYS',
  ] as const;
  const originalEnv = Object.fromEntries(managedEnvKeys.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    for (const key of managedEnvKeys) delete process.env[key];
  });

  afterEach(() => {
    for (const key of managedEnvKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('round-trips a value through active enc_v3 AES-GCM', () => {
    const cipher = new AISecretCipher('a-strong-test-secret', { keyId: '2026-08' });
    const encrypted = cipher.encrypt('plain-secret');

    expect(encrypted).toMatch(/^enc_v3:2026-08:/);
    expect(encrypted).not.toContain('plain-secret');
    expect(cipher.decrypt(encrypted)).toBe('plain-secret');
    expect(cipher.needsRewrap(encrypted)).toBe(false);
  });

  it('produces distinct ciphertext for the same plaintext', () => {
    const cipher = new AISecretCipher('a-strong-test-secret');
    expect(cipher.encrypt('same-input')).not.toBe(cipher.encrypt('same-input'));
  });

  it('authenticates the key id as AAD', () => {
    const cipher = new AISecretCipher('same-secret', {
      keyId: 'active',
      previousKeys: { previous: 'same-secret' },
    });
    const encrypted = cipher.encrypt('plain-secret');
    const tamperedKid = encrypted.replace('enc_v3:active:', 'enc_v3:previous:');

    expect(() => cipher.decrypt(tamperedKid)).toThrow();
  });

  it('decrypts previous enc_v3 keys and marks them for rewrap', () => {
    const oldCipher = new AISecretCipher('old-secret', { keyId: '2026-07' });
    const encrypted = oldCipher.encrypt('plain-secret');
    const rotated = new AISecretCipher('new-secret', {
      keyId: '2026-08',
      previousKeys: { '2026-07': 'old-secret' },
    });

    expect(rotated.decrypt(encrypted)).toBe('plain-secret');
    expect(rotated.needsRewrap(encrypted)).toBe(true);
    expect(rotated.rewrap(encrypted)).toMatch(/^enc_v3:2026-08:/);
  });

  it('rejects legacy ciphertext without a migration reader', () => {
    const cipher = new AISecretCipher('new-secret');
    expect(() => cipher.decrypt('enc_v2:legacy')).toThrow(/unsupported ciphertext format/);
  });

  it('fails when an enc_v3 key id is not in the keyring', () => {
    const encrypted = new AISecretCipher('old-secret', { keyId: 'old' }).encrypt('plain-secret');
    expect(() => new AISecretCipher('new-secret', { keyId: 'new' }).decrypt(encrypted)).toThrow(
      /key id old is not available/,
    );
  });

  it('rejects plaintext seeds without a migration reader', () => {
    const cipher = new AISecretCipher('a-strong-test-secret');
    expect(() => cipher.decrypt('not-encrypted')).toThrow(/unsupported ciphertext format/);
  });

  it('rejects legacy enc_v1 XOR ciphertext', () => {
    const cipher = new AISecretCipher('a-strong-test-secret');
    expect(() => cipher.decrypt('enc_v1:c29tZS1sZWdhY3ktdmFsdWU=')).toThrow(/unsupported ciphertext format/);
  });

  it('round-trips Unicode values', () => {
    const cipher = new AISecretCipher('a-strong-test-secret');
    const value = '密钥-🔐-café';
    expect(cipher.decrypt(cipher.encrypt(value))).toBe(value);
  });

  it('rejects empty secrets and invalid/duplicate key ids', () => {
    expect(() => new AISecretCipher('')).toThrow(/non-empty secret/);
    expect(() => new AISecretCipher('secret', { keyId: 'invalid key id' })).toThrow(/key id/);
    expect(
      () => new AISecretCipher('secret', { keyId: 'same', previousKeys: { same: 'old' } }),
    ).toThrow(/duplicate key id/);
  });

  it('fails fast when AI_PROVIDER_ENCRYPTION_KEY is missing', () => {
    expect(() => AISecretCipher.fromEnv()).toThrow(/AI_PROVIDER_ENCRYPTION_KEY/);
  });

  it('builds an active + previous keyring from environment variables', () => {
    process.env.AI_PROVIDER_ENCRYPTION_KEY = 'new-secret-0123456789abcdef01234567';
    process.env.AI_PROVIDER_ENCRYPTION_KEY_ID = '2026-08';
    process.env.AI_PROVIDER_ENCRYPTION_PREVIOUS_KEYS =
      '2026-07=old-secret-0123456789abcdef01234567,2026-06=older-secret-0123456789abcdef01234';

    const cipher = AISecretCipher.fromEnv();
    const legacy = new AISecretCipher('old-secret-0123456789abcdef01234567', {
      keyId: '2026-07',
    }).encrypt('value');

    expect(cipher.encrypt('value')).toMatch(/^enc_v3:2026-08:/);
    expect(cipher.decrypt(legacy)).toBe('value');
  });

  it('rejects malformed previous-key environment syntax', () => {
    process.env.AI_PROVIDER_ENCRYPTION_KEY = 'new-secret-0123456789abcdef01234567';
    process.env.AI_PROVIDER_ENCRYPTION_PREVIOUS_KEYS = 'missing-separator';
    expect(() => AISecretCipher.fromEnv()).toThrow(/kid=secret/);
  });
});
