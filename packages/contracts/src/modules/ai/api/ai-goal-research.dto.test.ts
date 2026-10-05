import { describe, expect, it } from 'vitest';
import { GoalResearchEvidenceSchema, GoalResearchSourceSchema } from './ai-goal-research.dto';

describe('Goal external research evidence contract', () => {
  it('accepts bounded external evidence with HTTP(S) provenance', () => {
    expect(
      GoalResearchEvidenceSchema.safeParse({
        query: 'Official admissions timeline',
        intent: 'timeline',
        summary: 'The official page lists the current milestones.',
        sources: [{ title: 'Official source', url: 'https://example.edu/admissions' }],
        trust: 'external_untrusted',
        provenance: 'external',
      }).success,
    ).toBe(true);
  });

  it('rejects executable or credential-bearing citation URLs', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hello',
      'https://user:secret@example.edu/private',
    ]) {
      expect(GoalResearchSourceSchema.safeParse({ title: 'Unsafe', url }).success).toBe(false);
    }
  });
});
