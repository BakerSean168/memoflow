import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma, PrismaClient } from '@memoflow/database';

export interface OAuthStore {
  readonly db: PrismaClient;
  bounded<T>(operation: () => Promise<T>): Promise<T>;
  serialize<T>(operation: () => Promise<T>): Promise<T>;
}
/** Binds the provider adapter to the same transaction as product grant state. */
export function createOAuthStore(database: PrismaClient): OAuthStore {
  const transaction = new AsyncLocalStorage<Prisma.TransactionClient>();
  const db = new Proxy(database, {
    get(target, key) {
      const current = transaction.getStore();
      // Better Auth can nest its own adapter transaction; join the outer one.
      if (current && key === '$transaction') {
        return (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          operation(current);
      }
      const owner = current ?? target;
      const value: unknown = Reflect.get(owner, key);
      return typeof value === 'function' ? value.bind(owner) : value;
    },
  });
  async function run<T>(operation: () => Promise<T>, serialize: boolean): Promise<T> {
    if (transaction.getStore()) return operation();
    return database.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('statement_timeout', '5000', true)`;
        await tx.$executeRaw`SELECT set_config('lock_timeout', '5000', true)`;
        // ponytail: serialize OAuth lifecycle mutations across API instances.
        // Split by grant only when provider family invalidation becomes grant-scoped.
        if (serialize) await tx.$executeRaw`SELECT pg_advisory_xact_lock(117004)`;
        return transaction.run(tx, operation);
      },
      { timeout: serialize ? 15000 : 5000, maxWait: 2000 },
    );
  }
  return {
    db,
    bounded: (operation) => run(operation, false),
    serialize: (operation) => run(operation, true),
  };
}
