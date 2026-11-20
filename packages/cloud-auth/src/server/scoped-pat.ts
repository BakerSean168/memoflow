import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  CreateScopedPatSchema,
  DEFAULT_EXTERNAL_AGENT_RATE_LIMITS,
  ScopedPatCreateReceiptSchema,
  type CreateScopedPatInput,
} from '@memoflow/agent-gateway';
import type { RequestContext } from '@memoflow/transport-contracts';
import type { PrismaClient, Prisma } from '@memoflow/database';
import type { z } from 'zod';
import { ExternalMutationError, runExternalMutation } from '@memoflow/database/transaction';

type ScopedPatCreateReceipt = z.output<typeof ScopedPatCreateReceiptSchema>;

export interface VerifiedPatPrincipal {
  readonly identityId: string;
  readonly credentialId: string;
  readonly credentialType: 'pat';
  readonly scopes: readonly string[];
}

interface Options {
  readonly database: PrismaClient;
  readonly audience: string;
  readonly accountIsActive: (identityId: string, context?: RequestContext) => Promise<boolean>;
  readonly closureChecker?: (identityId: string) => Promise<boolean>;
  /** Fixed-window read budget per credential; defaults to the calibrated gateway limit. */
  readonly readQuotaPerMinute?: number;
}

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
/**
 * Hot-path budget for the observability timestamp. The gateway verifies a PAT on
 * every MCP call, so persisting `lastUsedAt` per verification would turn an
 * indexed read path into write amplification across all live tokens. Advancing
 * the durable value at most once per window keeps "is this token still in use?"
 * answerable at management-page resolution while bounding writes to one per
 * token per window.
 */
export const PAT_LAST_USED_WRITE_INTERVAL_MS = 5 * 60_000;
/**
 * Receipt domain for first-party credential management. There is no external
 * connection here; the value only records which lane produced the receipt.
 */
const MANAGEMENT_RECEIPT_CONNECTION = 'first-party-management';
const publicFields = {
  id: true,
  name: true,
  prefix: true,
  audience: true,
  scopes: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

/** Cloud Auth's private PAT pilot; every authentication checks durable authority. */
export function createScopedPatService(options: Options) {
  const db = options.database;
  async function read<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('statement_timeout', '5000', true)`;
        return operation(tx);
      },
      { timeout: 5000, maxWait: 2000 },
    );
  }
  async function isActive(identityId: string, context?: RequestContext): Promise<boolean> {
    if (options.closureChecker && (await options.closureChecker(identityId))) return false;
    const [user, account] = await Promise.all([
      read((tx) =>
        tx.cloudAuthUser.findUnique({ where: { id: identityId }, select: { disabledAt: true } }),
      ),
      options.accountIsActive(identityId, context),
    ]);
    return Boolean(user && user.disabledAt === null && account === true);
  }
  /**
   * Record that a verified credential was actually used, at most once per window.
   * The conditional update is what makes the throttle shared across API instances:
   * a concurrent caller that already advanced the row matches nothing, so only one
   * write lands per window regardless of how many calls arrive together.
   */
  async function touchLastUsed(id: string, previous: Date | null): Promise<void> {
    const now = Date.now();
    if (previous && now - previous.getTime() < PAT_LAST_USED_WRITE_INTERVAL_MS) return;
    try {
      await db.externalAgentPat.updateMany({
        where: {
          id,
          OR: [
            { lastUsedAt: null },
            { lastUsedAt: { lt: new Date(now - PAT_LAST_USED_WRITE_INTERVAL_MS) } },
          ],
        },
        data: { lastUsedAt: new Date(now) },
      });
    } catch {
      // Usage telemetry must never turn a valid credential into a failed call.
    }
  }
  return {
    async create(identityId: string, input: CreateScopedPatInput, context?: RequestContext) {
      const parsed = CreateScopedPatSchema.parse(input);
      const days = parsed.expiresInDays;
      const secret = `mfp_${randomBytes(32).toString('base64url')}`;
      const data = {
        id: randomUUID(),
        userId: identityId,
        name: parsed.name,
        prefix: secret.slice(0, 12),
        tokenDigest: digest(secret),
        audience: options.audience,
        scopes: parsed.scopes,
        expiresAt: new Date(Date.now() + days * 86400000),
      };
      const mint = (tx: PrismaClient | Prisma.TransactionClient) =>
        tx.externalAgentPat.create({ data, select: publicFields });

      // Legacy callers without a key keep the historical create-per-request
      // behavior; every retrying client must supply a key.
      const idempotencyKey = parsed.idempotencyKey;
      if (!idempotencyKey) {
        if (!(await isActive(identityId, context))) throw new Error('Inactive account');
        return { ...(await mint(db)), secret, replayed: false };
      }

      const receipt = await runExternalMutation<ScopedPatCreateReceipt>(
        db,
        identityId,
        {
          connectionId: MANAGEMENT_RECEIPT_CONNECTION,
          authorize: async () => {
            if (!(await isActive(identityId, context)))
              throw new ExternalMutationError('FORBIDDEN');
          },
        },
        'pat.create.v1',
        { ...parsed, idempotencyKey },
        ScopedPatCreateReceiptSchema,
        async (tx) => {
          const pat = await mint(tx);
          return {
            result: {
              ...pat,
              createdAt: pat.createdAt.toISOString(),
              expiresAt: pat.expiresAt.toISOString(),
              revokedAt: pat.revokedAt?.toISOString() ?? null,
              lastUsedAt: pat.lastUsedAt?.toISOString() ?? null,
            },
          };
        },
      );
      const summary = {
        ...receipt.result,
        createdAt: new Date(receipt.result.createdAt),
        expiresAt: new Date(receipt.result.expiresAt),
        revokedAt: receipt.result.revokedAt === null ? null : new Date(receipt.result.revokedAt),
        lastUsedAt: receipt.result.lastUsedAt === null ? null : new Date(receipt.result.lastUsedAt),
      };
      // The plaintext is deliberately absent from the receipt: a replay can
      // return the same credential identity, never a second copy of the secret.
      return receipt.replayed
        ? { ...summary, replayed: true }
        : { ...summary, secret, replayed: false };
    },
    async list(identityId: string, context?: RequestContext) {
      if (!(await isActive(identityId, context))) throw new Error('Inactive account');
      return db.externalAgentPat.findMany({
        where: { userId: identityId },
        select: publicFields,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });
    },
    async revoke(identityId: string, id: string, context?: RequestContext) {
      if (!(await isActive(identityId, context))) throw new Error('Inactive account');
      const result = await db.externalAgentPat.updateMany({
        where: { id, userId: identityId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return result.count > 0;
    },
    async authenticate(
      authorization: string | undefined,
      context?: RequestContext,
    ): Promise<VerifiedPatPrincipal | null> {
      if (!authorization || !/^Bearer mfp_[A-Za-z0-9_-]{43}$/.test(authorization)) return null;
      const pat = await read((tx) =>
        tx.externalAgentPat.findUnique({
          where: { tokenDigest: digest(authorization.slice(7)) },
        }),
      );
      if (
        !pat ||
        pat.audience !== options.audience ||
        pat.expiresAt.getTime() <= Date.now() ||
        pat.revokedAt !== null
      )
        return null;
      if (
        pat.scopes.length < 1 ||
        pat.scopes.length > 12 ||
        new Set(pat.scopes).size !== pat.scopes.length ||
        pat.scopes.some(
          (scope) =>
            ![
              'goals:read',
              'tasks:read',
              'goals:write',
              'tasks:write',
              'routines:write',
              'ai:read',
              'routines:read',
              'notifications:read',
              'schedules:read',
              'notifications:write',
              'labels:read',
              'relations:read',
            ].includes(scope),
        ) ||
        !(await isActive(pat.userId, context))
      )
        return null;
      await touchLastUsed(pat.id, pat.lastUsedAt);
      return {
        identityId: pat.userId,
        credentialId: pat.id,
        credentialType: 'pat',
        scopes: pat.scopes,
      };
    },
    /** PostgreSQL CAS keeps the fixed-window per-credential quota effective across API instances. */
    async consumeReadQuota(credentialId: string): Promise<boolean> {
      const perMinute =
        options.readQuotaPerMinute ?? DEFAULT_EXTERNAL_AGENT_RATE_LIMITS.credentialPerMinute;
      const count = await read(
        (tx) => tx.$executeRaw`
        UPDATE external_agent_pats
        SET rate_count = CASE
              WHEN rate_window <= CURRENT_TIMESTAMP - INTERVAL '1 minute' THEN 1
              ELSE rate_count + 1
            END,
            rate_window = CASE
              WHEN rate_window <= CURRENT_TIMESTAMP - INTERVAL '1 minute' THEN CURRENT_TIMESTAMP
              ELSE rate_window
            END
        WHERE id = ${credentialId}
          AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
          AND (rate_window <= CURRENT_TIMESTAMP - INTERVAL '1 minute' OR rate_count < ${perMinute})
      `,
      );
      return count === 1;
    },
  };
}

/** Revalidate a verified PAT using the mutation transaction's own connection. */
export async function isScopedPatAuthorityCurrent(
  tx: Prisma.TransactionClient,
  principal: { identityId: string; credentialId: string; scopes: readonly string[] },
  accountIsActive: (identityId: string) => Promise<boolean>,
  requiredScope: string,
): Promise<boolean> {
  // Hold through the mutation/receipt commit: SHARE blocks revocation and scope updates.
  await tx.$queryRaw`
    SELECT id FROM external_agent_pats WHERE id = ${principal.credentialId} FOR SHARE
  `;
  const pat = await tx.externalAgentPat.findUnique({ where: { id: principal.credentialId } });
  if (
    !pat ||
    !CreateScopedPatSchema.shape.scopes.safeParse(pat.scopes).success ||
    pat.userId !== principal.identityId ||
    pat.revokedAt !== null ||
    pat.expiresAt.getTime() <= Date.now() ||
    !pat.scopes.includes(requiredScope) ||
    principal.scopes.some((scope) => !pat.scopes.includes(scope))
  )
    return false;
  const user = await tx.cloudAuthUser.findUnique({
    where: { id: principal.identityId },
    select: { disabledAt: true },
  });
  return Boolean(user && user.disabledAt === null && (await accountIsActive(principal.identityId)));
}
