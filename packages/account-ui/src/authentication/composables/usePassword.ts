/**
 * usePassword - 密码管理 Composable
 *
 * 通过 DI 注入的 AuthClientService 与后端交互。
 * Service 返回 Result<T>，Composable 负责 Result 解包 + UI 状态。
 *
 * @module authentication/composables
 *
 * Soft residual 1055 / Residual 1075 keep-boundary: password flows keep a
 * dedicated structured receipt path — they write the structured password
 * mutation error (W6-C) into the shared authentication store via
 * `setPasswordMutationError`, and keep toasting. They do NOT use the generic
 * `store.setError` nor `createComposableHandleError` sole.
 */

import { ref } from 'vue';
import { toast } from 'vue-sonner';
import { useI18n } from 'vue-i18n';
import type { CloudAuthClientPort } from '@memoflow/contracts/cloud-auth';
import { useAuthenticationStore } from '../stores/authentication-store';
import { buildPasswordMutationErrorReceipt } from './reportAuthOperationFailure';
import { accountUiHost } from '../../account-ui-host';

export function usePassword() {
  const store = useAuthenticationStore();
  const service = accountUiHost.useStrictInject(accountUiHost.AUTH_SERVICE_KEY, 'AuthService');
  const { t } = useI18n();

  const isLoading = ref(false);

  function getPasswordErrorMessage(error: unknown, fallbackKey: string) {
    return accountUiHost.translateResultError(error, t, {
      scope: 'auth',
      fallbackKey,
    });
  }

  // ========== 修改密码 ==========

  async function changePassword(
    req: Parameters<CloudAuthClientPort['changePassword']>[0],
  ): Promise<boolean> {
    if (!store.isAuthenticated) {
      toast.error(t('auth.toast.pleaseLogin'));
      return false;
    }

    isLoading.value = true;
    const result = await service.changePassword(req);
    isLoading.value = false;

    if (result.ok) {
      store.clearPasswordMutationError();
      toast.success(t('auth.toast.passwordChanged'), {
        description: t('auth.toast.reloginWithNew'),
      });
      return true;
    }
    const message = getPasswordErrorMessage(result.error, 'auth.toast.changePasswordFailed');
    store.setPasswordMutationError(
      buildPasswordMutationErrorReceipt(result.error, result.meta, 'change-password', t),
    );
    toast.error(t('auth.toast.operationFailed'), {
      description: message,
    });
    return false;
  }

  // ========== 忘记密码 ==========

  async function forgotPassword(req: { email: string }): Promise<boolean> {
    isLoading.value = true;
    const result = await service.forgotPassword(req.email);
    isLoading.value = false;

    if (result.ok) {
      store.clearPasswordMutationError();
      toast.success(t('auth.toast.resetEmailSent'), {
        description: t('auth.toast.checkResetEmail'),
      });
      return true;
    }
    const message = getPasswordErrorMessage(result.error, 'auth.toast.sendResetEmailFailed');
    store.setPasswordMutationError(
      buildPasswordMutationErrorReceipt(result.error, result.meta, 'forgot-password', t),
    );
    toast.error(t('auth.toast.operationFailed'), {
      description: message,
    });
    return false;
  }

  // ========== 重置密码 ==========

  async function resetPassword(
    req: Parameters<CloudAuthClientPort['resetPassword']>[0],
  ): Promise<boolean> {
    isLoading.value = true;
    const result = await service.resetPassword(req);
    isLoading.value = false;

    if (result.ok) {
      store.clearPasswordMutationError();
      toast.success(t('auth.toast.passwordReset'), { description: t('auth.toast.loginWithNew') });
      return true;
    }
    const message = getPasswordErrorMessage(result.error, 'auth.toast.resetPasswordFailed');
    store.setPasswordMutationError(
      buildPasswordMutationErrorReceipt(result.error, result.meta, 'reset-password', t),
    );
    toast.error(t('auth.toast.operationFailed'), {
      description: message,
    });
    return false;
  }

  return {
    // State
    isLoading,

    // Actions
    changePassword,
    forgotPassword,
    resetPassword,
  };
}
