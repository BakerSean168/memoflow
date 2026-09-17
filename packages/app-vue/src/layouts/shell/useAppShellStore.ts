/**
 * App Shell UI Store (UI 重构 V2)
 *
 * 承载 ChatGPT 桌面式壳的视图状态：右侧面板 surface、业务多 Tab 集合、
 * 布局态（split / focus）、侧栏与面板宽度。localStorage 持久化实现"会话恢复"
 * （重启后还原上次打开的 Tabs + 各自路由；显式 focus/split 偏好按 AI conversation id
 * 记忆，避免某个会话的专注态污染其他会话）。
 *
 * 契约（docs/UI_REDESIGN_V2_PLAN.md + 2026-07-14 壳层诊断修订）：
 * - §2.3 多 Tab：胶囊/深链落 Tab（同 module 已开则激活，否则新开）；
 *   上限 8，超限时最久未激活的 Tab 作为候选返回给 UI 提示（不自动关，避免丢状态）。
 * - 右侧面板显隐、活动 surface、左侧栏与 focus 互相独立；
 * - Home 是右侧面板无活动业务 Tab 时的 surface，不是 BusinessTab；
 * - STATE D 独立 Settings 不属于 BusinessTab / ShellModule。
 * - KeepAlive :include 由 tabs 派生，Tab 保活编辑器脏状态。
 *
 * 本 store 只存视图状态；URL 是活动 Tab 路由的持久化形式（§4），
 * router ↔ store 的双向同步在 useShellRouterSync（AppShell 消费），
 * 不在此处直连 router。
 */
import { defineStore } from 'pinia';
import { BUSINESS_HARD_MIN, SIDEBAR_HARD_MIN, computePanelGeometry } from './panel-geometry';
// Residual 1001: sole clamp (local dual retired).
import { clamp } from './clamp';

/** 面板可容纳的最大 Tab 数（V2 §2.3 建议 8）。 */
export const MAX_BUSINESS_TABS = 8;

const SIDEBAR_DEFAULT = 260;
// 面板绝对像素上下限由 panel-geometry 动态计算；此处仅保留偏好默认值种子。

export type ShellLayout = 'split' | 'focus';
export type PanelSurface = 'home' | 'business' | 'workflow';
export type PanelSurfaceStatus = 'clean' | 'dirty' | 'busy';
export type WorkflowSurfaceRequest = 'opened' | 'deferred' | 'unavailable';

/**
 * 布局来源（诊断修订 §4.2）：
 * - default：新开业务面板的初始状态；
 * - user：最大化/最小化按钮触发，空间恢复后不自动改回；
 * - viewport：空间不足自动触发，可在空间恢复后回到 split。
 */
export type ShellLayoutReason = 'default' | 'user' | 'viewport';
export type PanelWidthSource = 'responsive' | 'user';

/**
 * 进入独立设置场景前保存的 workspace 状态（Phase 0 / 诊断 UI-007）。
 * 返回设置时优先恢复 origin；origin 失效（Tab 被关）时才回 active tab，
 * 再回 `/`。origin 是会话内临时导航状态，不参与 localStorage 持久化。
 */
export interface ShellOrigin {
  /** 进入设置前的完整路由（含 query），如 `/goals/g-1?tab=x`。 */
  route: string;
  /** 进入设置前激活的业务 Tab id；Home surface 时为 null。 */
  tabId: string | null;
  /** 进入设置前的 BusinessPanel surface。 */
  panelSurface: PanelSurface;
  /** 进入设置前的布局态与来源，返回时恢复。 */
  layout: ShellLayout;
  layoutReason: ShellLayoutReason;
}

/** 胶囊/深链可落地的业务模块标识。Settings 已升为独立场景，不在此列。 */
export type ShellModule = 'goal' | 'task' | 'note' | 'notification' | 'schedule';

export interface BusinessTab {
  id: string;
  module: ShellModule;
  route: string;
  title: string;
  lastActiveAt: number;
}

export interface OpenTabInput {
  module: ShellModule;
  route: string;
  title: string;
  intent: 'capsule' | 'deeplink';
}

export interface OpenTabResult {
  /**
   * 打开的 Tab id。超限未创建时为 ''（此时 evictionCandidateId 非 null）。
   */
  tabId: string;
  /**
   * 超限时的最久未激活 Tab 候选 id（UI 层确认后可 closeTab 后重试）；
   * 未超限时为 null。
   */
  evictionCandidateId: string | null;
}

interface AppShellState {
  tabs: BusinessTab[];
  activeTabId: string | null;
  rightPanelOpen: boolean;
  panelSurface: PanelSurface;
  returnPanelSurface: Exclude<PanelSurface, 'workflow'> | null;
  surfaceStatus: PanelSurfaceStatus;
  workflowAvailable: boolean;
  workflowItemCount: number;
  workflowAttentionCount: number;
  layout: ShellLayout;
  layoutReason: ShellLayoutReason;
  /** 用户显式 focus/split 偏好，按 AI conversation id 持久化。 */
  conversationLayoutPreferences: Record<string, ShellLayout>;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  /**
   * 用户偏好面板宽度（像素）。
   * 渲染时用 computePanelGeometry clamp；窗口缩放不回写此值，
   * 避免把临时约束永久固化（侧栏折叠后应能回到更宽偏好）。
   */
  /** null means no user override; geometry derives the responsive 64% default. */
  panelWidth: number | null;
  /**
   * Distinguishes an intentional drag from legacy persisted pixel defaults.
   * Older persisted states do not contain this field and therefore hydrate as
   * `responsive`, so their stale 520px seed cannot override the new ratio.
   */
  panelWidthSource: PanelWidthSource;
  /**
   * 进入独立设置场景前保存的 workspace 状态（会话内，不持久化）。
   * 返回设置时优先恢复；origin 失效时才回 active tab，再回 `/`。
   */
  settingsOrigin: ShellOrigin | null;
}

const BUSINESS_MODULES = new Set<ShellModule>([
  'goal',
  'task',
  'note',
  'notification',
  'schedule',
]);

let tabSeq = 0;
function nextTabId(module: ShellModule): string {
  tabSeq += 1;
  return `tab-${module}-${Date.now().toString(36)}-${tabSeq}`;
}

// Residual 1001: clamp elevated to ./clamp.

function isBusinessModule(value: unknown): value is ShellModule {
  return typeof value === 'string' && BUSINESS_MODULES.has(value as ShellModule);
}

export const useAppShellStore = defineStore('app-shell', {
  state: (): AppShellState => ({
    tabs: [],
    activeTabId: null,
    rightPanelOpen: true,
    panelSurface: 'home',
    returnPanelSurface: null,
    surfaceStatus: 'clean',
    workflowAvailable: false,
    workflowItemCount: 0,
    workflowAttentionCount: 0,
    layout: 'split',
    layoutReason: 'default',
    conversationLayoutPreferences: {},
    sidebarCollapsed: false,
    sidebarWidth: SIDEBAR_DEFAULT,
    panelWidth: null,
    panelWidthSource: 'responsive',
    settingsOrigin: null,
  }),

  getters: {
    /** 当前激活的 Tab（无面板时为 undefined）。 */
    activeTab(state): BusinessTab | undefined {
      return state.tabs.find((t) => t.id === state.activeTabId);
    },
    /** 是否处于纯 AI 态：右侧面板由用户关闭，和 Tab 集合无关。 */
    isChatOnly(state): boolean {
      return !state.rightPanelOpen;
    },
    /** <KeepAlive :include> 的名单（= 全部 Tab id，LRU 已在 openTab 控量）。 */
    keepAliveInclude(state): string[] {
      return state.tabs.map((t) => t.id);
    },
  },

  actions: {
    /**
     * 打开一个业务 Tab（V2 §2.3 打开规则 + Phase 1 收敛）。
     * - capsule 意图：同 module 已存在 → 激活并更新为 landing 路由/标题；否则新开。
     * - deeplink 意图：同 route 已存在 → 激活；否则新开（不抢占当前 Tab）。
     *
     * 多 Tab 产品决策（Phase 1 写入 contract）：同模块**不同对象**允许多 Tab
     * （deeplink 按 route 精确匹配，各对象独立保活）；capsule/landing 意图
     * 同模块**复用**一个 Tab 并切回列表页。
     *
     * 上限契约：Tab 数量不得超过 `MAX_BUSINESS_TABS`（= KeepAlive `max`）。
     * 超限时**不创建**新 Tab，返回最久未激活候选 id 交 UI 层决定
     * （确认后 closeTab 重试；取消则保持现状），避免"Tab 可见但实例被
     * 缓存层静默驱逐"（诊断 UI-005）。
     */
    openTab(input: OpenTabInput): OpenTabResult {
      const now = Date.now();

      const existing =
        input.intent === 'capsule'
          ? this.tabs.find((t) => t.module === input.module)
          : this.tabs.find((t) => t.route === input.route);

      if (existing) {
        existing.route = input.route;
        existing.title = input.title;
        existing.lastActiveAt = now;
        this.activeTabId = existing.id;
        this.rightPanelOpen = true;
        this.panelSurface = 'business';
        this.returnPanelSurface = null;
        return { tabId: existing.id, evictionCandidateId: null };
      }

      // 超限：不创建，返回最久未激活候选（UI 层确认后 closeTab 重试）。
      if (this.tabs.length >= MAX_BUSINESS_TABS) {
        const candidate = this.tabs.reduce<BusinessTab | null>(
          (oldest, t) => (!oldest || t.lastActiveAt < oldest.lastActiveAt ? t : oldest),
          null,
        );
        return { tabId: '', evictionCandidateId: candidate?.id ?? null };
      }

      const tab: BusinessTab = {
        id: nextTabId(input.module),
        module: input.module,
        route: input.route,
        title: input.title,
        lastActiveAt: now,
      };
      this.tabs.push(tab);
      this.activeTabId = tab.id;
      this.rightPanelOpen = true;
      this.panelSurface = 'business';
      this.returnPanelSurface = null;

      return { tabId: tab.id, evictionCandidateId: null };
    },

    /** 激活已存在的 Tab，刷新其 LRU 时间戳。 */
    activateTab(tabId: string): void {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      tab.lastActiveAt = Date.now();
      this.activeTabId = tabId;
      this.rightPanelOpen = true;
      this.panelSurface = 'business';
      this.returnPanelSurface = null;
    },

    /**
     * 关闭一个 Tab。若关的是活动 Tab，则切到相邻 Tab（优先右侧，
     * 否则左侧）。关掉最后一个 Tab → 回 STATE A（activeTabId = null）。
     * 返回关闭后应导航到的路由（活动 Tab 的路由，或 null 表示回 '/'）。
     */
    closeTab(tabId: string): string | null {
      const index = this.tabs.findIndex((t) => t.id === tabId);
      if (index === -1) return this.activeTab?.route ?? null;

      const wasActive = this.activeTabId === tabId;
      this.tabs.splice(index, 1);

      if (this.tabs.length === 0) {
        this.activeTabId = null;
        this.panelSurface = 'home';
        this.returnPanelSurface = null;
        this.rightPanelOpen = true;
        this.surfaceStatus = 'clean';
        return null;
      }

      if (wasActive) {
        const neighbor = this.tabs[index] ?? this.tabs[index - 1];
        if (neighbor) {
          neighbor.lastActiveAt = Date.now();
          this.activeTabId = neighbor.id;
          this.panelSurface = 'business';
          this.returnPanelSurface = null;
          return neighbor.route;
        }
      }
      return this.activeTab?.route ?? null;
    },

    /** 清空业务 Tab 并回到 Home；右侧面板显隐保持独立。 */
    closeAllTabs(): void {
      this.tabs = [];
      this.activeTabId = null;
      this.panelSurface = 'home';
      this.returnPanelSurface = null;
      this.surfaceStatus = 'clean';
    },

    /** 用户显式隐藏右侧面板；保留 Tab、surface、草稿和 focus 偏好。 */
    closeRightPanel(): void {
      this.rightPanelOpen = false;
    },

    toggleRightPanel(): void {
      this.rightPanelOpen = !this.rightPanelOpen;
    },

    /** 显式回到右侧 Home。业务 Tab 继续保活，可稍后恢复。 */
    showHome(): void {
      this.rightPanelOpen = true;
      this.panelSurface = 'home';
      this.returnPanelSurface = null;
      this.surfaceStatus = 'clean';
    },

    setSurfaceStatus(status: PanelSurfaceStatus): void {
      this.surfaceStatus = status;
    },

    /**
     * 进入独立设置场景前保存 origin（useShellRouterSync 在 afterEach 中调用）。
     * origin 只存会话状态，不持久化；进入设置前的 workspace 实例保持常驻。
     */
    saveSettingsOrigin(origin: ShellOrigin): void {
      this.settingsOrigin = origin;
    },

    /** 离开设置场景后清除 origin（返回恢复动作或浏览器导航触发）。 */
    clearSettingsOrigin(): void {
      this.settingsOrigin = null;
    },

    setWorkflowAvailable(available: boolean, itemCount = 0): void {
      this.workflowAvailable = available;
      this.workflowItemCount = available ? Math.max(0, Math.floor(itemCount)) : 0;
      if (available) return;

      this.workflowAttentionCount = 0;
      if (this.panelSurface === 'workflow') {
        this.closeWorkflowSurface();
      }
    },

    /**
     * 工作流自动切换只允许发生在已打开且 clean 的右侧面板。
     * 用户点击通知/工作流入口属于 explicit，可重新打开面板；业务 view 仍保活。
     */
    requestWorkflowSurface(intent: 'automatic' | 'explicit'): WorkflowSurfaceRequest {
      if (!this.workflowAvailable) return 'unavailable';

      if (intent === 'automatic' && (!this.rightPanelOpen || this.surfaceStatus !== 'clean')) {
        this.workflowAttentionCount = Math.max(1, this.workflowItemCount);
        return 'deferred';
      }

      if (this.panelSurface !== 'workflow') {
        this.returnPanelSurface = this.panelSurface;
      }
      this.rightPanelOpen = true;
      this.panelSurface = 'workflow';
      this.workflowAttentionCount = 0;
      return 'opened';
    },

    closeWorkflowSurface(): void {
      const fallback = this.activeTabId ? 'business' : 'home';
      this.panelSurface = this.returnPanelSurface ?? fallback;
      if (this.panelSurface === 'business' && !this.activeTabId) {
        this.panelSurface = 'home';
      }
      this.returnPanelSurface = null;
    },

    /**
     * 清理历史持久化中的 Settings Tab 等非业务模块条目。
     * Settings 已升级为独立场景，不再属于 BusinessTab。
     */
    sanitizeLegacyTabs(): void {
      const next = this.tabs.filter(
        (tab) =>
          isBusinessModule(tab.module) &&
          // Residual 539: retired existing-note editor routes (/note/:id) no longer exist
          // Residual 885: portable boundary re-lock — strip /note tabs from persisted shell state.
          !(
            tab.route === '/note' ||
            tab.route.startsWith('/note/') ||
            tab.route.startsWith('/note?')
          ),
      );
      if (next.length !== this.tabs.length) {
        this.tabs = next;
        if (this.activeTabId && !next.some((tab) => tab.id === this.activeTabId)) {
          this.activeTabId = next.length > 0 ? next[next.length - 1]!.id : null;
        }
        if (next.length === 0) {
          this.panelSurface = 'home';
        }
      }

      // 工作流内容由 AI 会话恢复后重新声明，不能盲信历史 surface。
      if (this.panelSurface === 'workflow') {
        this.panelSurface = this.activeTabId ? 'business' : 'home';
        this.returnPanelSurface = null;
      }
    },

    /** 更新某 Tab 的当前路由（Tab 内导航时由 AppShell 回写）。 */
    setTabRoute(tabId: string, route: string): void {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (tab) {
        tab.route = route;
        this.rightPanelOpen = true;
        this.panelSurface = 'business';
        this.returnPanelSurface = null;
      }
    },

    /**
     * 更新当前激活 Tab 的标题（Phase 1：详情视图加载到对象名后调用，
     * 格式由视图拼装为「模块名 · 对象标题」；列表路由保持模块名）。
     */
    setActiveTabTitle(title: string): void {
      const tab = this.tabs.find((t) => t.id === this.activeTabId);
      if (tab) tab.title = title;
    },

    setLayout(layout: ShellLayout, reason: ShellLayoutReason = 'default'): void {
      this.layout = layout;
      this.layoutReason = reason;
    },

    /** 返回指定 AI 会话的显式布局偏好；无记录/非法记录时返回 null。 */
    getConversationLayoutPreference(conversationId: string | null | undefined): ShellLayout | null {
      if (!conversationId) return null;
      const value = this.conversationLayoutPreferences[conversationId];
      return value === 'focus' || value === 'split' ? value : null;
    },

    /** 记录用户显式布局选择；viewport 自动 focus 不调用此动作。 */
    rememberConversationLayout(
      conversationId: string | null | undefined,
      layout: ShellLayout,
    ): void {
      if (!conversationId) return;
      this.conversationLayoutPreferences[conversationId] = layout;
    },

    /** 会话删除时同步清理其本地布局偏好，避免持久化 map 长期残留孤儿键。 */
    forgetConversationLayout(conversationId: string | null | undefined): void {
      if (!conversationId) return;
      delete this.conversationLayoutPreferences[conversationId];
    },

    /** B ⇄ C 切换（分栏 ⇄ 专注）；用户显式操作，并可按当前 AI 会话记忆。 */
    toggleFocus(conversationId?: string | null): void {
      this.layout = this.layout === 'focus' ? 'split' : 'focus';
      this.layoutReason = 'user';
      this.rememberConversationLayout(conversationId, this.layout);
    },

    toggleSidebar(): void {
      this.sidebarCollapsed = !this.sidebarCollapsed;
    },

    setSidebarCollapsed(collapsed: boolean): void {
      this.sidebarCollapsed = collapsed;
    },

    setSidebarWidth(width: number, maxWidth = Number.POSITIVE_INFINITY): void {
      if (!Number.isFinite(width)) return;
      const upper = Math.max(SIDEBAR_HARD_MIN, maxWidth);
      this.sidebarWidth = clamp(width, SIDEBAR_HARD_MIN, upper);
    },

    /**
     * 写入用户偏好面板宽度（仅用户拖拽/双击重置调用）。
     * 窗口 resize 不得调用此方法写入 clamp 结果。
     */
    setPanelWidth(width: number): void {
      if (!Number.isFinite(width)) return;
      this.panelWidth = Math.max(BUSINESS_HARD_MIN, Math.round(width));
      this.panelWidthSource = 'user';
    },

    /** Return to the responsive business-dominant ratio at every viewport. */
    resetPanelWidthPreference(): void {
      this.panelWidth = null;
      this.panelWidthSource = 'responsive';
    },

    /**
     * 按当前视口与侧栏占用计算合法有效宽度（不回写偏好）。
     * 渲染层 / 拖拽结束校验使用。
     */
    resolvePanelWidth(viewportWidth: number, sidebarOccupiedWidth: number): number {
      return computePanelGeometry({
        viewportWidth,
        sidebarOccupiedWidth,
        preferredPanelWidth:
          this.panelWidthSource === 'user' ? (this.panelWidth ?? undefined) : undefined,
      }).panelWidth;
    },
  },

  persist: {
    pick: [
      'tabs',
      'activeTabId',
      'rightPanelOpen',
      'panelSurface',
      'conversationLayoutPreferences',
      'sidebarCollapsed',
      'sidebarWidth',
      'panelWidth',
      'panelWidthSource',
    ] as string[],
  },
});
