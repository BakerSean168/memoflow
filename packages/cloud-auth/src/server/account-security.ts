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
import { AccountVerificationPurposeSchema } from '@memoflow/cloud-auth-contracts';
import { createAccountEmailVerification } from './account-email-verification.js';
import type { CloudAuthEmailDelivery } from './email-delivery.js';

const passwordBody = z.object({ password: z.string().min(1).max(100) });
const verificationTokenBody = z.string().min(32).max(200);

interface SessionSubject {
  readonly user: { readonly id: string; readonly email: string; readonly emailVerified: boolean };
  readonly session: { readonly id: string };
}

/** Bind every proof to the acting account, current mailbox, session and purpose. */
const subjectOf = (
  session: SessionSubject,
  purpose: z.infer<typeof AccountVerificationPurposeSchema>,
) => ({
  userId: session.user.id,
  sessionId: session.session.id,
  email: session.user.email,
  purpose,
});

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

export function accountSecurityPlugin(
  database: PrismaClient,
  emailDelivery: CloudAuthEmailDelivery,
  secret: string,
): BetterAuthPlugin {
  const verification = createAccountEmailVerification(secret, emailDelivery);

  return {
    id: 'memoflow-account-security',
    endpoints: {
      requestAccountVerification: createAuthEndpoint(
        '/account-security/request-verification',
        {
          method: 'POST',
          body: z.object({ purpose: AccountVerificationPurposeSchema }),
          use: [sensitiveSessionMiddleware],
        },
        async (ctx) => {
          const session = ctx.context.session;
          if (!session.user.emailVerified)
            throw new APIError('BAD_REQUEST', {
              code: 'ACCOUNT_EMAIL_UNVERIFIED',
              message: '当前邮箱尚未验证，请先完成邮箱验证',
            });
          return ctx.json(
            await verification.request(
              ctx.context.internalAdapter,
              subjectOf(session, ctx.body.purpose),
            ),
          );
        },
      ),
      verifyAccountEmailCode: createAuthEndpoint(
        '/account-security/verify-email-code',
        {
          method: 'POST',
          body: z.object({
            purpose: AccountVerificationPurposeSchema,
            challengeId: z.string().uuid(),
            code: z.string().regex(/^\d{6}$/),
          }),
          use: [sensitiveSessionMiddleware],
        },
        async (ctx) =>
          ctx.json(
            await verification.verify(
              ctx.context.internalAdapter,
              subjectOf(ctx.context.session, ctx.body.purpose),
              ctx.body.challengeId,
              ctx.body.code,
            ),
          ),
      ),
      changeAccountPassword: createAuthEndpoint(
        '/account-security/change-password',
        {
          method: 'POST',
          body: z.object({
            currentPassword: z.string().min(1).max(100),
            newPassword: z.string().min(8).max(100),
            verificationToken: verificationTokenBody,
          }),
          use: [sensitiveSessionMiddleware],
        },
        async (ctx) => {
          const session = ctx.context.session;
          const credential = await ctx.context.internalAdapter.findCredentialAccount(
            session.user.id,
          );
          if (!credential?.password)
            throw new APIError('BAD_REQUEST', {
              code: 'PASSWORD_NOT_SET',
              message: '该账户未设置密码，请先通过邮箱恢复流程设置密码',
            });
          if (
            !(await ctx.context.password.verify({
              hash: credential.password,
              password: ctx.body.currentPassword,
            }))
          )
            throw new APIError('BAD_REQUEST', {
              code: 'INVALID_PASSWORD',
              message: '当前密码不正确',
            });
          await verification.consume(
            ctx.context.internalAdapter,
            subjectOf(session, 'change-password'),
            ctx.body.verificationToken,
          );
          await ctx.context.internalAdapter.updateAccount(credential.id, {
            password: await ctx.context.password.hash(ctx.body.newPassword),
          });
          return ctx.json({ status: true });
        },
      ),
      changeAccountEmail: createAuthEndpoint(
        '/account-security/change-email',
        {
          method: 'POST',
          body: passwordBody.extend({
            newEmail: z.string().email(),
            verificationToken: verificationTokenBody,
          }),
          use: [sensitiveSessionMiddleware, requirePassword],
        },
        async (ctx) => {
          await verification.consume(
            ctx.context.internalAdapter,
            subjectOf(ctx.context.session, 'change-email'),
            ctx.body.verificationToken,
          );
          return changeEmail({ ...ctx, body: { newEmail: ctx.body.newEmail }, asResponse: false });
        },
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
