import { describe, expect, it } from 'vitest';
import type {
  IElectronDatabase,
  IElectronDatabaseQueryResult,
  IElectronDatabaseTransaction,
} from '@memoflow/desktop-contracts';
import { PowerSyncNotificationReliableAdapter } from './power-sync-notification-reliable.adapter';

class RecordingDatabase implements IElectronDatabase {
  readonly executedSql: string[] = [];

  async execute(sql: string): Promise<IElectronDatabaseQueryResult> {
    this.executedSql.push(sql);
    return { rowsAffected: 0 };
  }

  async getAll<T>(): Promise<T[]> {
    return [];
  }

  async getOptional<T>(): Promise<T | null> {
    return null;
  }

  async get<T>(): Promise<T> {
    throw new Error('Unexpected get() call');
  }

  async writeTransaction<T>(
    callback: (tx: IElectronDatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return callback(this);
  }
}

describe('PowerSyncNotificationReliableAdapter schema ownership', () => {
  it('creates only adapter-owned outbox_messages state and never DDLs PowerSync views', async () => {
    const db = new RecordingDatabase();
    const adapter = new PowerSyncNotificationReliableAdapter(db);

    await expect(adapter.queryDeadLetters('identity-1')).resolves.toEqual([]);

    const ddl = db.executedSql.join('\n');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS outbox_messages');
    expect(ddl).toContain('idx_om_message_type');
    expect(ddl).toContain('idx_om_status');
    expect(ddl).not.toMatch(/CREATE (?:TABLE|INDEX)[\s\S]*notification_dispatch_outbox/iu);
    expect(ddl).not.toMatch(/CREATE (?:TABLE|INDEX)[\s\S]*desktop_delivery_acks/iu);
  });
});
