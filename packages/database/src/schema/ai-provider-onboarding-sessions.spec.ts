import {
  AI_PROVIDER_ONBOARDING_EXPIRY_INDEX,
  AI_PROVIDER_ONBOARDING_IDENTITY_EXPIRY_INDEX,
  AI_PROVIDER_ONBOARDING_TARGET_EXPIRY_INDEX,
  AI_PROVIDER_ONBOARDING_IDENTITY_FK,
  prepareAIProviderOnboardingSessions,
} from './ai-provider-onboarding-sessions';

function clientWithTable(tablePresent = true) {
  const queries: string[] = [];
  const query = vi.fn(async (sql: string) => {
    queries.push(sql);
    if (sql.includes("to_regclass('public.ai_provider_onboarding_sessions')")) {
      return {
        rows: [{ regclass: tablePresent ? 'ai_provider_onboarding_sessions' : null }],
        rowCount: 1,
      };
    }
    if (sql.includes(`to_regclass('public.${AI_PROVIDER_ONBOARDING_IDENTITY_EXPIRY_INDEX}')`)) {
      return { rows: [{ regclass: AI_PROVIDER_ONBOARDING_IDENTITY_EXPIRY_INDEX }], rowCount: 1 };
    }
    if (sql.includes(`to_regclass('public.${AI_PROVIDER_ONBOARDING_TARGET_EXPIRY_INDEX}')`)) {
      return { rows: [{ regclass: AI_PROVIDER_ONBOARDING_TARGET_EXPIRY_INDEX }], rowCount: 1 };
    }
    if (sql.includes(`to_regclass('public.${AI_PROVIDER_ONBOARDING_EXPIRY_INDEX}')`)) {
      return { rows: [{ regclass: AI_PROVIDER_ONBOARDING_EXPIRY_INDEX }], rowCount: 1 };
    }
    if (sql.includes('information_schema.columns') && sql.includes('target_provider_id')) {
      return { rows: [{ present: 1 }], rowCount: 1 };
    }
    if (sql.includes('FROM pg_constraint') && sql.includes('LIMIT 1')) {
      return { rows: [{ present: 1 }], rowCount: 1 };
    }
    return { rows: [], rowCount: null };
  });
  return { query, queries };
}

describe('prepareAIProviderOnboardingSessions', () => {
  it('is a no-op before Prisma has created the onboarding table', async () => {
    const client = clientWithTable(false);
    await expect(prepareAIProviderOnboardingSessions(client)).resolves.toEqual({
      tablePresent: false,
      targetProviderColumnPresent: false,
      identityExpiryIndexPresent: false,
      targetExpiryIndexPresent: false,
      expiryIndexPresent: false,
      identityForeignKeyPresent: false,
    });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('idempotently enforces indexes and the account cascade foreign key', async () => {
    const client = clientWithTable(true);
    await expect(prepareAIProviderOnboardingSessions(client)).resolves.toEqual({
      tablePresent: true,
      targetProviderColumnPresent: true,
      identityExpiryIndexPresent: true,
      targetExpiryIndexPresent: true,
      expiryIndexPresent: true,
      identityForeignKeyPresent: true,
    });
    const executed = client.queries.join('\n');
    expect(executed).toContain('ADD COLUMN IF NOT EXISTS "target_provider_id" TEXT');
    expect(executed).toContain(
      `CREATE INDEX IF NOT EXISTS "${AI_PROVIDER_ONBOARDING_IDENTITY_EXPIRY_INDEX}"`,
    );
    expect(executed).toContain(
      `CREATE INDEX IF NOT EXISTS "${AI_PROVIDER_ONBOARDING_TARGET_EXPIRY_INDEX}"`,
    );
    expect(executed).toContain(
      `CREATE INDEX IF NOT EXISTS "${AI_PROVIDER_ONBOARDING_EXPIRY_INDEX}"`,
    );
    expect(executed).toContain(`ADD CONSTRAINT "${AI_PROVIDER_ONBOARDING_IDENTITY_FK}"`);
    expect(executed).toContain('ON DELETE CASCADE ON UPDATE CASCADE');
  });
});
