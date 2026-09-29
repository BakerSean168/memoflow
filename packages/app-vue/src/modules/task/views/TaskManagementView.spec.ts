import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'TaskManagementView.vue'), 'utf8');
const toolbarSource = readFileSync(resolve(__dirname, '../components/TaskPageToolbar.vue'), 'utf8');

describe('TaskManagementView occurrence-first surface', () => {
  it('converges Task Home to Today and Plans, with future browsing delegated to Schedule', () => {
    expect(source).toContain("ref<TaskSurface>('today')");
    expect(source).toContain('data-testid="task-occurrence-list"');
    expect(source).toContain('data-testid="task-plan-list"');
    expect(source).toContain('<TaskPlanRow');
    expect(source).toContain('task-plan-list-column-header');
    expect(source).toContain('isTaskOccurrenceOnTodaySurface');
    expect(source).toContain(':data-testid="`task-occurrence-group-${group.key}`"');
    expect(source).toContain("key: 'overdue' as const");
    expect(source).toContain("key: 'today' as const");
    expect(source).toContain('data-testid="task-open-schedule"');
    expect(source).toContain("name: 'ScheduleCalendar'");
    expect(source).not.toContain("'upcoming'");
    expect(source).not.toContain('emptyUpcoming');
    expect(source).not.toContain('task-plan-card');
    expect(source).not.toContain('openEditDialog');
    expect(source).not.toContain("ref<'create' | 'edit'>");
    expect(source).not.toContain('updatePlanSafe');
    expect(source).toContain('mode="create"');
  });

  it('keeps category/filter/sort/create controls in one Goal-style toolbar', () => {
    expect(source).toContain('<TaskPageToolbar');
    expect(source).not.toContain('<ModuleHeader');
    for (const selector of [
      'task-surface-trigger',
      'task-status-filter',
      'task-plan-state-filter',
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

  it('keeps occurrence and plan-state filters independent across the two surfaces', () => {
    expect(source).toContain(
      "const occurrenceStatusFilter = ref<'all' | TaskOccurrenceClientDTO['status']>('all')",
    );
    expect(source).toContain("const planStateFilter = ref<TaskPlanStateFilter>('all')");
    expect(source).toContain('occurrence.status === occurrenceStatusFilter.value');
    expect(source).toContain('matchesPlanState(template)');
    expect(source).not.toMatch(/filteredPlans[\s\S]{0,500}occurrenceStatusFilter/);
    expect(
      source.slice(
        source.indexOf('const visibleOccurrences'),
        source.indexOf('const occurrenceGroups'),
      ),
    ).not.toContain('planStateFilter');
  });

  it('uses bounded Today reads and a server-scoped Goal/KR plan query without raw ids', () => {
    expect(source).toContain('fetchInstancesByDateRange: fetchOccurrencesByDateRange');
    expect(source).toContain('includeOverdueOpen: true');
    expect(source).toContain('startOfDayMs(now)');
    expect(source).toContain('endOfDayMs(now)');
    expect(source).not.toContain('fetchOccurrencesMutation({ page: 1, limit: 500 })');
    expect(source).not.toContain('limit: 500');
    expect(source).toContain('limit: 100');
    expect(source).toContain('{ keyResultId: queryKeyResultId.value }');
    expect(source).toContain('goalService.getGoal(goalId)');
    expect(source).toContain('goalService.getKeyResults(goalId)');
    expect(source).toContain('scopedGoalName.value');
    expect(source).toContain('scopedKeyResultTitle.value');
    expect(source).not.toContain('`Goal ${queryGoalId.value}');
    expect(source).not.toContain('KR ${queryKeyResultId.value}');
    expect(source).not.toContain(':position="occurrencePositions');
  });

  it('exposes bounded Plan pages and reports missing occurrence-plan failures', () => {
    expect(source).toContain('page: planPage.value');
    expect(source).toContain('total: planTotal');
    expect(source).toContain('data-testid="task-plan-pagination"');
    expect(source).toContain('planPage * 100 >= planTotal');
    expect(source).toContain('todayDetailsError.value');
    expect(source).toContain('identityScope !== resolveIdentityScope()');
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
