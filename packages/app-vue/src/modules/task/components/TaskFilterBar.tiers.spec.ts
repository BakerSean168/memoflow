import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'TaskPageToolbar.vue'), 'utf8');

describe('Task occurrence filters', () => {
  it('keeps one canonical Goal-style toolbar across panel tiers', () => {
    expect(source.match(/data-testid="task-page-toolbar"/g)).toHaveLength(1);
    for (const selector of [
      'test-id="task-surface"',
      'test-id="task-status-filter"',
      'test-id="task-plan-state-filter"',
      'data-testid="task-label-filter"',
      'data-testid="task-compact-view-options"',
      'test-id="task-occurrence-sort"',
    ]) {
      expect(source).toContain(selector);
    }
    expect(source).toContain('<ProductSingleSelectFilter');
    expect(source).toContain('<LabelFilterPopover');
    expect(source).toContain('<ResponsivePrimaryAction');
    expect(source).toContain('@2xl/panel:hidden');
    expect(source).toContain('hidden shrink-0 @2xl/panel:block');
    expect(source).not.toContain('task-goal-filter');
    expect(source).not.toContain('goalFilter');
    expect(source).not.toContain('overflow-x-auto');
    expect(source).not.toContain('task-search-input');
    expect(source).toContain('data-primary-action="create-task"');
    expect(source).not.toContain('TaskDAG');
    expect(source).not.toContain('usePanelWidth');
  });
});
