import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { prisma } from '@memoflow/database';
import { IdentityId } from '@memoflow/domain-shared';
import { createAccountPrismaActiveQuery } from '@memoflow/account';
import { createScopedPatService } from '@memoflow/cloud-auth/server';
import {
  cleanAll,
  disconnectPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';

const accountIsActive = createAccountPrismaActiveQuery(prisma);
const audience = 'https://api.memo.test/mcp';
const service = () => createScopedPatService({ database: prisma, audience, accountIsActive });

describe('scoped PAT durable authority', () => {
  beforeEach(async () => {
    await cleanAll();
  });
  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  it('stores only a digest and rechecks audience, revocation and account state', async () => {
    const owner = IdentityId.generate();
    const other = IdentityId.generate();
    await seedAccount({ id: owner });
    await seedAccount({ id: other });
    const issued = await service().create(String(owner), { name: 'private read pilot' });
    const row = await prisma.externalAgentPat.findUniqueOrThrow({ where: { id: issued.id } });
    expect(row.tokenDigest).toBe(createHash('sha256').update(issued.secret).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(issued.secret);
    expect(await service().list(String(other))).toEqual([]);
    expect(await service().authenticate(`Bearer ${issued.secret}`)).toMatchObject({
      identityId: String(owner),
      credentialId: issued.id,
      scopes: ['goals:read'],
    });
    expect(
      await createScopedPatService({
        database: prisma,
        audience: 'https://other.memo.test/mcp',
        accountIsActive,
      }).authenticate(`Bearer ${issued.secret}`),
    ).toBeNull();
    expect(await service().revoke(String(other), issued.id)).toBe(false);
    const closure = await prisma.accountClosureOperation.create({
      data: {
        identityId: String(owner),
        idempotencyKey: 'pat-closure-fixture',
        phase: 'requested',
        status: 'Pending',
      },
    });
    expect(await service().authenticate(`Bearer ${issued.secret}`)).toBeNull();
    await prisma.accountClosureOperation.delete({ where: { id: closure.id } });

    await prisma.cloudAuthUser.update({
      where: { id: String(owner) },
      data: { disabledAt: new Date() },
    });
    expect(await service().authenticate(`Bearer ${issued.secret}`)).toBeNull();
    await prisma.cloudAuthUser.update({ where: { id: String(owner) }, data: { disabledAt: null } });
    await prisma.account.update({ where: { id: String(owner) }, data: { status: 'Closed' } });
    expect(await service().authenticate(`Bearer ${issued.secret}`)).toBeNull();
    await prisma.account.update({ where: { id: String(owner) }, data: { status: 'Active' } });
    await prisma.externalAgentPat.update({
      where: { id: issued.id },
      data: { scopes: ['goals:write'] },
    });
    expect(await service().authenticate(`Bearer ${issued.secret}`)).toBeNull();
    await prisma.externalAgentPat.update({
      where: { id: issued.id },
      data: { scopes: ['goals:read'], expiresAt: new Date(0) },
    });
    expect(await service().authenticate(`Bearer ${issued.secret}`)).toBeNull();
    await prisma.externalAgentPat.update({
      where: { id: issued.id },
      data: { expiresAt: issued.expiresAt },
    });
    expect(await service().revoke(String(owner), issued.id)).toBe(true);
    expect(await service().authenticate(`Bearer ${issued.secret}`)).toBeNull();
  });

  it('enforces a shared quota for parallel calls from independent service instances', async () => {
    const owner = IdentityId.generate();
    await seedAccount({ id: owner });
    const issued = await service().create(String(owner), { name: 'quota fixture' });
    const results = await Promise.all(
      Array.from({ length: 70 }, () => service().consumeReadQuota(issued.id)),
    );
    expect(results.filter(Boolean)).toHaveLength(60);
    expect(
      (await prisma.externalAgentPat.findUniqueOrThrow({ where: { id: issued.id } })).rateCount,
    ).toBe(60);
  });
});
