import { expect, it, vi } from 'vitest';
import { PermissionPrismaRepository } from './permission-prisma.repository';
import { authorize, executeAuthorized } from './authorize';

function fixture() {
  const db = {
    aiPermissionSetting: { findFirst: vi.fn(async () => null), upsert: vi.fn() },
    aiPermissionRule: { findMany: vi.fn(async () => []), upsert: vi.fn(), deleteMany: vi.fn() },
    aiPermissionAudit: {
      create: vi.fn(),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(),
    },
  };
  return { db, repository: new PermissionPrismaRepository(db as never) };
}

it('queries only the authenticated owner and persists validated records with owner-separated ids', async () => {
  const { db, repository } = fixture();
  await repository.saveSettings('owner-a', { preset: 'on_demand', agentPresets: {}, revision: 1 });
  await repository.saveSettings('owner-b', { preset: 'read_only', agentPresets: {}, revision: 1 });
  expect(db.aiPermissionSetting.upsert.mock.calls[0][0].where.id).not.toBe(
    db.aiPermissionSetting.upsert.mock.calls[1][0].where.id,
  );
  await executeAuthorized(
    repository,
    { owner: 'owner-a', agentId: 'external-mcp:pat', operationId: 'goal.create' },
    async () => 'created',
  );
  expect(db.aiPermissionSetting.findFirst).toHaveBeenCalledWith({
    where: { identityId: 'owner-a' },
  });
  expect(db.aiPermissionRule.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { identityId: 'owner-a' } }),
  );
  const audit = db.aiPermissionAudit.create.mock.calls[0][0].data;
  expect(audit.identityId).toBe('owner-a');
  expect(JSON.parse(audit.recordJson)).toMatchObject({
    agentId: 'external-mcp:pat',
    decision: 'allow',
  });
  await repository.removeRule('owner-b', 'rule');
  expect(db.aiPermissionRule.deleteMany).toHaveBeenCalledWith({
    where: { id: expect.any(String), identityId: 'owner-b' },
  });
  await repository.listAudit('owner-b', 1000);
  expect(db.aiPermissionAudit.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { identityId: 'owner-b' }, take: 500 }),
  );
});

it('falls back on Prisma missing-table errors, while ordinary DB failures block execution', async () => {
  const { db, repository } = fixture();
  db.aiPermissionSetting.findFirst.mockRejectedValue({ code: 'P2021' });
  db.aiPermissionAudit.create.mockRejectedValue({ code: 'P2021' });
  const input = { owner: 'owner-a', agentId: 'external-mcp:pat', operationId: 'goal.create' };
  await expect(executeAuthorized(repository, input, async () => 'created')).resolves.toBe(
    'created',
  );
  expect(await authorize(repository, { ...input, operationId: 'goal.update' })).toMatchObject({
    decision: 'ask',
  });
  db.aiPermissionSetting.findFirst.mockRejectedValue(new Error('connection failed'));
  const work = vi.fn();
  await expect(executeAuthorized(repository, input, work)).rejects.toThrow('connection failed');
  expect(work).not.toHaveBeenCalled();
});

it('does not infer missing permission storage from an arbitrary error message', async () => {
  const { db, repository } = fixture();
  db.aiPermissionSetting.findFirst.mockRejectedValue(
    new Error('no such table: ai_permission_settings'),
  );
  await expect(
    authorize(repository, { owner: 'owner', agentId: 'assistant', operationId: 'goal.create' }),
  ).rejects.toThrow('no such table');
});
