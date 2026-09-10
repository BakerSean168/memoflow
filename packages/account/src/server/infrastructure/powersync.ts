/**
 * Account PowerSync composition helpers.
 * 账户模块 PowerSync 组合辅助函数。
 *
 * Host-facing ingredient seams for the Electron lane: the repository set type,
 * the repository factory and the delegating convenience module factory. The
 * desktop lane delegates account closure to the Cloud API, so the set only
 * needs the account repository.
 *
 * 面向宿主的 Electron lane 组合原料：仓储集合类型、仓储工厂与委托式便捷模块工厂。
 * 桌面 lane 将账户关闭委托给 Cloud API，因此集合只需账户仓储。
 */

import { createAccountModule, type AccountModuleInstance } from './account.module';
import {
  PowerSyncAccountRepository,
  type Transactional,
} from './adapters/powersync/account-powersync.repository';
import {
  createAccountRuntimeContributions,
  type AccountRuntimeContributionsInput,
} from './runtime';
import type { IAccountRepository } from '../domain';
import type { Clock } from '@memoflow/time';

export interface CreateAccountPowerSyncModuleOptions {
  readonly runtimeContributions?: AccountRuntimeContributionsInput;
  readonly clock: Clock;
}

/**
 * Host-facing account repository set for the PowerSync lane.
 * 面向宿主暴露的 PowerSync lane 账户仓储集合。
 *
 * Desktop lane-capable subset of the account repository Ports. The closure
 * coordinator is deliberately absent because desktop closure is delegated to
 * the Cloud API endpoint.
 *
 * 桌面 lane 可承载的账户仓储 Port 子集。closure coordinator 刻意不在此列，
 * 因为桌面关闭流程委托给 Cloud API 端点。
 */
export interface AccountPowerSyncRepositorySet {
  readonly accountRepository: IAccountRepository;
}

/**
 * Creates PowerSync-backed account repositories.
 * 创建基于 PowerSync 的账户仓储。
 *
 * Electron counterpart of createAccountPrismaRepositories(): selects the
 * PowerSync adapter and returns the lane-capable repository Port shape.
 *
 * 与 createAccountPrismaRepositories() 对应的 Electron 版本：选择 PowerSync
 * 适配器并返回 lane 可承载的仓储 Port 形状。
 *
 * @param db - Electron database adapter owned by the desktop main runtime. 桌面主进程持有的 Electron 数据库适配器。
 * @returns Repository set backed by the PowerSync adapter. 基于 PowerSync 适配器的仓储集合。
 */
export function createAccountPowerSyncRepositories(
  db: Transactional,
): AccountPowerSyncRepositorySet {
  return {
    accountRepository: new PowerSyncAccountRepository(db),
  };
}

export function createAccountPowerSyncModule(
  db: Transactional,
  options: CreateAccountPowerSyncModuleOptions,
): AccountModuleInstance {
  const { accountRepository } = createAccountPowerSyncRepositories(db);

  return createAccountModule({
    accountRepository,
    clock: options.clock,
    laneCapability: 'desktop',
    runtimeContributions: createAccountRuntimeContributions(
      accountRepository,
      options.runtimeContributions,
    ),
  });
}
