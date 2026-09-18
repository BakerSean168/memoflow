import { randomUUID } from 'node:crypto';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { AIProviderCredentialRef } from '@memoflow/contracts/primitives';
import type {
  IAIProviderSecretVault,
  ResolveAIProviderCredentialInput,
  ReplaceAIProviderCredentialInput,
  StoreAIProviderCredentialInput,
} from '../../../application/ports/provider-secret-vault.port';
import { AISecretCipher } from '../../security/ai-secret-cipher';

interface SecretRow {
  id: string;
  identity_id: string;
  encrypted_value: string;
  expires_at: number | null;
  revoked_at: number | null;
}

/** Desktop SecretVault backed by the localOnly PowerSync SQLite table. */
export class PowerSyncAIProviderSecretVault implements IAIProviderSecretVault {
  private cipher: AISecretCipher | null;

  constructor(
    private readonly db: IElectronDatabase,
    cipher?: AISecretCipher,
  ) {
    this.cipher = cipher ?? null;
  }

  private get secretCipher(): AISecretCipher {
    return (this.cipher ??= AISecretCipher.fromEnv());
  }

  async store(input: StoreAIProviderCredentialInput): Promise<AIProviderCredentialRef> {
    assertCredential(input.value);
    const ref = `credential_${randomUUID()}` as AIProviderCredentialRef;
    const now = Date.now();
    await this.db.execute(
      `INSERT INTO ai_provider_secrets (
        id, identity_id, encrypted_value, expires_at, revoked_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      [
        ref,
        input.identityId,
        this.secretCipher.encrypt(input.value),
        input.expiresAt ?? null,
        now,
        now,
      ],
    );
    return ref;
  }

  async resolve(input: ResolveAIProviderCredentialInput) {
    const row = await this.db.getOptional<SecretRow>(
      `SELECT id, identity_id, encrypted_value, expires_at, revoked_at
       FROM ai_provider_secrets WHERE id = ? AND identity_id = ? LIMIT 1`,
      [String(input.credentialRef), input.identityId],
    );
    if (
      !row ||
      row.revoked_at !== null ||
      (row.expires_at !== null && row.expires_at <= (input.now ?? Date.now()))
    ) {
      throw new Error('AI provider credential is unavailable');
    }
    return { value: this.secretCipher.decrypt(row.encrypted_value) };
  }

  async replace(input: ReplaceAIProviderCredentialInput): Promise<void> {
    assertCredential(input.value);
    const now = input.now ?? Date.now();
    const updated = await this.db.execute(
      `UPDATE ai_provider_secrets
       SET encrypted_value = ?, updated_at = ?
       WHERE id = ? AND identity_id = ? AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)`,
      [
        this.secretCipher.encrypt(input.value),
        now,
        String(input.credentialRef),
        input.identityId,
        now,
      ],
    );
    if (updated.rowsAffected !== 1) throw new Error('AI provider credential is unavailable');
  }

  async revoke(input: ResolveAIProviderCredentialInput): Promise<void> {
    const now = input.now ?? Date.now();
    const updated = await this.db.execute(
      `UPDATE ai_provider_secrets SET revoked_at = ?, updated_at = ?
       WHERE id = ? AND identity_id = ? AND revoked_at IS NULL`,
      [now, now, String(input.credentialRef), input.identityId],
    );
    if (updated.rowsAffected === 1) return;

    const existing = await this.db.getOptional<{ id: string }>(
      `SELECT id FROM ai_provider_secrets WHERE id = ? AND identity_id = ? LIMIT 1`,
      [String(input.credentialRef), input.identityId],
    );
    if (!existing) throw new Error('AI provider credential is unavailable');
  }
}

function assertCredential(value: string): void {
  if (!value.trim()) throw new Error('AI provider credential must not be empty');
}
