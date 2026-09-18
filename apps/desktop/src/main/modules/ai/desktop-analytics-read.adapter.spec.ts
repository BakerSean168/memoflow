import { ok } from '@memoflow/contracts/result';
import type { AnalyticsTaskDashboard } from '@memoflow/ai/ports';
import { describe, expect, it, vi } from 'vitest';
import { DesktopAnalyticsReadAdapter } from './desktop-analytics-read.adapter';

const IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440000';
const TIME_CONTEXT = { timeZone: 'UTC' as never, weekStartsOn: 1 as const };

function taskDashboard(): AnalyticsTaskDashboard {
  return {
    todayTasks: [],
    overdueTasks: [],
    upcomingTasks: [],
    highPriorityTasks: [],
    summary: { totalTasks: 2, completedToday: 1, overdue: 1, upcoming: 0, highPriority: 0 },
  };
}

function fixture() {
  const goalApplicationPort = {
    getHomeSummary: vi.fn(async () => ok({ activeCount: 2, goals: [] })),
    listGoals: vi.fn(async () =>
      ok({
        data: [],
        pagination: { page: 1, pageSize: 10, total: 0, hasMore: false, totalPages: 0 },
      }),
    ),
    searchGoals: vi.fn(async () =>
      ok({
        data: [],
        pagination: { page: 1, pageSize: 10, total: 0, hasMore: false, totalPages: 0 },
      }),
    ),
  };
  const taskDashboardReadPort = {
    getDashboard: vi.fn(async () => taskDashboard()),
  };
  const plannerReadPort = {
    getWindowSummary: vi.fn(async () => ({
      startTime: 0,
      endTime: 0,
      calendar: [
        {
          id: 'schedule-1',
          title: 'Focus block',
          startTime: Date.parse('2026-09-19T10:00:00Z'),
          endTime: Date.parse('2026-09-19T11:00:00Z'),
          hasConflict: true,
          conflictingEntryIds: ['schedule-2'],
        },
      ],
      tasks: [],
    })),
  };
  const notificationReadPort = {
    getUnreadSummary: vi.fn(async () => ({ unreadCount: 3, items: [] })),
  };
  const activityReadPort = {
    listRecent: vi.fn(async () => [
      { id: 'activity-1', type: 'completed', description: 'Finished a task', timestamp: 1 },
    ]),
  };
  const userTimeContextPort = {
    getUserTimeContext: vi.fn(async () => TIME_CONTEXT),
  };

  return {
    adapter: new DesktopAnalyticsReadAdapter({
      goalApplicationPort,
      taskDashboardReadPort,
      plannerReadPort,
      notificationReadPort,
      activityReadPort,
      userTimeContextPort,
    }),
    goalApplicationPort,
    plannerReadPort,
    activityReadPort,
  };
}

describe('DesktopAnalyticsReadAdapter', () => {
  it('matches the API owner projection shape and Product-Time bounds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T12:00:00Z'));
    try {
      const fixtureData = fixture();
      const context = await fixtureData.adapter.buildContext(IDENTITY_ID, 'focus');

      expect(context).not.toHaveProperty('dashboard');
      expect(context.ownerReads.goal.progress.activeCount).toBe(2);
      expect(context.ownerReads.schedule.upcoming).toEqual([
        {
          id: 'schedule-1',
          title: 'Focus block',
          startTime: Date.parse('2026-09-19T10:00:00Z'),
          endTime: Date.parse('2026-09-19T11:00:00Z'),
          priority: 0,
        },
      ]);
      expect(context.ownerReads.notification.unreadCount).toBe(3);
      expect(fixtureData.goalApplicationPort.listGoals).toHaveBeenCalledWith(
        expect.objectContaining({ systemView: 'active', includeKeyResults: true, pageSize: 10 }),
      );
      expect(fixtureData.plannerReadPort.getWindowSummary).toHaveBeenCalledWith({
        identityId: IDENTITY_ID,
        startTime: Date.parse('2026-09-18T00:00:00Z'),
        endTime: Date.parse('2026-10-18T12:00:00Z'),
      });
      expect(fixtureData.activityReadPort.listRecent).toHaveBeenCalledWith({
        identityId: IDENTITY_ID,
        since: Date.parse('2026-09-04T12:00:00Z'),
        limit: 10,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
