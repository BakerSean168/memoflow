/**
 * Task pilot authority surface (fail closed; plan §5.6).
 *
 * 失败即门的 authority surface：Task Pinia store 一旦重新出现 template/graph server DTO 或
 * template loading/error authority，或视图回到无条件 `refreshTaskManagement`/
 * `fetchTaskGraph`/`fetchTemplate`，本 spec 必须失败。
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const taskRoot = dirname(fileURLToPath(import.meta.url));

/** Strip comments so prose never trips authority checks. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\/.*$/g, '');
}

const storeSource = code(readFileSync(resolve(taskRoot, 'stores/task-store.ts'), 'utf8'));
const managementView = code(
  readFileSync(resolve(taskRoot, 'views/TaskManagementView.vue'), 'utf8'),
);
const detailView = code(readFileSync(resolve(taskRoot, 'views/TaskDetailView.vue'), 'utf8'));

describe('Task pilot authority surface (fail closed)', () => {
  it('keeps the Task store instances/UI-only (no template / graph / dependency DTOs)', () => {
    expect(storeSource).not.toContain('TaskPlanClientDTO');
    expect(storeSource).not.toMatch(/templates:\s*\[/);
    expect(storeSource).not.toMatch(/currentTemplate:/);
    expect(storeSource).not.toMatch(/dependencies:\s*\[/);
    expect(storeSource).not.toMatch(/pagination:\s*\{\s*page: 1,\s*pageSize: 20,\s*total:/);
  });

  it('does not leave imperative graph/detail refetch callsites in the pilot views', () => {
    expect(managementView).not.toContain('fetchTaskGraph');
    expect(managementView).not.toContain('refreshTaskManagement');
    expect(detailView).not.toContain('fetchTaskGraph');
    expect(detailView).not.toContain('fetchTemplate');
    expect(detailView).not.toContain('loadDetailPage');
  });

  it('keeps mutation convergence through invalidation, not store template writes', () => {
    expect(managementView).not.toContain('.setTemplates(');
    expect(detailView).not.toContain('.setTemplates(');
  });
});
