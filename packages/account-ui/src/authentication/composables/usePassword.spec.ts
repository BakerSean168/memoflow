import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/contracts/result';
import type { CloudAuthClientPort } from '@memoflow/cloud-auth-contracts';
import { createTestPinia } from '@memoflow/test-utils';
import { AUTH_SERVICE_KEY } from '@account-ui-test-host/di/keys';
import { useAuthenticationStore } from '../stores/authentication-store';
import { usePassword } from './usePassword';

/**
 * W6-C real persistence evidence: the public test setup installs a genuine
 * happy-dom Storage on globalThis.localStorage, so the durable receipt path runs
 * against a real browser storage implementation and survives store rebuilds.
 */

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      auth: {
        errors: {
          BAD_REQUEST: 'The authentication request is invalid.',
          CONFLICT: 'The account already exists or this operation conflicts with existing data.',
          FORBIDDEN: 'This account cannot perform the requested action.',
          NOT_FOUND: 'The authentication resource was not found.',
          UNAUTHORIZED: 'Incorrect credentials or the cloud session is no longer valid.',
          VALIDATION_ERROR: 'Some submitted fields are invalid.',
          RATE_LIMITED: 'Too many attempts. Try again later.',
          NETWORK_ERROR: 'The authentication server is unreachable.',
          SERVICE_UNAVAILABLE: 'Authentication is temporarily unavailable.',
          INTERNAL_ERROR: 'The authentication service encountered an error.',
          TIMEOUT: 'The authentication request timed out.',
          UNKNOWN: 'Authentication failed. Try again later.',
          EMAIL_VERIFICATION_REQUIRED: 'Open the verification email to verify your address.',
          USER_ALREADY_EXISTS: 'This email is already registered. Sign in instead.',
        },
        toast: {
          pleaseLogin: 'Connect a cloud account first',
          passwordChanged: 'Password changed',
          operationFailed: 'Operation failed',
          changePasswordFailed: 'Failed to change password',
          resetEmailSent: 'Password reset link sent',
          sendResetEmailFailed: 'Failed to send reset email',
          passwordReset: 'Password reset',
          resetPasswordFailed: 'Failed to reset password',
        },
      },
    },
  },
});

function mountComposable(serviceOverrides: Partial<CloudAuthClientPort> = {}) {
  let composable!: ReturnType<typeof usePassword>;
  const service = {
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    changePassword: vi.fn(),
    ...serviceOverrides,
  };
  const pinia = createTestPinia();

  mount(
    defineComponent({
      setup() {
        composable = usePassword();
        return () => h('div');
      },
    }),
    {
      global: {
        plugins: [pinia, i18n],
        provide: {
          [AUTH_SERVICE_KEY as symbol]: service,
        },
      },
    },
  );

  const store = useAuthenticationStore(pinia);

  return { composable, service, store, pinia };
}

describe('usePassword structured error persistence (W6-C)', () => {
  beforeEach(() => {
    createTestPinia();
    vi.clearAllMocks();
    try {
      localStorage.clear();
    } catch {
      // localStorage unavailable in the test host
    }
  });

  it('writes structured error + request id + retryability into the auth store on failure', async () => {
    const { composable, service, store } = mountComposable({
      changePassword: vi.fn().mockResolvedValue(
        fail(
          {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Better Auth is temporarily unavailable',
            context: { requestId: 'req-change-123' },
          },
          { traceId: 'trace-change-123' },
        ),
      ),
    });
    store.handleCloudAuthResponse({
      account: {
        id: 'cloud-user-1',
        email: 'person@example.com',
        name: 'Person',
        emailVerified: true,
      },
      session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
      requiresEmailVerification: false,
    });

    const result = await composable.changePassword({
      currentPassword: 'old-pass',
      newPassword: 'new-pass',
    });

    expect(result).toBe(false);
    expect(store.passwordMutationError).not.toBeNull();
    expect(store.passwordMutationError?.code).toBe('SERVICE_UNAVAILABLE');
    expect(store.passwordMutationError?.requestId).toBe('trace-change-123');
    expect(store.passwordMutationError?.retryable).toBe(true);
    expect(store.passwordMutationError?.operation).toBe('change-password');
    expect(store.passwordMutationError?.failedAt).toBeGreaterThan(0);
    expect(service.changePassword).toHaveBeenCalledTimes(1);
  });

  it('persists the structured error across a simulated page reload', async () => {
    const { composable, store } = mountComposable({
      resetPassword: vi.fn().mockResolvedValue(
        fail(
          {
            code: 'VALIDATION_ERROR',
            message: 'Reset token is invalid or expired',
            context: { requestId: 'req-reset-456' },
          },
          { traceId: 'trace-reset-456' },
        ),
      ),
    });
    store.handleCloudAuthResponse({
      account: {
        id: 'cloud-user-1',
        email: 'person@example.com',
        name: 'Person',
        emailVerified: true,
      },
      session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
      requiresEmailVerification: false,
    });

    await composable.resetPassword({ token: 'reset-token', newPassword: 'new-pass' });
    expect(store.passwordMutationError?.code).toBe('VALIDATION_ERROR');
    expect(store.passwordMutationError?.requestId).toBe('trace-reset-456');
    // The receipt must be in durable storage (real localStorage).
    const persisted = localStorage.getItem('memoflow:auth:password-mutation-error');
    expect(persisted).not.toBeNull();
    expect(JSON.parse(persisted!).code).toBe('VALIDATION_ERROR');

    // Simulate a page reload: a brand-new pinia boot reads the receipt back
    // from durable storage into the fresh store instance.
    const reloadPinia = createTestPinia();
    const reloaded = useAuthenticationStore(reloadPinia);
    expect(reloaded.passwordMutationError).not.toBeNull();
    expect(reloaded.passwordMutationError?.code).toBe('VALIDATION_ERROR');
    expect(reloaded.passwordMutationError?.requestId).toBe('trace-reset-456');
  });

  it('clears the stored error after a successful mutation', async () => {
    const { composable, store } = mountComposable({
      forgotPassword: vi.fn().mockResolvedValue(fail({ code: 'TIMEOUT', message: 'Timed out' })),
    });
    store.handleCloudAuthResponse({
      account: {
        id: 'cloud-user-1',
        email: 'person@example.com',
        name: 'Person',
        emailVerified: true,
      },
      session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
      requiresEmailVerification: false,
    });

    await composable.forgotPassword({ email: 'person@example.com' });
    expect(store.passwordMutationError?.code).toBe('TIMEOUT');

    // A later successful mutation clears both memory and durable storage.
    const { composable: second, store: secondStore } = mountComposable({
      forgotPassword: vi.fn().mockResolvedValue(ok(undefined)),
    });
    secondStore.handleCloudAuthResponse({
      account: {
        id: 'cloud-user-1',
        email: 'person@example.com',
        name: 'Person',
        emailVerified: true,
      },
      session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
      requiresEmailVerification: false,
    });
    await second.forgotPassword({ email: 'person@example.com' });
    expect(secondStore.passwordMutationError).toBeNull();
    expect(localStorage.getItem('memoflow:auth:password-mutation-error')).toBeNull();
  });

  it('never leaks credentials into the structured error object', async () => {
    const { composable, store } = mountComposable({
      changePassword: vi.fn().mockResolvedValue(
        fail({
          code: 'UNAUTHORIZED',
          message: 'Current password is incorrect',
          context: { requestId: 'req-change-789' },
        }),
      ),
    });
    store.handleCloudAuthResponse({
      account: {
        id: 'cloud-user-1',
        email: 'person@example.com',
        name: 'Person',
        emailVerified: true,
      },
      session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
      requiresEmailVerification: false,
    });

    await composable.changePassword({ currentPassword: 'secret-old', newPassword: 'secret-new' });

    const receipt = store.passwordMutationError;
    expect(receipt).not.toBeNull();
    const json = JSON.stringify(receipt);
    expect(json).not.toContain('secret-old');
    expect(json).not.toContain('secret-new');
    expect(json).not.toMatch(/currentPassword|newPassword|token|accessToken/i);
  });

  it('redacts malicious server messages echoing credentials from store AND localStorage', async () => {
    const secretPassword = 'p@ssw0rd-echo';
    const secretToken = 'reset-token-echo';
    const secretEmail = 'victim@example.com';
    const { composable, store } = mountComposable({
      resetPassword: vi.fn().mockResolvedValue(
        fail({
          code: 'UNKNOWN_ERROR_CODE_FROM_SERVER',
          message: `Reset failed for ${secretEmail} with token ${secretToken} using password ${secretPassword}`,
          context: { requestId: 'req-echo-1', email: secretEmail, token: secretToken },
        }),
      ),
    });
    store.handleCloudAuthResponse({
      account: {
        id: 'cloud-user-1',
        email: 'person@example.com',
        name: 'Person',
        emailVerified: true,
      },
      session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
      requiresEmailVerification: false,
    });

    await composable.resetPassword({ token: secretToken, newPassword: secretPassword });

    const receipt = store.passwordMutationError;
    expect(receipt).not.toBeNull();
    // Unknown server code falls back to the allowlisted generic UNKNOWN text.
    expect(receipt?.message).toBe('Authentication failed. Try again later.');
    const persisted = localStorage.getItem('memoflow:auth:password-mutation-error');
    expect(persisted).not.toBeNull();

    const allPersisted = JSON.stringify({
      receipt,
      persistedRaw: persisted,
    });
    expect(allPersisted).not.toContain(secretPassword);
    expect(allPersisted).not.toContain(secretToken);
    expect(allPersisted).not.toContain(secretEmail);
    // No raw server message/context field may survive into the receipt or storage.
    expect(allPersisted).not.toContain('Reset failed for');
    expect(allPersisted).not.toMatch(
      /currentPassword|newPassword|token|accessToken|victim@example\.com/i,
    );

    // Reload still yields only the safe allowlisted message.
    const reloadPinia = createTestPinia();
    const reloaded = useAuthenticationStore(reloadPinia);
    expect(reloaded.passwordMutationError?.message).toBe('Authentication failed. Try again later.');
  });

  it('persists only the allowlisted localized message even for known server codes', async () => {
    const secretEmail = 'person@example.com';
    const { composable, store } = mountComposable({
      forgotPassword: vi.fn().mockResolvedValue(
        fail({
          code: 'VALIDATION_ERROR',
          message: `No account for ${secretEmail} / password echo p@ss`,
          context: { requestId: 'req-echo-2' },
        }),
      ),
    });
    store.handleCloudAuthResponse({
      account: {
        id: 'cloud-user-1',
        email: 'person@example.com',
        name: 'Person',
        emailVerified: true,
      },
      session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
      requiresEmailVerification: false,
    });

    await composable.forgotPassword({ email: secretEmail });

    const persisted = localStorage.getItem('memoflow:auth:password-mutation-error');
    expect(persisted).not.toBeNull();
    const parsed = JSON.parse(persisted!) as { message: string };
    expect(parsed.message).toBe('Some submitted fields are invalid.');
    expect(persisted).not.toContain('p@ss');
    expect(persisted).not.toContain('No account for');
  });
});
