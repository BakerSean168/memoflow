import { ref } from 'vue';
import { toast } from 'vue-sonner';
import { z } from 'zod';
import { DesktopGithubSignInAttemptSchema } from '@memoflow/cloud-auth-contracts';
import { CloudAuthChannels } from '@memoflow/desktop-contracts';
import { translateResultError } from '../utils/translate-result-error';
import type { DesktopProfilesSharedContext } from './useDesktopProfiles';

/** The signed-in Profile the main process opened for the identity window. */
export const openedProfileSchema = z.object({ profileId: z.string().min(1) });
const GITHUB_POLL_INTERVAL_MS = 1_500;

/** Catalog actions the cloud sign-in composable calls into. */
export interface DesktopProfileCloudSignInCross {
  enterOpenedProfile: () => Promise<boolean>;
}

/** Cloud sign-in: email/password and the GitHub browser authorization. */
export function useDesktopProfileCloudSignIn(
  ctx: DesktopProfilesSharedContext,
  cross: DesktopProfileCloudSignInCross,
) {
  const { t, invokeScoped, accessView, loginRemember } = ctx;

  // Sign-in state: cloud email/password, and the GitHub browser attempt.
  const loginEmail = ref('');
  const loginPassword = ref('');
  const signInBusy = ref(false);
  const githubPending = ref(false);
  const githubStarting = ref(false);
  const githubConnecting = ref(false);
  const githubBrowserOpened = ref(false);
  const githubActionBusy = ref(false);
  let githubGeneration = 0;
  let githubExpiresAt = 0;
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
    if (signInBusy.value || githubPending.value || githubStarting.value) return;
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

  async function signInWithGithub(): Promise<void> {
    if (githubPending.value || githubStarting.value || signInBusy.value) return;
    const generation = ++githubGeneration;
    githubStarting.value = true;
    try {
      const started = await invokeScoped(
        CloudAuthChannels.GITHUB_SIGN_IN_BEGIN,
        DesktopGithubSignInAttemptSchema,
        { scope: 'auth' },
        { remember: loginRemember.value },
      );
      if (!started) return;
      if (generation !== githubGeneration) {
        await invokeScoped(
          CloudAuthChannels.GITHUB_SIGN_IN_CANCEL,
          z.unknown(),
          { scope: 'auth', silent: true },
          { attemptId: started.data.attemptId },
        );
        return;
      }
      githubAttemptId.value = started.data.attemptId;
      githubExpiresAt = Date.parse(started.data.expiresAt);
      githubBrowserOpened.value = started.data.browserOpened;
      githubPending.value = true;
      scheduleGithubPoll();
    } finally {
      if (generation === githubGeneration) githubStarting.value = false;
    }
  }

  async function reopenGithubBrowser(): Promise<void> {
    if (!githubAttemptId.value || githubActionBusy.value) return;
    githubActionBusy.value = true;
    try {
      const result = await invokeScoped(
        CloudAuthChannels.GITHUB_SIGN_IN_REOPEN,
        DesktopGithubSignInAttemptSchema,
        { scope: 'auth' },
        { attemptId: githubAttemptId.value },
      );
      if (result) githubBrowserOpened.value = result.data.browserOpened;
    } finally {
      githubActionBusy.value = false;
    }
  }

  async function copyGithubLink(): Promise<void> {
    if (!githubAttemptId.value) return;
    const result = await invokeScoped(
      CloudAuthChannels.GITHUB_SIGN_IN_COPY_LINK,
      z.unknown(),
      { scope: 'auth' },
      { attemptId: githubAttemptId.value },
    );
    if (result) toast.success(t('auth.profileAccess.githubLinkCopied'));
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
      CloudAuthChannels.GITHUB_SIGN_IN_STATUS,
      DesktopGithubSignInAttemptSchema,
      { scope: 'auth', silent: true },
      { attemptId },
    );
    if (!githubPending.value || githubAttemptId.value !== attemptId) return;
    if (!status) {
      if (Date.now() >= githubExpiresAt) {
        githubPending.value = false;
        githubAttemptId.value = null;
        toast.error(t('auth.errors.GITHUB_SIGN_IN_EXPIRED'));
        return;
      }
      // A transport hiccup is not a verdict: keep the waiting state and retry.
      scheduleGithubPoll();
      return;
    }
    const attempt = status.data;
    githubConnecting.value = attempt.status === 'connecting_profile';
    githubBrowserOpened.value = attempt.browserOpened;
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
    if (githubConnecting.value) return;
    const attemptId = githubAttemptId.value;
    ++githubGeneration;
    githubStarting.value = false;
    if (attemptId) {
      const cancelled = await invokeScoped(
        CloudAuthChannels.GITHUB_SIGN_IN_CANCEL,
        z.unknown(),
        { scope: 'auth' },
        { attemptId },
      );
      if (!cancelled) return;
    }
    stopGithubPolling();
    githubPending.value = false;
    githubConnecting.value = false;
    githubAttemptId.value = null;
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
    githubStarting,
    githubConnecting,
    githubBrowserOpened,
    githubActionBusy,
    reopenGithubBrowser,
    copyGithubLink,
    enterLoginState,
    resetSignInState,
    signInWithPassword,
    forgotPassword,
    signInWithGithub,
    cancelGithubSignIn,
    stopGithubPolling,
  };
}
