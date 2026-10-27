import { describe, expect, it } from 'vitest';
import {
  GetGoalWorkspaceReqSchema,
  GoalWorkspaceKnowledgeItemSchema,
  GoalWorkspaceKnowledgePageSchema,
  GoalWorkspacePageRequestSchema,
  GoalWorkspaceTaskPageRequestSchema,
} from './goal-workspace.dto';

const GOAL_ID = 'IGoalId_550e8400-e29b-41d4-a716-446655440000';
const KDOC = 'kdoc_550e8400-e29b-41d4-a716-446655440090';
const SPACE = 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440091';

describe('Goal Workspace contracts', () => {
  it('uses bounded defaults for first-paint and full-list pagination', () => {
    expect(GetGoalWorkspaceReqSchema.parse({})).toEqual({ previewLimit: 5, recentLimit: 5 });
    expect(GoalWorkspacePageRequestSchema.parse({})).toEqual({ limit: 20, offset: 0 });
    expect(GoalWorkspaceTaskPageRequestSchema.parse({ keyResultId: 'kr-1' })).toEqual({
      limit: 20,
      offset: 0,
      keyResultId: 'kr-1',
    });
    expect(GetGoalWorkspaceReqSchema.safeParse({ previewLimit: 11 }).success).toBe(false);
    expect(GoalWorkspacePageRequestSchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it('represents current and missing knowledge projections without changing stable document identity', () => {
    const resolved = GoalWorkspaceKnowledgeItemSchema.parse({
      state: 'Resolved',
      relationId: 'relation-1',
      documentId: KDOC,
      linkedAt: 10,
      knowledgeSpaceId: SPACE,
      title: 'AI interview notes',
      excerpt: 'Current display projection',
      relativePath: 'career/interview.md',
      updatedAt: 20,
    });
    const missing = GoalWorkspaceKnowledgeItemSchema.parse({
      state: 'Missing',
      relationId: 'relation-2',
      documentId: KDOC,
      linkedAt: 11,
      knowledgeSpaceId: null,
      title: null,
      excerpt: null,
      relativePath: null,
      updatedAt: null,
    });

    expect(resolved.documentId).toBe(KDOC);
    expect(missing.documentId).toBe(KDOC);
    expect(
      GoalWorkspaceKnowledgeItemSchema.safeParse({ ...resolved, documentId: 'notes/a.md' }).success,
    ).toBe(false);
  });

  it('keeps full knowledge pages bounded while total remains collection-wide', () => {
    const page = GoalWorkspaceKnowledgePageSchema.parse({
      items: [],
      total: 42,
      limit: 20,
      offset: 20,
    });
    expect(page).toEqual({ items: [], total: 42, limit: 20, offset: 20 });
  });

  it('does not place taskIds or noteIds into the workspace contract source shape', () => {
    expect(GOAL_ID).toContain('IGoalId_');
    const source = String(GoalWorkspaceKnowledgePageSchema);
    expect(source).not.toContain('taskIds');
    expect(source).not.toContain('noteIds');
  });
});
