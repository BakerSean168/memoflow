import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'TaskManagementView.vue'),
  'utf8',
);

describe('Task vNext panel adaptation', () => {
  it('keeps one primary create action and uses container CSS rather than business branching', () => {
    expect(source).toContain('data-primary-action="create-task"');
    expect(source).toContain('data-testid="create-task-plan-button"');
    expect(source).toContain('@2xl/panel');
    expect(source).not.toContain('usePanelWidth');
    expect(source).not.toContain('isNarrow');
    expect(source).not.toContain('TaskDAG');
    expect(source).not.toContain('DependencyManager');
  });
});
