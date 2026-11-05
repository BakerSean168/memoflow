import type { PrismaClient } from '@memoflow/database';
import {
  APIError,
  changeEmail,
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
  sensitiveSessionMiddleware,
} from 'better-auth/api';
import type { BetterAuthPlugin } from 'better-auth';
import { z } from 'zod';

const passwordBody = z.object({ password: z.string().min(1).max(100) });

/** Password recheck runs inside Better Auth's origin and rate-limit boundary. */
const requirePassword = createAuthMiddleware(async (ctx) => {
  const session = await getSessionFromCtx(ctx);
  if (!session) throw new APIError('UNAUTHORIZED', { code: 'UNAUTHORIZED', message: '请先登录' });
  const input = passwordBody.safeParse(ctx.body);
  if (!input.success)
    throw new APIError('BAD_REQUEST', { code: 'INVALID_PASSWORD', message: '请输入当前密码' });
  const credential = await ctx.context.internalAdapter.findCredentialAccount(session.user.id);
  if (
    !credential?.password ||
    !(await ctx.context.password.verify({
      hash: credential.password,
      password: input.data.password,
    }))
  ) {
    throw new APIError('BAD_REQUEST', { code: 'INVALID_PASSWORD', message: '当前密码不正确' });
  }
});

/** Physically remove the identity and its data in one transaction. */
export async function deleteCloudAccount(
  database: PrismaClient,
  identityId: string,
): Promise<void> {
  await database.$transaction(async (tx) => {
    const where = { identityId };
    // These owner relations deliberately restrict deletion; clear their rows
    // before deleting the user. Remaining business rows cascade via Account.
    await tx.walletTransaction.deleteMany({ where });
    await tx.taskOccurrence.deleteMany({ where });
    await tx.taskPlanHistory.deleteMany({ where });
    await tx.notificationDispatchOutbox.deleteMany({ where });
    await tx.routineOccurrence.deleteMany({ where });
    // Durable queues/preferences without an Account FK must also be erased.
    await tx.outboxMessage.deleteMany({ where });
    await tx.taskGoalOutbox.deleteMany({ where });
    await tx.notificationDeliveryDecisionRecord.deleteMany({ where });
    await tx.notificationPreference.deleteMany({ where });
    await tx.scheduleRebuildOutbox.deleteMany({ where });
    await tx.scheduleDomainEventOutbox.deleteMany({ where });
    await tx.accountClosureOperation.deleteMany({ where });
    await tx.operationAuditLog.deleteMany({ where: { actorIdentityId: identityId } });
    const user = await tx.cloudAuthUser.findUnique({
      where: { id: identityId },
      select: { email: true },
    });
    await tx.cloudAuthVerification.deleteMany({
      where: { OR: [{ value: identityId }, ...(user ? [{ identifier: user.email }] : [])] },
    });
    await tx.cloudAuthUser.delete({ where: { id: identityId } });
  });
}

export function accountSecurityPlugin(database: PrismaClient): BetterAuthPlugin {
  return {
    id: 'memoflow-account-security',
    endpoints: {
      changeAccountEmail: createAuthEndpoint(
        '/account-security/change-email',
        {
          method: 'POST',
          body: passwordBody.extend({ newEmail: z.string().email() }),
          use: [sensitiveSessionMiddleware, requirePassword],
        },
        async (ctx) =>
          changeEmail({ ...ctx, body: { newEmail: ctx.body.newEmail }, asResponse: false }),
      ),
      verifyAccountPassword: createAuthEndpoint(
        '/account-security/verify-password',
        {
          method: 'POST',
          body: passwordBody,
          use: [sensitiveSessionMiddleware, requirePassword],
        },
        async (ctx) => ctx.json({ status: true }),
      ),
      accountSessions: createAuthEndpoint(
        '/account-security/sessions',
        {
          method: 'GET',
          use: [sensitiveSessionMiddleware],
        },
        async (ctx) => {
          const sessions = await ctx.context.internalAdapter.listSessions(
            ctx.context.session.user.id,
            { onlyActiveSessions: true },
          );
          return ctx.json(
            sessions.map((session) => ({
              id: session.id,
              expiresAt: session.expiresAt.toISOString(),
              createdAt: session.createdAt.toISOString(),
              ipAddress: session.ipAddress ?? null,
              userAgent: session.userAgent ?? null,
              current: session.id === ctx.context.session.session.id,
            })),
          );
        },
      ),
      revokeAccountSession: createAuthEndpoint(
        '/account-security/revoke-session',
        {
          method: 'POST',
          body: z.object({ sessionId: z.string().min(1).max(200) }),
          use: [sensitiveSessionMiddleware],
        },
        async (ctx) => {
          const sessions = await ctx.context.internalAdapter.listSessions(
            ctx.context.session.user.id,
            { onlyActiveSessions: true },
          );
          const target = sessions.find((session) => session.id === ctx.body.sessionId);
          if (!target || target.id === ctx.context.session.session.id)
            throw new APIError('BAD_REQUEST', { message: '只能撤销本账户的其他会话' });
          await ctx.context.internalAdapter.deleteSession(target.token);
          return ctx.json({ status: true });
        },
      ),
      deleteAccountPermanently: createAuthEndpoint(
        '/account-security/delete-account',
        {
          method: 'POST',
          body: passwordBody.extend({ confirmation: z.literal('DELETE') }),
          use: [sensitiveSessionMiddleware, requirePassword],
        },
        async (ctx) => {
          await deleteCloudAccount(database, ctx.context.session.user.id);
          return ctx.json({ status: true });
        },
      ),
    },
    rateLimit: [
      {
        pathMatcher: (path) => path.startsWith('/account-security/') || path === '/change-email',
        window: 60,
        max: 10,
      },
    ],
  };
}
