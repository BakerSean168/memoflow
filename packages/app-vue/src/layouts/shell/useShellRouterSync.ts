/**
 * Shell Router ↔ Tab Sync (UI 重构 V2 §4 + 2026-07-14 壳层诊断修订)
 *
 * URL 是活动 Tab 路由的持久化形式：
 * - URL → 面板：路由变化按 §2.3 打开规则落 Tab（精确路由已开 → 激活；
 *   活动 Tab 同模块 → 视为 Tab 内导航回写路由；否则新开 Tab 不抢占）。
 * - 面板 → URL：切 Tab = router.replace 到该 Tab 路由（不污染 history）；
 *   关最后一个 Tab = router.push('/')，右侧面板回 Home；面板 Toggle 不改 URL/Tab。
 * - `/` = 右侧面板 Home surface；既有后台 Tab 可继续保活。
 * - `/settings` / `/account` = STATE D 独立设置场景：不创建 BusinessTab，
 *   不修改 layout；后台 tabs 保留，返回时恢复。
 * - 会话恢复：挂载时若 URL 为 `/` 且 store 里有持久化 Tab，则 replace 回
 *   活动 Tab 的路由（V2 §11 拍板：localStorage 恢复 Tab 列表）。
 *
 * 导航先行原则：关闭活动 Tab / 关面板先执行路由跳转，跳转成功才改 store,
 * 这样业务视图的路由离开守卫（编辑器未保存守卫等）可以照常拦截。
 */
import { onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter, type Router } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import type { RouteLocationNormalizedGeneric } from 'vue-router';
import { useAppShellStore, type ShellLayoutReason, type ShellModule } from './useAppShellStore';
import { canLeaveBusinessSurface } from './surface-leave-protocol';
import { isStandaloneSettingsPath } from './shell-scene';
import {
  AI_HARD_MIN,
  BUSINESS_HARD_MIN,
  SIDEBAR_HARD_MIN,
  computePanelGeometry,
} from './panel-geometry';

export { isStandaloneSettingsPath } from './shell-scene';

/** 分栏放不下的窗口宽度阈值：新开面板自动升专注态（V2 §1.1 / §7）。 */
export const AUTO_FOCUS_VIEWPORT = 1024;

export async function returnFromSettingsScene(
  router: Router,
  store: ReturnType<typeof useAppShellStore>,
  currentFullPath: string,
): Promise<void> {
  const origin = store.settingsOrigin;
  store.clearSettingsOrigin();
  store.setSettingsNavigationOpen(false);

  if (!origin) {
    if (store.activeTab) {
      await router.push(store.activeTab.route).catch(() => {});
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    await router.push('/').catch(() => {});
    return;
  }

  store.setLayout(origin.layout, origin.layoutReason === 'user' ? 'user' : 'default');

  if (origin.tabId && store.tabs.some((tab) => tab.id === origin.tabId)) {
    store.activateTab(origin.tabId);
  } else if (origin.panelSurface === 'home' && !store.activeTab) {
    store.showHome();
  }

  if (origin.panelSurface === 'home') {
    store.showHome();
  } else if (origin.panelSurface === 'workflow' && !store.workflowAvailable && !store.activeTab) {
    store.showHome();
  }

  const target = store.panelSurface === 'home' ? '/' : (store.activeTab?.route ?? '/');
  if (currentFullPath !== target) {
    await router.replace(target).catch(() => {});
  }

  if (origin.panelSurface === 'workflow' && store.workflowAvailable) {
    store.requestWorkflowSurface('explicit');
  }
}

/** 路由前缀 → 业务模块归属（V2 §3 模块矩阵；Settings 已移出）。 */
const MODULE_PREFIXES: Array<[prefix: string, module: ShellModule]> = [
  ['/goals', 'goal'],
  ['/tasks', 'task'],
  ['/repository', 'note'],
  ['/governance', 'note'],
  ['/notifications', 'notification'],
  ['/sse-monitor', 'notification'],
  ['/schedule', 'schedule'],
];

/** Tab 标题的 i18n key（S1 用模块名；S2 起换具体对象名）。 */
export const MODULE_TITLE_KEYS: Record<ShellModule, string> = {
  goal: 'nav.capsule.goal',
  task: 'nav.capsule.task',
  note: 'nav.capsule.note',
  notification: 'nav.capsule.notification',
  schedule: 'nav.schedule',
};

/** Settings / Account 独立场景：不落 BusinessTab。 */
// isStandaloneSettingsPath 定义移至 ./shell-scene（供场景守卫复用，避免循环依赖）。

/** 判定一条路由路径归属哪个业务模块；壳外/未知路径返回 null。 */
export function moduleForPath(path: string): ShellModule | null {
  if (isStandaloneSettingsPath(path)) return null;
  for (const [prefix, module] of MODULE_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return module;
  }
  return null;
}

/**
 * 新开业务面板时的布局建议（诊断修订 §4）：
 * - 窄窗口 → focus + viewport（可自动恢复）；
 * - 宽窗口 → 仅当当前不是用户主动 focus 时回到 split。
 */
export function resolveEntryLayout(
  viewportWidth: number,
  currentLayout: 'split' | 'focus',
  currentReason: ShellLayoutReason,
  /** 几何上是否还能同时保证 AI 与业务硬下限；默认 true。 */
  canSplit = true,
): { layout: 'split' | 'focus'; reason: ShellLayoutReason } | null {
  if (viewportWidth < AUTO_FOCUS_VIEWPORT || !canSplit) {
    if (currentLayout === 'focus' && currentReason === 'viewport') return null;
    return { layout: 'focus', reason: 'viewport' };
  }
  if (currentReason === 'user' && currentLayout === 'focus') {
    return null;
  }
  if (currentLayout === 'split' && currentReason === 'default') {
    return null;
  }
  return { layout: 'split', reason: 'default' };
}

export function useShellRouterSync() {
  const router = useRouter();
  const route = useRoute();
  const store = useAppShellStore();
  const { t } = useI18n();

  function titleFor(module: ShellModule): string {
    return t(MODULE_TITLE_KEYS[module]);
  }

  function maybeAutoFocus(): void {
    if (typeof window === 'undefined') return;
    const splitSidebarMax = Math.max(
      SIDEBAR_HARD_MIN,
      window.innerWidth - AI_HARD_MIN - BUSINESS_HARD_MIN,
    );
    const geo = computePanelGeometry({
      viewportWidth: window.innerWidth,
      // 使用分栏态侧栏占用，避免 focus 隐藏侧栏后 canSplit 抖动。
      sidebarOccupiedWidth: store.sidebarCollapsed
        ? 0
        : Math.min(store.sidebarWidth, splitSidebarMax),
    });
    const next = resolveEntryLayout(
      window.innerWidth,
      store.layout,
      store.layoutReason,
      geo.canSplit,
    );
    if (next) store.setLayout(next.layout, next.reason);
  }

  /** 统一离开协议（Phase 0）：busy 拦截 / dirty 确认 / clean 放行。 */
  function canLeaveSurface(): boolean {
    return canLeaveBusinessSurface(t);
  }

  /** URL → 面板状态（V2 §4）。 */
  function syncRouteToStore(
    to: Pick<RouteLocationNormalizedGeneric, 'path' | 'fullPath' | 'meta'>,
    /** 进入当前路由前的路由；超限取消时用于回滚 URL（Phase 1 验收：URL/Tab/对象一致）。 */
    from?: Pick<RouteLocationNormalizedGeneric, 'fullPath'>,
  ): void {
    // STATE D：独立设置场景不创建/激活 BusinessTab，也不改 layout。
    if (isStandaloneSettingsPath(to.path) || to.meta?.shellScene === 'settings') {
      return;
    }

    if (to.path === '/') {
      store.showHome();
      maybeAutoFocus();
      return;
    }

    const module = moduleForPath(to.path);
    if (!module) return; // 壳外路由（/auth 等）不影响面板状态。

    // 1. 精确路由已在某个 Tab 打开 → 激活它（深链不重复开）。
    const exact = store.tabs.find((tab) => tab.route === to.fullPath);
    if (exact) {
      store.activateTab(exact.id);
      return;
    }

    // 2. 活动 Tab 同模块 → Tab 内导航，回写路由。
    const active = store.activeTab;
    if (active && active.module === module) {
      store.setTabRoute(active.id, to.fullPath);
      return;
    }

    // 3. 其余（胶囊新开 / 深链 / AI 硬跳转）→ 新开 Tab，不抢占现有 Tab。
    // Phase 1：超限时 openTab 不创建，返回候选——UI 明确确认（关闭最久未用）
    // 后重试；取消则保持现状（tabs ≤ MAX_BUSINESS_TABS = KeepAlive max，
    // 杜绝缓存静默驱逐）。
    let opened = store.openTab({
      module,
      route: to.fullPath,
      title: titleFor(module),
      intent: 'deeplink',
    });
    if (opened.evictionCandidateId && !opened.tabId) {
      const candidate = store.tabs.find((tab) => tab.id === opened.evictionCandidateId);
      const confirmed =
        typeof window === 'undefined'
          ? false
          : window.confirm(t('shell.panel.tabLimitConfirm', { title: candidate?.title ?? '' }));
      if (confirmed && candidate) {
        store.closeTab(candidate.id);
        opened = store.openTab({
          module,
          route: to.fullPath,
          title: titleFor(module),
          intent: 'deeplink',
        });
      } else {
        toast.info(t('shell.panel.tabLimitDeniedHint'));
        // 导航已成功但 Tab 未创建：回滚 URL 到进入前，保持 URL/Tab/对象一致。
        if (from && from.fullPath !== to.fullPath) {
          void router.replace(from.fullPath).catch(() => {});
        }
        return;
      }
    }
    if (opened.tabId) {
      maybeAutoFocus();
    }
  }

  // ── 面板 → URL 的动作（AppShell 事件出口） ──

  /** 切换 Tab：先改 store 再 replace URL（不污染 history）。 */
  async function activateTab(tabId: string): Promise<void> {
    const tab = store.tabs.find((item) => item.id === tabId);
    if (!tab) return;
    if (store.activeTabId !== tabId && !canLeaveSurface()) return;
    store.activateTab(tabId);
    if (route.fullPath !== tab.route) {
      await router.replace(tab.route).catch(() => {});
    }
  }

  /**
   * 关闭 Tab。关活动 Tab = 先导航到相邻 Tab（replace）或 `/`（push），
   * 导航成功（未被未保存守卫取消）后再移除；关后台 Tab 直接移除。
   */
  async function closeTab(tabId: string): Promise<void> {
    const index = store.tabs.findIndex((item) => item.id === tabId);
    if (index === -1) return;

    if (store.activeTabId !== tabId) {
      store.closeTab(tabId);
      return;
    }

    if (!canLeaveSurface()) return;

    const neighbor = store.tabs[index + 1] ?? store.tabs[index - 1];
    if (neighbor) {
      const failure = await router.replace(neighbor.route).catch(() => true);
      if (failure) return; // 守卫取消 → 保留 Tab。
      store.closeTab(tabId);
      return;
    }

    // 最后一个 Tab → `/` 对应右侧 Home；afterEach 不删除其它后台 Tab。
    const failure = await router.push('/').catch(() => true);
    if (failure) return;
    store.closeTab(tabId);
    maybeAutoFocus();
  }

  /** 面板头 ✕ / 顶栏 Toggle：隐藏面板但保留 Tab、路由和草稿。 */
  async function closePanel(): Promise<void> {
    if (!canLeaveSurface()) return;
    store.closeRightPanel();
  }

  async function togglePanel(): Promise<void> {
    if (store.rightPanelOpen) {
      await closePanel();
      return;
    }
    store.toggleRightPanel();
  }

  /**
   * 胶囊「进入」（V2 §2.3 + Phase 1 landing 语义）：主入口永远进入模块
   * 默认 route，不因旧 Tab 存在而停在详情。已有同模块 Tab → 更新为 landing
   * route 并激活（replace，不污染 history）；否则 push 后由 afterEach 落 Tab。
   */
  async function openModule(module: ShellModule, landingRoute: string): Promise<void> {
    // Phase 1：胶囊入口同样经过统一离开协议（dirty/busy 检查），
    // 避免编辑中点击胶囊静默切走（review P1）。
    if (!canLeaveSurface()) return;
    const existing = store.tabs.find((tab) => tab.module === module);
    if (existing) {
      store.openTab({
        module,
        route: landingRoute,
        title: titleFor(module),
        intent: 'capsule',
      });
      if (route.fullPath !== landingRoute) {
        await router.replace(landingRoute).catch(() => {});
      }
      return;
    }
    await router.push(landingRoute).catch(() => {});
  }

  /** 打开独立设置场景：只改路由，不碰 tabs / layout。 */
  async function openSettings(path = '/settings'): Promise<void> {
    if (
      route.fullPath === path ||
      (path === '/settings' && route.path === '/settings' && !route.query.tab)
    ) {
      return;
    }
    await router.push(path).catch(() => {});
  }

  /** 从设置返回应用：优先恢复 origin（进入设置前的 route/tab/surface/layout）。 */
  async function returnFromSettings(): Promise<void> {
    await returnFromSettingsScene(router, store, route.fullPath);
  }

  /** 回 STATE A（新对话 / 关面板后的地面态）。 */
  async function goHome(): Promise<void> {
    if (!canLeaveSurface()) return;
    if (route.path !== '/') {
      await router.push('/').catch(() => {});
    } else {
      store.showHome();
      maybeAutoFocus();
    }
  }

  // ── 生命周期：首次渲染前恢复 + afterEach 订阅 ──

  let removeAfterEach: (() => void) | null = null;

  function restoreStartupRoute(): void {
    const panelWasHidden = !store.rightPanelOpen;
    store.sanitizeLegacyTabs();

    // 持久化状态自愈：activeTabId 必须指向存在的 Tab。
    if (store.activeTabId && !store.tabs.some((tab) => tab.id === store.activeTabId)) {
      store.activeTabId = store.tabs.length > 0 ? store.tabs[store.tabs.length - 1]!.id : null;
    }
    if (store.tabs.length > 0 && !store.activeTabId) {
      store.activeTabId = store.tabs[store.tabs.length - 1]!.id;
    }

    // 独立设置深链：保留后台 tabs，不覆盖到业务 Tab。
    if (isStandaloneSettingsPath(route.path) || route.meta.shellScene === 'settings') {
      return;
    }

    // A persisted hidden panel is a user preference. On startup, the browser URL
    // still points at the preserved Home/business surface; restoring that same
    // URL must not masquerade as an explicit deep link and reopen the panel.
    if (
      panelWasHidden &&
      (route.path === '/' || store.tabs.some((tab) => tab.route === route.fullPath))
    ) {
      return;
    }

    // 会话恢复：URL 在 `/` 且有持久化 Tab → 回到活动 Tab 的路由。
    if (route.path === '/' && store.panelSurface === 'business' && store.activeTab) {
      void router.replace(store.activeTab.route).catch(() => {});
      return;
    }
    // 深链启动：当前路由落 Tab。
    syncRouteToStore(route);
  }

  /**
   * 进入/离开独立设置场景时保存/清除 origin（Phase 0 / UI-007）。
   * 进入设置时 store 状态仍对应 from 路由（settings 不修改 store），
   * 因此此时捕获的 tab/surface/layout 即进入设置前的现场。
   */
  function trackSettingsScene(
    to: Pick<RouteLocationNormalizedGeneric, 'path' | 'fullPath' | 'meta'>,
    from: Pick<RouteLocationNormalizedGeneric, 'path' | 'fullPath' | 'meta'>,
  ): void {
    const entering = isStandaloneSettingsPath(to.path) || to.meta?.shellScene === 'settings';
    const leaving = isStandaloneSettingsPath(from.path) || from.meta?.shellScene === 'settings';
    if (entering && !leaving) {
      store.saveSettingsOrigin({
        route: from.fullPath,
        tabId: store.activeTabId,
        panelSurface: store.panelSurface,
        layout: store.layout,
        layoutReason: store.layoutReason,
      });
    } else if (leaving && !entering) {
      store.clearSettingsOrigin();
    }
  }

  // router-view 的 KeepAlive key 依赖 Tab id。必须在首次渲染前创建深链 Tab，
  // 否则首帧使用 fallback key、挂载后切到 Tab key，会留下两套业务组件和 Teleport DOM。
  restoreStartupRoute();

  onMounted(() => {
    removeAfterEach = router.afterEach((to, from, failure) => {
      if (failure) return;
      trackSettingsScene(to, from);
      syncRouteToStore(to, from);
    });
  });

  onUnmounted(() => {
    removeAfterEach?.();
    removeAfterEach = null;
  });

  return {
    activateTab,
    closeTab,
    closePanel,
    togglePanel,
    openModule,
    openSettings,
    returnFromSettings,
    goHome,
  };
}
