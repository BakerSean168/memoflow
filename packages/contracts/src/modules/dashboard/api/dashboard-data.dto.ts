import { z } from 'zod';
import type { GoalId, ScheduleTaskId } from '../../../primitives';
import { brandedId } from '../../../primitives';
import { GoalStatus } from '../../goal/value-objects/goal-status';
import { GoalTimeframeSchema } from '../../goal/value-objects/goal-timeframe';

export const DashboardStatsSchema = z.object({
  activeTasks: z.number().int().nonnegative(),
  completedToday: z.number().int().nonnegative(),
  activeGoals: z.number().int().nonnegative(),
  upcomingReminders: z.number().int().nonnegative(),
  unreadNotifications: z.number().int().nonnegative(),
  scheduleConflicts: z.number().int().nonnegative(),
});

export type DashboardStats = z.infer<typeof DashboardStatsSchema>;

export const DashboardActivityItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string(),
  timestamp: z.number().int().nonnegative(),
});

export type ActivityItem = z.infer<typeof DashboardActivityItemSchema>;

export const DashboardTrendDaySchema = z.object({
  date: z.string(),
  tasksCompleted: z.number().int().nonnegative(),
  tasksCreated: z.number().int().nonnegative(),
  focusMinutes: z.number().int().nonnegative(),
});

export type TrendDay = z.infer<typeof DashboardTrendDaySchema>;

export const DashboardGoalProgressItemSchema = z.object({
  id: brandedId<GoalId>(),
  name: z.string(),
  progress: z.number().int().min(0).max(100),
  status: z.enum(GoalStatus),
  target: GoalTimeframeSchema.nullable(),
  keyResultCount: z.number().int().nonnegative(),
});

export type GoalProgressItem = z.infer<typeof DashboardGoalProgressItemSchema>;

export const DashboardTaskBoardSummarySchema = z.object({
  todo: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
});

export type TaskBoardSummary = z.infer<typeof DashboardTaskBoardSummarySchema>;

export const DashboardScheduleItemSchema = z.object({
  id: brandedId<ScheduleTaskId>(),
  title: z.string(),
  startTime: z.number().int(),
  endTime: z.number().int(),
  priority: z.number().int(),
});

export type ScheduleItem = z.infer<typeof DashboardScheduleItemSchema>;

export const DashboardDataSchema = z.object({
  stats: DashboardStatsSchema,
  activityTimeline: z.array(DashboardActivityItemSchema),
  trendDays: z.array(DashboardTrendDaySchema),
  goalProgress: z.array(DashboardGoalProgressItemSchema),
  taskBoard: DashboardTaskBoardSummarySchema,
  upcomingSchedule: z.array(DashboardScheduleItemSchema),
});

export type DashboardData = z.infer<typeof DashboardDataSchema>;
