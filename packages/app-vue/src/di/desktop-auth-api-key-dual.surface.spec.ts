import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 915: DESKTOP_AUTH_API_KEY dual retired.
 * InjectionKey uses DesktopAuthApi sole invoke-api body (not Pick<ElectronBridge, 'invoke'>).
 * Residual 903 (soft): DesktopBootstrapApi dual retired
 *   (shared/utils/desktop-bootstrap-api-dual.surface.spec.ts).
 * Residual 913 (soft): host-access cast duals retired
 *   (shared/utils/desktop-host-access-dual.surface.spec.ts).
 * Does not flip §13.2 checkboxes.
 */
describe('DESKTOP_AUTH_API_KEY dual retired (residual 915)', () => {
  const diDir = __dirname;
  const keys = readFileSync(resolve(diDir, 'keys.ts'), 'utf8');
  const recovery = readFileSync(
    resolve(diDir, '../shared/utils/desktop-auth-recovery.ts'),
    'utf8',
  );

  it('types DESKTOP_AUTH_API_KEY as InjectionKey of DesktopAuthApi', () => {
    expect(keys).toContain('Residual 915');
    expect(keys).toContain(
      "import type { DesktopAuthApi } from '../shared/utils/desktop-auth-recovery'",
    );
    expect(keys).toContain(
      'export const DESKTOP_AUTH_API_KEY: InjectionKey<DesktopAuthApi>',
    );
    expect(keys).not.toMatch(
      /DESKTOP_AUTH_API_KEY:\s*InjectionKey<Pick<ElectronBridge/,
    );
  });

  it('keeps sole DesktopAuthApi object-type body in recovery module', () => {
    expect(recovery).toContain('Residual 915');
    expect(recovery).toMatch(/export type DesktopAuthApi = \{/);
    expect(recovery).toContain(
      'invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>',
    );
  });

  it('keeps DESKTOP_BRIDGE_KEY as full ElectronBridge keep-boundary', () => {
    expect(keys).toContain("import type { ElectronBridge } from '@memoflow/ipc-client'");
    expect(keys).toContain(
      'export const DESKTOP_BRIDGE_KEY: InjectionKey<ElectronBridge>',
    );
    expect(keys).toContain("Symbol('DesktopBridge')");
    expect(keys).toContain("Symbol('DesktopAuthApi')");
  });
});
