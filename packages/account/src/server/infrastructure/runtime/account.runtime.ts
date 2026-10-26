import type { IAccountRepository } from '../../domain';
import type { AccountModuleRuntimeContribution } from '../account.module';

export type AccountRuntimeContributionsInput =
  | AccountModuleRuntimeContribution
  | readonly AccountModuleRuntimeContribution[];

function normalizeRuntimeContributions(
  runtimeContributions?: AccountRuntimeContributionsInput,
): readonly AccountModuleRuntimeContribution[] {
  if (!runtimeContributions) {
    return [];
  }

  return Array.isArray(runtimeContributions)
    ? Array.from(runtimeContributions)
    : [runtimeContributions as AccountModuleRuntimeContribution];
}

/**
 * Default account runtime contributions owned by the module instance.
 */
export function createAccountRuntimeContributions(
  _accountRepository: IAccountRepository,
  runtimeContributions?: AccountRuntimeContributionsInput,
): readonly AccountModuleRuntimeContribution[] {
  return normalizeRuntimeContributions(runtimeContributions);
}
