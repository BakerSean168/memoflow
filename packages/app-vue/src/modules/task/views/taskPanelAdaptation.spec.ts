import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const baseDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(baseDir, 'TaskManagementView.vue'), 'utf8');
const toolbarSource = readFileSync(resolve(baseDir, '../components/TaskPageToolbar.vue'), 'utf8');

describe('Task vNext panel adaptation', () => {
  it('keeps one primary create action and uses container CSS rather than business branching', () => {
    expect(source).toContain('<TaskPageToolbar');
    expect(toolbarSource).toContain('data-primary-action="create-task"');
    expect(toolbarSource).toContain('data-testid="create-task-plan-button"');
    expect(toolbarSource).toContain('<ResponsivePrimaryAction');
    expect(toolbarSource).toContain('@2xl/panel:hidden');
    expect(toolbarSource).toContain('hidden shrink-0 @2xl/panel:block');
    expect(toolbarSource).not.toContain('overflow-x-auto');
    expect(toolbarSource).not.toContain('task-goal-filter');
    expect(source).toContain('@2xl/panel');
    expect(source).not.toContain('usePanelWidth');
    expect(toolbarSource).not.toContain('usePanelWidth');
    expect(source).not.toContain('isNarrow');
    expect(toolbarSource).not.toContain('isNarrow');
    expect(source).not.toContain('TaskDAG');
    expect(source).not.toContain('DependencyManager');
  });
});
