import { describe, expect, it } from 'vitest';
import { prisma } from '../client.js';

describe('CloudAuthUser access projection physical schema', () => {
  it('has disabled_at and no status column', async () => {
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'cloud_auth_users'
    `;
    const columns = new Set(rows.map((row) => row.column_name));

    expect(columns.has('disabled_at')).toBe(true);
    expect(columns.has('status')).toBe(false);
  });
});
