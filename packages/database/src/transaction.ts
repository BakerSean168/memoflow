import type { Prisma, PrismaClient } from './generated/prisma/client.js';

/**
 * Prisma marks every interactive transaction client with this scope symbol.
 * Without that marker `$transaction` is also present on a transaction client,
 * so `'$transaction' in db` silently starts a nested transaction with its own
 * timeout instead of joining the caller's.
 */
const TRANSACTION_SCOPE = Symbol.for('prisma.client.transaction.scope_context');

function isTransactionClient(db: PrismaClient | Prisma.TransactionClient): boolean {
  return TRANSACTION_SCOPE in db;
}

/**
 * Join a caller-owned transaction; only a root client may start a new one.
 * Joining is required so nested owner work inherits the outer receipt budget.
 */
export function withPrismaTransaction<T>(
  db: PrismaClient | Prisma.TransactionClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    isolationLevel?: Prisma.TransactionIsolationLevel;
    timeout?: number;
    maxWait?: number;
  },
): Promise<T> {
  if (isTransactionClient(db)) return work(db as Prisma.TransactionClient);
  return db.$transaction(work, options);
}

export {
  runExternalMutation,
  externalMutationReceiptId,
  ExternalMutationError,
  EXTERNAL_MUTATION_TRANSACTION_OPTIONS,
  type ExternalMutationAuthority,
} from './adapters/prisma/external-mutation.js';
