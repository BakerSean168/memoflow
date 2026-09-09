import { describe, expect, it } from 'vitest';
import { Rule } from '../rule';
import { Language } from '../../value-objects/language';
import { RuleSeverity } from '../../value-objects/rule-severity';

describe('Governance -> Knowledge Standard migration characterization (SYS-0001 / ADR-109)', () => {
  it('freezes every meaningful Rule field that the future migrator must preserve', () => {
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
