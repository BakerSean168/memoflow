import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('Core vNext presentation boundaries', () => {
  it('keeps Goal date presentation behind Product Time helpers', () => {
    const productTime = read('shared/utils/product-time.ts');
    expect(productTime).toContain('formatProductDate');
    expect(productTime).toContain('toProductDateInputValue');
    for (const file of [
      'modules/goal/components/GoalProgressRow.vue',
      'modules/goal/views/GoalDetailView.vue',
      'modules/goal/components/dialogs/GoalReviewInspectDialog.vue',
      'modules/goal/components/dialogs/GoalDialog.vue',
    ]) {
      const source = read(file);
      expect(source).not.toContain('new Intl.DateTimeFormat');
      expect(source).not.toContain('toISOString().slice(0,10)');
    }
  });

  it('uses Missed facts and never resurrects persisted Expired in the canonical Task quick surface', () => {
    const capsule = read('layouts/shell/previews/TaskCapsulePreview.vue');
    const quickSurface = read('modules/task/components/TaskQuickSurface.vue');
    expect(capsule).toContain('<TaskQuickSurface');
    expect(quickSurface).toContain("'Missed'");
    expect(`${capsule}\n${quickSurface}`).not.toContain("'Expired'");
  });

  it('keeps a stable canonical create-task action anchor', () => {
    const source = read('modules/task/views/TaskManagementView.vue');
    const toolbar = read('modules/task/components/TaskPageToolbar.vue');
    expect(toolbar).toContain('data-testid="create-task-plan-button"');
    expect(toolbar).toContain('data-primary-action="create-task"');
    expect(source).not.toContain('TaskDAG');
    expect(source).not.toContain('DependencyManager');
  });
});
