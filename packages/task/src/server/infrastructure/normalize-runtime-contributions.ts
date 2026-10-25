/**
 * Residual 987: sole runtime-contribution normalize helpers for task module entrypoints.
 * API module + Electron entry import these; local duals retired.
 * Soft residual: server composition-root task.module.ts keeps a local normalizeRuntimeContributions
 * (same shape via TaskRuntimeContributionsInput) to avoid circular import with this module's type host.
 */

import type { TaskModuleRuntimeContribution } from './task.module';

export function isRuntimeContributionArray(
  runtimeContributions: TaskModuleRuntimeContribution | readonly TaskModuleRuntimeContribution[],
): runtimeContributions is readonly TaskModuleRuntimeContribution[] {
  return Array.isArray(runtimeContributions);
}

export function normalizeRuntimeContributions(
  runtimeContributions?: TaskModuleRuntimeContribution | readonly TaskModuleRuntimeContribution[],
): readonly TaskModuleRuntimeContribution[] {
  if (!runtimeContributions) {
    return [];
  }

  if (isRuntimeContributionArray(runtimeContributions)) {
    return Array.from(runtimeContributions);
  }

  return [runtimeContributions];
}

/**
 * Host-facing alias of `normalizeRuntimeContributions`, exported from the
 * package root so both host composers (apps/api + apps/desktop) reuse the same
 * normalization instead of carrying private copies.
 *
 * 面向宿主导出的 `normalizeRuntimeContributions` 别名，从包根导出，供两个宿主
 * composer（apps/api 与 apps/desktop）复用同一份规范化逻辑，避免各自维护
 * 私有副本。
 */
export const normalizeTaskRuntimeContributions = normalizeRuntimeContributions;
