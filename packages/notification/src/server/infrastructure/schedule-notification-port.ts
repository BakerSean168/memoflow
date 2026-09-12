/**
 * Schedule notification port — lane-neutral ingredient.
 * 日程通知端口 —— 与 lane 无关的组合原料。
 *
 * Builds the `ScheduleNotificationPort` from the SAME repository set that the
 * host composer hands to `createNotificationModule`, so schedule orchestration
 * shares one set and never constructs a second Prisma/PowerSync repository set.
 *
 * 从宿主 composer 交给 `createNotificationModule` 的同一仓储集合构建
 * `ScheduleNotificationPort`，使 schedule 编排共享一套集合，绝不构造第二套
 * Prisma/PowerSync 仓储集合。
 */

import { CreateNotificationUseCase } from '../application/use-cases/commands/create-notification.use-case';
import type { ScheduleNotificationPort } from '../../schedule-execution';
import type { UserTimeContextPort } from '@memoflow/time';
import type {
  INotificationRepository,
  INotificationPreferenceRepository,
} from '../domain/repositories';

export interface CreateNotificationScheduleNotificationPortDeps {
  readonly notificationRepository: INotificationRepository;
  readonly notificationPreferenceRepository: INotificationPreferenceRepository;
  readonly closureChecker: (identityId: string) => Promise<boolean>;
  readonly userTimeContextPort: UserTimeContextPort;
}

/**
 * Creates the schedule notification port from a host-owned repository set.
 * 从宿主持有的仓储集合创建日程通知端口。
 *
 * @param deps - The same repository instances wired into `createNotificationModule`.
 *               与 `createNotificationModule` 接线完全相同的仓储实例。
 * @returns A `ScheduleNotificationPort` consumed by schedule orchestration.
 *          返回供 schedule 编排消费的 `ScheduleNotificationPort`。
 */
export function createNotificationScheduleNotificationPort(
  deps: CreateNotificationScheduleNotificationPortDeps,
): ScheduleNotificationPort {
  if (!deps.closureChecker) {
    throw new Error('[FAIL-CLOSED] createNotificationScheduleNotificationPort requires closureChecker');
  }
  const createNotification = new CreateNotificationUseCase(
    deps.notificationRepository,
    deps.notificationPreferenceRepository,
    deps.closureChecker,
    deps.userTimeContextPort,
  );

  return {
    createNotification(request) {
      return createNotification.execute({
        ...request,
        channels: request.channels ? Array.from(request.channels) : undefined,
      });
    },
  };
}
