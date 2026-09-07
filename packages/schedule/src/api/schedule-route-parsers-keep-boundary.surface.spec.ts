import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** CLEAN-6304: worker-task query parsing moved with Temporal Engine ownership. */
describe('Schedule API physical boundary', () => {
  const routes = readFileSync(resolve(__dirname, 'routes.ts'), 'utf8');

  it('does not retain Scheduler task query parsers or task routes', () => {
    expect(routes).not.toMatch(/function parseNumber\b/);
    expect(routes).not.toMatch(/function parseString\b/);
    expect(routes).not.toMatch(/function parseBoolean\b/);
    expect(routes).not.toContain('/tasks');
    expect(routes).toContain('/operations/rebuild/timeline');
  });
});
