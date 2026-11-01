import { expect, it, vi } from 'vitest';
import { createLocalAgentSqlite } from '../../testing/local-agent-sqlite';
import { authorize, executeAuthorized, PermissionDeniedError } from './authorize';
import { PermissionPowerSyncRepository } from './permission-powersync.repository';
import {
  PermissionStorageUnavailableError,
  type PermissionRepository,
} from './permission.repository';

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

it('fails closed for writes if the permission storage is unavailable', async () => {
  const unavailable = new PermissionStorageUnavailableError();
  const repository = {
    getSettings: async () => {
      throw unavailable;
    },
    listRules: async () => {
      throw unavailable;
    },
    appendAudit: async () => {
      throw new PermissionStorageUnavailableError();
    },
    updateAuditExecution: async () => {
      throw new PermissionStorageUnavailableError();
    },
  } as PermissionRepository;

  await expect(
    executeAuthorized(
      repository,
      {
        owner: 'owner',
        agentId: 'codex',
        operationId: 'goal.create',
      },
      async () => 'created',
    ),
  ).rejects.toBeInstanceOf(PermissionDeniedError);
});

it('does not allow native conversation modes to raise global business permissions', async () => {
  const db = createLocalAgentSqlite();
  const repository = new PermissionPowerSyncRepository(db);
  try {
    await repository.saveSettings('owner', { preset: 'read_only', agentPresets: {}, revision: 1 });
    const input = {
      owner: 'owner',
      agentId: 'codex',
      operationId: 'goal.create',
      conversationPreset: 'full_auto' as const,
    };
    expect((await authorize(repository, input)).decision).toBe('deny');
    await repository.saveRule('owner', {
      id: 'deny',
      agentId: null,
      object: 'goal',
      action: 'create',
      effect: 'deny',
      source: 'user',
    });
    expect((await authorize(repository, input)).decision).toBe('deny');
    expect(
      (await authorize(repository, { ...input, operationId: 'ai_permission.update' })).decision,
    ).toBe('deny');
    expect(
      (
        await authorize(repository, {
          owner: 'owner',
          agentId: 'codex',
          operationId: 'goal.update',
        })
      ).decision,
    ).toBe('deny');
  } finally {
    db.close();
  }
});
