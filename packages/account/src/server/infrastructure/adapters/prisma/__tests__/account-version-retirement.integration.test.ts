import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@memoflow/database';

describe('ACC-1407 Account version physical retirement (real DB)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('removes accounts.version while preserving closure-operation version', async () => {
    const accountColumns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'accounts'`,
    );
    expect(new Set(accountColumns.map((row) => row.column_name)).has('version')).toBe(false);

    const closureColumns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'reliable_account_closure_operations'`,
    );
    expect(new Set(closureColumns.map((row) => row.column_name)).has('version')).toBe(true);
  });
});
