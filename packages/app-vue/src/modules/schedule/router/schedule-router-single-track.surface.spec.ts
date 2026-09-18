import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 230/232/233: schedule router has a single calendar entry.
 * No week/legacy dual-track redirect routes; docs/E2E match code.
 */
describe('schedule router single-track surface', () => {
  const router = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');
  const repoRoot = resolve(__dirname, '../../../../../../');
  const weekE2e = resolve(repoRoot, 'apps/web/e2e/schedule/schedule-week-view.spec.ts');
  const calendarE2e = resolve(repoRoot, 'apps/web/e2e/schedule/schedule-calendar.spec.ts');
  const scheduleFilesIndex = readFileSync(
    resolve(repoRoot, 'docs/product/module-index/schedule-files.md'),
    'utf8',
  );
  const brief = readFileSync(resolve(repoRoot, 'docs/UI_REDESIGN_BRIEF.md'), 'utf8');
  const v2 = readFileSync(resolve(repoRoot, 'docs/UI_REDESIGN_V2_PLAN.md'), 'utf8');
  const page = readFileSync(resolve(repoRoot, 'docs/UI_PAGE_REDESIGN_PLAN.md'), 'utf8');

  it('registers only calendar child route (no week/legacy dual redirects)', () => {
    expect(router).toContain("path: 'calendar'");
    expect(router).toContain("name: 'ScheduleCalendar'");
    expect(router).not.toContain("path: 'week'");
    expect(router).not.toContain("path: 'dashboard'");
    expect(router).not.toContain('ScheduleWeekView');
    expect(router).not.toContain('ScheduleDashboard');
    expect(router).not.toContain('backward compatibility');
  });

  it('docs and e2e follow single calendar entry (no dual week route surface)', () => {
    expect(existsSync(calendarE2e)).toBe(true);
    expect(existsSync(weekE2e)).toBe(false);
    expect(scheduleFilesIndex).toContain('ScheduleCalendarView.vue');
    expect(scheduleFilesIndex).toContain('/schedule/calendar');
    expect(scheduleFilesIndex).not.toContain('ScheduleWeekView.vue');
    expect(scheduleFilesIndex).not.toContain('ScheduleDashboardView.vue');
    expect(scheduleFilesIndex).not.toContain('重定向到主视图');
  });

  it('active redesign docs name ScheduleCalendarView (no week/legacy dual claims)', () => {
    expect(brief).toContain('ScheduleCalendarView.vue');
    expect(brief).not.toContain('`week`、`dashboard` 为兼容重定向');
    expect(brief).not.toContain('schedule/views/ScheduleDashboardView.vue');
    expect(v2).toContain('ScheduleCalendarView');
    expect(v2).not.toContain('schedule `week/legacy` redirect');
    expect(page).toContain('## 7. 日程 `/schedule/calendar`（`ScheduleCalendarView.vue`）');
  });
});
