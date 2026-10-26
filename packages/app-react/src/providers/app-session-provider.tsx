import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createCloudAuthHttpClient, type CloudAuthClientPort } from '@memoflow/cloud-auth';
import type {
  CloudAccountSummary,
  CloudSessionSummary,
  CloudSignInRequest,
  CloudSignUpRequest,
} from '@memoflow/contracts/cloud-auth';
import {
  createResultHttpClient,
  presentErrorMessage,
  type IResultHttpClient,
} from '@memoflow/http-client';
import { MOBILE_API_BASE_URL } from '../constants/auth';

export type AppSessionKind = 'signed-out' | 'authenticating' | 'authenticated' | 'guest' | 'demo';

export type AppSessionUser = { id: string; displayName: string; workspaceName: string };

export type AppSessionValue = {
  apiBaseUrl: string;
  currentIdentity: CloudAccountSummary | null;
  currentSession: CloudSessionSummary | null;
  currentUser: AppSessionUser | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  isGuest: boolean;
  isRemoteAuthenticated: boolean;
  lastError: string | null;
  sessionKind: AppSessionKind;
  clearError: () => void;
  createAuthorizedHttpClient: () => IResultHttpClient;
  enterGuestMode: () => void;
  forgotPassword: (req: { email: string }) => Promise<boolean>;
  loginByEmail: (req: CloudSignInRequest) => Promise<boolean>;
  registerByEmail: (req: CloudSignUpRequest) => Promise<boolean>;
  signInDemo: () => void;
  signOut: () => Promise<void>;
};

const AppSessionContext = createContext<AppSessionValue | null>(null);
const GUEST_USER = {
  id: 'guest-local',
  displayName: 'Guest session',
  workspaceName: 'Local sandbox',
};
const DEMO_USER = {
  id: 'demo-owner',
  displayName: 'MemoFlow Demo',
  workspaceName: 'MemoFlow preview',
};

function apiOrigin() {
  try {
    return new URL(MOBILE_API_BASE_URL).origin;
  } catch {
    return '';
  }
}

export function AppSessionProvider({ children }: PropsWithChildren) {
  const [sessionKind, setSessionKind] = useState<AppSessionKind>('signed-out');
  const [currentIdentity, setCurrentIdentity] = useState<CloudAccountSummary | null>(null);
  const [currentSession, setCurrentSession] = useState<CloudSessionSummary | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const auth = useRef<CloudAuthClientPort | null>(null);

  function createAuthorizedHttpClient() {
    return createResultHttpClient({ baseURL: MOBILE_API_BASE_URL, timeout: 15000 });
  }

  if (!auth.current) auth.current = createCloudAuthHttpClient(undefined, { baseUrl: apiOrigin() });

  useEffect(() => {
    let cancelled = false;
    void auth.current!.getSession().then((result) => {
      if (cancelled) return;
      if (result.ok && result.data.account && result.data.session) {
        setCurrentIdentity(result.data.account);
        setCurrentSession(result.data.session);
        setSessionKind('authenticated');
      }
      setIsBootstrapping(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loginByEmail(req: CloudSignInRequest) {
    setSessionKind('authenticating');
    const result = await auth.current!.signIn(req);
    if (!result.ok || !result.data.session) {
      setSessionKind('signed-out');
      setLastError(
        result.ok ? 'Verify your email before signing in.' : presentErrorMessage(result.error),
      );
      return false;
    }
    setCurrentIdentity(result.data.account);
    setCurrentSession(result.data.session);
    setSessionKind('authenticated');
    setLastError(null);
    return true;
  }

  async function registerByEmail(req: CloudSignUpRequest) {
    setSessionKind('authenticating');
    const result = await auth.current!.signUp(req);
    if (!result.ok) {
      setSessionKind('signed-out');
      setLastError(presentErrorMessage(result.error));
      return false;
    }
    setCurrentIdentity(result.data.account);
    setCurrentSession(result.data.session);
    setSessionKind(result.data.session ? 'authenticated' : 'signed-out');
    setLastError(
      result.data.requiresEmailVerification ? 'Check your email to verify the account.' : null,
    );
    return true;
  }

  async function forgotPassword(req: { email: string }) {
    const result = await auth.current!.forgotPassword(req.email);
    if (!result.ok) setLastError(presentErrorMessage(result.error));
    return result.ok;
  }

  function clearRemoteState() {
    setCurrentIdentity(null);
    setCurrentSession(null);
  }

  function enterGuestMode() {
    clearRemoteState();
    setSessionKind('guest');
    setLastError(null);
  }
  function signInDemo() {
    clearRemoteState();
    setSessionKind('demo');
    setLastError(null);
  }
  async function signOut() {
    if (sessionKind === 'authenticated') await auth.current!.signOut();
    clearRemoteState();
    setSessionKind('signed-out');
  }

  const currentUser =
    sessionKind === 'authenticated' && currentIdentity
      ? {
          id: currentIdentity.id,
          displayName: currentIdentity.name || currentIdentity.email,
          workspaceName: 'Remote workspace',
        }
      : sessionKind === 'guest'
        ? GUEST_USER
        : sessionKind === 'demo'
          ? DEMO_USER
          : null;

  return (
    <AppSessionContext.Provider
      value={{
        apiBaseUrl: MOBILE_API_BASE_URL,
        currentIdentity,
        currentSession,
        currentUser,
        isAuthenticated: sessionKind !== 'signed-out' && sessionKind !== 'authenticating',
        isBootstrapping,
        isGuest: sessionKind === 'guest',
        isRemoteAuthenticated: sessionKind === 'authenticated',
        lastError,
        sessionKind,
        clearError: () => setLastError(null),
        createAuthorizedHttpClient,
        enterGuestMode,
        forgotPassword,
        loginByEmail,
        registerByEmail,
        signInDemo,
        signOut,
      }}
    >
      {children}
    </AppSessionContext.Provider>
  );
}

export function useAppSession() {
  const context = useContext(AppSessionContext);
  if (!context) throw new Error('useAppSession must be used inside AppSessionProvider.');
  return context;
}
