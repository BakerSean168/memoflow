import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Account close-response envelope surface (W3 round 2):
 * close account returns a structured AccountClosureReceiptDTO (P1-1 receipt flow).
 */
describe('account close receipt envelope surface', () => {
  const routes = readFileSync(resolve(__dirname, './routes.ts'), 'utf8');
  const controller = readFileSync(
    resolve(__dirname, '../server/transport/account.controller.ts'),
    'utf8',
  );
  const electron = readFileSync(resolve(__dirname, '../electron/index.ts'), 'utf8');
  const lifecycle = readFileSync(
    resolve(__dirname, '../../../contracts/src/modules/account/api/account-lifecycle.dto.ts'),
    'utf8',
  );
  const dtosIndex = readFileSync(
    resolve(__dirname, '../../../contracts/src/modules/account/dtos/index.ts'),
    'utf8',
  );

  it('OpenAPI close returns AccountClosureReceiptDTO (structured receipt)', () => {
    expect(routes).toContain("/me/close");
    expect(routes).not.toContain("successResponse(z.null(), '注销成功')");
    expect(lifecycle).toContain('export type CloseAccountRes = AccountClosureReceiptDTO');
    expect(lifecycle).not.toContain('ImportAccountData');
    expect(dtosIndex).not.toContain('ImportAccountDataResultDTO');
  });

  it('controller returns CloseAccountRes receipt (not null)', () => {
    expect(controller).toMatch(/async closeAccount[\s\S]*?Promise<Result<.*CloseAccountRes>>/);
    expect(electron).toContain('AccountChannels.CLOSE');
  });
});
