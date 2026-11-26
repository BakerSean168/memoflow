import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { APIError, getSessionFromCtx } from 'better-auth/api';
import type { CloudAuthEmailDelivery } from './email-delivery';
import type { AccountVerificationPurpose } from '@memoflow/cloud-auth-contracts';

type VerificationStore = Parameters<typeof getSessionFromCtx>[0]['context']['internalAdapter'];
interface Subject { userId: string; sessionId: string; email: string; purpose: AccountVerificationPurpose }
const CODE_TTL = 10 * 60_000;
const GRANT_TTL = 5 * 60_000;
const PREFIX = 'account-security:';
const subjectKey = (subject: Subject) => `${PREFIX}${subject.userId}:${subject.sessionId}:${subject.purpose}`;
const sameSubject = (stored: Subject, current: Subject) => stored.userId === current.userId && stored.sessionId === current.sessionId && stored.email === current.email && stored.purpose === current.purpose;
const invalidCode = () => new APIError('BAD_REQUEST', { code: 'ACCOUNT_VERIFICATION_INVALID', message: '验证码错误或已失效，请重试或重新发送' });
const invalidGrant = () => new APIError('FORBIDDEN', { code: 'ACCOUNT_VERIFICATION_REQUIRED', message: '请先验证当前邮箱，再继续操作' });

/** Uses Better Auth's durable verification owner and atomic consume/reserve primitives. */
export function createAccountEmailVerification(secret: string, delivery: CloudAuthEmailDelivery) {
  const digest = (value: string) => createHmac('sha256', secret).update(value).digest('hex');
  return {
    async request(store: VerificationStore, subject: Subject) {
      const now = Date.now();
      const throttle = `${PREFIX}send:${subject.userId}:${subject.purpose}:${Math.floor(now / 60_000)}`;
      const existing = await store.findVerificationValue(throttle);
      if (existing || !await store.reserveVerificationValue({ identifier: throttle, value: 'sent', expiresAt: new Date(now + 60_000) })) {
        throw new APIError('TOO_MANY_REQUESTS', { code: 'ACCOUNT_VERIFICATION_RATE_LIMITED', message: '发送过于频繁，请稍后重试' });
      }
      const challengeId = randomUUID();
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const expiresAt = new Date(now + CODE_TTL);
      const active = `${subjectKey(subject)}:active`;
      const previous = await store.findVerificationValue(active);
      if (previous && now - Number(JSON.parse(previous.value).sentAt) < 60_000) {
        throw new APIError('TOO_MANY_REQUESTS', { code: 'ACCOUNT_VERIFICATION_RATE_LIMITED', message: '请稍后再重新发送验证码' });
      }
      const identifier = `${subjectKey(subject)}:code:${challengeId}`;
      await store.createVerificationValue({ identifier, value: JSON.stringify({ ...subject, hash: digest(`${challengeId}:${code}`), attempts: 0 }), expiresAt });
      try {
        await delivery.send({ kind: 'account-security-code', email: subject.email, code });
        await store.deleteVerificationByIdentifier(active);
        await store.createVerificationValue({ identifier: active, value: JSON.stringify({ challengeId, sentAt: now }), expiresAt });
      } catch (error) {
        await store.deleteVerificationByIdentifier(identifier);
        throw error;
      }
      return { challengeId, retryAfterSeconds: 60, expiresInSeconds: CODE_TTL / 1000 };
    },
    async verify(store: VerificationStore, subject: Subject, challengeId: string, code: string) {
      const active = await store.findVerificationValue(`${subjectKey(subject)}:active`);
      if (!active || JSON.parse(active.value).challengeId !== challengeId) throw invalidCode();
      const identifier = `${subjectKey(subject)}:code:${challengeId}`;
      const row = await store.consumeVerificationValue(identifier);
      if (!row) throw invalidCode();
      const stored = JSON.parse(row.value) as Subject & { hash: string; attempts: number };
      if (!sameSubject(stored, subject) || stored.attempts >= 5) throw invalidCode();
      const expected = Buffer.from(stored.hash, 'hex');
      const actual = Buffer.from(digest(`${challengeId}:${code}`), 'hex');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        if (stored.attempts + 1 < 5) await store.createVerificationValue({ identifier, value: JSON.stringify({ ...stored, attempts: stored.attempts + 1 }), expiresAt: row.expiresAt });
        throw invalidCode();
      }
      const latest = await store.findVerificationValue(`${subjectKey(subject)}:active`);
      if (!latest || JSON.parse(latest.value).challengeId !== challengeId) throw invalidCode();
      const verificationToken = randomBytes(32).toString('base64url');
      await store.createVerificationValue({ identifier: `${PREFIX}grant:${digest(verificationToken)}`, value: JSON.stringify(subject), expiresAt: new Date(Date.now() + GRANT_TTL) });
      return { verificationToken };
    },
    async consume(store: VerificationStore, subject: Subject, verificationToken: string) {
      const identifier = `${PREFIX}grant:${digest(verificationToken)}`;
      const existing = await store.findVerificationValue(identifier);
      // A foreign session cannot burn a legitimate session's proof.
      if (!existing || !sameSubject(JSON.parse(existing.value), subject)) throw invalidGrant();
      const row = await store.consumeVerificationValue(identifier);
      if (!row || !sameSubject(JSON.parse(row.value), subject)) throw invalidGrant();
    },
  };
}
