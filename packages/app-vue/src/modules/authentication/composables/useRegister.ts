import type { CloudSignUpRequest } from '@memoflow/contracts';
import type { AuthContext } from './useAuthContext';
import { reportAuthCatchFailure, reportAuthResultFailure } from './reportAuthOperationFailure';

// Residual 923: isDesktopEnvironment name dual retired — use hasDesktopAuthApi detect.
// Residual 1049: auth result/catch failure duals retired onto reportAuthOperationFailure sole.

export function useRegister(ctx: AuthContext) {
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

  async function registerByEmail(req: CloudSignUpRequest): Promise<boolean> {
    store.setLoading(true);
    store.setError(null);
    try {
      const result = await service.signUp(req);
      if (result.ok) {
        lastResultError.value = null;
        handleAuthSuccess(result.data);
        return true;
      }
      return reportAuthResultFailure(failureDeps, result.error, 'auth.toast.registerFailed');
    } catch (e) {
      return reportAuthCatchFailure(failureDeps, e, 'signUp', 'auth.toast.registerFailed');
    } finally {
      store.setLoading(false);
    }
  }

  return {
    registerByEmail,
  };
}
