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

  it('keeps create/edit property-chip first with the real checklist and reminder editors', () => {
    const form = read('components/TaskPlanForm/TaskPlanForm.vue');
    expect(form).toContain('task-plan-property-chips');
    expect(form).toContain('task-schedule-chip');
    expect(form).toContain('task-recurrence-chip');
    expect(form).toContain('task-goal-chip');
    expect(form).toContain('task-reminder-chip');
    expect(form).toContain('task-checklist-chip');
    expect(form).toContain('<ChecklistSection');
    expect(form).toContain('<ReminderSection');
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
