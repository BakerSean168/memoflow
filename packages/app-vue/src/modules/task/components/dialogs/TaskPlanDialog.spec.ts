import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve(__dirname, 'TaskPlanDialog.vue'), 'utf8');

describe('TaskPlanDialog vNext', () => {
  it('uses flat Task plan form without DAG controls', () => {
    expect(source).toContain('TaskPlanForm');
    for (const retired of ['DependencyManager', 'parentTaskId', 'folderId', 'TaskForDAG']) {
      expect(source).not.toContain(retired);
    }
  });

  it('uses canonical occurrence statistics for blank, copy, and update-impact drafts', () => {
    expect(source).toContain('futurePendingOccurrenceCount');
    expect(source).toContain('occurrenceCount: 0');
    expect(source).toContain('completedOccurrenceCount: 0');
    expect(source).toContain('pendingOccurrenceCount: 0');
  });
});
