import type { Prisma, PrismaClient } from './generated/prisma/client.js';

/** Join a caller-owned transaction; only a root client may start a new one. */
export function withPrismaTransaction<T>(
  db: PrismaClient | Prisma.TransactionClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
): Promise<T> {
  return '$transaction' in db ? db.$transaction(work, options) : work(db);
}
