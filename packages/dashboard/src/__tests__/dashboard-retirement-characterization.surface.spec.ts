import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Dashboard retirement characterization (SYS-0001 / ADR-108)', () => {
  const repoRoot = resolve(__dirname, '../../../..');
  const router = readFileSync(resolve(repoRoot, 'packages/app-vue/src/router/index.ts'), 'utf8');
  const todayOverview = readFileSync(
    resolve(repoRoot, 'packages/app-vue/src/layouts/shell/TodayOverviewPanel.vue'),
    'utf8',
  );
  const goalCapsule = readFileSync(
    resolve(repoRoot, 'packages/app-vue/src/layouts/shell/previews/GoalCapsulePreview.vue'),
    'utf8',
  );
  const apiAnalytics = readFileSync(
    resolve(repoRoot, 'apps/api/src/modules/ai/controlled-analytics-read.adapter.ts'),
    'utf8',
  );
  const desktopAnalytics = readFileSync(
    resolve(repoRoot, 'apps/desktop/src/main/modules/ai/desktop-analytics-read.adapter.ts'),
    'utf8',
  );

  it('keeps /dashboard as a compatibility redirect rather than a product page', () => {
    expect(router).toContain("path: 'dashboard'");
    expect(router).toContain("name: 'dashboard'");
    expect(router).toContain("redirect: '/'");
    expect(router).not.toMatch(/path:\s*'dashboard'[\s\S]{0,220}component:/);
  });

  it('records the remaining live Home/Goal consumers that must migrate before package deletion', () => {
    expect(todayOverview).toContain("from '../../modules/dashboard/composables/useDashboard'");
    expect(goalCapsule).toContain("from '../../../modules/dashboard/composables/useDashboard'");
  });

  it('records the remaining AI analytics dependency on DashboardData', () => {
    expect(apiAnalytics).toContain('getApiDashboardData');
    expect(apiAnalytics).toContain('dashboard as unknown as Record<string, unknown>');
    expect(desktopAnalytics).toContain("from '@memoflow/contracts/dashboard'");
    expect(desktopAnalytics).toContain('dashboardDataLoader');
  });

  it('keeps the already-retired page-only components physically absent', () => {
    for (const name of [
      'DashboardActivityTimeline.vue',
      'DashboardStatsStrip.vue',
      'DashboardTrendPanel.vue',
    ]) {
      expect(
        existsSync(resolve(repoRoot, 'packages/app-vue/src/modules/dashboard/components', name)),
      ).toBe(false);
    }
  });
});
