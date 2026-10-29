import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/desktop-contracts';

/** Enter the body directly: some desktop adapters pass themselves as the tx. */
export function withRoutineWriteTransaction<T>(
  db: IElectronDatabaseTransaction,
  body: (tx: IElectronDatabaseTransaction) => Promise<T>,
): Promise<T> {
  return 'writeTransaction' in db ? (db as IElectronDatabase).writeTransaction(body) : body(db);
}
