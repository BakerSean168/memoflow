/**
 * useSession - 会话管理 Composable
 *
 * 通过 DI 注入的 AuthClientService 与后端交互。
 * Service 返回 Result<T>，Composable 负责 Result 解包 + Store 更新 + UI 状态。
 *
 * Residual 1055: createComposableHandleError toast report path (session load/revoke duals retired).
 *
 * @module authentication/composables
 */

import { computed } from 'vue';
import { toast } from 'vue-sonner';
import { useI18n } from 'vue-i18n';
import { useAuthenticationStore } from '../stores/authentication-store';
import { accountUiHost } from '../../account-ui-host';

export function useSession() {
  const store = useAuthenticationStore();
  const service = accountUiHost.useStrictInject(accountUiHost.AUTH_SERVICE_KEY, 'AuthService');
  const { t } = useI18n();

  // ========== Computed State ==========
  const activeSessions = computed(() => store.activeSessions);
  const currentSession = computed(() => store.currentSession);
  const sessionCount = computed(() => store.getActiveSessionCount);

  const handleLoadError = accountUiHost.createComposableHandleError({
    t,
    setError: (message) => store.setError(message),
    report: (message) => toast.error(t('auth.toast.loadFailed'), { description: message }),
  });
  const handleOperationError = accountUiHost.createComposableHandleError({
    t,
    setError: (message) => store.setError(message),
    report: (message) => toast.error(t('auth.toast.operationFailed'), { description: message }),
  });

  // ========== 会话操作 ==========

  async function loadSessions(): Promise<boolean> {
    if (!store.isAuthenticated) return false;

    store.setLoading(true);
    const result = await service.getSession();
    store.setLoading(false);

    if (result.ok) {
      if (result.data.session) store.setActiveSessions([result.data.session] as never);
      return true;
    }
    handleLoadError(result.error, 'auth.toast.loadSessionsFailed');
    return false;
  }

  async function revokeSession(_sessionId: string): Promise<boolean> {
    if (!store.isAuthenticated) return false;

    store.setLoading(true);
    store.setLoading(false);
    toast.info('Better Auth 当前通过当前设备会话管理，暂不提供逐会话撤销。');
    return false;
  }

  return {
    // State
    activeSessions,
    currentSession,
    sessionCount,

    // Actions
    loadSessions,
    revokeSession,
  };
}
