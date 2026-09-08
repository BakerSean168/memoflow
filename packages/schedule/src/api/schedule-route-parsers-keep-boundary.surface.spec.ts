import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** CLEAN-6304: worker-task query parsing moved with Temporal Engine ownership. */
describe('Schedule API physical boundary', () => {
  const routes = readFileSync(resolve(__dirname, 'routes.ts'), 'utf8');
  const scheduleRoot = resolve(__dirname, '../..');
  const project = readFileSync(resolve(scheduleRoot, 'project.json'), 'utf8');

  it('does not retain Scheduler task query parsers or task routes', () => {
    expect(routes).not.toMatch(/function parseNumber\b/);
    expect(routes).not.toMatch(/function parseString\b/);
    expect(routes).not.toMatch(/function parseBoolean\b/);
    expect(routes).not.toContain('/tasks');
    expect(routes).toContain('/operations/rebuild/timeline');
  });

  it('does not retain the worker use-case coverage slice after the Scheduler split', () => {
    expect(existsSync(resolve(scheduleRoot, 'vitest.use-cases.config.ts'))).toBe(false);
    expect(project).not.toContain('vitest.use-cases.config.ts');
    expect(project).toContain('vitest.mappers.config.ts');
  });
});
