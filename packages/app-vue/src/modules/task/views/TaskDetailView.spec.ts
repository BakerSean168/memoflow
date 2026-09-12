import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'TaskDetailView.vue'), 'utf8');

describe('TaskDetailView occurrence correction and plan settings', () => {
  it('shows plan-owned recurrence, scheduling, reminders, and Goal binding through one editor', () => {
    expect(source).toContain('data-testid="task-plan-settings"');
    expect(source).toContain('recurrenceBoundaryText');
    expect(source).toContain('scheduleText');
    expect(source).toContain('reminderText');
    expect(source).toContain('goalBindingText');
    expect(source).toContain('<TaskPlanDialog');
    expect(source).toContain('@save="saveEdit"');
  });

  it('shows generated occurrences with repeat position and correction commands', () => {
    expect(source).toContain('data-testid="task-detail-occurrences"');
    expect(source).toContain('<TaskOccurrenceRow');
    expect(source).toContain('getTaskOccurrencePosition');
    for (const operation of [
      'completeInstance',
      'uncompleteInstance',
      'markInstanceMissed',
      'skipInstance',
    ]) {
      expect(source).toContain(operation);
    }
  });

  it('does not resurrect dependency or graph state', () => {
    for (const retired of ['TaskDependency', 'CriticalPath', 'parentTaskId', 'dependencyStatus']) {
      expect(source).not.toContain(retired);
    }
  });
});
