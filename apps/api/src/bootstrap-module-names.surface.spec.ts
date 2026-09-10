import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Elegance E5b: API bootstrap docs must not invent dead Legacy* module names.
 * Production registration lives in server.ts via the runtime composers
 * (composeGovernance / composeAccount and peers).
 */
describe('api bootstrap module names (elegance E5b)', () => {
  const dir = __dirname;
  const bootstrap = readFileSync(resolve(dir, 'bootstrap.ts'), 'utf8');
  const server = readFileSync(resolve(dir, 'server.ts'), 'utf8');

  it('example registers composed handles; no retired account module alias in bootstrap', () => {
    expect(bootstrap).toContain('.register(accountApiModule)');
    expect(bootstrap).toContain('Residual E5b');
    // Ban the historical fake module name in docs/example (E5 dead-domain).
    expect(bootstrap).not.toMatch(/LegacyAccountModule/);
    expect(bootstrap).not.toMatch(/\.register\(\s*Legacy\w*Module\s*\)/);
  });

  it('server wires account through composeAccount as the account API module', () => {
    expect(server).toContain("from './runtime/compose-account'");
    expect(server).toMatch(/composeAccount\(\{\s*db: prisma,\s*cloudAuth,\s*clock: createSystemClock\(\),?\s*\}/);
    expect(server).toContain('.register(accountApiModule)');
    expect(server).not.toMatch(/LegacyAccountModule/);
  });
});
