import { ipcMain } from 'electron';
import {
  DashboardChannels,
  isElectronAuthResolutionError,
} from '@memoflow/contracts/electron';
import { extractStructuredResultError, fail, ok } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import type { IElectronAuthContext } from '@memoflow/contracts/electron';
import {
  getDesktopDashboardData,
  type DashboardReadDependencies,
} from '../services/dashboard-read-service';

const CHANNEL = DashboardChannels.GET_STATS;
const logger = createLogger('DashboardIpc');

/**
 * Registers the dashboard stats IPC handler with explicit instance-bound
 * repository injection. 注册 dashboard stats IPC handler，并显式注入
 * instance-bound 仓储。
 *
 * The handler resolves the auth context and the Goal/Task repository view lazily
 * per request, because the desktop composition root creates the repositories per
 * profile activation (shell-level registration happens before any profile runs).
 * 该 handler 在每个请求时惰性解析 auth context 与 Goal/Task repository view，
 * 因为 desktop 组合根按 profile 激活创建仓储（shell 级注册早于任何 profile 运行）。
 *
 * @param getAuthProvider - Resolves the active profile auth context. 解析当前激活 profile 的 auth context。
 * @param getRepositories - Resolves the composed Goal/Task repository view. 解析组装好的 Goal/Task repository view。
 */
export function registerDashboardIpcHandler(
  getAuthProvider: () => IElectronAuthContext | null,
  getRepositories: () => DashboardReadDependencies,
): void {
  ipcMain.handle(CHANNEL, async () => {
    const auth = getAuthProvider();
    if (!auth) {
      return fail({ code: 'AUTH_REQUIRED', message: 'No active profile' });
    }

    try {
      const requestContext = await auth.requireRequestContext();
      const data = await getDesktopDashboardData(requestContext.identityId, getRepositories());
      return ok(data);
    } catch (error) {
      if (isElectronAuthResolutionError(error) && error.code === 'AUTH_RESTORING') {
        return fail({
          code: 'AUTH_RESTORING',
          message: 'Authentication restore in progress',
        });
      }

      if (isElectronAuthResolutionError(error) && error.code === 'AUTH_REQUIRED') {
        return fail({
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        });
      }

      const structuredError = extractStructuredResultError(error);
      if (structuredError) {
        return fail({
          code: structuredError.code,
          message: structuredError.message,
          details: structuredError.details,
          context: structuredError.context,
          cause: structuredError.cause,
        });
      }

      logger.error('Failed to aggregate dashboard data', error);
      return fail({
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch dashboard data',
      });
    }
  });
}

export function unregisterDashboardIpcHandler(): void {
  ipcMain.removeHandler(CHANNEL);
}
