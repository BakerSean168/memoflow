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
  const apiActivityRead = readFileSync(
    resolve(repoRoot, 'apps/api/src/modules/ai/activity-ledger-read.adapter.ts'),
    'utf8',
  );
  const apiCompose = readFileSync(resolve(repoRoot, 'apps/api/src/runtime/compose-ai.ts'), 'utf8');
  const desktopMain = readFileSync(resolve(repoRoot, 'apps/desktop/src/main/main.ts'), 'utf8');
  const desktopAnalyticsComposition = desktopMain.slice(
    desktopMain.indexOf('const analyticsReadAdapter = new DesktopAnalyticsReadAdapter({'),
    desktopMain.indexOf('const AIElectronModule = composeAI({'),
  );

  it('keeps /dashboard as a compatibility redirect rather than a product page', () => {
    expect(router).toContain("path: 'dashboard'");
    expect(router).toContain("name: 'dashboard'");
    expect(router).toContain("redirect: '/'");
    expect(router).not.toMatch(/path:\s*'dashboard'[\s\S]{0,220}component:/);
  });

  it('confirms Home/Goal consumers have completed the owner-read cutover', () => {
    expect(todayOverview).not.toContain("from '../../modules/dashboard/composables/useDashboard'");
    expect(todayOverview).toContain('useGoalHomeSummary');
    expect(goalCapsule).not.toContain("from '../../../modules/dashboard/composables/useDashboard'");
    expect(goalCapsule).toContain('useGoalHomeSummary');
  });

  it('records AI owner-read cutover and the transitional ActivityLedger dependency', () => {
    for (const source of [
      apiAnalytics,
      desktopAnalytics,
      apiCompose,
      desktopAnalyticsComposition,
    ]) {
      expect(source).not.toContain('DashboardData');
      expect(source).not.toContain('dashboardDataLoader');
      expect(source).not.toContain('getApiDashboardData');
      expect(source).not.toContain('@memoflow/contracts/dashboard');
      expect(source).not.toContain('as unknown as Record<string, unknown>');
      expect(source).toContain('goalApplicationPort');
      expect(source).toContain('taskDashboardReadPort');
      expect(source).toContain('plannerReadPort');
      expect(source).toContain('activityReadPort');
    }
    expect(apiActivityRead).toContain('ActivityLedger');
    expect(apiActivityRead).toContain('HOME-1804');
    expect(apiActivityRead).toContain('listRecent');
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
