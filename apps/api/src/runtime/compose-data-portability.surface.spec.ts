import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Data Portability API runtime composer surface.
 * 数据导出导入 API runtime composer 表面契约。
 *
 * Locks the Step C wiring: apps/api/src/server.ts must compose data-portability
 * through the runtime composer and must no longer reference the retired
 * `DataPortabilityApiModule` constant or the `@memoflow/data-portability/api`
 * seam. The composer must only touch the narrow seams the plan allows.
 *
 * 锁定 Step C 接线：apps/api/src/server.ts 必须通过 runtime composer 组装
 * data-portability，且不再引用已退役的 `DataPortabilityApiModule` 常量或
 * `@memoflow/data-portability/api` seam。composer 只允许接触计划允许的窄 seam。
 */
describe('data-portability API runtime composer surface', () => {
  const dir = resolve(__dirname, '..');
  const server = readFileSync(resolve(dir, 'server.ts'), 'utf8');
  const composer = readFileSync(resolve(dir, 'runtime/compose-data-portability.ts'), 'utf8');

  it('server.ts composes data-portability with the stable owner V3 capabilities', () => {
    expect(server).toContain("from './runtime/compose-data-portability'");
    expect(server).toMatch(/composeDataPortability\(\{[\s\S]*?db: prisma,/);
    expect(server).toContain('settingApiModule.portableCapability');
    expect(server).toContain('notificationApiModule.module.portableCapability');
    expect(server).toContain('.register(dataPortabilityApiModule.module)');
  });

  it('server.ts no longer references DataPortabilityApiModule or the data-portability/api seam', () => {
    expect(server).not.toMatch(/\bDataPortabilityApiModule\b/);
    expect(server).not.toContain("from '@memoflow/data-portability/api'");
  });

  it('composer forwards owner capabilities without importing owner internals', () => {
    expect(composer).toContain('portableCapabilities?: readonly PortableCapability<unknown>[]');
    expect(composer).toContain('portableCapabilities: dependencies.portableCapabilities');
    expect(composer).not.toContain('@memoflow/setting');
    expect(composer).not.toContain('@memoflow/notification');
  });

  it('composer only touches the narrow seams (no deep server import)', () => {
    expect(composer).toContain('interface ComposeDataPortabilityDependencies');
    expect(composer).toContain("from '@memoflow/data-portability'");
    expect(composer).toContain("from '@memoflow/data-portability/api'");
    expect(composer).not.toMatch(/@memoflow\/data-portability\/server/);
  });
});
