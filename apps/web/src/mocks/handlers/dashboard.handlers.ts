/**
 * MSW Handlers - Dashboard Module
 *
 * Aggregated dashboard statistics endpoint.
 * Returns combined data from all modules for the dashboard view.
 */

import { http, HttpResponse } from 'msw';
import { faker } from '@faker-js/faker';
import { GoalStatus } from '@memoflow/contracts/goal';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

function generateDashboardStats() {
  const now = Date.now();
  const DAY = 86_400_000;

  // --- Stat cards ---
  const stats = {
    activeTasks: faker.number.int({ min: 8, max: 25 }),
    completedToday: faker.number.int({ min: 1, max: 8 }),
    activeGoals: faker.number.int({ min: 3, max: 12 }),
    upcomingReminders: faker.number.int({ min: 2, max: 10 }),
    unreadNotifications: faker.number.int({ min: 0, max: 15 }),
    scheduleConflicts: faker.number.int({ min: 0, max: 3 }),
  };

  // --- Activity timeline (last 10 events) ---
  const activityTypes = [
    'task_completed',
    'goal_updated',
    'reminder_fired',
    'task_created',
    'review_added',
    'schedule_created',
  ] as const;
  const activityTimeline = Array.from({ length: 10 }, (_, i) => {
    const type = faker.helpers.arrayElement(activityTypes);
    const descriptions: Record<string, () => string> = {
      task_completed: () => `完成了任务「${faker.lorem.words(3)}」`,
      goal_updated: () => `更新了目标「${faker.lorem.words(2)}」的进度`,
      reminder_fired: () => `提醒「${faker.lorem.words(2)}」已触发`,
      task_created: () => `创建了新任务「${faker.lorem.words(3)}」`,
      review_added: () => `为目标「${faker.lorem.words(2)}」添加了复盘`,
      schedule_created: () => `创建了日程「${faker.lorem.words(3)}」`,
    };
    return {
      id: faker.string.uuid(),
      type,
      description: descriptions[type](),
      timestamp: now - i * faker.number.int({ min: 600_000, max: 7_200_000 }),
    };
  }).sort((a, b) => b.timestamp - a.timestamp);

  // --- Trend data (last 7 days) ---
  const trendDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now - (6 - i) * DAY);
    return {
      date: date.toISOString().slice(0, 10),
      tasksCompleted: faker.number.int({ min: 0, max: 10 }),
      tasksCreated: faker.number.int({ min: 1, max: 8 }),
      focusMinutes: faker.number.int({ min: 0, max: 240 }),
    };
  });

  // --- Goal progress (top 5 active goals) ---
  const goalProgress = Array.from({ length: 5 }, () => ({
    id: faker.string.uuid(),
    name: faker.lorem.words({ min: 2, max: 4 }),
    progress: faker.number.int({ min: 5, max: 95 }),
    status: GoalStatus.InProgress,
    dueDate: now + faker.number.int({ min: 7 * DAY, max: 90 * DAY }),
    keyResultCount: faker.number.int({ min: 1, max: 5 }),
  }));

  // --- Task board summary ---
  const taskBoard = {
    todo: faker.number.int({ min: 3, max: 15 }),
    inProgress: faker.number.int({ min: 1, max: 8 }),
    done: faker.number.int({ min: 5, max: 20 }),
    overdue: faker.number.int({ min: 0, max: 4 }),
  };

  // --- Upcoming schedule (next 5 events) ---
  const upcomingSchedule = Array.from({ length: 5 }, (_, i) => {
    const start = now + (i + 1) * faker.number.int({ min: 3_600_000, max: 18_000_000 });
    return {
      id: faker.string.uuid(),
      title: faker.lorem.words({ min: 2, max: 5 }),
      startTime: start,
      endTime: start + faker.number.int({ min: 1_800_000, max: 7_200_000 }),
      priority: faker.number.int({ min: 1, max: 5 }),
    };
  }).sort((a, b) => a.startTime - b.startTime);

  return {
    stats,
    activityTimeline,
    trendDays,
    goalProgress,
    taskBoard,
    upcomingSchedule,
  };
}

export const dashboardHandlers = [
  http.get(`${API_BASE}/dashboard/stats`, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: generateDashboardStats(),
      timestamp: Date.now(),
    });
  }),
];
