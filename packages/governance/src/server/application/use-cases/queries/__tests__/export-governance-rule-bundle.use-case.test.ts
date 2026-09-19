import { describe, expect, it, vi } from 'vitest';
import { ChangeType, Language, RuleStatus } from '@memoflow/contracts/governance';
import type { IRuleRepository, IRuleRevisionRepository } from '../../../../domain';
import { Rule } from '../../../../domain/aggregates/rule';
import { RuleRevision } from '../../../../domain/entities/rule-revision';
import { RuleSeverity } from '../../../../domain/value-objects/rule-severity';
import { ExportGovernanceRuleBundleUseCase } from '../export-governance-rule-bundle.use-case';

function createRule(code: string, tags: string[]) {
  const result = Rule.create({
    code,
    title: `${code} title`,
    description: `${code} deterministic published rule bundle test description.`,
    severity: RuleSeverity.Recommended,
    tags,
    goodExamples: [
      { language: Language.TypeScript, content: `const ${code.replace('-', '_')} = true;` },
    ],
    badExamples: [
      { language: Language.TypeScript, content: `const ${code.replace('-', '_')} = false;` },
    ],
    liveReferenceLocation: `tools/governance/${code.toLowerCase()}.mjs`,
    authorId: '00000000-0000-4000-8000-000000000002' as never,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function createRevision(rule: Rule, revisionNumber: number, changedFields: string[]) {
  const result = RuleRevision.create({
    ruleId: rule.id,
    revisionNumber,
    authorId: rule.authorId,
    changedFields,
    previousValues: { z: revisionNumber - 1, a: { z: false, a: true } },
    newValues: { z: revisionNumber, a: { z: true, a: false } },
    changeType: revisionNumber === 1 ? ChangeType.Created : ChangeType.Updated,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function repositorySet(rules: Rule[], revisions: Map<string, RuleRevision[]>) {
  const save = vi.fn(async () => undefined);
  const saveWithRevision = vi.fn(async () => undefined);
  const deleteRule = vi.fn(async () => undefined);
  const saveRevision = vi.fn(async () => undefined);

  const ruleRepository: IRuleRepository = {
    save,
    saveWithRevision,
    findById: vi.fn(async () => null),
    findByCode: vi.fn(async () => null),
    findAll: vi.fn(async (filter) => {
      expect(filter).toEqual({ status: RuleStatus.Active });
      return rules;
    }),
    search: vi.fn(async () => []),
    delete: deleteRule,
    exists: vi.fn(async () => false),
  };
  const revisionRepository: IRuleRevisionRepository = {
    save: saveRevision,
    findByRuleId: vi.fn(async (ruleId) => revisions.get(String(ruleId)) ?? []),
    findByRuleIdAndNumber: vi.fn(async () => null),
    countByRuleId: vi.fn(async () => 0),
  };

  return {
    ruleRepository,
    revisionRepository,
    writeSpies: [save, saveWithRevision, deleteRule, saveRevision],
  };
}

describe('ExportGovernanceRuleBundleUseCase (GOV-1903)', () => {
  it('produces the same semantic bundle/hash across repository and revision ordering', async () => {
    const ruleA = createRule('ARCH-200', ['zeta', 'architecture', 'alpha']);
    const ruleB = createRule('DDD-100', ['ddd', 'contracts']);
    expect(ruleA.activate().ok).toBe(true);
    expect(ruleB.activate().ok).toBe(true);

    const a1 = createRevision(ruleA, 1, ['title', 'code']);
    const a2 = createRevision(ruleA, 2, ['tags', 'description']);
    const b1 = createRevision(ruleB, 1, ['status', 'code']);

    const forward = repositorySet(
      [ruleB, ruleA],
      new Map([
        [String(ruleA.id), [a2, a1]],
        [String(ruleB.id), [b1]],
      ]),
    );
    const reverse = repositorySet(
      [ruleA, ruleB],
      new Map([
        [String(ruleA.id), [a1, a2]],
        [String(ruleB.id), [b1]],
      ]),
    );

    const first = await new ExportGovernanceRuleBundleUseCase(
      forward.ruleRepository,
      forward.revisionRepository,
    ).execute();
    const second = await new ExportGovernanceRuleBundleUseCase(
      reverse.ruleRepository,
      reverse.revisionRepository,
    ).execute();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.data).toEqual(first.data);
    expect(first.data.semanticHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.data.rules.map((rule) => rule.code)).toEqual(['ARCH-200', 'DDD-100']);
    expect(first.data.rules[0]?.tags).toEqual(['alpha', 'architecture', 'zeta']);
    expect(first.data.rules[0]?.provenance).toMatchObject({
      revisionCount: 2,
      latestRevision: {
        revisionNumber: 2,
        changeType: ChangeType.Updated,
        changedFields: ['description', 'tags'],
      },
    });
    expect(first.data.rules[0]?.engineering).toEqual({
      ruleKey: 'ARCH-200',
      severity: RuleSeverity.Recommended,
      tags: ['alpha', 'architecture', 'zeta'],
      referencePath: 'tools/governance/arch-200.mjs',
    });
    for (const spy of [...forward.writeSpies, ...reverse.writeSpies]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('supports Active rules without historical revisions without inventing provenance', async () => {
    const seedLikeRule = createRule('DDD-001', ['seed', 'ddd']);
    expect(seedLikeRule.activate().ok).toBe(true);
    const repositories = repositorySet([seedLikeRule], new Map());

    const result = await new ExportGovernanceRuleBundleUseCase(
      repositories.ruleRepository,
      repositories.revisionRepository,
    ).execute();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rules).toHaveLength(1);
    expect(result.data.rules[0]?.provenance.revisionCount).toBe(0);
    expect(result.data.rules[0]?.provenance.latestRevision).toBeNull();
  });

  it('changes the semantic hash when the published Active rule state changes', async () => {
    const rule = createRule('ARCH-201', ['architecture']);
    expect(rule.activate().ok).toBe(true);
    const revision = createRevision(rule, 1, ['code']);
    const repositories = repositorySet([rule], new Map([[String(rule.id), [revision]]]));
    const useCase = new ExportGovernanceRuleBundleUseCase(
      repositories.ruleRepository,
      repositories.revisionRepository,
    );

    const before = await useCase.execute();
    expect(rule.update({ title: 'Changed published rule title' }).ok).toBe(true);
    const after = await useCase.execute();

    expect(before.ok).toBe(true);
    expect(after.ok).toBe(true);
    if (!before.ok || !after.ok) return;
    expect(after.data.semanticHash).not.toBe(before.data.semanticHash);
  });
});
