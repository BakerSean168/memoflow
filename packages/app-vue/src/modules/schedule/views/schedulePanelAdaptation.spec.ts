import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));
const scheduleSource = readFileSync(resolve(dir, 'ScheduleCalendarView.vue'), 'utf8');
const plannerSource = readFileSync(resolve(dir, '../planner/PlannerCalendar.vue'), 'utf8');

describe('Schedule single-page architecture', () => {
  it('keeps one MemoFlow toolbar while FullCalendar is the sole rendering engine', () => {
    expect(scheduleSource).toContain('data-testid="schedule-page-toolbar"');
    expect(scheduleSource).toContain('data-primary-action="create-schedule"');
    expect(scheduleSource.match(/data-primary-action=/g)).toHaveLength(1);
    expect(scheduleSource).toContain(':aria-selected="activeView === tab.value"');
    expect(scheduleSource).toContain('<PlannerCalendar');
    expect(scheduleSource).not.toContain('<DayViewCalendar');
    expect(scheduleSource).not.toContain('<WeekViewCalendar');
    expect(scheduleSource).not.toContain('<MonthViewCalendar');
    expect(scheduleSource).not.toContain('usePanelWidth');
    expect(scheduleSource).not.toContain('effectiveView');
  });

  it('does not turn a committed schedule create into a save failure when planner refresh rejects', () => {
    expect(scheduleSource).toContain("toast.success(t('schedule.toast.scheduleCreated'))");
    expect(scheduleSource).toContain("toast.warning(t('schedule.toast.scheduleCreatedRefreshFailed'))");
    expect(scheduleSource).toContain('if (windowStart.value && windowEnd.value) {');
    expect(scheduleSource).toContain('await fetchForRange(windowStart.value, windowEnd.value)');
    expect(scheduleSource).toContain('} catch {');
  });

  it('owns navigation in the MemoFlow toolbar and delegates date math/window ownership to FullCalendar', () => {
    expect(scheduleSource).toContain('data-testid="schedule-period-navigation"');
    expect(scheduleSource).toContain('plannerCalendarRef.value?.previous()');
    expect(scheduleSource).toContain('plannerCalendarRef.value?.next()');
    expect(scheduleSource).toContain('plannerCalendarRef.value?.today()');
    expect(scheduleSource).not.toContain('resolveCalendarWindow');
    expect(scheduleSource).not.toContain('getWeekStart');
    expect(scheduleSource).not.toContain('setMonth(');
    expect(plannerSource).toContain("headerToolbar: false");
    expect(plannerSource).toContain("datesSet(info)");
  });
});
