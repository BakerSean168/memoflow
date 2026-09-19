import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import { Rule } from '../../domain/aggregates/rule';
import { RuleRevision } from '../../domain/entities/rule-revision';
import { ChangeType } from '../../domain/value-objects/change-type';
import { Language } from '../../domain/value-objects/language';
import { RuleSeverity } from '../../domain/value-objects/rule-severity';
import { RuleStatus } from '../../domain/value-objects/rule-status';
import { RulePrismaRepository } from '../adapters/prisma/rule-prisma.repository';
import { RulePrismaMapper } from '../adapters/prisma/mappers/rule-prisma.mapper';
import { RuleRevisionPrismaMapper } from '../adapters/prisma/mappers/rule-revision-prisma.mapper';
import { PowerSyncRuleRepository } from '../adapters/powersync/rule-powersync.repository';
import { PowerSyncRuleMapper } from '../adapters/powersync/mappers/powersync-rule.mapper';
import { PowerSyncRuleRevisionMapper } from '../adapters/powersync/mappers/powersync-rule-revision.mapper';

/**
 * GOV-1901 persistence parity gate.
 *
 * Governance is the executable reference feature, so Prisma (API) and PowerSync
 * (Desktop) must preserve the same domain state and search semantics. This test
 * intentionally compares the two real mappers/repositories rather than only
 * checking that their TypeScript Port shapes happen to match.
 */
describe('Governance Prisma / PowerSync behavioral parity (GOV-1901)', () => {
  it('round-trips the same Rule and RuleRevision domain state through both persistence mappers', () => {
    const created = Rule.create({
      code: 'ARCH-1901',
      title: 'Reference persistence parity',
      description: 'Prisma and PowerSync must restore the same governance domain state.',
      severity: RuleSeverity.Recommended,
      tags: ['Architecture', 'Reference Module'],
      goodExamples: [{ language: Language.TypeScript, content: 'port.execute(command);' }],
      badExamples: [{ language: Language.TypeScript, content: 'adapter.deepImport();' }],
      liveReferenceLocation: 'packages/governance',
      authorId: 'identity-gov-1901' as never,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const rule = created.data;

    const prismaPersistence = RulePrismaMapper.toPersistence(rule);
    const prismaRoundTrip = RulePrismaMapper.toDomain({
      ...prismaPersistence,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    });
    const powerSyncRoundTrip = PowerSyncRuleMapper.toDomain(
      PowerSyncRuleMapper.toPersistence(rule),
    );

    expect(prismaRoundTrip.toClientDTO()).toEqual(rule.toClientDTO());
    expect(powerSyncRoundTrip.toClientDTO()).toEqual(rule.toClientDTO());

    const revisionResult = RuleRevision.create({
      ruleId: rule.id,
      revisionNumber: 1,
      authorId: rule.authorId,
      changedFields: ['title'],
      previousValues: { title: 'Old title' },
      newValues: { title: rule.title },
      changeType: ChangeType.Updated,
    });
    expect(revisionResult.ok).toBe(true);
    if (!revisionResult.ok) return;
    const revision = revisionResult.data;

    const prismaRevisionRoundTrip = RuleRevisionPrismaMapper.toDomain(
      RuleRevisionPrismaMapper.toPersistence(revision),
    );
    const powerSyncRevisionRoundTrip = PowerSyncRuleRevisionMapper.toDomain(
      PowerSyncRuleRevisionMapper.toPersistence(revision),
    );

    expect(prismaRevisionRoundTrip.toClientDTO()).toEqual(revision.toClientDTO());
    expect(powerSyncRevisionRoundTrip.toClientDTO()).toEqual(revision.toClientDTO());
  });

  it('searches code, title, description and tags on both adapters with equivalent filters', async () => {
    const prismaFindMany = vi.fn(async () => []);
    const prisma = {
      rule: { findMany: prismaFindMany },
    } as unknown as PrismaClient;

    const powerSyncGetAll = vi.fn(async () => []);
    const powerSyncDb = {
      getAll: powerSyncGetAll,
    } as unknown as IElectronDatabase;

    const filter = {
      status: RuleStatus.Active,
      severity: RuleSeverity.Recommended,
      tags: ['architecture'],
    };

    await new RulePrismaRepository(prisma).search('OwNeRsHiP', filter);
    await new PowerSyncRuleRepository(powerSyncDb).search('OwNeRsHiP', filter);

    expect(prismaFindMany).toHaveBeenCalledTimes(1);
    const prismaArgs = prismaFindMany.mock.calls[0]?.[0] as {
      where: {
        AND: Array<{ OR: Array<Record<string, unknown>> }>;
        status: string;
        severity: string;
      };
    };
    expect(prismaArgs.where.status).toBe(RuleStatus.Active);
    expect(prismaArgs.where.severity).toBe(RuleSeverity.Recommended);
    expect(prismaArgs.where.AND[0]?.OR).toEqual(
      expect.arrayContaining([
        { code: { contains: 'OwNeRsHiP', mode: 'insensitive' } },
        { title: { contains: 'OwNeRsHiP', mode: 'insensitive' } },
        { description: { contains: 'OwNeRsHiP', mode: 'insensitive' } },
        { tags: { contains: 'OwNeRsHiP', mode: 'insensitive' } },
      ]),
    );
    expect(prismaArgs.where.AND[1]?.OR).toEqual(
      expect.arrayContaining([{ tags: { contains: '"architecture"' } }]),
    );

    expect(powerSyncGetAll).toHaveBeenCalledTimes(1);
    const [sql, params] = powerSyncGetAll.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('(code LIKE ? OR title LIKE ? OR description LIKE ? OR tags LIKE ?)');
    expect(sql).toContain('status = ?');
    expect(sql).toContain('severity = ?');
    expect(sql).toContain("tags LIKE ? ESCAPE '\\'");
    expect(params.slice(0, 4)).toEqual(Array(4).fill('%OwNeRsHiP%'));
    expect(params).toContain(RuleStatus.Active);
    expect(params).toContain(RuleSeverity.Recommended);
    expect(params).toContain('%"architecture"%');
  });

  it('short-circuits blank search without touching either persistence engine', async () => {
    const prismaFindMany = vi.fn(async () => []);
    const powerSyncGetAll = vi.fn(async () => []);
    const prisma = { rule: { findMany: prismaFindMany } } as unknown as PrismaClient;
    const powerSyncDb = { getAll: powerSyncGetAll } as unknown as IElectronDatabase;

    await expect(new RulePrismaRepository(prisma).search('   ')).resolves.toEqual([]);
    await expect(new PowerSyncRuleRepository(powerSyncDb).search('   ')).resolves.toEqual([]);
    expect(prismaFindMany).not.toHaveBeenCalled();
    expect(powerSyncGetAll).not.toHaveBeenCalled();
  });
});
