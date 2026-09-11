import { describe, expect, it } from 'vitest';
import { Rule } from '../rule';
import { Language } from '../../value-objects/language';
import { RuleSeverity } from '../../value-objects/rule-severity';

describe('Governance executable reference-module characterization (SYS-0001 / ADR-110)', () => {
  it('freezes the canonical lifecycle used by the reference feature', () => {
    const created = Rule.create({
      code: 'ARCH-043',
      title: 'Reference lifecycle',
      description: 'The executable reference feature keeps its lifecycle semantics explicit.',
      severity: RuleSeverity.Recommended,
      tags: ['governance'],
      goodExamples: [{ language: Language.TypeScript, content: 'rule.activate();' }],
      badExamples: [{ language: Language.TypeScript, content: 'rule.status = "Active";' }],
      authorId: 'identity-governance-characterization' as never,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const rule = created.data;
    expect(rule.status).toBe('Draft');
    expect(rule.activate().ok).toBe(true);
    expect(rule.status).toBe('Active');
    expect(rule.deprecate('Replaced by a newer reference rule.').ok).toBe(true);
    expect(rule.status).toBe('Deprecated');
    expect(rule.deprecationReason).toBe('Replaced by a newer reference rule.');
    expect(rule.reactivate().ok).toBe(true);
    expect(rule.status).toBe('Active');
    expect(rule.deprecationReason).toBeNull();
  });

  it('freezes the canonical Rule surface that the permanent reference feature must preserve', () => {
    const created = Rule.create({
      code: 'ARCH-042',
      title: 'Keep owner boundaries explicit',
      description: 'Business ownership must remain explicit across module boundaries.',
      severity: RuleSeverity.Recommended,
      tags: ['architecture', 'ownership'],
      goodExamples: [
        {
          language: Language.TypeScript,
          content: 'ownerPort.execute(command);',
          caption: 'Route mutation to the owner module',
        },
      ],
      badExamples: [
        {
          language: Language.TypeScript,
          content: 'projection.mutate(command);',
          caption: 'Do not mutate a read projection',
        },
      ],
      liveReferenceLocation: 'docs/architecture/',
      authorId: 'identity-governance-characterization' as never,
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const dto = created.data.toClientDTO();
    expect(Object.keys(dto).sort()).toEqual(
      [
        'authorId',
        'badExamples',
        'code',
        'createdAt',
        'deprecationReason',
        'description',
        'goodExamples',
        'id',
        'liveReferenceLocation',
        'replacementRuleId',
        'severity',
        'status',
        'tags',
        'title',
        'updatedAt',
      ].sort(),
    );
    expect(dto).toMatchObject({
      code: 'ARCH-042',
      title: 'Keep owner boundaries explicit',
      severity: RuleSeverity.Recommended,
      liveReferenceLocation: 'docs/architecture/',
    });
    expect(dto.tags.map((tag) => tag.value)).toEqual(['architecture', 'ownership']);
    expect(dto.goodExamples[0]).toMatchObject({
      language: Language.TypeScript,
      content: 'ownerPort.execute(command);',
      caption: 'Route mutation to the owner module',
    });
    expect(dto.badExamples[0]).toMatchObject({
      language: Language.TypeScript,
      content: 'projection.mutate(command);',
      caption: 'Do not mutate a read projection',
    });
  });
});
