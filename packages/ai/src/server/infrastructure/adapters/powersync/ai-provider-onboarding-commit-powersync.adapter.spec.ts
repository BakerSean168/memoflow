import { describe, expect, it, vi } from 'vitest';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import { PowerSyncAIProviderOnboardingCommitAdapter } from './ai-provider-onboarding-commit-powersync.adapter';

const provider = {
  id: 'provider-1',
  identityId: 'identity-1',
  name: 'OpenAI',
  providerDefinitionId: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  credentialRef: 'credential-test',
  defaultModel: 'gpt-5-mini',
  isActive: true,
  isDefault: true,
  priority: 100,
  version: 1,
  createdAt: 1_750_000_000_000,
  updatedAt: 1_750_000_000_000,
  deletedAt: null,
} as never;

function databaseFixture(tx: IElectronDatabaseTransaction, events: string[]) {
  return {
    writeTransaction: vi.fn(async <T>(work: (value: IElectronDatabaseTransaction) => Promise<T>) => {
      events.push('tx-start');
      try {
        const result = await work(tx);
        events.push('tx-commit');
        return result;
      } catch (error) {
        events.push('tx-rollback');
        throw error;
      }
    }),
    execute: vi.fn(),
    getAll: vi.fn(),
    getOptional: vi.fn(),
    get: vi.fn(),
  } as unknown as IElectronDatabase;
}

function createFixture(
  options: {
    session?: boolean;
    sessionTarget?: string | null;
    duplicate?: boolean;
    credential?: boolean;
    insertFails?: boolean;
    insertErrorCode?: string;
  } = {},
) {
  const events: string[] = [];
  let optionalCall = 0;
  const tx: IElectronDatabaseTransaction = {
    getOptional: vi.fn(async () => {
      optionalCall += 1;
      if (optionalCall === 1) {
        events.push('read-session');
        return options.session === false
          ? null
          : {
              identity_id: 'identity-1',
              base_url: 'https://api.openai.com/v1',
              target_provider_id: options.sessionTarget ?? null,
              expires_at: 1_750_000_100_000,
              consumed_at: null,
            };
      }
      events.push('check-duplicate');
      return options.duplicate ? { id: 'existing' } : null;
    }),
    execute: vi.fn(async (sql: string) => {
      if (sql.includes('UPDATE ai_provider_onboarding_sessions')) {
        events.push('consume-session');
        return { rowsAffected: 1 };
      }
      if (sql.includes('UPDATE ai_provider_secrets SET expires_at = NULL')) {
        events.push('activate-credential');
        return { rowsAffected: options.credential === false ? 0 : 1 };
      }
      if (sql.includes('UPDATE ai_provider_configs SET is_default = 0')) {
        events.push('clear-default');
        return { rowsAffected: 1 };
      }
      if (sql.includes('INSERT INTO ai_provider_configs')) {
        events.push('insert-provider');
        if (options.insertErrorCode) {
          throw Object.assign(new Error('provider insert failed'), { code: options.insertErrorCode });
        }
        if (options.insertFails) throw new Error('provider insert failed');
        return { rowsAffected: 1 };
      }
      return { rowsAffected: 0 };
    }),
    getAll: vi.fn(async () => []),
    get: vi.fn(async () => ({} as never)),
  };
  return { db: databaseFixture(tx, events), tx, events };
}

function replacementFixture(
  options: {
    session?: boolean;
    sessionTarget?: string | null;
    provider?: boolean;
    providerVersion?: number;
    updateRows?: number;
    credential?: boolean;
  } = {},
) {
  const events: string[] = [];
  let optionalCall = 0;
  const tx: IElectronDatabaseTransaction = {
    getOptional: vi.fn(async () => {
      optionalCall += 1;
      if (optionalCall === 1) {
        events.push('read-session');
        return options.session === false
          ? null
          : {
              identity_id: 'identity-1',
              base_url: 'https://new.example/v1',
              target_provider_id:
                options.sessionTarget === undefined ? 'provider-1' : options.sessionTarget,
              expires_at: 1_750_000_100_000,
              consumed_at: null,
            };
      }
      events.push('read-provider');
      return options.provider === false
        ? null
        : { id: 'provider-1', version: options.providerVersion ?? 7 };
    }),
    execute: vi.fn(async (sql: string) => {
      if (sql.includes('UPDATE ai_provider_onboarding_sessions')) {
        events.push('consume-session');
        return { rowsAffected: 1 };
      }
      if (sql.includes('UPDATE ai_provider_secrets SET expires_at = NULL')) {
        events.push('activate-new-credential');
        return { rowsAffected: options.credential === false ? 0 : 1 };
      }
      if (sql.includes('UPDATE ai_provider_secrets SET revoked_at')) {
        events.push('revoke-old-credential');
        return { rowsAffected: options.credential === false ? 0 : 1 };
      }
      if (sql.includes('UPDATE ai_provider_configs')) {
        events.push('replace-provider');
        return { rowsAffected: options.updateRows ?? 1 };
      }
      return { rowsAffected: 0 };
    }),
    getAll: vi.fn(async () => []),
    get: vi.fn(async () => ({} as never)),
  };
  return { db: databaseFixture(tx, events), tx, events };
}

describe('PowerSyncAIProviderOnboardingCommitAdapter create', () => {
  it('consumes a create-only session and inserts the Provider inside one writeTransaction', async () => {
    const { db, events } = createFixture();
    const adapter = new PowerSyncAIProviderOnboardingCommitAdapter(db);

    await expect(
      adapter.commit({
        identityId: 'identity-1',
        onboardingId: 'onboarding-1234567890',
        provider,
        now: 1_750_000_000_000,
      }),
    ).resolves.toBe('COMMITTED');

    expect(events).toEqual([
      'tx-start',
      'read-session',
      'check-duplicate',
      'consume-session',
      'clear-default',
      'activate-credential',
      'insert-provider',
      'tx-commit',
    ]);
  });

  it('refuses to use a replacement-bound handle to create a new Provider', async () => {
    const { db, tx, events } = createFixture({ sessionTarget: 'provider-1' });
    const adapter = new PowerSyncAIProviderOnboardingCommitAdapter(db);

    await expect(
      adapter.commit({
        identityId: 'identity-1',
        onboardingId: 'onboarding-1234567890',
        provider,
        now: 1_750_000_000_000,
      }),
    ).resolves.toBe('SESSION_UNAVAILABLE');

    expect(tx.execute).not.toHaveBeenCalled();
    expect(events).toEqual(['tx-start', 'read-session', 'tx-commit']);
  });

  it.each(['SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY'])(
    'maps the structured SQLite unique code %s to CONFLICT',
    async (insertErrorCode) => {
      const { db, events } = createFixture({ insertErrorCode });
      const adapter = new PowerSyncAIProviderOnboardingCommitAdapter(db);

      await expect(
        adapter.commit({
          identityId: 'identity-1',
          onboardingId: 'onboarding-1234567890',
          provider,
          now: 1_750_000_000_000,
        }),
      ).resolves.toBe('CONFLICT');

      expect(events.at(-1)).toBe('tx-rollback');
    },
  );

  it('does not misclassify non-unique SQLite constraints as a Provider conflict', async () => {
    const { db, events } = createFixture({ insertErrorCode: 'SQLITE_CONSTRAINT_NOTNULL' });
    const adapter = new PowerSyncAIProviderOnboardingCommitAdapter(db);

    await expect(
      adapter.commit({
        identityId: 'identity-1',
        onboardingId: 'onboarding-1234567890',
        provider,
        now: 1_750_000_000_000,
      }),
    ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_NOTNULL' });

    expect(events.at(-1)).toBe('tx-rollback');
  });

  it('keeps consume and insert in the same rollback boundary when Provider persistence fails', async () => {
    const { db, events } = createFixture({ insertFails: true });
    const adapter = new PowerSyncAIProviderOnboardingCommitAdapter(db);

    await expect(
      adapter.commit({
        identityId: 'identity-1',
        onboardingId: 'onboarding-1234567890',
        provider,
        now: 1_750_000_000_000,
      }),
    ).rejects.toThrow('provider insert failed');

    expect(events.at(-1)).toBe('tx-rollback');
    expect(events.indexOf('insert-provider')).toBeGreaterThan(events.indexOf('consume-session'));
  });

  it('rolls back the one-time consume when the credential reference is unavailable', async () => {
    const { db, events } = createFixture({ credential: false });
    const adapter = new PowerSyncAIProviderOnboardingCommitAdapter(db);

    await expect(
      adapter.commit({
        identityId: 'identity-1',
        onboardingId: 'onboarding-1234567890',
        provider,
        now: 1_750_000_000_000,
      }),
    ).rejects.toThrow('AI provider credential is unavailable');

    expect(events).toEqual([
      'tx-start',
      'read-session',
      'check-duplicate',
      'consume-session',
      'clear-default',
      'activate-credential',
      'tx-rollback',
    ]);
  });
});

describe('PowerSyncAIProviderOnboardingCommitAdapter replacement', () => {
  const replacement = {
    ...provider,
    baseUrl: 'https://new.example/v1',
    credentialRef: 'credential-new',
    defaultModel: 'model-new',
    version: 8,
    updatedAt: 1_750_000_000_000,
  } as never;

  it('atomically consumes the target-bound handle and swaps connection material', async () => {
    const { db, events } = replacementFixture();
    const adapter = new PowerSyncAIProviderOnboardingCommitAdapter(db);

    await expect(
      adapter.replace({
        identityId: 'identity-1',
        onboardingId: 'onboarding-replacement-1234',
        targetProviderId: 'provider-1',
        expectedVersion: 7,
        replacement,
        now: 1_750_000_000_000,
      }),
    ).resolves.toBe('REPLACED');

    expect(events).toEqual([
      'tx-start',
      'read-session',
      'read-provider',
      'consume-session',
      'replace-provider',
      'activate-new-credential',
      'revoke-old-credential',
      'tx-commit',
    ]);
  });

  it('refuses a create-only or differently-bound handle', async () => {
    const { db, tx, events } = replacementFixture({ sessionTarget: null });
    const adapter = new PowerSyncAIProviderOnboardingCommitAdapter(db);

    await expect(
      adapter.replace({
        identityId: 'identity-1',
        onboardingId: 'onboarding-create-123456',
        targetProviderId: 'provider-1',
        expectedVersion: 7,
        replacement,
        now: 1_750_000_000_000,
      }),
    ).resolves.toBe('SESSION_UNAVAILABLE');

    expect(tx.execute).not.toHaveBeenCalled();
    expect(events).toEqual(['tx-start', 'read-session', 'tx-commit']);
  });

  it('does not consume the handle when the Provider version changed before the transaction', async () => {
    const { db, tx, events } = replacementFixture({ providerVersion: 8 });
    const adapter = new PowerSyncAIProviderOnboardingCommitAdapter(db);

    await expect(
      adapter.replace({
        identityId: 'identity-1',
        onboardingId: 'onboarding-replacement-1234',
        targetProviderId: 'provider-1',
        expectedVersion: 7,
        replacement,
        now: 1_750_000_000_000,
      }),
    ).resolves.toBe('CONFLICT');

    expect(tx.execute).not.toHaveBeenCalled();
    expect(events).toEqual(['tx-start', 'read-session', 'read-provider', 'tx-commit']);
  });

  it('rolls back the session consume if the optimistic Provider update loses a race', async () => {
    const { db, events } = replacementFixture({ updateRows: 0 });
    const adapter = new PowerSyncAIProviderOnboardingCommitAdapter(db);

    await expect(
      adapter.replace({
        identityId: 'identity-1',
        onboardingId: 'onboarding-replacement-1234',
        targetProviderId: 'provider-1',
        expectedVersion: 7,
        replacement,
        now: 1_750_000_000_000,
      }),
    ).resolves.toBe('CONFLICT');

    expect(events).toEqual([
      'tx-start',
      'read-session',
      'read-provider',
      'consume-session',
      'replace-provider',
      'tx-rollback',
    ]);
  });

  it('rolls back the replacement when either secret reference cannot be activated', async () => {
    const { db, events } = replacementFixture({ credential: false });
    const adapter = new PowerSyncAIProviderOnboardingCommitAdapter(db);

    await expect(
      adapter.replace({
        identityId: 'identity-1',
        onboardingId: 'onboarding-replacement-1234',
        targetProviderId: 'provider-1',
        expectedVersion: 7,
        replacement,
        now: 1_750_000_000_000,
      }),
    ).rejects.toThrow('AI provider credential is unavailable');

    expect(events).toEqual([
      'tx-start',
      'read-session',
      'read-provider',
      'consume-session',
      'replace-provider',
      'activate-new-credential',
      'tx-rollback',
    ]);
  });
});
