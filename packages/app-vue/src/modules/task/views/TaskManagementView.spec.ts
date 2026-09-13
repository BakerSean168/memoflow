import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'TaskManagementView.vue'), 'utf8');

describe('TaskManagementView occurrence-first surface', () => {
  it('defaults to Today and keeps Upcoming occurrences separate from long-lived plans', () => {
    expect(source).toContain("ref<(typeof surfaces)[number]>('today')");
    expect(source).toContain("const surfaces = ['today', 'upcoming', 'plans'] as const");
    expect(source).toContain('data-testid="task-occurrence-list"');
    expect(source).toContain('data-testid="task-plan-list"');
    expect(source).toContain('isTaskOccurrenceOnSurface');
  });

  it('filters occurrences by title/labels/status/Goal and sorts without reintroducing graph mode', () => {
    for (const selector of [
      'task-search-input',
      'task-status-filter',
      'task-label-filter',
      'task-goal-filter',
      'task-occurrence-sort',
    ]) {
      expect(source).toContain(selector);
    }
    expect(source).toContain('templateMatchesFilters');
    expect(source).toContain('sortTaskOccurrences');
    for (const retired of ['TaskDAG', 'DependencyManager', 'CriticalPath', 'graph mode']) {
      expect(source).not.toContain(retired);
    }
  });

  it('uses the shared plan editor and authoritative occurrence commands', () => {
    expect(source).toContain('<TaskPlanDialog');
    expect(source).toContain('@save="handleSubmit"');
    for (const operation of [
      'completeOccurrence',
      'uncompleteOccurrence',
      'markOccurrenceMissed',
      'skipOccurrence',
    ]) {
      expect(source).toContain(operation);
    }
  });

  it('aliases occurrence mutations before local wrappers to prevent self-recursion', () => {
    for (const alias of [
      'completeOccurrenceMutation',
      'uncompleteOccurrenceMutation',
      'markOccurrenceMissedMutation',
      'skipOccurrenceMutation',
      'setOccurrenceChecklistItemMutation',
    ]) {
      expect(source).toContain(alias);
    }
    expect(source).toContain('runOccurrenceAction(id, completeOccurrenceMutation)');
    expect(source).toContain('runOccurrenceAction(occurrenceId, (id) =>');
    expect(source).toContain('setOccurrenceChecklistItemMutation(id,');
    expect(source).not.toContain('runOccurrenceAction(id, completeOccurrence)');
    expect(source).not.toContain('runOccurrenceAction(id, uncompleteOccurrence)');
    expect(source).not.toContain('runOccurrenceAction(id, markOccurrenceMissed)');
    expect(source).not.toContain('runOccurrenceAction(id, skipOccurrence)');
  });
});
