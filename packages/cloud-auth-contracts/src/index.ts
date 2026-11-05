import { z } from 'zod';
import type { Result } from '@memoflow/transport-contracts/result';

export interface CloudAccountSummary {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export interface CloudSessionSummary {
  id: string;
  expiresAt: string;
}

export type CloudAuthResponse = z.infer<typeof CloudAuthResponseSchema>;

export interface CloudSessionState {
  account: CloudAccountSummary | null;
  session: CloudSessionSummary | null;
}

export type DeviceAuthorizationDecisionStatus = 'pending' | 'approved' | 'denied';

export interface DeviceAuthorizationVerification {
  userCode: string;
  status: DeviceAuthorizationDecisionStatus;
}

export type DesktopCloudConnectionStatus =
  | 'requesting_code'
  | 'awaiting_authorization'
  | 'connecting_profile'
  | 'connected'
  | 'denied'
  | 'expired'
  | 'cancelled'
  | 'failed';

export const DesktopCloudConnectionRequestSchema = z
  .object({
    intent: z.enum(['add_account', 'reauthenticate']),
  })
  .strict();
export type DesktopCloudConnectionRequest = z.infer<typeof DesktopCloudConnectionRequestSchema>;

export const CloudAuthResponseSchema = z.object({
  account: z.object({
    id: z.string().min(1),
    email: z.string().email(),
    name: z.string(),
    emailVerified: z.boolean(),
  }),
  session: z.object({ id: z.string().min(1), expiresAt: z.string().datetime() }).nullable(),
  requiresEmailVerification: z.boolean(),
});

export const BetterAuthSessionResponseSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    email: z.string().email(),
    name: z.string(),
    emailVerified: z.boolean().optional(),
  }),
  session: z.object({
    id: z.string().min(1),
    expiresAt: z.string().datetime(),
  }),
});

export const DesktopCloudAttemptRequestSchema = z.object({ attemptId: z.string().uuid() }).strict();

/**
 * Credentials the identity window submits for cloud sign-in. The password is
 * only ever carried in this request; it is never stored or logged.
 */
export const DesktopCloudCredentialSignInSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1).max(100),
    remember: z.boolean(),
  })
  .strict();

export const DesktopCloudRegistrationSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1).max(100),
    name: z.string().max(80).optional(),
    remember: z.boolean(),
  })
  .strict();

export const DesktopCloudGithubSignInSchema = z.object({ remember: z.boolean() }).strict();
export type DesktopCloudCredentialSignIn = z.infer<typeof DesktopCloudCredentialSignInSchema>;
export type DesktopCloudRegistration = z.infer<typeof DesktopCloudRegistrationSchema>;
export type DesktopCloudGithubSignIn = z.infer<typeof DesktopCloudGithubSignInSchema>;

/**
 * The Profile the main process registered or found and opened for the new
 * session.
 */
export const DesktopCloudSignInResultSchema = z.object({ profileId: z.string().min(1) }).strict();
export type DesktopCloudSignInResult = z.infer<typeof DesktopCloudSignInResultSchema>;

export interface DesktopCloudConnectionResult {
  targetProfileId: string;
  activation: 'active' | 'pending' | 'password_required' | 'sync_pending';
}

export interface DesktopCloudConnectionAttempt {
  attemptId: string;
  /**
   * The Profile the attempt is anchored to. `null` for a source-less attempt
   * started from the identity window, where no Profile is open yet.
   */
  originProfileId: string | null;
  result: DesktopCloudConnectionResult | null;
  userCode: string;
  verificationUrl: string;
  expiresAt: string;
  status: DesktopCloudConnectionStatus;
  error: { code: string; message: string } | null;
}

export interface CloudSignInRequest {
  email: string;
  password: string;
}

export interface CloudSignUpRequest extends CloudSignInRequest {
  name?: string;
}

export interface CloudSessionClientPort {
  signOut(): Promise<Result<void>>;
  getSession(): Promise<Result<CloudSessionState>>;
}

export interface CloudAuthClientPort extends CloudSessionClientPort {
  signIn(request: CloudSignInRequest): Promise<Result<CloudAuthResponse>>;
  signUp(request: CloudSignUpRequest): Promise<Result<CloudAuthResponse>>;
  forgotPassword(email: string): Promise<Result<void>>;
  resetPassword(input: { token: string; newPassword: string }): Promise<Result<void>>;
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<Result<void>>;
}

export interface CloudAuthWebClientPort extends CloudAuthClientPort {
  beginGithubSignIn(callbackURL?: string): Promise<Result<{ url: string }>>;
  getDeviceAuthorization(userCode: string): Promise<Result<DeviceAuthorizationVerification>>;
  approveDeviceAuthorization(userCode: string): Promise<Result<void>>;
  denyDeviceAuthorization(userCode: string): Promise<Result<void>>;
}

export interface CloudAuthDesktopClientPort extends CloudSessionClientPort {
  beginCloudConnection(
    request: DesktopCloudConnectionRequest,
  ): Promise<Result<DesktopCloudConnectionAttempt>>;
  getCurrentCloudConnection(): Promise<Result<DesktopCloudConnectionAttempt | null>>;
  getCloudConnectionStatus(attemptId: string): Promise<Result<DesktopCloudConnectionAttempt>>;
  cancelCloudConnection(attemptId: string): Promise<Result<void>>;
}

/** Account security projection. Session bearer tokens never cross this port. */
export interface AccountSecuritySession {
  id: string;
  expiresAt: string;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

export interface CloudAccountSecurityPort {
  verifyAccountPassword(password: string): Promise<Result<void>>;
  requestEmailChange(input: { password: string; newEmail: string }): Promise<Result<void>>;
  listAccountSessions(): Promise<Result<AccountSecuritySession[]>>;
  revokeAccountSession(sessionId: string): Promise<Result<void>>;
  deleteAccountPermanently(input: {
    password: string;
    confirmation: 'DELETE';
  }): Promise<Result<void>>;
}

export const AccountSecurityRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('verify-password'), password: z.string().min(1).max(100) }).strict(),
  z
    .object({
      action: z.literal('change-email'),
      password: z.string().min(1).max(100),
      newEmail: z.string().email(),
    })
    .strict(),
  z.object({ action: z.literal('sessions') }).strict(),
  z.object({ action: z.literal('revoke-session'), sessionId: z.string().min(1).max(200) }).strict(),
  z
    .object({
      action: z.literal('delete-account'),
      password: z.string().min(1).max(100),
      confirmation: z.literal('DELETE'),
    })
    .strict(),
]);
