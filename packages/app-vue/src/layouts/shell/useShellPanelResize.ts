/**
 * Shell panel resize（面板 / 侧栏拖拽调宽）
 *
 * 从 AppShell 抽出的宽度几何、指针拖拽、焦点守卫与 resize disposer。
 * 组合式只持有状态与事件处理，不注册生命周期；AppShell 保持原有的
 * onMounted / onBeforeUnmount / watch 注册顺序。
 */
import { computed, ref, type Ref } from 'vue';
import type { ShellLayout, useAppShellStore } from './useAppShellStore';
import { AUTO_FOCUS_VIEWPORT, type useShellRouterSync } from './useShellRouterSync';
import {
  AI_HARD_MIN,
  BUSINESS_HARD_MIN,
  SIDEBAR_HARD_MIN,
  computePanelGeometry,
  panelWidthFromPointer,
  shouldCollapsePanelWidth,
  shouldCollapseSidebarWidth,
  sidebarWidthFromPointer,
  workspaceChromeBudget,
} from './panel-geometry';

type AppShellStore = ReturnType<typeof useAppShellStore>;
type ShellRouterSync = ReturnType<typeof useShellRouterSync>;

export interface ShellPanelResizeOptions {
  store: AppShellStore;
  sync: ShellRouterSync;
  layout: Ref<ShellLayout>;
  rightPanelOpen: Ref<boolean>;
  panelWidth: Ref<number | null>;
  sidebarWidth: Ref<number>;
  effectiveViewportWidth: Ref<number>;
  showDockedSidebar: Ref<boolean>;
  shellState: Ref<'chat' | 'split' | 'focus'>;
}

export function useShellPanelResize(options: ShellPanelResizeOptions) {
  const {
    store,
    sync,
    layout,
    rightPanelOpen,
    panelWidth,
    sidebarWidth,
    effectiveViewportWidth,
    showDockedSidebar,
    shellState,
  } = options;

  const isSidebarResizing = ref(false);
  const isPanelResizing = ref(false);

  /** 右侧面板显隐由独立持久化偏好控制。 */
  const showPanel = computed(() => rightPanelOpen.value);
  /** 当前几何下的有效侧栏宽度；用户偏好本身不被动态边界改写。 */
  const effectiveSidebarWidth = computed(() => {
    const reserved = showPanel.value
      ? BUSINESS_HARD_MIN + (layout.value === 'split' ? AI_HARD_MIN : 0)
      : AI_HARD_MIN;
    const chrome = workspaceChromeBudget(effectiveViewportWidth.value);
    const dynamicMax = Math.max(SIDEBAR_HARD_MIN, effectiveViewportWidth.value - reserved - chrome);
    return Math.min(sidebarWidth.value, dynamicMax);
  });

  function maxSidebarWidth(): number {
    if (typeof window === 'undefined') return Number.POSITIVE_INFINITY;
    const reserved = showPanel.value
      ? BUSINESS_HARD_MIN + (shellState.value === 'split' ? AI_HARD_MIN : 0)
      : AI_HARD_MIN;
    const chrome = workspaceChromeBudget(window.innerWidth);
    return Math.max(SIDEBAR_HARD_MIN, window.innerWidth - reserved - chrome);
  }

  const resizeDisposers = new Set<() => void>();

  function disposeResizeHandlers(): void {
    resizeDisposers.forEach((dispose) => dispose());
    resizeDisposers.clear();
  }

  function startSidebarResize(e: MouseEvent) {
    e.preventDefault();
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    // 记录拖拽前聚焦元素，拖拽结束后恢复（面板调整不打断用户输入焦点，
    // 如任务搜索框——e2e 断言拖拽布局后搜索框保持聚焦）。
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    isSidebarResizing.value = true;
    const cleanup = () => {
      resizeDisposers.delete(cleanup);
      isSidebarResizing.value = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('keydown', cancel);
      window.removeEventListener('blur', cleanup);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
    const move = (ev: MouseEvent) => {
      const width = sidebarWidthFromPointer(ev.clientX, window.innerWidth);
      if (shouldCollapseSidebarWidth(width)) {
        cleanup();
        store.setSidebarCollapsed(true);
        return;
      }
      store.setSidebarWidth(width, maxSidebarWidth());
    };
    const up = () => {
      cleanup();
    };
    const cancel = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') cleanup();
    };
    resizeDisposers.add(cleanup);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('keydown', cancel);
    window.addEventListener('blur', cleanup);
  }

  function resizeSidebarBy(delta: number): void {
    const next = effectiveSidebarWidth.value + delta;
    if (shouldCollapseSidebarWidth(next)) {
      store.setSidebarCollapsed(true);
      return;
    }
    store.setSidebarWidth(next, maxSidebarWidth());
  }

  function occupiedSidebarWidth(): number {
    return showDockedSidebar.value ? effectiveSidebarWidth.value : 0;
  }

  /** 分栏态只计算 docked sidebar；overlay 永远不占 workspace geometry。 */
  function prospectiveSidebarOccupied(): number {
    return showDockedSidebar.value ? effectiveSidebarWidth.value : 0;
  }

  function effectivePanelWidth(): number {
    if (typeof window === 'undefined') return panelWidth.value ?? 520;
    return store.resolvePanelWidth(window.innerWidth, occupiedSidebarWidth());
  }

  /**
   * 视口/侧栏变化：
   * - 不回写用户偏好宽度（由 effectivePanelWidth 即时 clamp）
   * - viewport 触发的 focus 可在空间恢复后回到 split；user focus 保持
   */
  function onViewportGeometryChange(): void {
    if (typeof window === 'undefined') return;
    effectiveViewportWidth.value = window.innerWidth;
    if (store.isChatOnly) return;

    const geo = computePanelGeometry({
      viewportWidth: window.innerWidth,
      sidebarOccupiedWidth: prospectiveSidebarOccupied(),
    });
    // 窄视口或几何上无法同时保证 AI 与业务硬下限时强制 viewport focus（§6.2）。
    const shouldFocus = window.innerWidth < AUTO_FOCUS_VIEWPORT || !geo.canSplit;

    if (shouldFocus) {
      if (store.layout !== 'focus') {
        store.setLayout('focus', 'viewport');
      }
      return;
    }

    if (store.layout === 'focus' && store.layoutReason === 'viewport') {
      store.restoreLayoutPreference();
    }
  }

  function startPanelResize(e: PointerEvent) {
    const focusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    e.preventDefault();
    const captureTarget =
      e.target instanceof Element
        ? ((e.target.closest('[data-testid="business-panel-resizer"]') as HTMLElement | null) ??
          (e.target as HTMLElement))
        : null;
    try {
      captureTarget?.setPointerCapture?.(e.pointerId);
    } catch {
      // pointer capture 在部分测试/非指针设备上可能失败，忽略即可
    }

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    isPanelResizing.value = true;

    const restoreFocusedElement = () => {
      if (!focusedElement) return;
      if (focusedElement.isConnected) {
        if (document.activeElement !== focusedElement) {
          focusedElement.focus({ preventScroll: true });
        }
        return;
      }

      // 拖拽触发布局重渲染导致原元素被替换（如任务搜索框）时，
      // 按 data-testid 定位新元素恢复焦点，保持用户输入上下文。
      const testId = focusedElement.getAttribute('data-testid');
      if (!testId) return;
      const replacement = document.querySelector<HTMLElement>(
        `[data-testid="${CSS.escape(testId)}"]`,
      );
      if (replacement && document.activeElement !== replacement) {
        replacement.focus({ preventScroll: true });
      }
    };

    // The trailing native pointer focus default (the drag handle is focusable) or
    // a menu closing with the same gesture can steal focus long after the restore
    // frame ran — on loaded machines this lands well beyond the next animation
    // frame. Until the user performs the next real interaction or the deadline
    // passes, redirect focus taken by the drag handle or cleared to body back to
    // the user's element. Tab and mouse presses end the guard before their focus
    // side effects, so keyboard and pointer users keep full control.
    const guardLateFocusTheft = () => {
      if (!focusedElement) return;
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resizeDisposers.delete(settle);
        document.removeEventListener('focusin', onFocusIn, true);
        document.removeEventListener('pointerdown', settle, true);
        document.removeEventListener('keydown', settle, true);
        window.clearTimeout(guardDeadline);
      };
      const onFocusIn = (event: FocusEvent) => {
        if (settled) return;
        if (event.target === captureTarget || event.target === document.body) {
          restoreFocusedElement();
        }
      };
      document.addEventListener('focusin', onFocusIn, true);
      document.addEventListener('pointerdown', settle, true);
      document.addEventListener('keydown', settle, true);
      const guardDeadline = window.setTimeout(settle, 2000);
      resizeDisposers.add(settle);
    };

    const dispose = () => cleanup(e.pointerId, false);
    const cleanup = (pointerId?: number, restoreFocusAfterGesture = true) => {
      resizeDisposers.delete(dispose);
      if (typeof pointerId === 'number') {
        try {
          captureTarget?.releasePointerCapture?.(pointerId);
        } catch {
          // ignore
        }
      }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('keydown', cancel);
      window.removeEventListener('blur', blur);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      isPanelResizing.value = false;
      if (restoreFocusAfterGesture) {
        // Chromium may apply the native pointer/mouse focus default after pointerup listeners.
        // Restore on the next frame so the user's active input wins after the full gesture settles.
        const frame = window.requestAnimationFrame(() => {
          resizeDisposers.delete(cancelFrame);
          restoreFocusedElement();
          guardLateFocusTheft();
        });
        const cancelFrame = () => window.cancelAnimationFrame(frame);
        resizeDisposers.add(cancelFrame);
      }
    };

    const move = (ev: PointerEvent) => {
      const width = panelWidthFromPointer(ev.clientX, window.innerWidth);
      if (shouldCollapsePanelWidth(width)) {
        cleanup(ev.pointerId, false);
        void sync.closePanel();
        return;
      }
      store.setPanelWidth(width);
    };
    const up = (ev: PointerEvent) => {
      cleanup(ev.pointerId);
    };
    const pointerCancel = (ev: PointerEvent) => {
      cleanup(ev.pointerId);
    };
    const cancel = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') cleanup();
    };
    const blur = () => cleanup();
    resizeDisposers.add(dispose);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('keydown', cancel);
    window.addEventListener('blur', blur);
  }

  function resetPanelWidth(): void {
    store.resetPanelWidthPreference();
  }

  function resizePanelBy(delta: number): void {
    const next = effectivePanelWidth() + delta;
    if (shouldCollapsePanelWidth(next)) {
      void sync.closePanel();
      return;
    }
    store.setPanelWidth(next);
  }

  return {
    isSidebarResizing,
    isPanelResizing,
    showPanel,
    effectiveSidebarWidth,
    startSidebarResize,
    resizeSidebarBy,
    effectivePanelWidth,
    onViewportGeometryChange,
    startPanelResize,
    resetPanelWidth,
    resizePanelBy,
    disposeResizeHandlers,
  };
}
