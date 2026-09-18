import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

interface AISecretCipherOptions {
  /** Stable non-secret identifier embedded in enc_v3 ciphertext. */
  readonly keyId?: string;
  /** Previous decrypt-only keys used during rotation. */
  readonly previousKeys?: Readonly<Record<string, string>>;
}

/**
 * Env-backed AES-256-GCM vault for AI provider credentials.
 *
 * New writes use `enc_v3:<kid>:<payload>`. The key id is authenticated as GCM
 * additional authenticated data (AAD), so changing the id invalidates the
 * ciphertext. A random 96-bit IV is generated for every encryption.
 *
 * Rotation is explicit: one active key encrypts, while zero or more previous
 * `enc_v3` key ids are decrypt-only. There is intentionally no legacy plaintext
 * or old ciphertext reader; ADR-111 requires a direct cutover with no secret
 * migration/backfill compatibility path.
 */
export class AISecretCipher {
  private static readonly PREFIX = 'enc_v3:';
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12;
  private static readonly AUTH_TAG_LENGTH = 16;
  private static readonly DEFAULT_KEY_ID = 'primary';
  private static readonly KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
  private static readonly AAD_NAMESPACE = 'memoflow.ai-provider-secret';

  private readonly activeKeyId: string;
  private readonly keys: ReadonlyMap<string, Buffer>;

  constructor(secret: string, options: AISecretCipherOptions = {}) {
    if (!secret) {
      throw new Error('AISecretCipher requires a non-empty secret');
    }

    const keyId = options.keyId ?? AISecretCipher.DEFAULT_KEY_ID;
    AISecretCipher.assertKeyId(keyId);

    const keys = new Map<string, Buffer>();
    keys.set(keyId, AISecretCipher.deriveKey(secret));
    for (const [previousKeyId, previousSecret] of Object.entries(options.previousKeys ?? {})) {
      AISecretCipher.assertKeyId(previousKeyId);
      if (!previousSecret) {
        throw new Error(`AISecretCipher previous key ${previousKeyId} requires a non-empty secret`);
      }
      if (keys.has(previousKeyId)) {
        throw new Error(`AISecretCipher duplicate key id: ${previousKeyId}`);
      }
      keys.set(previousKeyId, AISecretCipher.deriveKey(previousSecret));
    }

    this.activeKeyId = keyId;
    this.keys = keys;
  }

  /**
   * Build the vault from the server-only environment keyring.
   *
   * - `AI_PROVIDER_ENCRYPTION_KEY`: active secret (required when provider secrets are used)
   * - `AI_PROVIDER_ENCRYPTION_KEY_ID`: active key id, defaults to `primary`
   * - `AI_PROVIDER_ENCRYPTION_PREVIOUS_KEYS`: optional comma-separated `kid=secret` entries
   */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): AISecretCipher {
    const secret = env.AI_PROVIDER_ENCRYPTION_KEY;
    if (!secret) {
      throw new Error(
        'AI_PROVIDER_ENCRYPTION_KEY environment variable is required to encrypt AI provider secrets',
      );
    }
    if (secret.length < 32) {
      throw new Error('AI_PROVIDER_ENCRYPTION_KEY must be at least 32 characters');
    }

    return new AISecretCipher(secret, {
      keyId: env.AI_PROVIDER_ENCRYPTION_KEY_ID || AISecretCipher.DEFAULT_KEY_ID,
      previousKeys: AISecretCipher.parsePreviousKeys(env.AI_PROVIDER_ENCRYPTION_PREVIOUS_KEYS),
    });
  }

  encrypt(value: string): string {
    const iv = randomBytes(AISecretCipher.IV_LENGTH);
    const key = this.requireKey(this.activeKeyId);
    const cipher = createCipheriv(AISecretCipher.ALGORITHM, key, iv);
    cipher.setAAD(this.aad(this.activeKeyId));

    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, authTag, ciphertext]);

    return `${AISecretCipher.PREFIX}${this.activeKeyId}:${payload.toString('base64')}`;
  }

  decrypt(value: string): string {
    if (value.startsWith(AISecretCipher.PREFIX)) {
      const remainder = value.slice(AISecretCipher.PREFIX.length);
      const separator = remainder.indexOf(':');
      if (separator <= 0) {
        throw new Error('AISecretCipher: malformed enc_v3 ciphertext');
      }
      const keyId = remainder.slice(0, separator);
      AISecretCipher.assertKeyId(keyId);
      const key = this.keys.get(keyId);
      if (!key) {
        throw new Error(`AISecretCipher: key id ${keyId} is not available in the keyring`);
      }
      return this.decryptPayload(remainder.slice(separator + 1), key, this.aad(keyId));
    }
    throw new Error('AISecretCipher: unsupported ciphertext format');
  }

  needsRewrap(value: string): boolean {
    return !value.startsWith(`${AISecretCipher.PREFIX}${this.activeKeyId}:`);
  }

  rewrap(value: string): string {
    return this.encrypt(this.decrypt(value));
  }

  private decryptPayload(payloadBase64: string, key: Buffer, aad?: Buffer): string {
    const payload = Buffer.from(payloadBase64, 'base64');
    const minimumLength = AISecretCipher.IV_LENGTH + AISecretCipher.AUTH_TAG_LENGTH;
    if (payload.length < minimumLength) {
      throw new Error('AISecretCipher: encrypted payload is too short');
    }

    const iv = payload.subarray(0, AISecretCipher.IV_LENGTH);
    const authTag = payload.subarray(
      AISecretCipher.IV_LENGTH,
      AISecretCipher.IV_LENGTH + AISecretCipher.AUTH_TAG_LENGTH,
    );
    const ciphertext = payload.subarray(AISecretCipher.IV_LENGTH + AISecretCipher.AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(AISecretCipher.ALGORITHM, key, iv);
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  private aad(keyId: string): Buffer {
    return Buffer.from(`${AISecretCipher.AAD_NAMESPACE}:${keyId}`, 'utf8');
  }

  private requireKey(keyId: string): Buffer {
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`AISecretCipher: key id ${keyId} is not available in the keyring`);
    return key;
  }

  private static deriveKey(secret: string): Buffer {
    return createHash('sha256').update(secret).digest();
  }

  private static assertKeyId(keyId: string): void {
    if (!AISecretCipher.KEY_ID_PATTERN.test(keyId)) {
      throw new Error(
        'AISecretCipher key id must be 1-64 chars of alphanumeric, dot, underscore, or hyphen',
      );
    }
  }

  private static parsePreviousKeys(value: string | undefined): Record<string, string> {
    const result: Record<string, string> = {};
    if (!value?.trim()) return result;

    for (const rawEntry of value.split(',')) {
      const entry = rawEntry.trim();
      if (!entry) continue;
      const separator = entry.indexOf('=');
      if (separator <= 0 || separator === entry.length - 1) {
        throw new Error(
          'AI_PROVIDER_ENCRYPTION_PREVIOUS_KEYS must be comma-separated kid=secret entries',
        );
      }
      const keyId = entry.slice(0, separator).trim();
      const secret = entry.slice(separator + 1).trim();
      AISecretCipher.assertKeyId(keyId);
      if (secret.length < 32) {
        throw new Error(
          `AI_PROVIDER_ENCRYPTION_PREVIOUS_KEYS secret for ${keyId} must be at least 32 characters`,
        );
      }
      if (Object.prototype.hasOwnProperty.call(result, keyId)) {
        throw new Error(`AI_PROVIDER_ENCRYPTION_PREVIOUS_KEYS contains duplicate key id: ${keyId}`);
      }
      result[keyId] = secret;
    }
    return result;
  }
}
