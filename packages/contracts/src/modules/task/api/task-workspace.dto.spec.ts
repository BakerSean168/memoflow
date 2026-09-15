import { describe, expect, it } from 'vitest';
import { GetTaskWorkspaceReqSchema, TaskWorkspaceGoalContextSchema, TaskWorkspaceLinkedNoteSchema } from './task-workspace.dto';

describe('Task workspace contract', () => {
  it('defaults and bounds recentLimit and rejects unknown labels', () => {
    expect(GetTaskWorkspaceReqSchema.parse({})).toEqual({ recentLimit: 5 });
    expect(() => GetTaskWorkspaceReqSchema.parse({ recentLimit: 0 })).toThrow();
    expect(() => GetTaskWorkspaceReqSchema.parse({ recentLimit: 21 })).toThrow();
    expect(() => GetTaskWorkspaceReqSchema.parse({ label: 'x' })).toThrow();
  });

  it('preserves goal binding ids in every availability state', () => {
    const goalId = 'IGoalId_550e8400-e29b-41d4-a716-446655440000';
    const keyResultId = 'IKeyResultId_550e8400-e29b-41d4-a716-446655440001';
    expect(TaskWorkspaceGoalContextSchema.parse({ availability: 'Missing', goalId, keyResultId, goal: null, keyResult: null })).toMatchObject({ goalId, keyResultId });
    expect(TaskWorkspaceGoalContextSchema.parse({ availability: 'Unavailable', goalId, keyResultId, goal: null, keyResult: null })).toMatchObject({ goalId, keyResultId });
  });

  it('requires a stable document ref for resolved notes and never path identity', () => {
    const note = TaskWorkspaceLinkedNoteSchema.parse({
      state: 'Resolved', relationId: 'rel-1', documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440000',
      linkedAt: 1, documentRef: { knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440001', documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440000' },
      title: 'Renamed', excerpt: 'text', relativePath: 'new/path.md', updatedAt: 2,
    });
    expect(note.state === 'Resolved' ? note.documentRef.documentId : null).toBe(note.documentId);
    expect(() => TaskWorkspaceLinkedNoteSchema.parse({ ...note, documentRef: undefined })).toThrow();
  });
});
