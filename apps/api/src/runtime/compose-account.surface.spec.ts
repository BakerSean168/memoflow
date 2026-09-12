import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Account API runtime composer surface.
 * 账户 API runtime composer 表面契约。
 *
 * Locks the Step C wiring: apps/api/src/server.ts must compose account through the
 * runtime composer and must no longer reference the retired `createAccountApiModule`
 * transport factory or the `@memoflow/account/api` seam. The composer must only
 * touch the narrow seams the plan allows.
 *
 * 锁定 Step C 接线：apps/api/src/server.ts 必须通过 runtime composer 组装账户，
 * 且不再引用已退役的 `createAccountApiModule` transport 工厂或 `@memoflow/account/api`
 * seam。composer 只允许接触计划允许的窄 seam。
 */
describe('account API runtime composer surface', () => {
  const dir = resolve(__dirname, '..');
  const server = readFileSync(resolve(dir, 'server.ts'), 'utf8');
  const composer = readFileSync(resolve(dir, 'runtime/compose-account.ts'), 'utf8');

  it('server.ts composes account with an explicit Product Time clock', () => {
    expect(server).toContain("from './runtime/compose-account'");
    expect(server).toMatch(/composeAccount\(\{\s*db: prisma,\s*cloudAuth,/);
    expect(server).toMatch(/clock:\s*createSystemClock\(\)/);
    expect(server).toContain('.register(accountApiModule)');
  });

  it('server.ts no longer references createAccountApiModule or the account/api seam', () => {
    expect(server).not.toMatch(/\bcreateAccountApiModule\b/);
    expect(server).not.toContain("from '@memoflow/account/api'");
  });

  it('composer only touches the narrow seams (no deep server import)', () => {
    expect(composer).toContain('interface ComposeAccountDependencies');
    expect(composer).toContain('readonly clock: Clock');
    expect(composer).toContain("from '@memoflow/account'");
    expect(composer).toContain("from '@memoflow/account/api'");
    expect(composer).not.toMatch(/@memoflow\/account\/server/);
  });
});
