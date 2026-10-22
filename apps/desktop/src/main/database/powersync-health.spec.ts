import { describe, expect, it } from 'vitest';
import { describePowerSyncStatus } from './powersync-health';

describe('PowerSync safe first-download diagnostics', () => {
  it('does not confuse attached or connecting with first download checkpoint', () => {
    expect(
      describePowerSyncStatus({
        connected: false,
        connecting: true,
        hasSynced: false,
      }),
    ).toEqual({ phase: 'connecting', hasSynced: false });
    expect(
      describePowerSyncStatus({
        connected: true,
        connecting: false,
        hasSynced: false,
      }),
    ).toEqual({ phase: 'connected', hasSynced: false });
    expect(
      describePowerSyncStatus({
        connected: true,
        connecting: false,
        hasSynced: true,
      }),
    ).toEqual({ phase: 'synced', hasSynced: true });
  });

  it('recognizes SDK download failures without copying secret-bearing error messages or stack', () => {
    const sensitive = 'Bearer secret-never-log-this';
    const error = Object.assign(new Error(sensitive), {
      name: 'FetchError',
      code: 'PSYNC_S2106',
      status: 401,
      stack: sensitive,
      url: 'https://private.example.test?secret=' + sensitive,
    });
    const snapshot = describePowerSyncStatus({
      connected: false,
      connecting: true,
      hasSynced: false,
      dataFlowStatus: { downloadError: error },
    });
    expect(snapshot).toEqual({
      phase: 'download_error',
      hasSynced: false,
      errorType: 'FetchError',
      errorCode: 'PSYNC_S2106',
      httpStatus: 401,
    });
    expect(JSON.stringify(snapshot)).not.toContain(sensitive);
    expect(JSON.stringify(snapshot)).not.toContain('private.example.test');
  });

  it('rejects arbitrary error names, codes and out-of-range status values', () => {
    const details = describePowerSyncStatus({
      dataFlowStatus: {
        downloadError: {
          name: 'secret=someBearerAccessToken',
          code: 'secret=value',
          status: 999,
        },
      },
    });
    expect(details).toEqual({
      phase: 'download_error',
      hasSynced: false,
      errorType: 'UnknownError',
    });
    // Alphanumeric-only secret material must also not masquerade as an error class.
    expect(
      describePowerSyncStatus({
        dataFlowStatus: { downloadError: { name: 'MySecretPlainTextTokenABC123' } },
      }).errorType,
    ).toBe('UnknownError');
  });

  it('reports no connection for empty/idle SDK status without manufacturing a download', () => {
    expect(describePowerSyncStatus(undefined)).toEqual({ phase: 'idle', hasSynced: false });
    expect(describePowerSyncStatus({})).toEqual({ phase: 'idle', hasSynced: false });
  });
});
