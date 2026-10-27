import type { AccountClientDTO } from '@memoflow/account-contracts';
import type { IAccountRepository } from '../../../domain';

export class ListAccountsUseCase {
  constructor(private readonly accountRepository: IAccountRepository) {}

  async execute(
    options?: Parameters<IAccountRepository['findAll']>[0],
  ): Promise<{ accounts: AccountClientDTO[]; total: number }> {
    const result = await this.accountRepository.findAll(options);

    return {
      accounts: result.accounts.map((account) => account.toClientDTO()),
      total: result.total,
    };
  }
}
