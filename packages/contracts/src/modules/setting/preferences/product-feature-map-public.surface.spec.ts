import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 339: product feature-map auth/AI status stays current, and retired
 * web public debug/test pages stay deleted (stage-6 runtime surface cleanup).
 */
describe('product feature-map + web public debug surface', () => {
  const repoRoot = resolve(__dirname, '../../../../../../');
  const featureMap = readFileSync(resolve(repoRoot, 'docs/product/feature-map.md'), 'utf8');
  const publicDir = resolve(repoRoot, 'apps/web/public');

  it('feature-map auth row describes the Better Auth and local Profile split', () => {
    expect(featureMap).not.toContain('GitHub 服务端骨架已落地');
    expect(featureMap).not.toContain('只完成服务端 callback 骨架');
    expect(featureMap).toContain('Better Auth 账密/GitHub');
    expect(featureMap).toContain('Desktop guest/Profile unlock');
    expect(featureMap).toContain('云端失效只暂停同步');
    expect(featureMap).toContain('packages/cloud-auth');
    expect(featureMap).toContain('apps/desktop/src/main/profile');
    expect(featureMap).toContain('apps/web/src/auth');
  });

  it('feature-map AI row reflects the Mastra-native single runtime', () => {
    expect(featureMap).toContain('Mastra-native vNext 已落地');
    expect(featureMap).toContain('Mastra 是唯一 Assistant/Workflow runtime');
    expect(featureMap).toContain('apps/api/src/runtime/compose-ai.ts');
    expect(featureMap).toContain('apps/desktop/src/main/runtime/compose-ai.ts');
    expect(featureMap).not.toContain('ADR-035 Host 部分落地');
    expect(featureMap).not.toContain('CustomModelGateway');
    expect(featureMap).not.toContain('CapabilityResolver');
  });

  it('retired web public debug/test pages stay deleted (residual 337/339)', () => {
    for (const name of [
      'editor-test.html',
      'schedule-test.html',
      'sse-test.html',
      'debug-events.js',
    ]) {
      expect(existsSync(resolve(publicDir, name))).toBe(false);
    }
    // Product static assets that must remain.
    expect(existsSync(resolve(publicDir, 'favicon.ico'))).toBe(true);
    expect(existsSync(resolve(publicDir, 'sw.js'))).toBe(true);
  });
});
