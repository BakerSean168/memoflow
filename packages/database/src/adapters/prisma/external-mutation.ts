import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';

export class ExternalMutationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export interface ExternalMutationAuthority {
  readonly connectionId: string;
  /** Trusted host revalidates the credential before replay or execution. */
  authorize(tx: Prisma.TransactionClient): Promise<void>;
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
  const receiptId = hash([identityId, authority.connectionId, capability, input.idempotencyKey]);
  const digest = hash(input);
  return db
    .$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('statement_timeout', '10000', true)`;
        await tx.$executeRaw`SELECT set_config('lock_timeout', '5000', true)`;
        // Advisory lock serializes a not-yet-existing receipt across processes.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${receiptId}, 0))`;
        await authority.authorize(tx);
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
      },
      { timeout: 15000, maxWait: 2000 },
    )
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
