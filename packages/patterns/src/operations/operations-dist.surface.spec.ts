import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = resolve(import.meta.dirname, '..', '..');

describe('P1-1 @memoflow/patterns/operations 发布产物存在性门禁', () => {
  const distDir = resolve(PACKAGE_ROOT, 'dist/operations');

  it('package.json 的 ./operations export 指向 dist/operations/index.js', () => {
    const pkg = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      exports: Record<string, { import?: string; types?: string }>;
    };
    expect(pkg.exports['./operations'].import).toBe('./dist/operations/index.js');
    expect(pkg.exports['./operations'].types).toBe('./dist/operations/index.d.ts');
  });

  it('tsup entry 已登记 src/operations/index.ts', () => {
    const tsup = readFileSync(resolve(PACKAGE_ROOT, 'tsup.config.ts'), 'utf8');
    expect(tsup).toContain("'src/operations/index.ts'");
  });

  it('dist 产物存在（每个新 export 的 JS/DTS）', () => {
    for (const file of ['index.js', 'index.d.ts']) {
      expect(existsSync(resolve(distDir, file)), `${file} 缺失`).toBe(true);
    }
  });

  it('dist 产物非空且含预期符号', () => {
    const js = readFileSync(resolve(distDir, 'index.js'), 'utf8');
    for (const symbol of [
      'mapProjectionToTimelineEntry',
      'mapReceiptToTimelineEntry',
      'outboxMetricKey',
      'workerMetricKey',
    ]) {
      expect(js, `产物缺少 ${symbol}`).toContain(symbol);
    }
  });
});
