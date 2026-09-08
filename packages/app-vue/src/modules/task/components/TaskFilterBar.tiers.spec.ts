import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '../views/TaskManagementView.vue'), 'utf8');

describe('Task occurrence filters', () => {
  it('keeps one canonical filter row across panel tiers', () => {
    expect(source.match(/data-testid="task-filter-bar"/g)).toHaveLength(1);
    for (const selector of [
      'task-search-input',
      'task-status-filter',
      'task-label-filter',
      'task-goal-filter',
      'task-occurrence-sort',
    ]) {
      expect(source).toContain(selector);
    }
    expect(source).toContain('data-primary-action="create-task"');
    expect(source).not.toContain('TaskDAG');
    expect(source).not.toContain('usePanelWidth');
  });
});
