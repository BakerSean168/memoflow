import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { normalizeCrudData } from './crud-normalization';
import { IDENTITY_ID_TABLES, getPrismaDelegate } from './table-mapping';

const repoRoot = resolve(__dirname, '../../../../..');

describe('canonical preference PowerSync control-plane surface', () => {
  it('syncs identity-scoped user_preference_records from the server stream', () => {
    const syncConfig = readFileSync(resolve(repoRoot, 'docker/powersync/sync-config.yaml'), 'utf8');
    expect(syncConfig).toContain(
      'SELECT * FROM user_preference_records WHERE identity_id = auth.user_id()',
    );
  });

  it('maps the table to Prisma and normalizes its JSON payload', () => {
    const delegate = {
      upsert: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    };
    expect(IDENTITY_ID_TABLES.has('user_preference_records')).toBe(true);
    expect(getPrismaDelegate({ userPreferenceRecord: delegate }, 'user_preference_records')).toBe(
      delegate,
    );
    expect(
      normalizeCrudData('user_preference_records', {
        payload: '{"timeZone":"UTC","dateStyle":"medium","timeStyle":"24h","weekStartsOn":1}',
      }),
    ).toMatchObject({ payload: { timeZone: 'UTC', weekStartsOn: 1 } });
  });

  it('includes canonical preferences in desktop pre-hydration readiness', () => {
    const desktopPowerSync = readFileSync(
      resolve(repoRoot, 'apps/desktop/src/main/database/powersync.ts'),
      'utf8',
    );
    expect(desktopPowerSync).toMatch(
      /PRE_HYDRATION_BOOTSTRAP_SYNC_TABLES\s*=\s*\[[\s\S]*'user_preference_records'/,
    );
  });

  it('routes canonical preference CRUD around the generic last-write-wins path', () => {
    const executor = readFileSync(resolve(__dirname, 'crud-executor.ts'), 'utf8');
    expect(executor).toContain("tableName === 'user_preference_records'");
    expect(executor).toContain('executeUserPreferenceCrudOperation');
  });
});
