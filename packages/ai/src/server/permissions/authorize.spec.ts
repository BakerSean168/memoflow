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

it('escalates over-threshold calls to a fresh confirmation and records the item count', async () => {
  const db = createLocalAgentSqlite();
  const repository = new PermissionPowerSyncRepository(db);
  try {
    await repository.saveSettings('owner', {
      preset: 'confirm_each',
      agentPresets: {},
      revision: 1,
    });
    await repository.saveRule('owner', {
      id: 'allow-task-update',
      agentId: null,
      object: 'task',
      action: 'update',
      effect: 'allow',
      source: 'user',
    });
    const ask = vi.fn().mockResolvedValue('allow');
    const bulk = await authorize(repository, {
      owner: 'owner',
      agentId: 'codex',
      operationId: 'task.update',
      itemCount: 11,
      ask,
    });
    expect(ask).toHaveBeenCalledOnce();
    expect(bulk).toMatchObject({ decision: 'allow', decidedBy: 'user', itemCount: 11 });

    const boundaryAsk = vi.fn().mockResolvedValue('deny');
    const boundary = await authorize(repository, {
      owner: 'owner',
      agentId: 'codex',
      operationId: 'task.update',
      itemCount: 10,
      ask: boundaryAsk,
    });
    expect(boundaryAsk).not.toHaveBeenCalled();
    expect(boundary).toMatchObject({ decision: 'allow', decidedBy: 'rule', itemCount: 10 });

    const plain = await authorize(repository, {
      owner: 'owner',
      agentId: 'codex',
      operationId: 'task.update',
    });
    expect(plain).toMatchObject({ decision: 'allow', decidedBy: 'rule' });
    expect(plain).not.toHaveProperty('itemCount');
    // The count survives the JSON audit round-trip and stays absent when undeclared.
    const persisted = (await repository.listAudit('owner')).map((record) => record.itemCount);
    expect(persisted).toHaveLength(3);
    expect(persisted.filter((count) => count !== undefined).sort()).toEqual([10, 11]);
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

it('resolves the bulk threshold from stored settings and audits the risk set', async () => {
  const db = createLocalAgentSqlite();
  const repository = new PermissionPowerSyncRepository(db);
  try {
    await repository.saveSettings('owner', {
      preset: 'full_auto',
      agentPresets: {},
      revision: 1,
      bulkThreshold: 3,
    });
    await repository.saveRule('owner', {
      id: 'allow-task-update',
      agentId: null,
      object: 'task',
      action: 'update',
      effect: 'allow',
      source: 'user',
    });
    const ask = vi.fn().mockResolvedValue('allow');
    const bulk = await authorize(repository, {
      owner: 'owner',
      agentId: 'codex',
      operationId: 'task.update',
      itemCount: 4,
      ask,
    });
    expect(ask).toHaveBeenCalledOnce();
    expect(bulk).toMatchObject({
      decision: 'allow',
      decidedBy: 'user',
      itemCount: 4,
      risks: ['bulk'],
    });

    const within = await authorize(repository, {
      owner: 'owner',
      agentId: 'codex',
      operationId: 'task.update',
      itemCount: 3,
    });
    expect(within).toMatchObject({ decision: 'allow', decidedBy: 'rule' });
    expect(within).not.toHaveProperty('risks');

    // A per-call override still wins over the stored setting.
    const overrideAsk = vi.fn().mockResolvedValue('deny');
    const overridden = await authorize(repository, {
      owner: 'owner',
      agentId: 'codex',
      operationId: 'task.update',
      itemCount: 3,
      bulkThreshold: 2,
      ask: overrideAsk,
    });
    expect(overrideAsk).toHaveBeenCalledOnce();
    expect(overridden).toMatchObject({ decision: 'deny', decidedBy: 'user', risks: ['bulk'] });

    // The risk set survives the JSON audit round-trip.
    const persisted = (await repository.listAudit('owner')).map((record) => record.risks);
    expect(persisted.filter((risks) => risks !== undefined)).toEqual([['bulk'], ['bulk']]);
  } finally {
    db.close();
  }
});

it('requires a fresh confirmation for permanent deletion even in full auto', async () => {
  const db = createLocalAgentSqlite();
  const repository = new PermissionPowerSyncRepository(db);
  try {
    await repository.saveSettings('owner', {
      preset: 'full_auto',
      agentPresets: {},
      revision: 1,
    });
    await repository.saveRule('owner', {
      id: 'allow-goal-delete',
      agentId: null,
      object: 'goal',
      action: 'delete',
      effect: 'allow',
      source: 'user',
    });
    const unanswered = await authorize(repository, {
      owner: 'owner',
      agentId: 'codex',
      operationId: 'goal.delete_permanent',
    });
    expect(unanswered).toMatchObject({
      decision: 'ask',
      decidedBy: 'preset',
      risks: ['delete_permanent'],
    });
    const confirmed = await authorize(repository, {
      owner: 'owner',
      agentId: 'codex',
      operationId: 'goal.delete_permanent',
      ask: async () => 'allow',
    });
    expect(confirmed).toMatchObject({ decision: 'allow', decidedBy: 'user' });
    // Ordinary recoverable deletes stay fully automatic in full auto.
    const ordinary = await authorize(repository, {
      owner: 'owner',
      agentId: 'codex',
      operationId: 'goal.delete',
    });
    expect(ordinary).toMatchObject({ decision: 'allow', decidedBy: 'rule' });
    expect(ordinary).not.toHaveProperty('risks');
  } finally {
    db.close();
  }
});
