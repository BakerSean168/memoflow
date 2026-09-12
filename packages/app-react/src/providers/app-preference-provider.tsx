import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type {
  PreferenceNamespacePatch,
  PreferenceNamespaceResponse,
  PresentationPreferences,
  RegionalPreferences,
  UserPreferenceProfile,
} from '@memoflow/contracts/setting';
import { presentErrorMessage } from '@memoflow/http-client';

import { useAppSession } from './app-session-provider';
import { useAppClientRegistry } from './app-client-registry-provider';
import {
  resetProductTimePreferences,
  setProductTimePreferences,
} from '../utils/product-time';

type PresentationResponse = Extract<PreferenceNamespaceResponse, { namespace: 'presentation' }>;
type RegionalResponse = Extract<PreferenceNamespaceResponse, { namespace: 'regional' }>;

type AppPreferenceValue = {
  profile: UserPreferenceProfile | null;
  presentationRevision: number | null;
  regionalRevision: number | null;
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  patchPresentation: (patch: PreferenceNamespacePatch<'presentation'>) => Promise<boolean>;
  patchRegional: (patch: PreferenceNamespacePatch<'regional'>) => Promise<boolean>;
  resetNamespace: (namespace: 'presentation' | 'regional') => Promise<boolean>;
  resetAll: () => Promise<boolean>;
};

const AppPreferenceContext = createContext<AppPreferenceValue | null>(null);

export function AppPreferenceProvider({ children }: PropsWithChildren) {
  const { settingService } = useAppClientRegistry();
  const { isRemoteAuthenticated } = useAppSession();
  const [presentation, setPresentation] = useState<PresentationResponse | null>(null);
  const [regional, setRegional] = useState<RegionalResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = useMemo<UserPreferenceProfile | null>(() => {
    if (!presentation || !regional) return null;
    return { presentation: presentation.preferences, regional: regional.preferences };
  }, [presentation, regional]);

  const refresh = useCallback(async () => {
    if (!isRemoteAuthenticated) {
      setPresentation(null);
      setRegional(null);
      setError(null);
      resetProductTimePreferences();
      return;
    }

    setIsLoading(true);
    const [presentationResult, regionalResult] = await Promise.all([
      settingService.getPreferenceNamespace('presentation'),
      settingService.getPreferenceNamespace('regional'),
    ]);
    setIsLoading(false);

    if (!presentationResult.ok) {
      setError(presentErrorMessage(presentationResult.error));
      return;
    }
    if (!regionalResult.ok) {
      setError(presentErrorMessage(regionalResult.error));
      return;
    }
    if (presentationResult.data.namespace !== 'presentation' || regionalResult.data.namespace !== 'regional') {
      setError('Preference namespace response mismatch.');
      return;
    }

    setPresentation(presentationResult.data);
    setRegional(regionalResult.data);
    setError(null);
  }, [isRemoteAuthenticated, settingService]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (profile) setProductTimePreferences(profile);
  }, [profile]);

  const patchPresentation = useCallback(async (patch: PreferenceNamespacePatch<'presentation'>) => {
    if (!presentation) return false;
    setIsMutating(true);
    const result = await settingService.patchPreferenceNamespace('presentation', patch, presentation.revision);
    setIsMutating(false);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      await refresh();
      return false;
    }
    setPresentation({
      namespace: 'presentation',
      preferences: { ...presentation.preferences, ...patch } as PresentationPreferences,
      revision: result.data.revision,
    });
    setError(null);
    return true;
  }, [presentation, refresh, settingService]);

  const patchRegional = useCallback(async (patch: PreferenceNamespacePatch<'regional'>) => {
    if (!regional) return false;
    setIsMutating(true);
    const result = await settingService.patchPreferenceNamespace('regional', patch, regional.revision);
    setIsMutating(false);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      await refresh();
      return false;
    }
    setRegional({
      namespace: 'regional',
      preferences: { ...regional.preferences, ...patch } as RegionalPreferences,
      revision: result.data.revision,
    });
    setError(null);
    return true;
  }, [refresh, regional, settingService]);

  const resetNamespace = useCallback(async (namespace: 'presentation' | 'regional') => {
    const current = namespace === 'presentation' ? presentation : regional;
    if (!current) return false;
    setIsMutating(true);
    const result = await settingService.resetPreferenceNamespace(namespace, current.revision);
    setIsMutating(false);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      await refresh();
      return false;
    }
    await refresh();
    return true;
  }, [presentation, refresh, regional, settingService]);

  const resetAll = useCallback(async () => {
    if (!presentation || !regional) return false;
    setIsMutating(true);
    const result = await settingService.resetUserPreferences({
      presentation: presentation.revision,
      regional: regional.revision,
    });
    setIsMutating(false);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      await refresh();
      return false;
    }
    await refresh();
    return true;
  }, [presentation, refresh, regional, settingService]);

  return (
    <AppPreferenceContext.Provider value={{
      profile,
      presentationRevision: presentation?.revision ?? null,
      regionalRevision: regional?.revision ?? null,
      isLoading,
      isMutating,
      error,
      refresh,
      patchPresentation,
      patchRegional,
      resetNamespace,
      resetAll,
    }}>
      {children}
    </AppPreferenceContext.Provider>
  );
}

export function useAppPreferences() {
  const value = useContext(AppPreferenceContext);
  if (!value) throw new Error('useAppPreferences must be used inside AppPreferenceProvider.');
  return value;
}
