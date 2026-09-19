import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ACC-1402: Account transport and domain client intentionally expose different read models.
 * Transport returns AccountView (product Account snapshot + safe Cloud identity summary),
 * while AccountClientPort returns AccountClientView (domain Account + the same separate summary).
 * Cloud identity must never be folded into the Account aggregate.
 */
describe('account client view mapping boundary', () => {
  const service = readFileSync(resolve(__dirname, 'account-client-service.ts'), 'utf8');
  const port = readFileSync(resolve(__dirname, '../ports/account-api-client.port.ts'), 'utf8');

  it('IAccountApiClient returns AccountView on profile reads/writes', () => {
    expect(port).toContain('export interface IAccountApiClient');
    expect(port).toMatch(/getMyProfile\(\):\s*Promise<Result<AccountView>>/);
    expect(port).toMatch(
      /updateMyProfile\(request: UpdateAccountReq\):\s*Promise<Result<AccountView>>/,
    );
    expect(port).not.toContain('Promise<Result<AccountClientDTO>>');
  });

  it('AccountClientPort maps AccountView to AccountClientView without polluting Account', () => {
    expect(service).toMatch(/export interface AccountClientView\s*\{/);
    expect(service).toMatch(/readonly account: Account;/);
    expect(service).toMatch(/readonly cloudIdentity: CloudIdentitySummary \| null;/);
    expect(service).toMatch(/export interface AccountClientPort\s*\{/);
    expect(service).not.toMatch(/export type AccountClientPort\s*=\s*IAccountApiClient/);
    expect(service).toMatch(/getMyProfile\(\):\s*Promise<Result<AccountClientView>>/);
    expect(service).toMatch(
      /updateMyProfile\(request: UpdateAccountReq\):\s*Promise<Result<AccountClientView>>/,
    );
    expect(service).toContain('function mapAccountResult');
    expect(service).toContain('account: accountFromDTO(view.account)');
    expect(service).toContain('cloudIdentity: view.cloudIdentity');
    const accountMapper = service.slice(
      service.indexOf('function accountFromDTO'),
      service.indexOf('export interface AccountClientView'),
    );
    expect(accountMapper).not.toContain('cloudIdentity');
  });
});
