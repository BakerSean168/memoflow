import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'TaskManagementView.vue'), 'utf8');
const toolbarSource = readFileSync(resolve(__dirname, '../components/TaskPageToolbar.vue'), 'utf8');

describe('TaskManagementView occurrence-first surface', () => {
  it('defaults to Today and keeps Upcoming occurrences separate from long-lived plans', () => {
    expect(source).toContain("type TaskSurface = 'today' | 'upcoming' | 'plans'");
    expect(source).toContain("ref<TaskSurface>('today')");
    expect(source).toContain('data-testid="task-occurrence-list"');
    expect(source).toContain('data-testid="task-plan-list"');
    expect(source).toContain('<TaskPlanRow');
    expect(source).toContain('task-plan-list-column-header');
    expect(source).not.toContain('task-plan-card');
    expect(source).not.toContain('openEditDialog');
    expect(source).not.toContain("ref<'create' | 'edit'>");
    expect(source).not.toContain('updatePlanSafe');
    expect(source).toContain('mode="create"');
    expect(source).toContain('isTaskOccurrenceOnSurface');
  });

  it('keeps category/filter/sort/create controls in one Goal-style toolbar', () => {
    expect(source).toContain('<TaskPageToolbar');
    expect(source).not.toContain('<ModuleHeader');
    for (const selector of [
      'task-surface-trigger',
      'task-status-filter',
      'task-label-filter',
      'task-compact-view-options',
      'task-occurrence-sort',
    ]) {
      expect(toolbarSource).toContain(selector);
    }
    expect(toolbarSource).toContain('data-primary-action="create-task"');
    expect(toolbarSource).toContain('<ResponsivePrimaryAction');
    expect(toolbarSource).toContain('<LabelFilterPopover');
    expect(toolbarSource).not.toContain('task-goal-filter');
    expect(toolbarSource).not.toContain('goalFilter');
    expect(source).not.toContain('goalFilter');
    expect(toolbarSource).not.toContain('task-search-input');
    expect(source).toContain('templateMatchesFilters');
    expect(source).toContain('sortTaskOccurrences');
    for (const retired of ['TaskDAG', 'DependencyManager', 'CriticalPath', 'graph mode']) {
      expect(source).not.toContain(retired);
    }
  });

  it('accepts a create-and-bind intent without turning it into a persistent Goal filter', () => {
    expect(source).toContain('route.query.createGoalId');
    expect(source).toContain('openBoundTaskCreateDialog');
    expect(source).toContain(':initial-goal-binding="createInitialGoalBinding"');
    expect(source).toContain("void router.replace({ name: 'task-list' })");
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
