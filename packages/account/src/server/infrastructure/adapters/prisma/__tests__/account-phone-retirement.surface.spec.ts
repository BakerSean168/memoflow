import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RETIRED_PHONE_SYMBOLS = [
  'ContactPhone',
  'phoneCountryCode',
  'phoneNumber',
  'phoneFullNumber',
  'phoneIsVerified',
  'phoneVerifiedAt',
  'phone_country_code',
  'phone_number',
  'phone_full_number',
  'phone_is_verified',
  'phone_verified_at',
] as const;

/** ACC-1405: speculative phone verification/persistence is physically retired. */
describe('account phone retirement surface', () => {
  const accountSchema = readFileSync(
    resolve(__dirname, '../../../../../../../database/prisma/schema/account.prisma'),
    'utf8',
  );
  const powerSyncSchema = readFileSync(
    resolve(__dirname, '../../../../../../../powersync-schema/src/index.ts'),
    'utf8',
  );
  const accountResponse = readFileSync(
    resolve(
      __dirname,
      '../../../../../../../contracts/src/modules/account/api/response-schemas.ts',
    ),
    'utf8',
  );
  const serverAccount = readFileSync(
    resolve(__dirname, '../../../../domain/aggregates/account.ts'),
    'utf8',
  );

  it('does not expose ContactPhone or a phone member from Account contracts/domain', () => {
    expect(accountResponse).not.toMatch(/\bphone\s*:/);
    expect(serverAccount).not.toContain('ContactPhone');
    expect(serverAccount).not.toMatch(/\bphone\s*:/);
  });

  it('does not persist retired phone columns in Prisma or PowerSync Account schemas', () => {
    for (const symbol of RETIRED_PHONE_SYMBOLS) {
      expect(accountSchema).not.toContain(symbol);
      expect(powerSyncSchema).not.toContain(symbol);
    }
  });
});
