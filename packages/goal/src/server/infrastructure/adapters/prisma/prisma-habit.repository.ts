import type { PrismaClient } from '@memoflow/database';
import type { TimeContext } from '@memoflow/time';
import {
  Habit,
  type HabitState,
} from '../../../domain/habit/habit';
import type { IHabitRepository } from '../../../application/use-cases/commands/habit.use-cases';

function toState(row: {
  id: string;
  identityId: string;
  name: string;
  description: string | null;
  frequency: string;
  goalId: string | null;
  status: string;
  startDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  occurrences?: Array<{
    id: string;
    occurrenceDate: Date;
    status: string;
    checkIns?: Array<{ checkedAt: Date; note: string | null }>;
  }>;
}): HabitState {
  return {
    id: row.id,
    identityId: row.identityId,
    name: row.name,
    description: row.description,
    frequency: row.frequency as HabitState['frequency'],
    goalId: row.goalId,
    status: row.status as HabitState['status'],
    startDate: row.startDate ? row.startDate.getTime() : null,
    occurrences: (row.occurrences ?? []).map((o) => ({
      id: o.id,
      habitId: row.id,
      occurrenceDate: o.occurrenceDate.getTime(),
      status: o.status as HabitState['occurrences'][number]['status'],
      checkedAt: o.checkIns?.[0]?.checkedAt?.getTime() ?? null,
      note: o.checkIns?.[0]?.note ?? null,
    })),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export class PrismaHabitRepository implements IHabitRepository {
  constructor(private readonly db: PrismaClient) {}

  async save(habit: Habit, timeContext: TimeContext, now = Date.now()): Promise<void> {
    const s = habit.state;
    await this.db.$transaction(async (tx) => {
      await tx.habit.upsert({
        where: { id: s.id },
        create: {
          id: s.id,
          identityId: s.identityId,
          name: s.name,
          description: s.description,
          frequency: s.frequency,
          goalId: s.goalId,
          status: s.status,
          startDate: s.startDate ? new Date(s.startDate) : null,
        },
        update: {
          name: s.name,
          description: s.description,
          frequency: s.frequency,
          goalId: s.goalId,
          status: s.status,
          startDate: s.startDate ? new Date(s.startDate) : null,
        },
      });
      for (const occurrence of s.occurrences) {
        await tx.habitOccurrence.upsert({
          where: {
            habitId_occurrenceDate: {
              habitId: s.id,
              occurrenceDate: new Date(occurrence.occurrenceDate),
            },
          },
          create: {
            id: occurrence.id,
            habitId: s.id,
            occurrenceDate: new Date(occurrence.occurrenceDate),
            status: occurrence.status,
          },
          update: {
            status: occurrence.status,
            updatedAt: new Date(),
          },
        });
        if (occurrence.checkedAt !== null) {
          await tx.habitCheckIn.upsert({
            where: { id: `checkin:${occurrence.id}` },
            create: {
              id: `checkin:${occurrence.id}`,
              occurrenceId: occurrence.id,
              checkedAt: new Date(occurrence.checkedAt),
              note: occurrence.note,
            },
            update: { checkedAt: new Date(occurrence.checkedAt), note: occurrence.note },
          });
        }
      }
      // streak 投影
      const streak = habit.streak(now, timeContext);
      await tx.habitStreakProjection.upsert({
        where: { habitId: s.id },
        create: {
          id: `streak:${s.id}`,
          habitId: s.id,
          currentStreak: streak.currentStreak,
          longestStreak: streak.longestStreak,
          lastCheckInDate: streak.lastCheckInDate
            ? new Date(streak.lastCheckInDate)
            : null,
        },
        update: {
          currentStreak: streak.currentStreak,
          longestStreak: streak.longestStreak,
          lastCheckInDate: streak.lastCheckInDate
            ? new Date(streak.lastCheckInDate)
            : null,
        },
      });
    });
  }

  async findByIdForIdentity(identityId: string, id: string): Promise<Habit | null> {
    const row = await this.db.habit.findFirst({
      where: { id, identityId },
      include: { occurrences: { include: { checkIns: true } } },
    });
    return row ? Habit.load(toState(row)) : null;
  }

  async findByIdentityId(identityId: string): Promise<Habit[]> {
    const rows = await this.db.habit.findMany({
      where: { identityId, status: 'Active' },
      include: { occurrences: { include: { checkIns: true } } },
    });
    return rows.map((row) => Habit.load(toState(row)));
  }

  async deleteByIdentityId(identityId: string, id: string): Promise<void> {
    await this.db.habit.deleteMany({ where: { id, identityId } });
  }
}
