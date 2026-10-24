import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';

export class ExternalMutationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
/** One budget for every transaction that owns an external mutation receipt. */
export const EXTERNAL_MUTATION_TRANSACTION_OPTIONS = {
  timeout: 15_000,
  maxWait: 2_000,
} as const;
export interface ExternalMutationAuthority {
  readonly connectionId: string;
  /**
   * Trusted host revalidates the credential before the receipt transaction
   * opens. It must not query through a second pool connection: the caller runs
   * this before `$transaction`, so no connection is held while it waits.
   */
  authorize(): Promise<void>;
  /** Optional owner-host check using this transaction, without another pool connection. */
  authorizeInTransaction?(tx: Prisma.TransactionClient): Promise<void>;
  readonly receiptScope?: 'credential';
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

/** Canonical receipt identity also permits recovery without repeating a committed mutation. */
export function externalMutationReceiptId(
  identityId: string,
  authority: Pick<ExternalMutationAuthority, 'connectionId' | 'receiptScope'>,
  capability: string,
  idempotencyKey: string,
): string {
  return hash(
    authority.receiptScope === 'credential'
      ? [identityId, authority.connectionId, capability, idempotencyKey]
      : [identityId, capability, idempotencyKey],
  );
}

/** Owner invokes its existing use cases using only this transaction's repositories. */
export async function runExternalMutation<T extends { receiptId: string }>(
  db: PrismaClient,
  identityId: string,
  authority: ExternalMutationAuthority,
  capability: string,
  input: { idempotencyKey: string },
  schema: { parse(value: unknown): T },
  work: (tx: Prisma.TransactionClient) => Promise<Omit<T, 'receiptId'>>,
): Promise<T & { replayed: boolean }> {
  if (!identityId || !authority.connectionId) throw new ExternalMutationError('FORBIDDEN');
  // Existing Goal/Task receipts survive PAT rotation; the Routine capability
  // explicitly binds its retry key to the issuing credential.
  const receiptId = externalMutationReceiptId(
    identityId,
    authority,
    capability,
    input.idempotencyKey,
  );
  const digest = hash(input);
  // Revalidate before BEGIN: the host check may use its own pool connection.
  await authority.authorize();
  return db
    .$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('statement_timeout', '10000', true)`;
      await tx.$executeRaw`SELECT set_config('lock_timeout', '5000', true)`;
      // Advisory lock serializes a not-yet-existing receipt across processes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${receiptId}, 0))`;
      await authority.authorizeInTransaction?.(tx);
      const saved = await tx.externalMutationReceipt.findUnique({ where: { id: receiptId } });
      if (saved) {
        if (saved.inputDigest !== digest) throw new ExternalMutationError('IDEMPOTENCY_CONFLICT');
        return { ...schema.parse(JSON.parse(saved.resultJson)), replayed: true };
      }
      const result = schema.parse({ receiptId, ...(await work(tx)) });
      if (Buffer.byteLength(JSON.stringify(result)) > 240 * 1024)
        throw new ExternalMutationError('RESPONSE_TOO_LARGE');
      await tx.externalMutationReceipt.create({
        data: {
          id: receiptId,
          identityId,
          connectionId: authority.connectionId,
          capability,
          inputDigest: digest,
          resultJson: JSON.stringify(result),
        },
      });
      return { ...result, replayed: false };
    }, EXTERNAL_MUTATION_TRANSACTION_OPTIONS)
    .catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2010' && error.meta?.code === '55P03')
          throw new ExternalMutationError('OPERATION_IN_PROGRESS');
        if (error.code === 'P2028' || error.code === 'P2034')
          throw new ExternalMutationError('UNAVAILABLE');
      }
      throw error;
    });
}
