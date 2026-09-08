import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 1237 (P3): relative vs absolute presentation keep-boundary.
 * - dashboard: product relative via formatProductRelative / facade (i18n band may wrap)
 * Soft residual 1237: absolute product-time sites (setting/goal/capsule) stay separate.
 * Soft residual 1207: formatMessageTime keep-boundary remains separate (Registry boundary).
 */
describe('formatTime keep-boundary (residual 1237)', () => {
  const dir = __dirname;
  const dashboard = readFileSync(
    resolve(dir, '../../modules/dashboard/components/DashboardActivityTimeline.vue'),
    'utf8',
  );
  const setting = readFileSync(
    resolve(dir, '../../modules/setting/components/SettingAdvancedActions.vue'),
    'utf8',
  );
  const weight = readFileSync(
    resolve(dir, '../../modules/goal/components/weight-snapshot/WeightSnapshotList.vue'),
    'utf8',
  );
  const capsule = readFileSync(
    resolve(dir, '../../layouts/shell/previews/ReminderCapsulePreview.vue'),
    'utf8',
  );

  it('dashboard relative uses product-time relative path (no local Date.now bucket table sole)', () => {
    expect(dashboard).toContain('Residual 1237');
    // P3: either formatProductRelative or getProductTime().format.relative
    expect(
      dashboard.includes('formatProductRelative') ||
        dashboard.includes('format.relative') ||
        dashboard.includes("t('dashboard.time."),
    ).toBe(true);
    expect(dashboard).not.toContain('date-fns');
    expect(dashboard).not.toContain("format(new Date");
  });

  it('soft residual 1237 absolute product-time sites stay separate from relative', () => {
    expect(setting).toContain('formatProductDateTime');
    expect(setting).not.toMatch(/function formatTime\b/);
    expect(weight).toContain('formatProductPattern');
    expect(weight).not.toMatch(/function formatTime\b/);
    expect(capsule).toContain('formatProductHm');
    expect(capsule).not.toMatch(/function formatTime\b/);
  });

  it('documents residual 1237 lock intent', () => {
    const self = readFileSync(
      resolve(dir, 'format-time-keep-boundary.surface.spec.ts'),
      'utf8',
    );
    expect(self).toContain('Residual 1237');
    expect(self).toContain('keep-boundary');
  });
});
