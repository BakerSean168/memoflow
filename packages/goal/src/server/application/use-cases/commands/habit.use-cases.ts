import type { Result } from '@memoflow/contracts/result';
import { error, ok } from '@memoflow/contracts/result';
import { Habit, type HabitFrequency, type HabitState } from '../../../domain/habit/habit';
import type { TimeContext, UserTimeContextPort } from '@memoflow/time';

/** Habit 仓储端口（Prisma/PowerSync 实现）。 */
export interface IHabitRepository {
  save(habit: Habit, timeContext: TimeContext, now?: number): Promise<void>;
  findByIdForIdentity(identityId: string, id: string): Promise<Habit | null>;
  findByIdentityId(identityId: string): Promise<Habit[]>;
  deleteByIdentityId(identityId: string, id: string): Promise<void>;
}

export interface CreateHabitReq {
  name: string;
  description?: string | null;
  frequency?: HabitFrequency;
  goalId?: string | null;
}

export interface HabitDTO {
  id: string;
  name: string;
  description: string | null;
  frequency: HabitFrequency;
  goalId: string | null;
  status: string;
  currentStreak: number;
  longestStreak: number;
  lastCheckInDate: number | null;
}

function toDTO(habit: Habit, now: number, timeContext: TimeContext): HabitDTO {
  const streak = habit.streak(now, timeContext);
  return {
    id: habit.id,
    name: habit.name,
    description: habit.description,
    frequency: habit.frequency,
    goalId: habit.goalId,
    status: habit.status,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    lastCheckInDate: streak.lastCheckInDate,
  };
}

export class CreateHabitUseCase {
  constructor(
    private readonly repository: IHabitRepository,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {}

  async execute(identityId: string, req: CreateHabitReq): Promise<Result<HabitDTO>> {
    if (!req.name.trim()) {
      return error('VALIDATION_ERROR', 'Habit name is required');
    }
    const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
    const now = Date.now();
    const habit = Habit.create({ identityId, ...req, now, timeContext });
    await this.repository.save(habit, timeContext, now);
    return ok(toDTO(habit, now, timeContext));
  }
}

export class RecordHabitCheckInUseCase {
  constructor(
    private readonly repository: IHabitRepository,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {}

  async execute(
    identityId: string,
    id: string,
    occurrenceDate: number,
    note?: string | null,
  ): Promise<Result<HabitDTO>> {
    const habit = await this.repository.findByIdForIdentity(identityId, id);
    if (!habit) {
      return error('NOT_FOUND', `Habit ${id} not found`);
    }
    const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
    const now = Date.now();
    habit.checkIn(occurrenceDate, now, timeContext, note);
    await this.repository.save(habit, timeContext, now);
    return ok(toDTO(habit, now, timeContext));
  }
}

export class ListHabitUseCase {
  constructor(
    private readonly repository: IHabitRepository,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {}

  async execute(identityId: string): Promise<Result<HabitDTO[]>> {
    const habits = await this.repository.findByIdentityId(identityId);
    const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
    const now = Date.now();
    return ok(habits.map((h) => toDTO(h, now, timeContext)));
  }
}

export function stateToHabit(state: HabitState): Habit {
  return Habit.load(state);
}
