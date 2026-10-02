import { describe, expect, it } from 'vitest';
import {
  KnowledgeCaptureSourceSchema,
  KnowledgeCaptureDecisionSchema,
  KnowledgeNoteDraftContentSchema,
} from './ai-knowledge-capture-workflow.dto';
describe('Knowledge capture owner source boundary', () => {
  it('accepts only host-neutral repository or local Vault references', () => {
    expect(
      KnowledgeCaptureSourceSchema.parse({ kind: 'repository', connectionId: 'binding' }),
    ).toEqual({ kind: 'repository', connectionId: 'binding' });
    expect(KnowledgeCaptureSourceSchema.parse({ kind: 'local_vault' })).toEqual({
      kind: 'local_vault',
    });
    for (const value of [
      { kind: 'repository', connectionId: '' },
      { kind: 'local_vault', rootPath: '/vault' },
      { kind: 'other' },
    ]) {
      expect(KnowledgeCaptureSourceSchema.safeParse(value).success).toBe(false);
    }
  });
  it('rejects planner-selected persistence sources and absolute paths', () => {
    const candidateDraft = {
      title: 'Note',
      topic: 'Topic',
      markdown: '# Note',
      targetSubpath: 'notes/note.md',
      tags: [],
      duplicateRisk: '',
    };
    expect(
      KnowledgeCaptureDecisionSchema.safeParse({
        status: 'draft_ready',
        reason: 'Ready',
        candidateDraft: { ...candidateDraft, source: { kind: 'local_vault' } },
      }).success,
    ).toBe(false);
    for (const targetSubpath of ['/vault/note.md', 'C:\\vault\\note.md', '\\\\server\\note.md']) {
      expect(
        KnowledgeNoteDraftContentSchema.safeParse({ ...candidateDraft, targetSubpath }).success,
      ).toBe(false);
    }
  });
});
