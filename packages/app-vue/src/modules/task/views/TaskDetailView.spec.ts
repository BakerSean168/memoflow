import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'TaskDetailView.vue'), 'utf8');

describe('TaskDetailView occurrence correction and plan settings', () => {
  it('shows plan-owned recurrence, scheduling, reminders, and Goal binding through one editor', () => {
    expect(source).toContain('data-testid="task-plan-workspace"');
    expect(source).toContain('data-testid="task-plan-workspace-properties"');
    expect(source).toContain('recurrenceBoundaryText');
    expect(source).toContain('scheduleText');
    expect(source).toContain('reminderText');
    expect(source).toContain('goalBindingText');
    expect(source).toContain('<TaskPlanDialog');
    expect(source).toContain('@save="saveEdit"');
  });

  it('shows workspace occurrences and correction commands without inventing bounded positions', () => {
    expect(source).toContain('data-testid="task-detail-occurrences"');
    expect(source).toContain('<TaskOccurrenceRow');
    expect(source).toContain('executionSummary');
    expect(source).toContain('linkedNotes');
    expect(source).not.toContain('fetchInstances({ page: 1, limit: 500 })');
    expect(source).not.toContain('getTaskOccurrencePosition');
    for (const operation of [
      'completeInstance',
      'uncompleteInstance',
      'markInstanceMissed',
      'skipInstance',
      'setChecklistItem',
    ]) {
      expect(source).toContain(operation);
    }
    expect(source).toContain('refetchWorkspace');
  });

  it('does not resurrect dependency or graph state', () => {
    for (const retired of ['TaskDependency', 'CriticalPath', 'parentTaskId', 'dependencyStatus']) {
      expect(source).not.toContain(retired);
    }
  });
});
