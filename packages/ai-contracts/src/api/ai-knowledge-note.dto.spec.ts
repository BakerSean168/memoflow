import { describe, expect, it } from 'vitest';
import {
  CreateKnowledgeNoteSchema,
  KnowledgeNoteTargetSubpathSchema,
} from './ai-knowledge-note.dto';

describe('knowledge note target path contract', () => {
  const confirmation = {
    proposalId: 'proposal-1',
    revision: 1,
    requestId: 'request-1',
  };

  it('normalizes a proposal-owned vault-relative subpath', () => {
    expect(KnowledgeNoteTargetSubpathSchema.parse(' Research\\ TypeScript / ')).toBe(
      'Research/TypeScript',
    );
  });

  it.each(['/private', 'C:\\private', '../private', 'notes/../../private'])(
    'rejects paths outside the vault boundary: %s',
    (targetSubpath) => {
      expect(
        CreateKnowledgeNoteSchema.safeParse({
          topic: 'Safe path proposal',
          targetSubpath,
          confirmation,
        }).success,
      ).toBe(false);
    },
  );

  it('does not require a hidden user-level default path', () => {
    expect(
      CreateKnowledgeNoteSchema.parse({ topic: 'Proposal chooses its path', confirmation }),
    ).toEqual({ topic: 'Proposal chooses its path', confirmation });
  });

  it('rejects persistence commands without explicit proposal confirmation', () => {
    expect(CreateKnowledgeNoteSchema.safeParse({ topic: 'Unconfirmed note' }).success).toBe(false);
  });
});
