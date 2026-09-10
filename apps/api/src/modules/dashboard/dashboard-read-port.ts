/**
 * Dashboard read port (RefArch Phase 6).
 * Dashboard 读取 Port（RefArch 阶段 6）。
 *
 * The dashboard module consumes a `DashboardReadPort` injected by the host
 * runtime instead of reading `context.db`. The Prisma-backed adapter is
 * assembled by the host and bound into the module factory closure.
 *
 * Dashboard 模块消费由宿主 runtime 注入的 `DashboardReadPort`，而不是读取
 * `context.db`。Prisma-backed adapter 由宿主组装并绑定进模块工厂闭包。
 */

import type { PrismaClient } from '@memoflow/database';
import type { DashboardData } from '@memoflow/contracts/dashboard';
import type { UserTimeContextPort } from '@memoflow/time';
import { getApiDashboardData } from './dashboard-read-service.js';

/**
 * Port for aggregated dashboard read data.
 * 聚合 dashboard 读取数据的 Port。
 */
export interface DashboardReadPort {
  /**
   * Resolves the aggregated dashboard data for one identity.
   * 解析单个 identity 的聚合 dashboard 数据。
   *
   * @param identityId - Principal identity ID.
   * @returns The aggregated `DashboardData`.
   */
  getDashboardData(identityId: string): Promise<DashboardData>;
}

/**
 * Prisma-backed `DashboardReadPort` adapter, assembled by the host runtime.
 * 由宿主 runtime 组装的 Prisma-backed `DashboardReadPort` adapter。
 */
export class PrismaDashboardReadPort implements DashboardReadPort {
  /**
   * Creates the adapter over a Prisma client.
   * 基于 Prisma client 创建 adapter。
   *
   * @param db - Prisma client bound by the host runtime.
   */
  constructor(
    private readonly db: PrismaClient,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {}

  getDashboardData(identityId: string): Promise<DashboardData> {
    return getApiDashboardData(this.db, identityId, this.userTimeContextPort);
  }
}
