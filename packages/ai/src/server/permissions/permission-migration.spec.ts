import { expect, it } from 'vitest';
import { createLocalAgentSqlite } from '../../testing/local-agent-sqlite';
import { PermissionPowerSyncRepository } from './permission-powersync.repository';
import { migrateLegacyPermissions } from './permission-migration';

it('imports legacy scopes once, keeps missing write scopes denied and defaults new owners to on demand', async () => {
  const db = createLocalAgentSqlite();
  const repository = new PermissionPowerSyncRepository(db);
  try {
    const agents = [
      {
        agentId: 'codex',
        writeScopes: ['goals:write'] as const,
        mode: 'auto' as const,
      },
    ];
    await migrateLegacyPermissions(repository, 'owner', agents);
    expect(await repository.getSettings('owner')).toMatchObject({
      preset: 'confirm_each',
      agentPresets: { codex: 'confirm_each' },
      migratedFrom: 'legacy-write-scopes-v1',
    });
    expect(await repository.listRules('owner')).toHaveLength(6);
    await migrateLegacyPermissions(repository, 'owner', [{ agentId: 'new', writeScopes: [] }]);
    expect(await repository.listRules('owner')).toHaveLength(6);
    await migrateLegacyPermissions(repository, 'new-owner', []);
    expect(await repository.getSettings('new-owner')).toMatchObject({
      preset: 'on_demand',
      migratedFrom: 'new-default-v1',
    });
  } finally {
    db.close();
  }
});
