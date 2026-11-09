/**
 * Shell scene derivation (Phase 0 / 诊断 UI-007 + UI 重构 V2 §1.1)
 *
 * AppShell 的场景派生：STATE A/B/C、侧栏 presentation（docked / overlay）
 * 与 workspace chrome 度量。保持为纯派生 + 无生命周期，由 AppShell 决定
 * 挂载/监听时序。
 */
import { computed, ref, type Ref } from 'vue';
import type { ShellLayout, useAppShellStore } from './useAppShellStore';
import {
  SIDEBAR_HARD_MIN,
  resolveSidebarPresentation,
  resolveWorkspaceChromeMetrics,
} from './panel-geometry';

type AppShellStore = ReturnType<typeof useAppShellStore>;

export interface ShellSceneOptions {
  store: AppShellStore;
  layout: Ref<ShellLayout>;
  rightPanelOpen: Ref<boolean>;
  sidebarCollapsed: Ref<boolean>;
  sidebarWidth: Ref<number>;
}

export function useShellScene(options: ShellSceneOptions) {
  const { store, layout, rightPanelOpen, sidebarCollapsed, sidebarWidth } = options;

  /** STATE A/B/C 派生（§1.1）。 */
  const shellState = computed<'chat' | 'split' | 'focus'>(() => {
    if (!rightPanelOpen.value) return 'chat';
    return layout.value === 'focus' ? 'focus' : 'split';
  });

  const effectiveViewportWidth = ref(typeof window === 'undefined' ? 1280 : window.innerWidth);
  const workspaceChromeStyle = computed(() => {
    const { inset, gap } = resolveWorkspaceChromeMetrics(effectiveViewportWidth.value);
    return {
      '--workspace-edge-inset': `${inset}px`,
      '--workspace-sidebar-gap': `${gap}px`,
    };
  });
  /**
   * Responsive sidebar contract:
   * - >= 960px: docked/persistent, consuming workspace width and honoring the persisted preference;
   * - < 960px: off-canvas overlay, closed by default and controlled by transient shell state.
   * Narrow geometry never mutates the user's docked preference.
   */
  const sidebarPresentation = computed(() =>
    resolveSidebarPresentation(effectiveViewportWidth.value),
  );
  const overlaySidebarOpen = ref(false);
  const showDockedSidebar = computed(
    () => sidebarPresentation.value === 'docked' && !sidebarCollapsed.value,
  );
  const headerSidebarCollapsed = computed(() =>
    sidebarPresentation.value === 'overlay' ? !overlaySidebarOpen.value : sidebarCollapsed.value,
  );
  const overlaySidebarWidth = computed(() =>
    Math.max(
      SIDEBAR_HARD_MIN,
      Math.min(
        sidebarWidth.value,
        360,
        Math.max(SIDEBAR_HARD_MIN, effectiveViewportWidth.value - 48),
      ),
    ),
  );

  function closeOverlaySidebar(): void {
    overlaySidebarOpen.value = false;
  }

  function handleShellSidebarToggle(): void {
    if (sidebarPresentation.value === 'overlay') {
      overlaySidebarOpen.value = !overlaySidebarOpen.value;
      return;
    }
    store.toggleSidebar();
  }

  return {
    shellState,
    effectiveViewportWidth,
    workspaceChromeStyle,
    sidebarPresentation,
    overlaySidebarOpen,
    showDockedSidebar,
    headerSidebarCollapsed,
    overlaySidebarWidth,
    closeOverlaySidebar,
    handleShellSidebarToggle,
  };
}
