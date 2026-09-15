import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@memoflow/database';

const RETIRED_ACCOUNT_EMAIL_COLUMNS = [
  'email_address',
  'email_is_verified',
  'email_verified_at',
  'email_is_primary',
] as const;

describe('ACC-1406 Account auth-email physical retirement (real DB)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('removes Account email shadows while preserving the Cloud Auth email authority', async () => {
    const accountColumns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'accounts'`,
    );
    const accountNames = new Set(accountColumns.map((row) => row.column_name));
    for (const column of RETIRED_ACCOUNT_EMAIL_COLUMNS) {
      expect(accountNames.has(column)).toBe(false);
    }

    const cloudAuthColumns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'cloud_auth_users'`,
    );
    expect(new Set(cloudAuthColumns.map((row) => row.column_name)).has('email')).toBe(true);
  });
});
