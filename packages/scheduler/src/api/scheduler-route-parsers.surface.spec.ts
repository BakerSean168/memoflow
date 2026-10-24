import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Scheduler diagnostics query ownership', () => {
  const routes = readFileSync(resolve(__dirname, 'routes.ts'), 'utf8');

  it('uses the canonical invocation query schema without legacy task parsers', () => {
    expect(routes).toContain('ScheduledInvocationDiagnosticQuerySchema');
    expect(routes).toContain('ScheduledInvocationDiagnosticQuerySchema.parse(req.query ?? {})');
    expect(routes).toContain("path: '/invocations'");
    expect(routes).toContain("path: '/invocations/due'");
    expect(routes).toContain("path: '/invocations/:id'");
    expect(routes).not.toMatch(/function parse(?:Number|String|Boolean)\b/);
    expect(routes).not.toContain("path: '/tasks'");
    expect(routes).not.toMatch(/method: '(?:post|put|patch|delete)'/);
  });
});
