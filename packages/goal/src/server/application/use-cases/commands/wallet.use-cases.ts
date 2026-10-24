/**
 * R7：Wallet 外部模块试点 use cases（暂驻 goal 包，验证 ModuleManifest 扩展性）。
 *
 * 契约纪律：钱包写入只依赖本模块表 + 通用 Relation/Activity 端口，
 * 不直接依赖 Goal/Task 数据表（与 Goal 的连接走 Relation contributes_to）。
 * use case 只依赖 domain-owned `IWalletRepository` Port；
 * Prisma 实现位于 `infrastructure/adapters/prisma/wallet-prisma.repository.ts`。
 */

import type { Result } from '@memoflow/contracts/result';
import { error, ok } from '@memoflow/contracts/result';
import type { IWalletRepository, WalletAccountDTO, WalletTransactionDTO } from '../../../domain';
import { WalletAccountNotFoundError } from '../../../domain/errors/wallet-account-not-found-error';

export class CreateWalletAccountUseCase {
  constructor(private readonly repository: IWalletRepository) {}

  async execute(
    identityId: string,
    input: { name: string; currency?: string },
  ): Promise<Result<WalletAccountDTO>> {
    if (!input.name.trim()) {
      return error('VALIDATION_ERROR', 'Account name is required');
    }
    return ok(await this.repository.createAccount({ identityId, ...input }));
  }
}

export class RecordWalletTransactionUseCase {
  constructor(private readonly repository: IWalletRepository) {}

  async execute(
    identityId: string,
    input: {
      accountId: string;
      type: 'income' | 'expense' | 'transfer';
      amount: string;
      category?: string | null;
      note?: string | null;
      goalId?: string | null;
      occurredAt?: number;
    },
  ): Promise<Result<WalletTransactionDTO>> {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return error('VALIDATION_ERROR', 'Amount must be a positive number');
    }
    try {
      return ok(await this.repository.recordTransaction({ identityId, ...input }));
    } catch (e) {
      if (e instanceof WalletAccountNotFoundError) {
        return error('NOT_FOUND', 'Wallet account not found');
      }
      throw e;
    }
  }
}

export class ListWalletUseCase {
  constructor(private readonly repository: IWalletRepository) {}

  async execute(identityId: string): Promise<
    Result<{
      accounts: WalletAccountDTO[];
      transactions: WalletTransactionDTO[];
    }>
  > {
    const [accounts, transactions] = await Promise.all([
      this.repository.listAccounts(identityId),
      this.repository.listTransactions(identityId, 50),
    ]);
    return ok({ accounts, transactions });
  }
}
