import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname);
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

describe('Task vNext UI anti-resurrection', () => {
  it('keeps TaskPlan form state on canonical schedule/checklist truth only', () => {
    const types = read('components/types.ts');
    const planViewModel = types.slice(
      types.indexOf('export interface TaskPlanViewModel'),
      types.indexOf('export interface TaskPlanFormProps'),
    );
    expect(planViewModel).toContain('schedule: TaskPlanSchedule');
    expect(planViewModel).toContain('checklist: ChecklistItemDefinitionDTO[]');
    expect(planViewModel).not.toMatch(/\btimeConfig\s*:/);
    expect(planViewModel).not.toMatch(/\brecurrenceRule\s*:/);
    expect(planViewModel).not.toMatch(/\btaskType\s*:/);
  });

  it('keeps create/edit on the Task workspace hierarchy with anchored property popovers', () => {
    const form = read('components/TaskPlanForm/TaskPlanForm.vue');
    const basic = read('components/TaskPlanForm/sections/BasicInfoSection.vue');

    expect(form).toContain('task-plan-identity-section');
    expect(form).toContain('task-plan-property-chips');
    expect(form).toContain('task-schedule-chip');
    expect(form).toContain('task-recurrence-chip');
    expect(form).toContain('task-goal-chip');
    expect(form).toContain('task-reminder-chip');
    expect(form).toContain('task-importance-chip');
    expect(form).toContain('task-schedule-popover');
    expect(form).toContain('task-reminder-popover');
    expect(form).toContain('task-description-section');
    expect(form).toContain('<ChecklistSection');
    expect(form).toContain('class="mt-auto shrink-0"');
    expect(form).toContain('task-plan-form-container flex min-h-0 flex-1 flex-col');
    expect(form).toContain('task-plan-form flex min-h-0 flex-1 flex-col gap-6');
    expect(form).toContain('task-importance-option-');
    expect(form).toContain('<ReminderSection');
    expect(form).not.toContain('task-plan-property-editor');
    expect(form).not.toContain('task-checklist-chip');
    expect(basic).toContain('ProductAutoTextarea');
    expect(basic).not.toContain('<Input');

    const dialog = read('components/dialogs/TaskPlanDialog.vue');
    expect(dialog).toContain('body-class="flex flex-col"');

    const timeConfig = read('components/TaskPlanForm/sections/TimeConfigSection.vue');
    expect(timeConfig).toContain('task-time-type-menu');
    expect(timeConfig).toContain('role="radio"');
    expect(timeConfig).toContain('<Check');

    const checklist = read('components/TaskPlanForm/sections/ChecklistSection.vue');
    expect(checklist).toContain('checklist-editor-reveal');
    expect(checklist).toContain('product-dialog-body');
    expect(checklist).not.toContain('task-checklist-empty');
  });

  it('keeps occurrence checklist interaction on the occurrence snapshot and workspace surface', () => {
    const row = read('components/TaskOccurrenceRow.vue');
    const detail = read('views/TaskDetailView.vue');
    expect(row).toContain('occurrence.checklistState');
    expect(row).toContain("'checklist-change'");
    expect(detail).toContain('data-testid="task-plan-workspace"');
    expect(detail).toContain('@checklist-change="setOccurrenceChecklistItem"');
  });
});
