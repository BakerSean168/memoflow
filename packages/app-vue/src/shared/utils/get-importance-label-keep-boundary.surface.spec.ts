import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('GOAL-2101 / GOAL-7210 importance retirement', () => {
  const dir = __dirname;
  const goalDetail = readFileSync(
    resolve(dir, '../../modules/goal/views/GoalDetailView.vue'),
    'utf8',
  );
  const goalRow = readFileSync(
    resolve(dir, '../../modules/goal/components/GoalProgressRow.vue'),
    'utf8',
  );
  const goalDialog = readFileSync(
    resolve(dir, '../../modules/goal/components/dialogs/GoalDialog.vue'),
    'utf8',
  );
  const retiredKrPreview = resolve(dir, '../../modules/goal/components/KRPreviewList.vue');

  it('does not restore Goal business importance or a Goal importance label mapper', () => {
    for (const source of [goalDetail, goalRow, goalDialog]) {
      expect(source).not.toMatch(/getImportanceLabel\b/);
      expect(source).not.toContain('importanceVital');
      expect(source).not.toContain('goal.importance');
    }
  });

  it('deletes the retired standalone KR preview importance track', () => {
    expect(existsSync(retiredKrPreview)).toBe(false);
  });
});
