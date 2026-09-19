import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const moduleDir = resolve(__dirname, '..');
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|vue)$/.test(name) && !name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

describe('TASK-2203 DAG/dependency presentation retirement', () => {
  it('does not restore retired DAG components, graph query, or DAG view-model types', () => {
    expect(existsSync(resolve(__dirname, 'dag/TaskDAGVisualization.vue'))).toBe(false);
    expect(existsSync(resolve(__dirname, '../types/task-dag.types.ts'))).toBe(false);
    expect(existsSync(resolve(__dirname, '../composables/useTaskPlanGraphQuery.ts'))).toBe(false);
    const banned = [
      'TaskForDAGViewModel',
      'TaskGraphEdgeViewModel',
      'TaskGraphDataViewModel',
      'TaskDAGVisualization',
      'useTaskPlanGraphQuery',
      'DependencyManager',
    ];
    const offenders: string[] = [];
    for (const file of walk(moduleDir)) {
      const source = readFileSync(file, 'utf8');
      for (const token of banned) if (source.includes(token)) offenders.push(`${file}: ${token}`);
    }
    expect(offenders).toEqual([]);
  });
});
