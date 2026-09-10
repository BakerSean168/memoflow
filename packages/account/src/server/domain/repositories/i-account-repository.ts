import type { Account } from '../aggregates/account';

export interface IAccountRepository {
  save(account: Account, tx?: unknown): Promise<void>;
  findById(id: string, tx?: unknown): Promise<Account | null>;
  delete(id: string, tx?: unknown): Promise<void>;
  findAll(
    options?: {
      page?: number;
      pageSize?: number;
      status?: 'Active' | 'Closed';
    },
    tx?: unknown,
  ): Promise<{ accounts: Account[]; total: number }>;
}
