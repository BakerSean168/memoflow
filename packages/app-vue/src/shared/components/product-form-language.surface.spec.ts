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

  it('keeps primary create/edit dialogs on the shared ProductDialogShell', () => {
    for (const file of [
      'modules/goal/components/dialogs/GoalDialog.vue',
      'modules/goal/components/dialogs/GoalRecordDialog.vue',
      'modules/task/components/dialogs/TaskPlanDialog.vue',
      'modules/task/components/TaskAIGenerationDialog.vue',
      'modules/task/components/dialogs/TemplateSelectionDialog.vue',
      'modules/schedule/components/CreateScheduleDialog.vue',
    ]) {
      expect(read(file), file).toContain('ProductDialogShell');
    }
  });

  it('keeps active Repository projection dialogs on the shared product dialog shell', () => {
    const repository = read('modules/repository/views/KnowledgeProjectionWorkspaceView.vue');
    expect(repository).toContain('test-id="knowledge-projection-create-dialog"');
    expect(repository).toContain('test-id="knowledge-projection-adopt-dialog"');
    expect(repository).toContain('ProductDialogShell');
    expect(repository).not.toContain('<DialogContent');
  });

  it('keeps Schedule progressive-disclosure instead of restoring the long always-open form', () => {
    const schedule = read('modules/schedule/components/CreateScheduleDialog.vue');
    expect(schedule).toContain(
      "type ScheduleProperty = 'when' | 'location' | 'attendees' | 'conflict'",
    );
    expect(schedule).toContain('schedule-property-editor');
    expect(schedule).toContain('v-if="activeProperty === \'when\'"');
    expect(schedule).toContain('v-else-if="activeProperty === \'location\'"');
    expect(schedule).toContain('v-else-if="activeProperty === \'attendees\'"');
    expect(schedule).toContain('v-else-if="activeProperty === \'conflict\'"');
  });
});
