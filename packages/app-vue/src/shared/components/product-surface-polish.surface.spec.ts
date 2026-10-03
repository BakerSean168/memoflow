import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(import.meta.dirname, '../..');
const read = (relative: string) => readFileSync(resolve(appRoot, relative), 'utf8');

describe('MemoFlow product surface polish', () => {
  it('keeps Goal detail on a direct-manipulation workspace instead of a global edit mode', () => {
    const goal = read('modules/goal/views/GoalDetailView.vue');
    expect(goal).toContain('<ModuleHeader data-testid="goal-detail-toolbar">');
    expect(goal).toContain('data-testid="goal-detail-identity"');
    expect(goal).toContain('class="space-y-4 border-b border-[hsl(var(--border-subtle))] pb-5"');
    expect(goal).toContain('<GoalStatusPicker');
    expect(goal.match(/<GoalTimeframePicker/g)?.length).toBeGreaterThanOrEqual(2);
    expect(goal).toContain('<GoalReminderMenuItems');
    expect(goal).toContain('<ProductDateTimePicker');
    expect(goal).toContain('@request-custom-time="openCustomReminderPicker"');
    expect(goal).toContain('<GoalKnowledgeMenuItems');
    expect(goal).toContain('data-testid="goal-reminders-row"');
    expect(goal).toContain('v-for="trigger in pendingReminderTriggers"');
    expect(goal).not.toContain('variant="header"');
    expect(goal).not.toContain('goal-reminder-header');
    expect(goal).toContain('<LabelCommandPanel');
    expect(goal).toContain('<DropdownMenuSub');
    expect(goal).toContain('<DropdownMenuCheckboxItem');
    expect(goal).toContain('v-for="option in selectedLabelOptions"');
    expect(goal).toContain('variant="outline"');
    expect(goal).toContain('data-testid="goal-properties-row"');
    expect(goal).toContain('data-testid="goal-labels-row"');
    expect(goal).toContain('data-testid="goal-tasks-row"');
    expect(goal).toContain('data-testid="goal-knowledge-row"');
    expect(goal).toContain('data-testid="goal-reviews-row"');
    expect(goal).toContain('v-if="pendingReminderTriggers.length === 0"');
    expect(goal).toContain('v-if="labelIdsDraft.length === 0 && !showLabelsEditor"');
    expect(goal).toContain('v-if="taskCount === 0"');
    expect(goal).toContain('v-if="knowledgeCount === 0"');
    expect(goal).toContain('v-if="reviewCount === 0"');
    expect(goal.indexOf('data-testid="goal-workspace-description"')).toBeLessThan(
      goal.indexOf('data-testid="goal-workspace-key-results"'),
    );
    expect(goal).not.toContain('data-testid="goal-workspace-tasks"');
    expect(goal).not.toContain('data-testid="goal-workspace-knowledge"');
    expect(goal).not.toContain('data-testid="goal-workspace-reviews"');
    expect(goal).not.toContain('v-model:open="editOpen"');
    expect(goal).not.toContain('data-testid="goal-start-action"');
    expect(goal).not.toContain('data-testid="goal-abandon-action"');
  });

  it('keeps Goal reminder UX on absolute and target-relative presets instead of percentage configuration', () => {
    const reminder = read('modules/goal/components/GoalReminderMenuItems.vue');
    expect(reminder).toContain('ReminderTriggerType.AbsoluteAt');
    expect(reminder).toContain('ReminderTriggerType.RemainingDays');
    expect(reminder).toContain('goal.reminder.inOneHour');
    expect(reminder).toContain('goal.reminder.customTime');
    expect(reminder).toContain("emit('request-custom-time')");
    expect(reminder).not.toContain('<ProductDatePicker');
    expect(reminder).not.toContain('type="time"');
    expect(reminder).toContain('goal.reminder.relativeToTarget');
    expect(reminder).toContain('triggers: [...existing, { type, value, enabled: true }]');
    expect(reminder).toContain('MAX_REMINDERS = 10');
    expect(reminder).toContain('canSetRemainingDays');
    expect(reminder).toContain('goalTimeframeStartBoundary');
    expect(reminder.match(/formatProductDateTime\(/g)?.length).toBeGreaterThanOrEqual(8);
    expect(reminder).toContain('remainingDaysInstant');
    expect(reminder).not.toContain('formatProductHm');
    expect(reminder).not.toContain('formatProductDate(next');
    expect(reminder).not.toContain('TimeProgressPercentage');
  });

  it('keeps Goal review and KR inspect on the product dialog shell', () => {
    const reviewCreate = read('modules/goal/components/dialogs/GoalReviewCreateDialog.vue');
    const reviewDetail = read('modules/goal/components/dialogs/GoalReviewInspectDialog.vue');
    const keyResultDetail = read('modules/goal/components/dialogs/GoalKeyResultInspectDialog.vue');

    for (const source of [reviewCreate, reviewDetail]) {
      expect(source).toContain('<ProductDialogShell');
      expect(source).not.toContain('min-h-14 items-center gap-2 border-b');
      expect(source).not.toContain('rounded-lg border bg-card');
    }

    expect(reviewCreate).toContain('<GoalReviewSnapshot');
    expect(reviewDetail).toContain('<GoalReviewSnapshot');
    expect(read('modules/goal/components/GoalReviewSnapshot.vue')).toContain('surface-raised');
    expect(keyResultDetail).toContain('<ProductDialogShell');
    expect(keyResultDetail).toContain('<GoalKeyResultTrajectoryPlot');
  });

  it('keeps standalone Key Result create/edit on the same trajectory editor as the Goal form', () => {
    const goalDialog = read('modules/goal/components/dialogs/GoalDialog.vue');
    const keyResultDialog = read('modules/goal/components/dialogs/KeyResultDialog.vue');

    expect(goalDialog).toContain('<GoalKeyResultDraftEditor');
    expect(keyResultDialog).toContain('<GoalKeyResultCardEditor');
    expect(keyResultDialog).toContain('v-model:initial-value="draft.initialValue"');
    expect(keyResultDialog).toContain('v-model:current-value="currentValueModel"');
    expect(keyResultDialog).toContain('v-model:target-value="draft.targetValue"');
    expect(keyResultDialog).toContain(':goal-start="goalStart"');
    expect(keyResultDialog).toContain(':goal-target="goalTarget"');
    expect(keyResultDialog).not.toContain('key-result-initial-input');
    expect(keyResultDialog).not.toContain('krAdvanced');
    expect(keyResultDialog).not.toContain('<Collapsible');
  });

  it('keeps the Key Result trajectory editor on one restrained surface with compact controls', () => {
    const card = read('modules/goal/components/GoalKeyResultCardEditor.vue');
    const trajectory = read('modules/goal/components/GoalKeyResultTrajectoryPlot.vue');

    expect(card).toContain('data-testid="draft-kr-weight-popover"');
    expect(card).toContain('data-testid="draft-kr-weight-glyph"');
    expect(card).toContain('<Sigma');
    expect(card).toContain('<Plus v-if="!unit"');
    expect(card).toContain('weightOpen.value = false');
    expect(trajectory).toContain('class="relative border-t border-border/45"');
    expect(trajectory).toContain("'mt-4 h-[14.5rem]'");
    expect(trajectory).not.toContain('rounded-xl bg-background/35');
    expect(trajectory).not.toContain('stroke-dasharray="1.2 2.4"');
    expect(trajectory).toContain(":data-target-state=\"hasTarget ? 'set' : 'unset'\"");
    expect(trajectory).toContain('v-if="hasTarget"');
    expect(trajectory).toContain('bg-transparent');
  });

  it('aligns Task detail metadata with the Goal detail label/value rows', () => {
    const task = read('modules/task/views/TaskDetailView.vue');
    expect(task).toContain('data-testid="task-detail-metadata"');
    expect(task).toContain('data-testid="task-properties-row"');
    expect(task).toContain('test-id="task-properties-more"');
    expect(task).toContain('<DropdownMenuSub');
    expect(task).toContain('<DropdownMenuCheckboxItem');
    expect(task).toContain('<TaskReminderMenuItems');
    expect(task).toContain('<ProductDateTimePicker');
    expect(task).toContain('v-if="viewModel.goalBinding || showGoalEditor"');
    expect(task).toContain('v-if="labelIds.length || showLabelsEditor"');
    expect(task).toContain('v-if="reminderTriggers.length || showReminderEditor"');
    expect(task).toContain('data-testid="task-goal-row"');
    expect(task).toContain('data-testid="task-labels-row"');
    expect(task).toContain('data-testid="task-reminders-row"');
    expect(task).toContain('grid-cols-[6.5rem_minmax(0,1fr)]');
    expect(task).toContain('<LabelCommandPanel');
    expect(task).toContain('variant="outline"');
    expect(task).toContain('task-detail-schedule-chip');
    expect(task).toContain('task-detail-recurrence-chip');
    expect(task).toContain('task-detail-goal-chip');
    expect(task).toContain('task-detail-reminder-chip');
    expect(task).not.toContain('<LabelPicker');
    expect(task).not.toContain('@3xl/panel:grid-cols-4');
  });

  it('keeps high-frequency editors on semantic surfaces instead of nested default cards', () => {
    const krCard = read('modules/goal/components/GoalKeyResultCardEditor.vue');
    const krDrafts = read('modules/goal/components/GoalKeyResultDraftEditor.vue');
    const checklist = read('modules/task/components/TaskPlanForm/sections/ChecklistSection.vue');
    const reminder = read('modules/task/components/TaskPlanForm/sections/ReminderSection.vue');
    const schedule = read('modules/schedule/components/CreateScheduleDialog.vue');

    for (const source of [krCard, krDrafts, checklist, reminder, schedule]) {
      expect(source).toContain('surface-raised');
      expect(source).not.toContain('border bg-card');
    }

    expect(krDrafts).not.toContain('border border-border/70 bg-background/20');
    expect(checklist).not.toContain('border border-border/70 bg-background/20');
    expect(schedule).not.toContain('border border-border/60 bg-muted/[0.08]');
    expect(schedule).not.toContain('border border-border/60 bg-background/55');
  });

  it('keeps inbox rows compact without the old high-chroma unread chrome', () => {
    const item = read('modules/notification/components/NotificationItem.vue');
    expect(item).toContain('data-density="compact"');
    expect(item).not.toContain('border-l-4');
    expect(item).not.toContain('ring-4 ring-info/12');
  });

  it('keeps Schedule day and event details on compact row surfaces', () => {
    const day = read('modules/schedule/components/PlannerDayDialog.vue');
    const detail = read('modules/schedule/components/PlannerEventDialog.vue');
    expect(day).toContain('data-testid="planner-day-event-list"');
    expect(day).toContain(
      'class="divide-y divide-[hsl(var(--border-subtle))] border-y border-[hsl(var(--border-subtle))]"',
    );
    expect(detail).toContain('data-testid="event-detail-properties"');
  });

  it('uses one shared settings navigation renderer across wide sidebar and narrow drawer', () => {
    const settings = read('modules/setting/views/UserSettingsView.vue');
    const navigation = read('modules/setting/components/SettingsNavigation.vue');
    expect(settings).toContain('settings-group-sidebar');
    expect(settings).toContain('settings-navigation-drawer');
    expect(settings).not.toContain('settings-group-tabs');
    expect(navigation).toContain('LinearSidebarItem');
    expect(navigation).toContain('settings-return-to-app');
  });

  it('uses semantic Goal timeframes and shared product date pickers instead of native date inputs', () => {
    const goal = read('modules/goal/components/dialogs/GoalDialog.vue');
    const task = read('modules/task/components/TaskPlanForm/sections/TimeConfigSection.vue');
    const schedule = read('modules/schedule/components/CreateScheduleDialog.vue');
    expect(goal.match(/GoalTimeframePicker/g)?.length).toBeGreaterThanOrEqual(2);
    expect(task).toContain('ProductDatePicker');
    expect(schedule.match(/ProductDatePicker/g)?.length).toBeGreaterThanOrEqual(2);
    expect(schedule.match(/ProductDateTimePicker/g)?.length).toBeGreaterThanOrEqual(2);
    expect(goal).not.toContain('type="date"');
    expect(task).not.toContain('type="date"');
    expect(schedule).not.toContain('type="date"');
  });

  it('keeps legal surface-header families explicit at their owner boundaries', () => {
    expect(read('modules/task/components/TaskPageToolbar.vue')).toContain(
      '<ProductSurfaceHeader family="collection"',
    );
    expect(read('modules/goal/components/GoalPageToolbar.vue')).toContain(
      '<ProductSurfaceHeader family="collection"',
    );
    expect(read('modules/schedule/views/ScheduleCalendarView.vue')).toContain(
      '<ProductSurfaceHeader family="calendar"',
    );
    expect(read('modules/repository/components/DocumentWorkspaceToolbar.vue')).toContain(
      '<ProductSurfaceHeader family="document"',
    );
    expect(read('modules/setting/views/UserSettingsView.vue')).toContain('family="settings"');
    expect(read('modules/notification/views/SSEMonitorPage.vue')).toContain(
      '<ModuleHeader family="diagnostic">',
    );
    expect(read('modules/task/views/TaskDetailView.vue')).toContain(
      '<ModuleHeader data-testid="task-detail-toolbar">',
    );
  });
});
