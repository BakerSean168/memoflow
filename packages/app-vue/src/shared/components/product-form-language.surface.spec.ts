import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(import.meta.dirname, '../..');
const read = (relative: string) => readFileSync(resolve(appRoot, relative), 'utf8');

describe('MemoFlow product form language', () => {
  it('shares one compact property-chip primitive across Goal, Task, and Schedule', () => {
    const goal = read('modules/goal/components/dialogs/GoalDialog.vue');
    const task = read('modules/task/components/TaskPlanForm/TaskPlanForm.vue');
    const schedule = read('modules/schedule/components/CreateScheduleDialog.vue');

    expect(goal).toContain('ProductPropertyChip');
    expect(task).toContain('ProductPropertyChip');
    expect(schedule).toContain('ProductPropertyChip');
    expect(schedule).toContain('schedule-property-chips');
  });

  it('keeps primary create/edit flows on the shared pane or legacy dialog shell', () => {
    expect(read('modules/goal/components/dialogs/GoalFormFrame.vue')).toContain(
      '<ProductDialogShell',
    );
    for (const file of [
      'modules/goal/components/dialogs/GoalRecordDialog.vue',
      'modules/task/components/dialogs/TemplateSelectionDialog.vue',
    ]) {
      expect(read(file), file).toContain('ProductDialogShell');
    }
    for (const file of [
      'modules/task/components/dialogs/TaskPlanDialog.vue',
      'modules/schedule/components/CreateScheduleDialog.vue',
    ]) {
      expect(read(file), file).toContain('ProductEditorFrame');
    }
    const frame = read('shared/components/ProductEditorFrame.vue');
    expect(frame).toContain('<ProductDialogShell');
    expect(frame).toContain('<PaneScopedDialog');
  });

  it('keeps active Repository projection dialogs on the shared product dialog shell', () => {
    const repository = read('modules/repository/views/KnowledgeProjectionWorkspaceView.vue');
    expect(repository).toContain('test-id="knowledge-projection-adopt-dialog"');
    expect(repository).not.toContain('test-id="knowledge-projection-create-dialog"');
    expect(repository).toContain('ProductDialogShell');
    expect(repository).not.toContain('<DialogContent');
  });

  it('keeps Schedule time primary while progressively disclosing optional properties', () => {
    const schedule = read('modules/schedule/components/CreateScheduleDialog.vue');
    expect(schedule).toContain("type ScheduleProperty = 'location' | 'attendees'");
    expect(schedule).toContain('schedule-time-panel');
    expect(schedule).toContain('schedule-property-editor');
    expect(schedule).toContain("activeProperty === 'location'");
    expect(schedule).toContain('schedule-conflict-setting');
    expect(schedule).toContain('<ProductDateTimePicker');
  });
});
