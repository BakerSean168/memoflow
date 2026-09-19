import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const clientRuntimeFiles = [
  '../application-client/task-client-service.ts',
  '../domain-client/aggregates/task-plan.ts',
  '../domain-client/aggregates/task-occurrence.ts',
  '../domain-client/index.ts',
  './index.ts',
] as const;

describe('Task client browser boundary', () => {
  it('does not cross into server-domain or Node-only runtime modules', () => {
    for (const relative of clientRuntimeFiles) {
      const source = readFileSync(resolve(__dirname, relative), 'utf8');
      expect(source, relative).not.toMatch(/(?:\.\.\/)+server\//);
      expect(source, relative).not.toMatch(/from\s+['"]node:/);
    }
  });
});
