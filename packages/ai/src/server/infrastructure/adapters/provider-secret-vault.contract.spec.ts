import { describe, expect, it, vi } from 'vitest';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { IAIProviderSecretVault } from '../../application/ports/provider-secret-vault.port';
import { AISecretCipher } from '../security/ai-secret-cipher';
import { PowerSyncAIProviderSecretVault } from './powersync/ai-provider-secret-powersync.vault';
import { AIProviderSecretPrismaVault } from './prisma/ai-provider-secret-prisma.vault';

const CIPHER = new AISecretCipher('provider-secret-vault-contract-test-key');
const OWNER = 'identity-1';
const OTHER_OWNER = 'identity-2';

interface ApiSecretRow {
  id: string;
  identityId: string;
  encryptedValue: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DesktopSecretRow {
  id: string;
  identity_id: string;
  encrypted_value: string;
  expires_at: number | null;
  revoked_at: number | null;
  created_at: number;
  updated_at: number;
}

type ApiSecretWhere = {
  id?: string;
  identityId?: string;
  revokedAt?: null;
  OR?: Array<{ expiresAt: null } | { expiresAt: { gt: Date } }>;
};

type ApiSecretData = Partial<
  Pick<ApiSecretRow, 'encryptedValue' | 'expiresAt' | 'revokedAt' | 'updatedAt'>
>;

interface VaultFixture {
  vault: IAIProviderSecretVault;
  stored(ref: string): ApiSecretRow | DesktopSecretRow | undefined;
}

function createApiFixture(): VaultFixture {
  const rows = new Map<string, ApiSecretRow>();
  const matches = (where: ApiSecretWhere, row: ApiSecretRow): boolean => {
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.identityId !== undefined && row.identityId !== where.identityId) return false;
    if (where.revokedAt === null && row.revokedAt !== null) return false;
    if (Array.isArray(where.OR)) {
      const validExpiry = where.OR.some((candidate) => {
        if (candidate.expiresAt === null) return row.expiresAt === null;
        return row.expiresAt !== null && row.expiresAt > candidate.expiresAt.gt;
      });
      if (!validExpiry) return false;
    }
    return true;
  };
  const aiProviderSecret = {
    create: vi.fn(async ({ data }: { data: ApiSecretRow }) => {
      rows.set(data.id, data);
      return data;
    }),
    findFirst: vi.fn(async ({ where }: { where: ApiSecretWhere }) => {
      const row = rows.get(where.id);
      return row && matches(where, row) ? row : null;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: ApiSecretWhere; data: ApiSecretData }) => {
      let count = 0;
      for (const row of rows.values()) {
        if (!matches(where, row)) continue;
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    }),
  };
  const db = { aiProviderSecret } as never;
  return {
    vault: new AIProviderSecretPrismaVault(db, CIPHER),
    stored: (ref) => rows.get(ref),
  };
}

function createDesktopFixture(): VaultFixture {
  const rows = new Map<string, DesktopSecretRow>();
  const db = {
    execute: vi.fn(async (sql: string, parameters: unknown[] = []) => {
      if (sql.startsWith('INSERT INTO ai_provider_secrets')) {
        const [id, identityId, encryptedValue, expiresAt, createdAt, updatedAt] = parameters as [
          string,
          string,
          string,
          number | null,
          number,
          number,
        ];
        rows.set(id, {
          id,
          identity_id: identityId,
          encrypted_value: encryptedValue,
          expires_at: expiresAt,
          revoked_at: null,
          created_at: createdAt,
          updated_at: updatedAt,
        });
        return { rowsAffected: 1 };
      }
      if (sql.includes('SET encrypted_value = ?')) {
        const [encryptedValue, updatedAt, id, identityId, now] = parameters as [
          string,
          number,
          string,
          string,
          number,
        ];
        const row = rows.get(id);
        if (
          !row ||
          row.identity_id !== identityId ||
          row.revoked_at !== null ||
          (row.expires_at !== null && row.expires_at <= now)
        ) {
          return { rowsAffected: 0 };
        }
        row.encrypted_value = encryptedValue;
        row.updated_at = updatedAt;
        return { rowsAffected: 1 };
      }
      if (sql.startsWith('UPDATE ai_provider_secrets SET revoked_at')) {
        const [revokedAt, updatedAt, id, identityId] = parameters as [
          number,
          number,
          string,
          string,
        ];
        const row = rows.get(id);
        if (!row || row.identity_id !== identityId || row.revoked_at !== null) {
          return { rowsAffected: 0 };
        }
        row.revoked_at = revokedAt;
        row.updated_at = updatedAt;
        return { rowsAffected: 1 };
      }
      throw new Error(`Unexpected SQL in vault contract fixture: ${sql}`);
    }),
    getOptional: vi.fn(async (_sql: string, parameters: unknown[] = []) => {
      const [id, identityId] = parameters as [string, string];
      const row = rows.get(id);
      return row?.identity_id === identityId ? row : null;
    }),
  } as unknown as IElectronDatabase;
  return {
    vault: new PowerSyncAIProviderSecretVault(db, CIPHER),
    stored: (ref) => rows.get(ref),
  };
}

const fixtures = [
  ['API Prisma', createApiFixture],
  ['Desktop PowerSync', createDesktopFixture],
] as const;

describe.each(fixtures)('%s SecretVault contract', (_name, createFixture) => {
  it('stores encrypted material behind an opaque ref and resolves only for its owner', async () => {
    const { vault, stored } = createFixture();
    const secret = 'sk-provider-secret';
    const ref = await vault.store({ identityId: OWNER, value: secret });

    expect(ref).toMatch(/^credential_/);
    expect(JSON.stringify(stored(ref))).not.toContain(secret);
    await expect(vault.resolve({ identityId: OWNER, credentialRef: ref })).resolves.toEqual({
      value: secret,
    });
    await expect(vault.resolve({ identityId: OTHER_OWNER, credentialRef: ref })).rejects.toThrow(
      'unavailable',
    );
  });

  it('supports replace, expiry fail-closed, revoke, and idempotent revoke retry', async () => {
    const { vault } = createFixture();
    const ref = await vault.store({ identityId: OWNER, value: 'old-secret' });

    await vault.replace({ identityId: OWNER, credentialRef: ref, value: 'new-secret' });
    await expect(vault.resolve({ identityId: OWNER, credentialRef: ref })).resolves.toEqual({
      value: 'new-secret',
    });

    const expiredRef = await vault.store({
      identityId: OWNER,
      value: 'expired-secret',
      expiresAt: 100,
    });
    await expect(
      vault.resolve({ identityId: OWNER, credentialRef: expiredRef, now: 100 }),
    ).rejects.toThrow('unavailable');
    await expect(
      vault.replace({
        identityId: OWNER,
        credentialRef: expiredRef,
        value: 'replacement',
        now: 100,
      }),
    ).rejects.toThrow('unavailable');

    await vault.revoke({ identityId: OWNER, credentialRef: ref, now: 200 });
    await expect(
      vault.resolve({ identityId: OWNER, credentialRef: ref, now: 200 }),
    ).rejects.toThrow('unavailable');
    await expect(
      vault.revoke({ identityId: OWNER, credentialRef: ref, now: 201 }),
    ).resolves.toBeUndefined();
    await expect(
      vault.revoke({ identityId: OTHER_OWNER, credentialRef: ref, now: 201 }),
    ).rejects.toThrow('unavailable');
  });
});
