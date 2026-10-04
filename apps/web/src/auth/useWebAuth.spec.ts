import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/contracts/result';
import { useWebAuth } from './useWebAuth';

const service = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  changePassword: vi.fn(),
  beginGithubSignIn: vi.fn(),
  getDeviceAuthorization: vi.fn(),
  approveDeviceAuthorization: vi.fn(),
  denyDeviceAuthorization: vi.fn(),
}));

vi.mock('./service', () => ({
  useAuthService: () => service,
}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('useWebAuth email sign-in outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps invalid credentials as an error instead of requesting email verification', async () => {
    service.signIn.mockResolvedValue(
      fail({
        code: 'UNAUTHORIZED',
        message: 'Invalid credentials',
      }),
    );
    const auth = useWebAuth();

    const outcome = await auth.loginByEmail({
      email: 'person@example.com',
      password: 'Wrong-password-123',
    });

    expect(outcome).toBe(false);
    expect(auth.pendingVerificationEmail.value).toBeNull();
    expect(auth.errorMessage.value).toBe('Invalid credentials');
  });

  it('requests email verification only for the provider-neutral verification failure', async () => {
    service.signIn.mockResolvedValue(
      fail({
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Email verification required',
      }),
    );
    const auth = useWebAuth();

    const outcome = await auth.loginByEmail({
      email: 'person@example.com',
      password: 'Correct-password-123',
    });

    expect(outcome).toBe('needs-email-verification');
    expect(auth.pendingVerificationEmail.value).toBe('person@example.com');
    expect(auth.errorMessage.value).toBeNull();
  });
});

describe('useWebAuth GitHub popup sign-in', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/auth');
  });

  it('fails cleanly when the browser blocks the authorization popup', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const auth = useWebAuth();

    await expect(auth.startGithubLogin('/repository')).resolves.toBe(false);

    expect(open).toHaveBeenCalledWith(
      'about:blank',
      'memoflow-github-auth',
      expect.stringContaining('popup=yes'),
    );
    expect(service.beginGithubSignIn).not.toHaveBeenCalled();
    expect(auth.errorMessage.value).toBe('The browser blocked the GitHub sign-in window.');
  });

  it('keeps the parent page in place while the popup authorizes, then observes the shared session', async () => {
    vi.useFakeTimers();
    const replacePopup = vi.fn();
    const closePopup = vi.fn();
    const popup = {
      closed: false,
      location: { replace: replacePopup },
      close: closePopup,
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    service.beginGithubSignIn.mockResolvedValue(
      ok({ url: 'https://github.com/login/oauth/authorize?client_id=test' }),
    );
    service.getSession.mockResolvedValue(
      ok({
        account: { id: 'account-1', email: 'person@example.com' },
        session: { id: 'session-1', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      }),
    );
    const auth = useWebAuth();

    const outcome = auth.startGithubLogin('/repository');
    await Promise.resolve();
    await Promise.resolve();

    expect(open).toHaveBeenCalledOnce();
    expect(replacePopup).toHaveBeenCalledWith(
      'https://github.com/login/oauth/authorize?client_id=test',
    );
    const callbackURL = new URL(service.beginGithubSignIn.mock.calls[0]![0]);
    expect(callbackURL.origin).toBe(window.location.origin);
    expect(callbackURL.pathname).toBe('/auth/popup-complete');
    expect(callbackURL.searchParams.get('provider')).toBe('github');
    expect(callbackURL.searchParams.get('requestId')).toBeTruthy();
    expect(window.location.pathname).toBe('/auth');

    await vi.advanceTimersByTimeAsync(750);
    await expect(outcome).resolves.toBe(true);

    expect(service.getSession).toHaveBeenCalled();
    expect(closePopup).toHaveBeenCalled();
    expect(window.location.pathname).toBe('/repository');
    vi.useRealTimers();
  });
});
