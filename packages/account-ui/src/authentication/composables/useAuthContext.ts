import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { CloudAuthClientPort, CloudAuthResponse } from '@memoflow/cloud-auth-contracts';
import type { ResultError } from '@memoflow/contracts/result';
import { useAuthenticationStore } from '../stores/authentication-store';
import { accountUiHost } from '../../account-ui-host';
// Residual 909: desktop detect via hasDesktopAuthApi (DesktopAuthApi sole body; no inline dual).
// Residual 923: isDesktopEnvironment name dual fully retired — callers use hasDesktopAuthApi(window).

export interface AuthContext {
  store: ReturnType<typeof useAuthenticationStore>;
  service: CloudAuthClientPort;
  t: ReturnType<typeof useI18n>['t'];
  lastResultError: ReturnType<typeof ref<ResultError | null>>;
  redirectWithReload: (path: string) => void;
  handleAuthSuccess: (data: CloudAuthResponse) => void;
  getLocalizedAuthError: (errorLike: unknown, fallbackKey: string) => string;
}

export function createAuthContext(): AuthContext {
  const store = useAuthenticationStore();
  const router = useRouter();
  const service = accountUiHost.useStrictInject(accountUiHost.AUTH_SERVICE_KEY, 'AuthService');
  const { t } = useI18n();
  const lastResultError = ref<ResultError | null>(null);

  function redirectWithReload(path: string) {
    if (typeof window !== 'undefined') {
      window.location.replace(path);
      return;
    }
    void router.push(path);
  }

  /**
   * Residual 1201 keep-boundary: app-vue handleAuthSuccess — Pinia store session apply.
   * store.handleAuthResponse + clear error; no localStorage writes here.
   * Soft residual 1201: web useWebAuth handleAuthSuccess is localStorage-only (no force-merge).
   */
  function handleAuthSuccess(data: CloudAuthResponse) {
    store.handleCloudAuthResponse(data);
    store.setError(null);
  }

  function getLocalizedAuthError(errorLike: unknown, fallbackKey: string): string {
    return accountUiHost.translateResultError(errorLike, t, {
      scope: 'auth',
      fallbackKey,
    });
  }

  return {
    store,
    service,
    t,
    lastResultError,
    redirectWithReload,
    handleAuthSuccess,
    getLocalizedAuthError,
  };
}
