import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { APIError, getSessionFromCtx } from 'better-auth/api';
import type { AccountVerificationPurpose } from '@memoflow/cloud-auth-contracts';
import type { CloudAuthEmailDelivery } from './email-delivery.js';

type VerificationStore = Parameters<typeof getSessionFromCtx>[0]['context']['internalAdapter'];

/** The proof subject is immutable: account, current mailbox, session and purpose. */
export interface AccountVerificationSubject {
  readonly userId: string;
  readonly sessionId: string;
  readonly email: string;
  readonly purpose: AccountVerificationPurpose;
}

const CODE_TTL_MS = 10 * 60_000;
const GRANT_TTL_MS = 5 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;
const PREFIX = 'account-security:';

const subjectKey = (subject: AccountVerificationSubject) =>
  `${PREFIX}${subject.userId}:${subject.sessionId}:${subject.purpose}`;

const sameSubject = (stored: AccountVerificationSubject, current: AccountVerificationSubject) =>
  stored.userId === current.userId &&
  stored.sessionId === current.sessionId &&
  stored.email === current.email &&
  stored.purpose === current.purpose;

const invalidCode = () =>
  new APIError('BAD_REQUEST', {
    code: 'ACCOUNT_VERIFICATION_INVALID',
    message: '验证码错误或已失效，请重试或重新发送',
  });

const invalidGrant = () =>
  new APIError('FORBIDDEN', {
    code: 'ACCOUNT_VERIFICATION_REQUIRED',
    message: '请先验证当前邮箱，再继续操作',
  });

/**
 * Email-code ownership proof for sensitive account mutations.
 *
 * Codes and grants are stored only as keyed digests. Verification and grant
 * redemption use Better Auth's atomic single-use primitives, so a code or
 * grant is valid at most once even under concurrent requests.
 */
export function createAccountEmailVerification(secret: string, delivery: CloudAuthEmailDelivery) {
  const digest = (value: string) => createHmac('sha256', secret).update(value).digest('hex');

  return {
    async request(store: VerificationStore, subject: AccountVerificationSubject) {
      const now = Date.now();
      // One delivery per minute per account and purpose. The database-backed
      // reservation is first-writer-wins, so parallel requests cannot both send.
      const throttle = `${PREFIX}send:${subject.userId}:${subject.purpose}:${Math.floor(now / 60_000)}`;
      const existing = await store.findVerificationValue(throttle);
      if (
        existing ||
        !(await store.reserveVerificationValue({
          identifier: throttle,
          value: 'sent',
          expiresAt: new Date(now + 60_000),
        }))
      ) {
        throw new APIError('TOO_MANY_REQUESTS', {
          code: 'ACCOUNT_VERIFICATION_RATE_LIMITED',
          message: '发送过于频繁，请稍后重试',
        });
      }

      const activeKey = `${subjectKey(subject)}:active`;
      const previous = await store.findVerificationValue(activeKey);
      if (previous && now - Number(JSON.parse(previous.value).sentAt) < RESEND_COOLDOWN_MS) {
        throw new APIError('TOO_MANY_REQUESTS', {
          code: 'ACCOUNT_VERIFICATION_RATE_LIMITED',
          message: '请稍后再重新发送验证码',
        });
      }

      const challengeId = randomUUID();
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const identifier = `${subjectKey(subject)}:code:${challengeId}`;
      const expiresAt = new Date(now + CODE_TTL_MS);
      await store.createVerificationValue({
        identifier,
        value: JSON.stringify({ ...subject, hash: digest(`${challengeId}:${code}`), attempts: 0 }),
        expiresAt,
      });

      try {
        await delivery.send({ kind: 'account-security-code', email: subject.email, code });
      } catch (error) {
        await store.deleteVerificationByIdentifier(identifier);
        throw error;
      }

      // Only the newest challenge stays active; an older code cannot be
      // redeemed even though its row is still inside its TTL window.
      await store.deleteVerificationByIdentifier(activeKey);
      await store.createVerificationValue({
        identifier: activeKey,
        value: JSON.stringify({ challengeId, sentAt: now }),
        expiresAt,
      });

      return {
        challengeId,
        retryAfterSeconds: RESEND_COOLDOWN_MS / 1000,
        expiresInSeconds: CODE_TTL_MS / 1000,
      };
    },

    async verify(
      store: VerificationStore,
      subject: AccountVerificationSubject,
      challengeId: string,
      code: string,
    ) {
      const active = await store.findVerificationValue(`${subjectKey(subject)}:active`);
      if (!active || JSON.parse(active.value).challengeId !== challengeId) throw invalidCode();

      const identifier = `${subjectKey(subject)}:code:${challengeId}`;
      const row = await store.consumeVerificationValue(identifier);
      if (!row) throw invalidCode();

      const stored = JSON.parse(row.value) as AccountVerificationSubject & {
        hash: string;
        attempts: number;
      };
      if (!sameSubject(stored, subject) || stored.attempts >= MAX_ATTEMPTS) throw invalidCode();

      const expected = Buffer.from(stored.hash, 'hex');
      const actual = Buffer.from(digest(`${challengeId}:${code}`), 'hex');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        // Consume invalidates the row, so the attempt counter is re-created
        // only while budget remains; racing guesses cannot exceed the budget.
        if (stored.attempts + 1 < MAX_ATTEMPTS) {
          await store.createVerificationValue({
            identifier,
            value: JSON.stringify({ ...stored, attempts: stored.attempts + 1 }),
            expiresAt: row.expiresAt,
          });
        }
        throw invalidCode();
      }

      const verificationToken = randomBytes(32).toString('base64url');
      await store.createVerificationValue({
        identifier: `${PREFIX}grant:${digest(verificationToken)}`,
        value: JSON.stringify(subject),
        expiresAt: new Date(Date.now() + GRANT_TTL_MS),
      });
      return { verificationToken };
    },

    async consume(
      store: VerificationStore,
      subject: AccountVerificationSubject,
      verificationToken: string,
    ) {
      const identifier = `${PREFIX}grant:${digest(verificationToken)}`;
      const existing = await store.findVerificationValue(identifier);
      // A foreign session or purpose cannot burn another subject's proof.
      if (!existing || !sameSubject(JSON.parse(existing.value), subject)) throw invalidGrant();
      const row = await store.consumeVerificationValue(identifier);
      if (!row || !sameSubject(JSON.parse(row.value), subject)) throw invalidGrant();
    },
  };
}
