import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Desktop Update renderer DI composition', () => {
  const source = readFileSync(resolve(__dirname, 'di-app.ts'), 'utf8');

  it('provides exactly one IPC-backed DesktopUpdateService at the host boundary', () => {
    expect(source.match(/createDesktopUpdateService\(/gu)).toHaveLength(1);
    expect(source.match(/app\.provide\(DESKTOP_UPDATE_SERVICE_KEY/gu)).toHaveLength(1);
    expect(source).toContain('createDesktopUpdateService(resultIpcClient, bridge)');
  });

  it('does not inline Desktop Update channels in shared DI composition', () => {
    expect(source).not.toContain('desktop-update:get-snapshot');
    expect(source).not.toContain('desktop-update:check');
    expect(source).not.toContain('desktop-update:restart-and-install');
    expect(source).not.toContain('desktop-update:state-changed');
  });
});
