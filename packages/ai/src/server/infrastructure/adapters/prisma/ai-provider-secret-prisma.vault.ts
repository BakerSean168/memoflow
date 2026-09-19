import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@memoflow/database';
import type { AIProviderCredentialRef } from '@memoflow/contracts/primitives';
import type {
  IAIProviderSecretVault,
  ResolveAIProviderCredentialInput,
  ReplaceAIProviderCredentialInput,
  StoreAIProviderCredentialInput,
} from '../../../application/ports/provider-secret-vault.port';
import { AISecretCipher } from '../../security/ai-secret-cipher';

type SecretDb = Pick<PrismaClient, 'aiProviderSecret'>;

/** API host SecretVault backed by the non-portable Prisma secret table. */
export class AIProviderSecretPrismaVault implements IAIProviderSecretVault {
  private cipher: AISecretCipher | null;

  constructor(
    private readonly db: SecretDb,
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
    const now = new Date();
    await this.db.aiProviderSecret.create({
      data: {
        id: ref,
        identityId: input.identityId,
        encryptedValue: this.secretCipher.encrypt(input.value),
        expiresAt: input.expiresAt == null ? null : new Date(input.expiresAt),
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    return ref;
  }

  async resolve(input: ResolveAIProviderCredentialInput) {
    const row = await this.db.aiProviderSecret.findFirst({
      where: { id: String(input.credentialRef), identityId: input.identityId },
    });
    if (
      !row ||
      row.revokedAt ||
      (row.expiresAt && row.expiresAt.getTime() <= (input.now ?? Date.now()))
    ) {
      throw new Error('AI provider credential is unavailable');
    }
    return { value: this.secretCipher.decrypt(row.encryptedValue) };
  }

  async replace(input: ReplaceAIProviderCredentialInput): Promise<void> {
    assertCredential(input.value);
    const now = input.now ?? Date.now();
    const updated = await this.db.aiProviderSecret.updateMany({
      where: {
        id: String(input.credentialRef),
        identityId: input.identityId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(now) } }],
      },
      data: {
        encryptedValue: this.secretCipher.encrypt(input.value),
        updatedAt: new Date(now),
      },
    });
    if (updated.count !== 1) throw new Error('AI provider credential is unavailable');
  }

  async revoke(input: ResolveAIProviderCredentialInput): Promise<void> {
    const now = new Date(input.now ?? Date.now());
    const updated = await this.db.aiProviderSecret.updateMany({
      where: { id: String(input.credentialRef), identityId: input.identityId, revokedAt: null },
      data: { revokedAt: now, updatedAt: now },
    });
    if (updated.count === 1) return;

    const existing = await this.db.aiProviderSecret.findFirst({
      where: { id: String(input.credentialRef), identityId: input.identityId },
      select: { id: true },
    });
    if (!existing) throw new Error('AI provider credential is unavailable');
  }
}

function assertCredential(value: string): void {
  if (!value.trim()) throw new Error('AI provider credential must not be empty');
}
