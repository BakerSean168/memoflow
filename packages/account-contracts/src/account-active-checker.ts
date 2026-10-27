/**
 * Account Active Checker Port / Shared Contract.
 * 账户活跃/关户门禁契约。
 */

export interface AccountActiveChecker {
  /**
   * Check if account closure is in progress or completed for identityId.
   * Returns true if closure is in progress or completed (blocking new work).
   */
  isClosureBlocked(identityId: string): Promise<boolean>;
}

export type ClosureCheckerFn = (identityId: string) => Promise<boolean>;
