import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve(__dirname, 'TaskPlanDialog.vue'), 'utf8');

describe('TaskPlanDialog vNext', () => {
  it('uses the same stable workspace dialog shell as Goal', () => {
    expect(source).toContain('TaskPlanForm');
    expect(source).toContain('recipe="workspace"');
    expect(source).not.toContain('content-class="h-[min(88vh,760px)]"');
    for (const retired of ['DependencyManager', 'parentTaskId', 'folderId', 'TaskForDAG']) {
      expect(source).not.toContain(retired);
    }
  });

  it('separates Goal-bound create drafts from generic standalone drafts', () => {
    expect(source).toContain('props.initialGoalBinding?.goalId');
    expect(source).toContain("props.initialGoalBinding.keyResultId ?? 'goal'");
    expect(source).toContain('goalBinding: props.initialGoalBinding');
  });

  it('uses canonical occurrence statistics for blank, copy, and update-impact drafts', () => {
    expect(source).toContain('futurePendingOccurrenceCount');
    expect(source).toContain('occurrenceCount: 0');
    expect(source).toContain('completedOccurrenceCount: 0');
    expect(source).toContain('pendingOccurrenceCount: 0');
  });
});
