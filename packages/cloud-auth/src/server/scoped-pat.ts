import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  CreateScopedPatSchema,
  type CreateScopedPatInput,
} from '@memoflow/contracts/agent-gateway';
import type { RequestContext } from '@memoflow/contracts/shared';
import type { PrismaClient, Prisma } from '@memoflow/database';

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
}

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const publicFields = {
  id: true,
  name: true,
  prefix: true,
  audience: true,
  scopes: true,
  expiresAt: true,
  revokedAt: true,
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
  return {
    async create(identityId: string, input: CreateScopedPatInput, context?: RequestContext) {
      const parsed = CreateScopedPatSchema.parse(input);
      const days = parsed.expiresInDays;
      if (!(await isActive(identityId, context))) throw new Error('Inactive account');
      const secret = `mfp_${randomBytes(32).toString('base64url')}`;
      const pat = await db.externalAgentPat.create({
        data: {
          id: randomUUID(),
          userId: identityId,
          name: parsed.name,
          prefix: secret.slice(0, 12),
          tokenDigest: digest(secret),
          audience: options.audience,
          scopes: parsed.scopes,
          expiresAt: new Date(Date.now() + days * 86400000),
        },
        select: publicFields,
      });
      return { ...pat, secret };
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
        pat.scopes.length > 2 ||
        new Set(pat.scopes).size !== pat.scopes.length ||
        pat.scopes.some((scope) => scope !== 'goals:read' && scope !== 'tasks:read') ||
        !(await isActive(pat.userId, context))
      )
        return null;
      return {
        identityId: pat.userId,
        credentialId: pat.id,
        credentialType: 'pat',
        scopes: pat.scopes,
      };
    },
    /** PostgreSQL CAS keeps the pilot's fixed-window quota effective across API instances. */
    async consumeReadQuota(credentialId: string): Promise<boolean> {
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
          AND (rate_window <= CURRENT_TIMESTAMP - INTERVAL '1 minute' OR rate_count < 60)
      `,
      );
      return count === 1;
    },
  };
}
