import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../..');
function source(relative: string): string {
  return readFileSync(resolve(root, relative), 'utf8');
}

describe('GOAL-7209 UI convergence lock', () => {
  it('keeps manual Goal create compact and precision preserving', () => {
    const dialog = source('app-vue/src/modules/goal/components/dialogs/GoalDialog.vue');
    const timeframe = source('app-vue/src/modules/goal/components/GoalTimeframePicker.vue');

    expect(dialog).toContain('data-testid="goal-property-chips"');
    expect(dialog).toContain('GoalTimeframePicker');
    expect(dialog).toContain('GoalReminderChip');
    expect(dialog).toContain("emit('create-with-ai')");
    expect(dialog).toContain("emit('open-knowledge'");
    expect(dialog).not.toContain('targetDate');
    expect(dialog).not.toContain('dueDate');
    expect(dialog).not.toContain('draft.motivation');
    expect(dialog).not.toContain('draft.feasibilityAnalysis');

    for (const kind of ['day', 'month', 'quarter', 'halfYear', 'year']) {
      expect(timeframe).toContain(`value="${kind}"`);
    }
    expect(timeframe).toContain('goalTimeframeLabel');
    expect(timeframe).not.toContain('goalTimeframeEndBoundary');
  });

  it('renders Goal Workspace through owner read models instead of foreign repositories', () => {
    const detail = source('app-vue/src/modules/goal/views/GoalDetailView.vue');

    expect(detail).toContain('useGoalWorkspace(goalId)');
    expect(detail).toContain('workspace.taskContext');
    expect(detail).toContain('workspace.knowledgeContext');
    expect(detail).toContain('workspace.recentProgress');
    expect(detail).toContain('workspace.recentReviews');
    expect(detail).toContain('isPastGoalTarget');
    expect(detail).toContain("name: 'task-list'");
    expect(detail).toContain("path: '/repository'");
    expect(detail).not.toContain('TASK_SERVICE_KEY');
    expect(detail).not.toContain('REPOSITORY_SERVICE_KEY');
  });

  it('makes Goal/KR task deep links real on both Vue and React surfaces', () => {
    const vueTasks = source('app-vue/src/modules/task/views/TaskManagementView.vue');
    const reactTasks = source('app-react/src/screens/TasksScreen.tsx');
    const reactHook = source('app-react/src/hooks/useTaskPlans.ts');

    expect(vueTasks).toContain('route.query.goalId');
    expect(vueTasks).toContain('route.query.keyResultId');
    expect(vueTasks).toContain('template.goalBinding?.keyResultId');
    expect(reactTasks).toContain('useLocalSearchParams');
    expect(reactTasks).toContain('useTaskPlans({ goalId, keyResultId })');
    expect(reactHook).toContain('options.goalId');
    expect(reactHook).toContain('options.keyResultId');
  });

  it('keeps React/Mobile on the same GoalTimeframe and Workspace semantics', () => {
    const editor = source('app-react/src/screens/GoalEditorScreen.tsx');
    const kr = source('app-react/src/screens/GoalKeyResultScreen.tsx');
    const detail = source('app-react/src/screens/GoalDetailScreen.tsx');
    const productTime = source('app-react/src/utils/product-time.ts');

    expect(editor).toContain('parseGoalTimeframeInput');
    expect(editor).toContain('goalTimeframeInputValue');
    expect(kr).toContain('parseGoalTimeframeInput');
    expect(detail).toContain('useGoalWorkspace(goalId)');
    expect(detail).toContain('workspace.taskContext');
    expect(detail).toContain('workspace.knowledgeContext');
    expect(detail).toContain('isPastGoalTarget');
    expect(productTime).toContain("kind: 'quarter'");
    expect(productTime).toContain("kind: 'halfYear'");
    expect(productTime).not.toContain('goalTimeframeEndBoundary');
  });
});
