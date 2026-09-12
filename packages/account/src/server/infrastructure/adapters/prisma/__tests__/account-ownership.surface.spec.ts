import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Account ownership surface (stage-6 residual 192):
 * Account primary key IS the identity id — bare findById(cx.identityId) is the
 * natural ownership path (no dual method). Secondary lookups are by nickname/email.
 */
describe('account ownership surface', () => {
  const port = readFileSync(
    resolve(__dirname, '../../../../domain/repositories/i-account-repository.ts'),
    'utf8',
  );
  const prisma = readFileSync(resolve(__dirname, '../account-prisma.repository.ts'), 'utf8');
  const powersync = readFileSync(
    resolve(__dirname, '../../powersync/account-powersync.repository.ts'),
    'utf8',
  );
  const getProfile = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/queries/get-account-profile.use-case.ts'),
    'utf8',
  );
  const updateProfile = readFileSync(
    resolve(
      __dirname,
      '../../../../application/use-cases/commands/update-account-profile.use-case.ts',
    ),
    'utf8',
  );
  const closeAccount = readFileSync(
    resolve(__dirname, '../../../../application/use-cases/commands/close-account.use-case.ts'),
    'utf8',
  );

  it('port keeps bare findById as identity-aligned primary key (residual 192)', () => {
    expect(port).toContain('findById(id: string, tx?: unknown): Promise<Account | null>;');
    expect(port).not.toMatch(/findByIdForIdentity/);
    expect(port).not.toContain('findByNickname(');
    expect(port).not.toContain('findByEmail(');
    expect(port).not.toContain('existsByNickname(');
    expect(port).not.toContain('existsByEmail(');
  });

  it('prisma/powersync load account by primary key only', () => {
    expect(prisma).toContain('async findById(id: string, tx?: AccountDb): Promise<Account | null>');
    expect(prisma).toContain(
      'const row = await this.client(tx).account.findUnique({ where: { id } });',
    );
    expect(prisma).not.toMatch(/findByIdForIdentity/);
    expect(powersync).toContain(
      'async findById(id: string, tx?: unknown): Promise<Account | null>',
    );
    expect(powersync).not.toMatch(/findByIdForIdentity/);
  });

  it('user-facing use cases load account by context identityId as PK', () => {
    expect(getProfile).toContain(
      'const account = await this.accountRepository.findById(cx.identityId);',
    );
    expect(updateProfile).toMatch(/findById\(cx\.identityId(?:, tx)?\)/);
    expect(closeAccount).toContain('this.coordinator.execute(cx.identityId');
    // Never introduce a dual-method ownership fence on account PK.
    expect(getProfile).not.toMatch(/findByIdForIdentity/);
    expect(updateProfile).not.toMatch(/findByIdForIdentity/);
    expect(closeAccount).not.toMatch(/findByIdForIdentity/);
  });
});
