/**
 * useDesktopWindowControls
 *
 * Composable for desktop window control operations (minimize, maximize, close).
 * Receives the desktop bridge via Vue inject, falling back to a full ElectronBridge
 * host surface when inject is unavailable (auth-screen titlebar).
 *
 * Moved from apps/desktop (UI redesign V2 S1): the shell's WindowHeader renders
 * the window controls on every desktop route, while the desktop host still uses
 * it for the auth-screen titlebar.
 *
 * Residual 929: ElectronBridge keep-boundary (invoke+on+off).
 * DesktopAuthApi is invoke-only — window controls must not collapse onto it.
 */
import { inject, reactive } from 'vue';
import { isOk, type Result } from '@memoflow/transport-contracts/result';
import { DESKTOP_BRIDGE_KEY, type ElectronBridge } from '../../di/keys';
import { RendererEventChannels, WindowChannels } from '@memoflow/desktop-contracts';

export interface WindowControlsState {
  isMaximized: boolean;
  isMinimizable: boolean;
  isMaximizable: boolean;
  isClosable: boolean;
}

// Residual 929: narrow unknown host surface to full ElectronBridge (invoke+on+off).
function isElectronBridge(value: unknown): value is ElectronBridge {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ElectronBridge>;
  return (
    typeof candidate.invoke === 'function' &&
    typeof candidate.on === 'function' &&
    typeof candidate.off === 'function'
  );
}

function getBridge(): ElectronBridge | undefined {
  const injected = inject(DESKTOP_BRIDGE_KEY, undefined);
  if (isElectronBridge(injected)) {
    return injected;
  }
  // Keep-boundary: app-vue Window types electronAPI as DesktopAuthApi (invoke-only).
  // Desktop preload still exposes full ElectronBridge; narrow only here.
  if (typeof window === 'undefined') {
    return undefined;
  }
  const hostApi = (window as { electronAPI?: unknown }).electronAPI;
  return isElectronBridge(hostApi) ? hostApi : undefined;
}

function readResultData<T>(response: unknown): T | null {
  if (!response || typeof response !== 'object' || !('ok' in response)) {
    return null;
  }
  const result = response as Result<T>;
  return isOk(result) ? (result.data ?? null) : null;
}

export function useDesktopWindowControls() {
  const bridge = getBridge();

  const windowControlsState = reactive<WindowControlsState>({
    isMaximized: false,
    isMinimizable: true,
    isMaximizable: true,
    isClosable: true,
  });

  function applyState(state: Partial<WindowControlsState> | null | undefined) {
    if (!state) return;
    windowControlsState.isMaximized = state.isMaximized ?? windowControlsState.isMaximized;
    windowControlsState.isMinimizable = state.isMinimizable ?? windowControlsState.isMinimizable;
    windowControlsState.isMaximizable = state.isMaximizable ?? windowControlsState.isMaximizable;
    windowControlsState.isClosable = state.isClosable ?? windowControlsState.isClosable;
  }

  async function syncState() {
    const response = await bridge?.invoke(WindowChannels.GET_CONTROLS_STATE);
    applyState(readResultData<Partial<WindowControlsState>>(response));
  }

  async function minimizeWindow() {
    await bridge?.invoke(WindowChannels.MINIMIZE);
  }

  async function toggleMaximize() {
    const response = await bridge?.invoke(WindowChannels.TOGGLE_MAXIMIZE);
    applyState(readResultData<Partial<WindowControlsState>>(response));
  }

  async function closeWindow() {
    await bridge?.invoke(WindowChannels.CLOSE);
  }

  const handleStateChanged = (...args: unknown[]) => {
    applyState(args[0] as Partial<WindowControlsState> | null | undefined);
  };

  function startListening() {
    void syncState();
    bridge?.on(RendererEventChannels.WINDOW_STATE_CHANGED, handleStateChanged);
  }

  function stopListening() {
    bridge?.off(RendererEventChannels.WINDOW_STATE_CHANGED, handleStateChanged);
  }

  return {
    windowControlsState,
    minimizeWindow,
    toggleMaximize,
    closeWindow,
    startListening,
    stopListening,
  };
}
