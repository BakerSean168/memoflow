/**
 * R4 Habit 仓储 Port（domain-owned）。
 * R4 Habit repository port (domain-owned).
 *
 * 习惯持久化只依赖 Habit 聚合根与 Product Time 上下文；Prisma 实现位于
 * infrastructure/adapters/prisma。端口与实现同层拆分，避免基础设施层反向
 * 依赖应用层用例模块。
 * Habit persistence depends only on the Habit aggregate and the Product Time
 * context; the Prisma implementation lives in infrastructure/adapters/prisma.
 * Keeping the port at the domain layer stops infrastructure from depending on
 * the application use-case module.
 */

import type { TimeContext } from '@memoflow/time';
import type { Habit } from '../habit/habit';

/** Habit 仓储 Port / Habit repository port. */
export interface IHabitRepository {
  save(habit: Habit, timeContext: TimeContext, now?: number): Promise<void>;
  findByIdForIdentity(identityId: string, id: string): Promise<Habit | null>;
  findByIdentityId(identityId: string): Promise<Habit[]>;
  deleteByIdentityId(identityId: string, id: string): Promise<void>;
}
