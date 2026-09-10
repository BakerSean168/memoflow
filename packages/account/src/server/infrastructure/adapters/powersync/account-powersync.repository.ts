import type { IAccountRepository } from '../../../domain';
import { Account } from '../../../domain';
import {
  AggregateRepositoryBase,
  createEventBusAdapter,
  publishAggregateEvents,
} from '@memoflow/patterns';
import { eventBus } from '@memoflow/utils/domain';
import {
  AccountPowerSyncMapper,
  type PowerSyncAccountRow,
} from './mappers/account-powersync.mapper';

const eventBusAdapter = createEventBusAdapter(eventBus);

type Queryable = {
  getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]>;
  get<T>(sql: string, parameters?: unknown[]): Promise<T>;
  getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null>;
  execute(sql: string, parameters?: unknown[]): Promise<unknown>;
};

export type Transactional = Queryable & {
  writeTransaction<T>(callback: (tx: Queryable) => Promise<T>): Promise<T>;
};

export class PowerSyncAccountRepository
  extends AggregateRepositoryBase<Account>
  implements IAccountRepository
{
  constructor(private readonly db: Transactional) {
    super(eventBusAdapter);
  }

  protected async persist(account: Account, tx?: unknown): Promise<void> {
    const executor = this.asQueryable(tx) ?? this.db;
    const row = AccountPowerSyncMapper.toRow(account);

    const existing = await executor.getOptional<{ id: string }>(
      `SELECT id FROM accounts WHERE id = ? LIMIT 1`,
      [row.id],
    );

    if (existing) {
      await executor.execute(
        `UPDATE accounts
         SET status = ?,
             profile = ?,
             updated_at = ?,
             closed_at = ?
         WHERE id = ?`,
        [row.status, row.profile, row.updated_at, row.closed_at, row.id],
      );
    } else {
      await executor.execute(
        `INSERT INTO accounts (
           id,
           status,
           profile,
           created_at,
           updated_at,
           closed_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [row.id, row.status, row.profile, row.created_at, row.updated_at, row.closed_at],
      );
    }
  }

  override async save(account: Account, tx?: unknown): Promise<void> {
    await this.persist(account, tx);
    await publishAggregateEvents(account, { eventBus: this.eventBus });
  }

  async findById(id: string, tx?: unknown): Promise<Account | null> {
    const executor = this.asQueryable(tx) ?? this.db;
    const row = await executor.getOptional<PowerSyncAccountRow>(
      `SELECT * FROM accounts WHERE id = ? LIMIT 1`,
      [id],
    );
    return row ? AccountPowerSyncMapper.toDomain(row) : null;
  }

  async delete(id: string, tx?: unknown): Promise<void> {
    const executor = this.asQueryable(tx) ?? this.db;
    await executor.execute(`DELETE FROM accounts WHERE id = ?`, [id]);
  }

  async findAll(
    options?: {
      page?: number;
      pageSize?: number;
      status?: 'Active' | 'Closed';
    },
    tx?: unknown,
  ): Promise<{ accounts: Account[]; total: number }> {
    const executor = this.asQueryable(tx) ?? this.db;
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 10;
    const offset = (page - 1) * pageSize;
    const status = this.mapStatusFilter(options?.status);
    const whereClause = status ? ` WHERE status = ?` : '';
    const params = status ? [status] : [];

    const totalRow = await executor.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM accounts${whereClause}`,
      params,
    );

    const rows = await executor.getAll<PowerSyncAccountRow>(
      `SELECT * FROM accounts${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    return {
      accounts: rows.map((row) => AccountPowerSyncMapper.toDomain(row)),
      total: Number(totalRow.count ?? 0),
    };
  }

  private asQueryable(tx?: unknown): Queryable | null {
    if (!tx || typeof tx !== 'object') {
      return null;
    }

    const candidate = tx as Partial<Queryable>;
    if (
      typeof candidate.getAll === 'function' &&
      typeof candidate.get === 'function' &&
      typeof candidate.getOptional === 'function' &&
      typeof candidate.execute === 'function'
    ) {
      return candidate as Queryable;
    }

    return null;
  }

  private mapStatusFilter(status: 'Active' | 'Closed' | undefined): string | null {
    return status ?? null;
  }
}
