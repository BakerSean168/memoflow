import type { IScheduleRepository } from '../../domain/repositories/i-schedule-repository';

const DEFAULT_ACTIVITY_LIMIT = 10;

export interface ScheduleActivityReadOptions {
  /** Inclusive lower bound expressed as a Product Time instant. */
  readonly since: number;
  readonly limit?: number;
}

export interface ScheduleActivityItem {
  readonly id: string;
  readonly type: 'schedule_created';
  readonly description: string;
  readonly timestamp: number;
}

export interface ScheduleActivityReadServiceDependencies {
  readonly scheduleRepository: IScheduleRepository;
}

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_ACTIVITY_LIMIT;
  return Math.max(1, Math.min(DEFAULT_ACTIVITY_LIMIT, Math.trunc(limit)));
}

/**
 * Read-only, identity-scoped schedule activity projection.
 *
 * Schedule owns the mapping from its own calendar entries to the lightweight
 * host-facing activity entries. Hosts consume the pre-projected items and
 * never touch schedule persistence shapes.
 */
export class ScheduleActivityReadService {
  constructor(private readonly dependencies: ScheduleActivityReadServiceDependencies) {}

  async listRecentActivity(
    identityId: string,
    options: ScheduleActivityReadOptions,
  ): Promise<ScheduleActivityItem[]> {
    const schedules = await this.dependencies.scheduleRepository.findByIdentityId(identityId);

    return schedules
      .flatMap((schedule): ScheduleActivityItem[] => {
        const timestamp = Number(schedule.createdAt);
        if (timestamp < options.since) return [];
        return [
          {
            id: `schedule-created-${String(schedule.id)}`,
            type: 'schedule_created',
            description: `创建了日程「${schedule.title}」`,
            timestamp,
          },
        ];
      })
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, boundedLimit(options.limit));
  }
}
