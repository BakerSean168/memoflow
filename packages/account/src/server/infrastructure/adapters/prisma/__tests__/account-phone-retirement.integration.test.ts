import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@memoflow/database';

const RETIRED_PHONE_COLUMNS = [
  'phone_country_code',
  'phone_number',
  'phone_full_number',
  'phone_is_verified',
  'phone_verified_at',
] as const;

describe('ACC-1405 Account phone physical retirement (real DB)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accounts table contains none of the retired phone columns after schema reconciliation', async () => {
    const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'accounts'`,
    );
    const names = new Set(columns.map((row) => row.column_name));

    for (const column of RETIRED_PHONE_COLUMNS) {
      expect(names.has(column)).toBe(false);
    }
  });
});
