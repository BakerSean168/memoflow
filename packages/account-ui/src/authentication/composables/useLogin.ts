import type { CloudSignInRequest } from '@memoflow/cloud-auth-contracts';
import type { AuthContext } from './useAuthContext';
import { reportAuthCatchFailure, reportAuthResultFailure } from './reportAuthOperationFailure';

// Residual 923: isDesktopEnvironment name dual retired — use hasDesktopAuthApi detect.
// Residual 1049: auth result/catch failure duals retired onto reportAuthOperationFailure sole.

export function useLogin(ctx: AuthContext) {
  const {
    store,
    service,
    t,
    lastResultError,
    redirectWithReload,
    handleAuthSuccess,
    getLocalizedAuthError,
  } = ctx;
  const failureDeps = { store, t, lastResultError, getLocalizedAuthError };

  async function loginByEmail(req: CloudSignInRequest): Promise<boolean> {
    store.setLoading(true);
    store.setError(null);
    try {
      const result = await service.signIn(req);
      if (result.ok) {
        lastResultError.value = null;
        handleAuthSuccess(result.data);
        return true;
      }
      return reportAuthResultFailure(failureDeps, result.error, 'auth.toast.loginFailed');
    } catch (e) {
      return reportAuthCatchFailure(failureDeps, e, 'signIn', 'auth.toast.loginFailed');
    } finally {
      store.setLoading(false);
    }
  }

  return {
    loginByEmail,
  };
}
