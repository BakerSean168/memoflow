import { ref } from 'vue';
import { toast } from 'vue-sonner';
import { z } from 'zod';
import { CloudAuthChannels } from '@memoflow/desktop-contracts';
import { translateResultError } from '../utils/translate-result-error';
import type { DesktopProfilesSharedContext } from './useDesktopProfiles';

/** The signed-in Profile the main process opened for the identity window. */
export const openedProfileSchema = z.object({ profileId: z.string().min(1) });
/**
 * The device-authorization attempt snapshot. Only the fields the identity
 * window reacts to are read; the rest of the shape belongs to the workspace
 * cloud-connection dialog.
 */
const signInAttemptSchema = z.object({
  attemptId: z.string(),
  status: z.enum([
    'requesting_code',
    'awaiting_authorization',
    'connecting_profile',
    'connected',
    'denied',
    'expired',
    'cancelled',
    'failed',
  ]),
  result: z.object({ targetProfileId: z.string(), activation: z.string() }).nullable(),
  userCode: z.string(),
  verificationUrl: z.string(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});

const GITHUB_POLL_INTERVAL_MS = 1_500;

/** Catalog actions the cloud sign-in composable calls into. */
export interface DesktopProfileCloudSignInCross {
  enterOpenedProfile: () => Promise<boolean>;
}

/** Cloud sign-in: email/password and the GitHub device-authorization attempt. */
export function useDesktopProfileCloudSignIn(
  ctx: DesktopProfilesSharedContext,
  cross: DesktopProfileCloudSignInCross,
) {
  const { t, invokeScoped, accessView, loginRemember } = ctx;

  // Sign-in state: cloud email/password, and the GitHub device attempt.
  const loginEmail = ref('');
  const loginPassword = ref('');
  const signInBusy = ref(false);
  const githubPending = ref(false);
  const githubUserCode = ref('');
  const githubAttemptId = ref<string | null>(null);
  let githubPollTimer: ReturnType<typeof setTimeout> | null = null;

  /** The "+" tile: the formal sign-in surface, not an inline account form. */
  function enterLoginState(): void {
    resetSignInState();
    accessView.value = 'login';
  }

  function resetSignInState(): void {
    // Leaving the sign-in state abandons a pending GitHub attempt: it must not
    // adopt a session for a window that no longer shows it.
    void cancelGithubSignIn();
    loginEmail.value = '';
    loginPassword.value = '';
    loginRemember.value = true;
    signInBusy.value = false;
  }

  async function signInWithPassword(): Promise<void> {
    if (signInBusy.value) return;
    const email = loginEmail.value.trim();
    if (!email || !loginPassword.value) {
      toast.error(t('auth.validation.passwordRequired'));
      return;
    }
    signInBusy.value = true;
    try {
      const result = await invokeScoped(
        CloudAuthChannels.SIGN_IN,
        openedProfileSchema,
        { scope: 'auth' },
        { email, password: loginPassword.value, remember: loginRemember.value },
      );
      // The password never outlives the request, on success or failure.
      loginPassword.value = '';
      if (result) await cross.enterOpenedProfile();
    } finally {
      signInBusy.value = false;
    }
  }

  async function forgotPassword(): Promise<void> {
    await invokeScoped(CloudAuthChannels.FORGOT_PASSWORD, z.unknown(), { scope: 'auth' });
  }

  /**
   * GitHub sign-in reuses the device-authorization page, which already offers
   * GitHub. The main process starts an attempt without an origin Profile and
   * commits the same register-and-open path the password form uses.
   */
  async function signInWithGithub(): Promise<void> {
    if (githubPending.value || signInBusy.value) return;
    const started = await invokeScoped(
      CloudAuthChannels.GITHUB_SIGN_IN_BEGIN,
      signInAttemptSchema,
      { scope: 'auth' },
      { remember: loginRemember.value },
    );
    if (!started) return;
    githubAttemptId.value = started.data.attemptId;
    githubUserCode.value = started.data.userCode;
    githubPending.value = true;
    scheduleGithubPoll();
  }

  function scheduleGithubPoll(): void {
    stopGithubPolling();
    githubPollTimer = setTimeout(() => {
      void pollGithubAttempt();
    }, GITHUB_POLL_INTERVAL_MS);
  }

  async function pollGithubAttempt(): Promise<void> {
    const attemptId = githubAttemptId.value;
    if (!attemptId || !githubPending.value) return;
    const status = await invokeScoped(
      CloudAuthChannels.CLOUD_CONNECTION_STATUS,
      signInAttemptSchema,
      { scope: 'auth', silent: true },
      { attemptId },
    );
    if (!githubPending.value || githubAttemptId.value !== attemptId) return;
    if (!status) {
      // A transport hiccup is not a verdict: keep the waiting state and retry.
      scheduleGithubPoll();
      return;
    }
    const attempt = status.data;
    if (attempt.status === 'connected' && attempt.result) {
      githubPending.value = false;
      githubAttemptId.value = null;
      await cross.enterOpenedProfile();
      return;
    }
    if (['denied', 'expired', 'cancelled', 'failed'].includes(attempt.status)) {
      githubPending.value = false;
      githubAttemptId.value = null;
      toast.error(
        attempt.error?.code
          ? translateResultError(attempt.error, t, { scope: 'auth' })
          : t('auth.profileAccess.githubFailed'),
      );
      return;
    }
    scheduleGithubPoll();
  }

  async function cancelGithubSignIn(): Promise<void> {
    const attemptId = githubAttemptId.value;
    stopGithubPolling();
    githubPending.value = false;
    githubUserCode.value = '';
    githubAttemptId.value = null;
    if (attemptId)
      await invokeScoped(
        CloudAuthChannels.CLOUD_CONNECTION_CANCEL,
        z.unknown(),
        { scope: 'auth', silent: true },
        { attemptId },
      );
  }

  function stopGithubPolling(): void {
    if (githubPollTimer) {
      clearTimeout(githubPollTimer);
      githubPollTimer = null;
    }
  }

  return {
    loginEmail,
    loginPassword,
    signInBusy,
    githubPending,
    githubUserCode,
    enterLoginState,
    resetSignInState,
    signInWithPassword,
    forgotPassword,
    signInWithGithub,
    cancelGithubSignIn,
    stopGithubPolling,
  };
}
