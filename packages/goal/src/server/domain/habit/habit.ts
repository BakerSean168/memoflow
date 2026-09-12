/**
 * Habit 聚合根（R4）。
 *
 * 习惯 = 周期性意图；发生（occurrence）= 某本地日的一次执行机会；
 * 打卡（check-in）= 完成该次发生。连续天数（streak）由已完成发生的
 * 连续本地日期推导（从最后一次打卡向前数，跳过 Skipped 不计断）。
 */

import { createTimeFacade, type TimeContext } from '@memoflow/time';

export type HabitFrequency = 'daily' | 'weekly';
export type HabitStatus = 'Active' | 'Archived';
export type HabitOccurrenceStatus = 'Pending' | 'Completed' | 'Skipped';

export interface HabitOccurrenceData {
  id: string;
  habitId: string;
  /** 本地日 00:00 的 epoch ms。 */
  occurrenceDate: number;
  status: HabitOccurrenceStatus;
  checkedAt: number | null;
  note: string | null;
}

export interface HabitState {
  id: string;
  identityId: string;
  name: string;
  description: string | null;
  frequency: HabitFrequency;
  goalId: string | null;
  status: HabitStatus;
  startDate: number | null;
  occurrences: HabitOccurrenceData[];
  createdAt: number;
  updatedAt: number;
}

export interface HabitStreak {
  currentStreak: number;
  longestStreak: number;
  lastCheckInDate: number | null;
}

/** Product Time 本地日归一化。 */
export function startOfLocalDay(epochMs: number, timeContext: TimeContext): number {
  return Number(createTimeFacade({ context: timeContext }).calendar.startOfDay(epochMs));
}

/** 相邻 Product Time 日差（天数）。 */
function dayDiff(aMs: number, bMs: number, timeContext: TimeContext): number {
  return createTimeFacade({ context: timeContext }).calendar.diffCalendarDays(aMs, bMs);
}

/**
 * 从已完成发生的日期序列推导连续天数。
 * 完成日期按本地日去重；从最近完成日向前数连续天数。
 */
export function calculateStreak(
  completedDates: number[],
  now: number,
  timeContext: TimeContext,
): HabitStreak {
  const today = startOfLocalDay(now, timeContext);
  const dates = Array.from(
    new Set(completedDates.map((d) => startOfLocalDay(d, timeContext))),
  ).sort(
    (a, b) => a - b,
  );

  if (dates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, lastCheckInDate: null };
  }

  // 最近一次完成若早于昨天，当前连续天数已断（今天/昨天均未完成）。
  const last = dates[dates.length - 1];
  if (dayDiff(today, last, timeContext) > 1) {
    return {
      currentStreak: 0,
      longestStreak: longestRun(dates, timeContext),
      lastCheckInDate: last,
    };
  }

  // 从最近完成日（今天或昨天）向前数连续天数：今天未完成时从昨天数，
  // 今天不算断更。
  let currentStreak = 1;
  for (let i = dates.length - 2; i >= 0; i--) {
    if (dayDiff(dates[i + 1], dates[i], timeContext) === 1) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  return {
    currentStreak,
    longestStreak: longestRun(dates, timeContext),
    lastCheckInDate: last,
  };
}

/** 历史最长连续完成天数。 */
function longestRun(dates: number[], timeContext: TimeContext): number {
  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    run = dayDiff(dates[i], dates[i - 1], timeContext) === 1 ? run + 1 : 1;
    if (run > longestStreak) longestStreak = run;
  }
  return longestStreak;
}

export class Habit {
  private _props: HabitState;

  private constructor(state: HabitState) {
    this._props = { ...state };
  }

  static create(params: {
    id?: string;
    identityId: string;
    name: string;
    description?: string | null;
    frequency?: HabitFrequency;
    goalId?: string | null;
    startDate?: number | null;
    now?: number;
    timeContext: TimeContext;
  }): Habit {
    if (!params.name.trim()) {
      throw new Error('Habit name is required');
    }
    const now = params.now ?? Date.now();
    return new Habit({
      id: params.id ?? crypto.randomUUID(),
      identityId: params.identityId,
      name: params.name.trim(),
      description: params.description ?? null,
      frequency: params.frequency ?? 'daily',
      goalId: params.goalId ?? null,
      status: 'Active',
      startDate: params.startDate ?? startOfLocalDay(now, params.timeContext),
      occurrences: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  static load(state: HabitState): Habit {
    return new Habit(state);
  }

  get id(): string {
    return this._props.id;
  }
  get identityId(): string {
    return this._props.identityId;
  }
  get name(): string {
    return this._props.name;
  }
  get description(): string | null {
    return this._props.description;
  }
  get frequency(): HabitFrequency {
    return this._props.frequency;
  }
  get goalId(): string | null {
    return this._props.goalId;
  }
  get status(): HabitStatus {
    return this._props.status;
  }
  get occurrences(): HabitOccurrenceData[] {
    return this._props.occurrences;
  }
  get state(): HabitState {
    return this._props;
  }

  /**
   * 为 [start, end] 区间补齐发生（幂等：已存在日不重复）。
   * @returns 新建的发生列表。
   */
  ensureOccurrences(
    start: number,
    end: number,
    now: number,
    timeContext: TimeContext,
  ): HabitOccurrenceData[] {
    const time = createTimeFacade({ context: timeContext });
    const existing = new Set(
      this._props.occurrences.map((o) => startOfLocalDay(o.occurrenceDate, timeContext)),
    );
    const created: HabitOccurrenceData[] = [];
    const from = startOfLocalDay(start, timeContext);
    const to = startOfLocalDay(end, timeContext);
    for (let day = from; day <= to; day = Number(time.calendar.addDays(day, 1))) {
      if (!existing.has(day)) {
        const occurrence: HabitOccurrenceData = {
          id: crypto.randomUUID(),
          habitId: this._props.id,
          occurrenceDate: day,
          status: 'Pending',
          checkedAt: null,
          note: null,
        };
        this._props.occurrences.push(occurrence);
        created.push(occurrence);
      }
    }
    this._props.updatedAt = now;
    return created;
  }

  /** 打卡：完成某日发生；返回完成后的 streak。 */
  checkIn(
    occurrenceDate: number,
    now: number,
    timeContext: TimeContext,
    note?: string | null,
  ): HabitStreak {
    const day = startOfLocalDay(occurrenceDate, timeContext);
    const occurrence = this._props.occurrences.find(
      (o) => startOfLocalDay(o.occurrenceDate, timeContext) === day,
    );
    if (!occurrence) {
      throw new Error(`No occurrence for ${day}`);
    }
    occurrence.status = 'Completed';
    occurrence.checkedAt = now;
    occurrence.note = note ?? null;
    this._props.updatedAt = now;
    return this.streak(now, timeContext);
  }

  /** 跳过某日发生（不计断 streak）。 */
  skip(occurrenceDate: number, now: number, timeContext: TimeContext): void {
    const day = startOfLocalDay(occurrenceDate, timeContext);
    const occurrence = this._props.occurrences.find(
      (o) => startOfLocalDay(o.occurrenceDate, timeContext) === day,
    );
    if (!occurrence) {
      throw new Error(`No occurrence for ${day}`);
    }
    occurrence.status = 'Skipped';
    this._props.updatedAt = now;
  }

  /** 连续天数投影。 */
  streak(now: number, timeContext: TimeContext): HabitStreak {
    const completed = this._props.occurrences
      .filter((o) => o.status === 'Completed' && o.checkedAt !== null)
      .map((o) => o.occurrenceDate);
    return calculateStreak(completed, now, timeContext);
  }
}
