import type { CloudSignInRequest, CloudSignUpRequest } from '@memoflow/contracts';
import type { ResultError } from '@memoflow/contracts/result';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { startGithubPopupSignIn } from './github-popup-sign-in';
import { translateAuthResultError } from './result-error';
import { useAuthService } from './service';

export type AuthSuccessOutcome = 'authenticated' | 'needs-email-verification';

export function useWebAuth() {
  const service = useAuthService();
  const { t } = useI18n();
  const isLoading = ref(false);
  const error = ref<ResultError | null>(null);
  const successMessage = ref<string | null>(null);
  const pendingVerificationEmail = ref<string | null>(null);
  const errorMessage = computed(() =>
    error.value
      ? translateAuthResultError(error.value, t, {
          scope: 'auth',
          fallbackKey: 'auth.errors.UNKNOWN',
        })
      : null,
  );

  async function run<T>(
    operation: () => Promise<{ ok: true; data: T } | { ok: false; error: ResultError }>,
  ) {
    isLoading.value = true;
    error.value = null;
    try {
      const result = await operation();
      if (!result.ok) {
        error.value = result.error;
        return null;
      }
      return result.data;
    } finally {
      isLoading.value = false;
    }
  }

  async function loginByEmail(
    input: CloudSignInRequest,
    successUrl = '/',
  ): Promise<AuthSuccessOutcome | false> {
    isLoading.value = true;
    error.value = null;
    pendingVerificationEmail.value = null;
    try {
      const result = await service.signIn(input);
      if (!result.ok) {
        if (result.error.code === 'EMAIL_VERIFICATION_REQUIRED') {
          pendingVerificationEmail.value = input.email;
          return 'needs-email-verification';
        }
        error.value = result.error;
        return false;
      }
      if (!result.data.session) {
        pendingVerificationEmail.value = input.email;
        return 'needs-email-verification';
      }
      window.location.replace(successUrl);
      return 'authenticated';
    } finally {
      isLoading.value = false;
    }
  }

  async function registerByEmail(
    input: CloudSignUpRequest,
    successUrl = '/',
  ): Promise<AuthSuccessOutcome | false> {
    const data = await run(() => service.signUp(input));
    if (!data) return false;
    if (!data.session) {
      pendingVerificationEmail.value = input.email;
      successMessage.value = '验证邮件已发送，请通过邮件中的链接完成验证。';
      return 'needs-email-verification';
    }
    window.location.replace(successUrl);
    return 'authenticated';
  }

  async function forgotPassword(input: { email: string }): Promise<boolean> {
    const data = await run(() => service.forgotPassword(input.email));
    if (data === null) return false;
    successMessage.value = t('auth.forgot.sent');
    return true;
  }

  async function resetPassword(input: { token: string; newPassword: string }): Promise<boolean> {
    const data = await run(() => service.resetPassword(input));
    if (data === null) return false;
    successMessage.value = t('auth.reset.success');
    return true;
  }

  async function startGithubLogin(successUrl = '/'): Promise<boolean> {
    isLoading.value = true;
    error.value = null;
    try {
      const result = await startGithubPopupSignIn(service);
      if (result.kind === 'failed') {
        error.value = result.error;
        return false;
      }
      if (result.kind === 'cancelled') return false;

      window.location.replace(successUrl);
      return true;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    loginByEmail,
    registerByEmail,
    forgotPassword,
    resetPassword,
    startGithubLogin,
    isLoading,
    errorMessage,
    successMessage,
    pendingVerificationEmail,
    clearError: () => {
      error.value = null;
    },
    clearSuccessMessage: () => {
      successMessage.value = null;
    },
  };
}
