import type { IAccountRepository } from '../../../domain';
import { Account } from '../../../domain';

export class MemoryAccountRepository implements IAccountRepository {
  private readonly accounts = new Map<string, Account>();

  async save(account: Account): Promise<void> {
    this.accounts.set(String(account.id), account);
  }

  async findById(id: string): Promise<Account | null> {
    return this.accounts.get(id) ?? null;
  }

  async delete(id: string): Promise<void> {
    this.accounts.delete(id);
  }

  async findAll(options?: {
    page?: number;
    pageSize?: number;
    status?: 'Active' | 'Closed';
  }): Promise<{ accounts: Account[]; total: number }> {
    const filtered = Array.from(this.accounts.values()).filter((account) => {
      if (!options?.status) return true;
      return String(account.status) === options.status;
    });

    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 10;
    const start = (page - 1) * pageSize;
    const accounts = filtered.slice(start, start + pageSize);

    return { accounts, total: filtered.length };
  }
}
