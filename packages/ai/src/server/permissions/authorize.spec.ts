import { expect, it, vi } from 'vitest';
import { createLocalAgentSqlite } from '../../testing/local-agent-sqlite';
import { authorize, executeAuthorized, PermissionDeniedError } from './authorize';
import { PermissionPowerSyncRepository } from './permission-powersync.repository';
import type { PermissionRepository } from './permission.repository';

it('audits preset decisions, confirmation outcomes and execution results', async () => {
  const db = createLocalAgentSqlite();
  const repository = new PermissionPowerSyncRepository(db);
  try {
    await repository.saveSettings('owner', {
      preset: 'on_demand',
      agentPresets: {},
      revision: 1,
    });
    const read = await authorize(repository, {
      owner: 'owner',
      agentId: 'codex',
      operationId: 'goal.read',
      now: 10,
    });
    expect(read).toMatchObject({
      decision: 'allow',
      decidedBy: 'preset',
      execution: 'not_started',
    });
    const ask = vi.fn().mockResolvedValue('allow');
    const updated = await executeAuthorized(
      repository,
      {
        owner: 'owner',
        agentId: 'codex',
        operationId: 'goal.update',
        ask,
        now: 20,
      },
      async () => 'saved',
    );
    expect(updated).toBe('saved');
    expect(ask).toHaveBeenCalledOnce();
    expect(await repository.listAudit('owner')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationId: 'goal.update',
          decision: 'allow',
          decidedBy: 'user',
          execution: 'succeeded',
        }),
      ]),
    );
    await expect(
      executeAuthorized(
        repository,
        {
          owner: 'owner',
          agentId: 'codex',
          operationId: 'goal.update',
          ask: async () => 'deny',
          now: 30,
        },
        async () => {
          throw new Error('must not execute');
        },
      ),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    expect((await repository.listAudit('owner'))[0]).toMatchObject({
      decision: 'deny',
      decidedBy: 'user',
      execution: 'not_started',
    });
  } finally {
    db.close();
  }
});

it('uses the default preset without blocking when permission tables are not deployed', async () => {
  const unavailable = new Error('no such table: ai_permission_settings');
  const repository = {
    getSettings: async () => {
      throw unavailable;
    },
    listRules: async () => {
      throw unavailable;
    },
    appendAudit: async () => {
      throw new Error('no such table: ai_permission_audit');
    },
    updateAuditExecution: async () => {
      throw new Error('no such table: ai_permission_audit');
    },
  } as PermissionRepository;

  const result = await executeAuthorized(
    repository,
    {
      owner: 'owner',
      agentId: 'codex',
      operationId: 'goal.create',
    },
    async () => 'created',
  );
  expect(result).toBe('created');
});
