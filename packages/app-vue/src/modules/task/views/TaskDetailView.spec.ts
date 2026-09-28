import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'TaskDetailView.vue'), 'utf8');

describe('TaskDetailView occurrence correction and plan settings', () => {
  it('is the canonical inline Task editor instead of reopening the plan dialog', () => {
    expect(source).toContain('data-testid="task-plan-workspace"');
    expect(source).toContain('data-testid="task-detail-title"');
    expect(source).toContain('data-testid="task-plan-workspace-properties"');
    expect(source).toContain('data-testid="task-detail-metadata"');
    expect(source).toContain('data-testid="task-properties-row"');
    expect(source).toContain('data-testid="task-properties-more"');
    expect(source).toContain('v-if="viewModel.goalBinding || showGoalEditor"');
    expect(source).toContain('v-if="labelIds.length || showLabelsEditor"');
    expect(source).toContain('v-if="reminderTriggers.length || showReminderEditor"');
    expect(source).toContain('data-testid="task-goal-row"');
    expect(source).toContain('data-testid="task-labels-row"');
    expect(source).toContain('data-testid="task-reminders-row"');
    expect(source).toContain('data-testid="task-detail-description"');
    expect(source).toContain('task-detail-schedule-chip');
    expect(source).toContain('task-detail-recurrence-chip');
    expect(source).toContain('task-detail-goal-chip');
    expect(source).toContain('task-detail-reminder-chip');
    expect(source).toContain('task-detail-importance-chip');
    expect(source).toContain('<LabelCommandPanel');
    expect(source).toContain('reminderTriggerLabel');
    expect(source).toContain('formatProductDateTime');
    expect(source).toContain('hasMorePropertiesMenuItems');
    expect(source).toContain('<DropdownMenuSub');
    expect(source).toContain('<DropdownMenuCheckboxItem');
    expect(source).toContain('<TaskReminderMenuItems');
    expect(source).toContain('quickBindGoal');
    expect(source).toContain('toggleLabelSelection');
    expect(source).toContain('openGoalEditor');
    expect(source).toContain('openLabelsEditor');
    expect(source).toContain('openReminderEditor');
    expect(source).toContain('openCustomReminderPicker');
    expect(source).toContain('<ProductDateTimePicker');
    expect(source).not.toContain('<LabelPicker');
    expect(source).not.toContain('data-testid="task-detail-goal-context"');
    expect(source).toContain('<ChecklistSection');
    expect(source).toContain('saveInlinePlan');
    expect(source).toContain('const req: UpdateTaskPlanReq = {}');
    expect(source).not.toContain('name: vm.title');
    expect(source).not.toContain('description: vm.description');
    expect(source).not.toContain('<TaskPlanDialog');
    expect(source).not.toContain('saveEdit');
    expect(source).not.toContain('openEdit');
  });

  it('shows workspace occurrences and correction commands without inventing bounded positions', () => {
    expect(source).toContain('data-testid="task-detail-occurrences"');
    expect(source).toContain('<TaskOccurrenceRow');
    expect(source).toContain('executionSummary');
    expect(source).toContain('linkedNotes');
    expect(source).not.toContain('fetchInstances({ page: 1, limit: 500 })');
    expect(source).not.toContain('getTaskOccurrencePosition');
    for (const operation of [
      'completeOccurrence',
      'uncompleteOccurrence',
      'markOccurrenceMissed',
      'skipOccurrence',
      'setOccurrenceChecklistItem',
    ]) {
      expect(source).toContain(operation);
    }
    expect(source).toContain('refetchWorkspace');
  });

  it('routes each occurrence action to its composable mutation exactly once', () => {
    expect(source).toContain('runOccurrenceAction(occurrenceId, completeOccurrenceMutation)');
    expect(source).toContain('runOccurrenceAction(occurrenceId, uncompleteOccurrenceMutation)');
    expect(source).toContain('runOccurrenceAction(occurrenceId, markOccurrenceMissedMutation)');
    expect(source).toContain('runOccurrenceAction(occurrenceId, skipOccurrenceMutation)');
    expect(source).toContain('setOccurrenceChecklistItemMutation(occurrenceIdValue, {');

    expect(source).not.toContain('runOccurrenceAction(occurrenceId, completeOccurrence)');
    expect(source).not.toContain('runOccurrenceAction(occurrenceId, uncompleteOccurrence)');
    expect(source).not.toContain('runOccurrenceAction(occurrenceId, markOccurrenceMissed)');
    expect(source).not.toContain('runOccurrenceAction(occurrenceId, skipOccurrence)');
    expect(source).not.toContain(
      'setOccurrenceChecklistItem(id, { definitionId, completed, expectedVersion })',
    );
  });

  it('does not resurrect dependency or graph state', () => {
    for (const retired of ['TaskDependency', 'CriticalPath', 'parentTaskId', 'dependencyStatus']) {
      expect(source).not.toContain(retired);
    }
  });
});
