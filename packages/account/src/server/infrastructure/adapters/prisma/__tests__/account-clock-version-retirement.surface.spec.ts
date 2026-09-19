import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ACC-1407 Account Clock + version retirement surface', () => {
  const repoRoot = resolve(__dirname, '../../../../../../../..');
  const aggregate = readFileSync(
    resolve(repoRoot, 'packages/account/src/server/domain/aggregates/account.ts'),
    'utf8',
  );
  const accountModule = readFileSync(
    resolve(repoRoot, 'packages/account/src/server/infrastructure/account.module.ts'),
    'utf8',
  );
  const prismaModule = readFileSync(
    resolve(repoRoot, 'packages/account/src/server/infrastructure/prisma.ts'),
    'utf8',
  );
  const powerSyncModule = readFileSync(
    resolve(repoRoot, 'packages/account/src/server/infrastructure/powersync.ts'),
    'utf8',
  );
  const responseSchemas = readFileSync(
    resolve(repoRoot, 'packages/contracts/src/modules/account/api/response-schemas.ts'),
    'utf8',
  );
  const accountSchema = readFileSync(
    resolve(repoRoot, 'packages/database/prisma/schema/account.prisma'),
    'utf8',
  );
  const reliableSchema = readFileSync(
    resolve(repoRoot, 'packages/database/prisma/schema/reliable-messaging.prisma'),
    'utf8',
  );
  const powerSyncSchema = readFileSync(
    resolve(repoRoot, 'packages/powersync-schema/src/index.ts'),
    'utf8',
  );

  it('keeps Account domain deterministic with explicit Instant inputs and no ambient clock', () => {
    expect(aggregate).not.toContain('Date.now(');
    expect(aggregate).not.toContain('new Date(');
    expect(aggregate).toMatch(/nicknameSeed: string; now: Instant/);
    expect(aggregate).toContain('public updateProfile(profile: AccountProfile, now: Instant)');
    expect(aggregate).toContain('public close(now: Instant)');
    expect(accountModule).toContain("import type { Clock } from '@memoflow/time'");
    expect(accountModule).not.toContain('export interface Clock');
    expect(accountModule).not.toContain('systemClock');
  });

  it('requires an injected Clock at both persistence composition boundaries', () => {
    for (const moduleSource of [prismaModule, powerSyncModule]) {
      expect(moduleSource).not.toContain('createSystemClock');
      expect(moduleSource).not.toMatch(/clock\??\s*:\s*Clock\s*=\s*/);
      expect(moduleSource).not.toMatch(/options\??\s*:\s*[^,)]*\|\s*undefined/);
      expect(moduleSource).toMatch(/readonly clock:\s*Clock/);
      expect(moduleSource).toMatch(/clock:\s*options\.clock/);
    }
  });

  it('removes fake Account version from contract + persistence surfaces', () => {
    const accountResponseBody = responseSchemas.slice(
      responseSchemas.indexOf('export const AccountResponseSchema'),
      responseSchemas.indexOf('export const AccountViewSchema'),
    );
    expect(accountResponseBody).not.toMatch(/\bversion\s*:/);

    const prismaAccount = accountSchema.slice(
      accountSchema.indexOf('model Account {'),
      accountSchema.indexOf('\n}', accountSchema.indexOf('model Account {')),
    );
    expect(prismaAccount).not.toMatch(/\bversion\b/);

    const powerSyncAccount = powerSyncSchema.slice(
      powerSyncSchema.indexOf('const accounts = new Table({'),
      powerSyncSchema.indexOf('});', powerSyncSchema.indexOf('const accounts = new Table({')),
    );
    expect(powerSyncAccount).not.toMatch(/\bversion\s*:/);
  });

  it('preserves the real closure-operation CAS version', () => {
    const closureOperation = reliableSchema.slice(
      reliableSchema.indexOf('model AccountClosureOperation {'),
      reliableSchema.indexOf('\n}', reliableSchema.indexOf('model AccountClosureOperation {')),
    );
    expect(closureOperation).toMatch(/\bversion\s+Int\s+@default\(1\)/);
  });
});
