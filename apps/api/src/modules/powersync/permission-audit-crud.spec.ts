import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { executeCrudBatch } from './crud-executor.js';

function database() {
  const aiPermissionRule = {
    upsert: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    deleteMany: vi.fn().mockResolvedValue(undefined),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const aiPermissionSetting = { ...aiPermissionRule };
  const aiPermissionAudit = {
    upsert: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    deleteMany: vi.fn().mockResolvedValue(undefined),
    findFirst: vi.fn().mockResolvedValue({
      recordJson: JSON.stringify({
        id: 'event',
        decision: 'allow',
        execution: 'not_started',
      }),
    }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  return {
    aiPermissionRule,
    aiPermissionSetting,
    aiPermissionAudit,
    async $transaction<T>(
      callback: (tx: {
        aiPermissionAudit: typeof aiPermissionAudit;
        aiPermissionRule: typeof aiPermissionRule;
        aiPermissionSetting: typeof aiPermissionSetting;
      }) => Promise<T>,
    ) {
      return callback({
        aiPermissionAudit,
        aiPermissionRule,
        aiPermissionSetting,
      });
    },
  };
}

const auditId = `${createHash('sha256').update('owner').digest('hex')}:audit:event`;

describe('permission audit PowerSync writes', () => {
  it('creates immutable events and only permits the execution result transition', async () => {
    const db = database();
    await executeCrudBatch(db, 'owner', [
      {
        ops: [
          {
            op: 'PUT',
            type: 'ai_permission_audit',
            id: auditId,
            data: {
              occurred_at: '2026-10-31T00:00:00.000Z',
              record_json: JSON.stringify({
                id: 'event',
                decision: 'allow',
                execution: 'not_started',
              }),
            },
          },
        ],
      },
    ]);
    expect(db.aiPermissionAudit.upsert).toHaveBeenCalledWith({
      where: { id: auditId },
      create: expect.objectContaining({ id: auditId, identityId: 'owner' }),
      update: {},
    });

    await executeCrudBatch(db, 'owner', [
      {
        ops: [
          {
            op: 'PATCH',
            type: 'ai_permission_audit',
            id: auditId,
            data: {
              record_json: JSON.stringify({
                id: 'event',
                decision: 'allow',
                execution: 'succeeded',
              }),
            },
          },
        ],
      },
    ]);
    expect(db.aiPermissionAudit.updateMany).toHaveBeenCalledWith({
      where: {
        id: auditId,
        identityId: 'owner',
        recordJson: JSON.stringify({
          id: 'event',
          decision: 'allow',
          execution: 'not_started',
        }),
      },
      data: {
        recordJson: JSON.stringify({
          id: 'event',
          decision: 'allow',
          execution: 'succeeded',
        }),
      },
    });
  });

  it('rejects attempts to alter an authorization decision or delete its audit row', async () => {
    const db = database();
    await expect(
      executeCrudBatch(db, 'owner', [
        {
          ops: [
            {
              op: 'PATCH',
              type: 'ai_permission_audit',
              id: auditId,
              data: {
                record_json: JSON.stringify({
                  id: 'event',
                  decision: 'deny',
                  execution: 'succeeded',
                }),
              },
            },
          ],
        },
      ]),
    ).rejects.toThrow(/execution transition is invalid/);
    await expect(
      executeCrudBatch(db, 'owner', [
        { ops: [{ op: 'DELETE', type: 'ai_permission_audit', id: auditId }] },
      ]),
    ).rejects.toThrow(/append-only/);
  });

  it('rejects cross-owner rule ids before touching storage', async () => {
    const db = database();
    await expect(
      executeCrudBatch(db, 'owner', [
        {
          ops: [
            {
              op: 'PUT',
              type: 'ai_permission_rules',
              id: 'foreign:rule:deny',
              data: { record_json: '{}' },
            },
          ],
        },
      ]),
    ).rejects.toThrow(/not owner scoped/);
  });

  it('writes only owner-keyed rule and settings rows with the authenticated identity', async () => {
    const db = database();
    const ownerKey = createHash('sha256').update('owner').digest('hex');
    await executeCrudBatch(db, 'owner', [
      {
        ops: [
          {
            op: 'PUT',
            type: 'ai_permission_rules',
            id: `${ownerKey}:rule:task-deny`,
            data: {
              agent_id: null,
              record_json: '{"id":"task-deny"}',
            },
          },
        ],
      },
    ]);
    expect(db.aiPermissionRule.createMany).toHaveBeenCalledWith({
      data: {
        id: `${ownerKey}:rule:task-deny`,
        agentId: null,
        recordJson: '{"id":"task-deny"}',
        identityId: 'owner',
      },
      skipDuplicates: true,
    });
    expect(db.aiPermissionRule.updateMany).toHaveBeenCalledWith({
      where: { id: `${ownerKey}:rule:task-deny`, identityId: 'owner' },
      data: {
        id: `${ownerKey}:rule:task-deny`,
        agentId: null,
        recordJson: '{"id":"task-deny"}',
        identityId: 'owner',
      },
    });
  });

  it('keeps identity and row ID out of owner scoped patches', async () => {
    const db = database();
    const ownerKey = createHash('sha256').update('owner').digest('hex');
    await executeCrudBatch(db, 'owner', [
      {
        ops: [
          {
            op: 'PATCH',
            type: 'ai_permission_rules',
            id: `${ownerKey}:rule:task-deny`,
            data: {
              id: 'foreign-row',
              identity_id: 'foreign-owner',
              record_json: '{"id":"task-deny","effect":"deny"}',
            },
          },
        ],
      },
    ]);
    expect(db.aiPermissionRule.updateMany).toHaveBeenCalledWith({
      where: { id: `${ownerKey}:rule:task-deny`, identityId: 'owner' },
      data: { recordJson: '{"id":"task-deny","effect":"deny"}' },
    });
  });
});
