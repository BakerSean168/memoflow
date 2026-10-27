import { defineStore } from 'pinia';
import type {
  CloudAccountSummary,
  CloudAuthResponse,
  CloudSessionState,
  CloudSessionSummary,
} from '@memoflow/contracts/cloud-auth';

export type PasswordMutationOperation = 'change-password' | 'reset-password' | 'forgot-password';

/**
 * Structured error written to the shared authentication store when a password
 * mutation fails. Carries the error code, an actionable localized message, the
 * server request id (when known) and whether retrying is meaningful — so the
 * failure survives a page reload and can be recovered by the user.
 * Never contains submitted passwords or tokens.
 */
export interface PasswordMutationErrorReceipt {
  code: string;
  message: string;
  requestId: string | null;
  retryable: boolean;
  operation: PasswordMutationOperation;
  failedAt: number;
}

export interface AuthenticationState {
  account: CloudAccountSummary | null;
  session: CloudSessionSummary | null;
  isLoading: boolean;
  error: string | null;
  isInitializing: boolean;
  passwordMutationError: PasswordMutationErrorReceipt | null;
}

const PASSWORD_MUTATION_ERROR_STORAGE_KEY = 'memoflow:auth:password-mutation-error';

function readStoredPasswordMutationError(): PasswordMutationErrorReceipt | null {
  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(PASSWORD_MUTATION_ERROR_STORAGE_KEY)
        : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PasswordMutationErrorReceipt;
    if (typeof parsed.code !== 'string' || typeof parsed.message !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredPasswordMutationError(receipt: PasswordMutationErrorReceipt | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (receipt === null) {
      localStorage.removeItem(PASSWORD_MUTATION_ERROR_STORAGE_KEY);
      return;
    }
    localStorage.setItem(PASSWORD_MUTATION_ERROR_STORAGE_KEY, JSON.stringify(receipt));
  } catch {
    // Persistence is best-effort; the in-memory store still carries the receipt.
  }
}

export const useAuthenticationStore = defineStore('authentication', {
  state: (): AuthenticationState => ({
    account: null,
    session: null,
    isLoading: false,
    error: null,
    isInitializing: false,
    passwordMutationError: readStoredPasswordMutationError(),
  }),

  getters: {
    isAuthenticated: (state) => state.account !== null && state.session !== null,
    currentIdentity: (state) => state.account,
    currentSession: (state) => state.session,
    activeSessions: (state) => (state.session ? [state.session] : []),
    getActiveSessionCount: (state) => (state.session ? 1 : 0),
    getIdentityId: (state) => state.account?.id ?? null,
  },

  actions: {
    handleCloudAuthResponse(data: CloudAuthResponse) {
      this.account = data.account;
      this.session = data.session;
      this.error = null;
    },

    hydrateCloudSession(data: CloudSessionState) {
      this.account = data.account;
      this.session = data.session;
      this.error = null;
      this.isInitializing = false;
    },

    setActiveSessions(sessions: CloudSessionSummary[]) {
      this.session = sessions[0] ?? null;
    },

    setLoading(loading: boolean) {
      this.isLoading = loading;
    },

    setError(error: string | null) {
      this.error = error;
    },

    setIsInitializing(value: boolean) {
      this.isInitializing = value;
    },

    /** Persist a structured password mutation error that survives page reloads. */
    setPasswordMutationError(receipt: PasswordMutationErrorReceipt) {
      this.passwordMutationError = receipt;
      writeStoredPasswordMutationError(receipt);
    },

    /** Clear the structured password mutation error after a successful mutation. */
    clearPasswordMutationError() {
      this.passwordMutationError = null;
      writeStoredPasswordMutationError(null);
    },

    reset() {
      this.account = null;
      this.session = null;
      this.isLoading = false;
      this.error = null;
      this.isInitializing = false;
      this.passwordMutationError = null;
      writeStoredPasswordMutationError(null);
    },
  },
});
