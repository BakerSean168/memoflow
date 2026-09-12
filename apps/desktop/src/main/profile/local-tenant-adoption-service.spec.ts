import { describe, expect, it, vi } from 'vitest';
import { IDENTITY_OWNED_TABLES, LocalTenantAdoptionService } from './local-tenant-adoption-service';
import { PowerSyncAppSchema } from '@memoflow/powersync-schema';

describe('LocalTenantAdoptionService', () => {
  it('derives adoption coverage from every PowerSync identity_id table', () => {
    const expected = PowerSyncAppSchema.tables
      .filter((table) => table.columns.some((column) => column.name === 'identity_id'))
      .map((table) => table.name);

    expect(IDENTITY_OWNED_TABLES).toEqual(expected);
    expect(IDENTITY_OWNED_TABLES).not.toContain('accounts');
    expect(IDENTITY_OWNED_TABLES).not.toContain('notification_templates');
  });

  it('replaces the immutable account id and updates every business identity table in one transaction', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const getOptional = vi.fn().mockResolvedValue(null);
    const db = {
      writeTransaction: vi.fn(
        async (
          callback: (tx: {
            execute: typeof execute;
            getOptional: typeof getOptional;
          }) => Promise<void>,
        ) => callback({ execute, getOptional }),
      ),
    };

    await new LocalTenantAdoptionService(db as never).adopt({
      fromOwnerId: 'guest-1',
      toOwnerId: 'cloud-1',
      displayName: 'Cloud User',
      identifier: 'user@example.com',
    });

    expect(db.writeTransaction).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO profile_adoption_journal'),
      expect.arrayContaining(['current', 'guest-1', 'cloud-1', 'Cloud User', 'user@example.com']),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO accounts'),
      expect.arrayContaining(['cloud-1', expect.any(String), 'guest-1']),
    );
    const accountInsertSql = execute.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO accounts'),
    )?.[0] as string;
    for (const retired of ['email_', 'phone_', 'settings', 'deleted_at']) {
      expect(accountInsertSql).not.toContain(retired);
    }
    expect(accountInsertSql).toContain('closed_at');

    expect(execute).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE accounts'),
      expect.anything(),
    );
    for (const table of IDENTITY_OWNED_TABLES) {
      expect(execute).toHaveBeenCalledWith(
        `UPDATE ${table} SET identity_id = ? WHERE identity_id = ?`,
        ['cloud-1', 'guest-1'],
      );
    }
    expect(execute).toHaveBeenLastCalledWith('DELETE FROM accounts WHERE id = ?', ['guest-1']);
  });

  it('rejects a silent merge when the cloud account already exists locally', async () => {
    const db = {
      writeTransaction: async (
        callback: (tx: {
          execute: () => Promise<void>;
          getOptional: () => Promise<{ id: string }>;
        }) => Promise<void>,
      ) => callback({ execute: vi.fn(), getOptional: async () => ({ id: 'cloud-1' }) }),
    };

    await expect(
      new LocalTenantAdoptionService(db as never).adopt({
        fromOwnerId: 'guest-1',
        toOwnerId: 'cloud-1',
        displayName: 'Cloud User',
        identifier: 'user@example.com',
      }),
    ).rejects.toThrow('拒绝静默合并');
  });
});
