import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Server-held data disclosure surface (stage-6 residual 75 / §13.2):
 * Web-only product path. Desktop injects DESKTOP_AUTH_API_KEY and must not
 * expose disclosure export (IPC adapter fails closed with NOT_SUPPORTED).
 */
describe('useDataPortability server-held disclosure surface', () => {
  const composable = readFileSync(resolve(__dirname, 'useDataPortability.ts'), 'utf8');
  const ipcAdapter = readFileSync(
    resolve(
      __dirname,
      '../../../../../data-portability/src/infrastructure-client/adapters/ipc/data-portability-ipc.adapter.ts',
    ),
    'utf8',
  );
  const dataSettingsSection = readFileSync(
    resolve(__dirname, '../components/DataSettingsSection.vue'),
    'utf8',
  );

  it('gates disclosure availability on service present and Desktop API absent', () => {
    expect(composable).toContain('DATA_PORTABILITY_SERVICE_KEY');
    expect(composable).toContain('DESKTOP_AUTH_API_KEY');
    expect(composable).toContain(
      'const isServerDisclosureAvailable = ref(service !== undefined && desktopApi === undefined);',
    );
    expect(composable).toContain('if (!service || desktopApi !== undefined)');
    expect(composable).toContain(
      'Server-held data disclosure is available from the authenticated Web runtime',
    );
  });

  it('Desktop IPC adapter fails closed without invoking IPC', () => {
    expect(ipcAdapter).toContain('exportServerHeldDataDisclosure');
    expect(ipcAdapter).toContain("code: 'NOT_SUPPORTED'");
    expect(ipcAdapter).toContain(
      'Server-held data disclosure is available from the authenticated Web runtime',
    );
    // Method body must not route through ipcClient.invoke for disclosure.
    const method = ipcAdapter.slice(
      ipcAdapter.indexOf('async exportServerHeldDataDisclosure'),
      ipcAdapter.indexOf('async importUserData'),
    );
    expect(method).not.toContain('this.ipcClient.invoke');
  });

  it('Data owner section wires disclosure only through the composable flag', () => {
    expect(dataSettingsSection).toContain('isServerDisclosureAvailable');
    expect(dataSettingsSection).toContain('exportServerHeldDataDisclosure');
    expect(dataSettingsSection).toContain(':server-data-disclosure-available="isServerDisclosureAvailable"');
    expect(dataSettingsSection).toContain('@export-server-data-disclosure="exportServerHeldDataDisclosure"');
  });
});
