import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RETIRED_ACCOUNT_EMAIL_SYMBOLS = [
  'ContactEmail',
  'emailAddress',
  'emailIsVerified',
  'emailVerifiedAt',
  'emailIsPrimary',
  'email_address',
  'email_is_verified',
  'email_verified_at',
  'email_is_primary',
] as const;

describe('ACC-1406 Account auth-email retirement surface', () => {
  const repoRoot = resolve(__dirname, '../../../../../../../..');
  const accountSchema = readFileSync(
    resolve(repoRoot, 'packages/database/prisma/schema/account.prisma'),
    'utf8',
  );
  const powerSyncSchema = readFileSync(
    resolve(repoRoot, 'packages/powersync-schema/src/index.ts'),
    'utf8',
  );
  const responseSchemas = readFileSync(
    resolve(repoRoot, 'packages/contracts/src/modules/account/api/response-schemas.ts'),
    'utf8',
  );
  const repositoryPort = readFileSync(
    resolve(repoRoot, 'packages/account/src/server/domain/repositories/i-account-repository.ts'),
    'utf8',
  );
  const routes = readFileSync(resolve(repoRoot, 'packages/account/src/api/routes.ts'), 'utf8');

  it('keeps login email only in CloudIdentitySummary, never in the Account product snapshot', () => {
    expect(responseSchemas).toContain('export const CloudIdentitySummarySchema = z.object({');
    expect(responseSchemas).toContain('email: z.string().email()');
    const accountSchemaBody = responseSchemas.slice(
      responseSchemas.indexOf('export const AccountResponseSchema'),
      responseSchemas.indexOf('export const AccountViewSchema'),
    );
    expect(accountSchemaBody).not.toMatch(/\bemail\s*:/);
    expect(accountSchemaBody).not.toContain('ContactEmail');
  });

  it('does not persist Account auth-email shadows or expose uniqueness/availability seams', () => {
    for (const symbol of RETIRED_ACCOUNT_EMAIL_SYMBOLS) {
      expect(accountSchema).not.toContain(symbol);
      expect(powerSyncSchema).not.toContain(symbol);
    }
    expect(repositoryPort).not.toContain('findByEmail(');
    expect(repositoryPort).not.toContain('existsByEmail(');
    expect(repositoryPort).not.toContain('findByNickname(');
    expect(repositoryPort).not.toContain('existsByNickname(');
    expect(routes).not.toContain("path: '/availability'");
  });

  it('retired the legacy bootstrap that depended on Account email shadow columns', () => {
    expect(
      existsSync(resolve(repoRoot, 'packages/database/src/schema/legacy-cloud-auth-migration.ts')),
    ).toBe(false);
    expect(
      existsSync(
        resolve(repoRoot, 'packages/database/scripts/prepare-legacy-cloud-auth-migration.ts'),
      ),
    ).toBe(false);
    const databaseProject = readFileSync(
      resolve(repoRoot, 'packages/database/project.json'),
      'utf8',
    );
    expect(databaseProject).not.toContain('legacy-cloud-auth-migration');
  });
});
