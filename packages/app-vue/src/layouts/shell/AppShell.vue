<script setup lang="ts">
/**
 * AppShell（UI 重构 V2 壳容器）
 *
 * ChatGPT 桌面式壳的共享布局根组件（docs/UI_REDESIGN_V2_PLAN.md §1.1 / §2），
 * S1 起取代 MainLayout 成为主路由树的父组件：
 *
 *   chat  = 用户隐藏右侧面板
 *   split = AI 与右侧 Home/业务/工作流 surface 并列
 *   focus = 仅隐藏中央 AI，左侧栏保持自己的独立偏好
 *
 * 接线：
 * - <router-view>（业务子路由）在 BusinessPanel 内渲染，KeepAlive 按 Tab 保活；
 * - AI 工作区 = AIChatView 常驻实例（不经路由）。三态切换只换 CSS
 *   （order / v-show），实例永不卸载——切专注态不打断流式回复；
 * - Router ↔ Tab 双向同步走 useShellRouterSync（V2 §4）；
 * - 会话侧栏消费 AIChatView defineExpose 的会话状态（单一 chat session）；
 * - 桌面窗控走 useDesktopWindowControls（Web 端不渲染，V2 决策 #6）。
 */
import { computed, inject, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useAppShellStore, MAX_BUSINESS_TABS, type ShellLayout } from './useAppShellStore';
import { useShellRouterSync, AUTO_FOCUS_VIEWPORT, moduleForPath } from './useShellRouterSync';
import { useDesktopWindowControls } from '../../shared/composables/useDesktopWindowControls';
import { hasDesktopAuthApi } from '../../shared/utils/desktop-auth-recovery';
import { useNotificationUnreadQuery } from '../../modules/notification/composables/useNotificationUnreadQuery';
import { useAuthenticationStore } from '../../modules/authentication/stores/authentication-store';
import { useAccountStore } from '../../modules/account/stores/account-store';
import AIChatView from '../../modules/ai/views/AIChatView.vue';
import type { ConversationSummary } from '../../modules/ai/composables/types';
import WindowHeader, { type WindowHeaderCapsule } from './WindowHeader.vue';
import GoalCapsulePreview from './previews/GoalCapsulePreview.vue';
import TaskCapsulePreview from './previews/TaskCapsulePreview.vue';
import NoteCapsulePreview from './previews/NoteCapsulePreview.vue';
import ReminderCapsulePreview from './previews/ReminderCapsulePreview.vue';
import ScheduleCapsulePreview from './previews/ScheduleCapsulePreview.vue';
import NotificationCapsulePreview from '../../modules/notification/components/NotificationCapsulePreview.vue';
import ConversationSidebar from './ConversationSidebar.vue';
import BusinessPanel from './BusinessPanel.vue';
import TodayOverviewPanel from './TodayOverviewPanel.vue';
import PanelErrorBoundary from './PanelErrorBoundary.vue';
import { resolvePanelRouteIdentity } from './panel-cache-key';
import { DialogDraftScopeKey } from './dialog-draft-store';
import GlobalComposer from './GlobalComposer.vue';
import CloudConnectionDialog from './CloudConnectionDialog.vue';
import StandaloneSettingsLayout from './StandaloneSettingsLayout.vue';
import {
  COMPOSER_BOTTOM_GAP,
  AI_HARD_MIN,
  BUSINESS_HARD_MIN,
  SIDEBAR_HARD_MIN,
  computePanelGeometry,
  panelWidthFromPointer,
  resolveComposerDensity,
  shouldCollapsePanelWidth,
  shouldCollapseSidebarWidth,
  shouldAutoCollapseSidebar,
  type ComposerDensity,
} from './panel-geometry';
import {
  SHELL_COMPOSER_DENSITY_KEY,
  SHELL_COMPOSER_MOUNT_KEY,
  SHELL_WORKFLOW_MOUNT_KEY,
  DESKTOP_ACCESS_SNAPSHOT_KEY,
  LOGOUT_HANDLER_KEY,
  MODULE_CAPSULES_KEY,
} from '../../di/keys';
import { defaultModuleCapsules } from '../../di/navigation';
import { getProductTime } from '../../shared/utils/product-time';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const store = useAppShellStore();
const {
  tabs,
  activeTabId,
  layout,
  sidebarCollapsed,
  sidebarWidth,
  panelWidth,
  rightPanelOpen,
  panelSurface,
  workflowAvailable,
  workflowAttentionCount,
} = storeToRefs(store);

provide(DialogDraftScopeKey, activeTabId);

const sync = useShellRouterSync();

// ── 宿主环境（沿 isDesktopEnvironment 分支模式，V2 决策 #6） ──
// Residual 913: detect via hasDesktopAuthApi (no electronAPI unknown cast dual).
const isDesktop = typeof window !== 'undefined' && hasDesktopAuthApi(window);
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const shellScene = computed<'workspace' | 'settings'>(() => {
  if (
    route.meta.shellScene === 'settings' ||
    route.path === '/settings' ||
    route.path.startsWith('/settings/') ||
    route.path.startsWith('/account')
  ) {
    return 'settings';
  }
  return 'workspace';
});

const isSettingsScene = computed(() => shellScene.value === 'settings');
const configuredModuleCapsules = inject(MODULE_CAPSULES_KEY, defaultModuleCapsules);

// Phase 5 / UI-008：badgeSource token → 实时计数（notification unread）。
const { unreadCount: notificationUnreadCount } = useNotificationUnreadQuery();
function resolveCapsuleBadge(source: string | undefined): number | null {
  if (source === 'notification.unread') return notificationUnreadCount.value;
  return null;
}

const headerCapsules = computed<WindowHeaderCapsule[]>(() =>
  configuredModuleCapsules.map((entry) => ({
    id: entry.id,
    label: t(entry.title),
    route: entry.route,
    icon: entry.icon,
    placement: entry.id === 'schedule' || entry.id === 'notification' ? 'utility' : 'primary',
    badge: resolveCapsuleBadge(entry.badgeSource),
  })),
);

/** STATE A/B/C 派生（§1.1）。 */
const shellState = computed<'chat' | 'split' | 'focus'>(() => {
  if (!rightPanelOpen.value) return 'chat';
  return layout.value === 'focus' ? 'focus' : 'split';
});

const effectiveViewportWidth = ref(typeof window === 'undefined' ? 1280 : window.innerWidth);
/** 用户 Toggle 是持久化偏好；极窄视口只临时释放侧栏预算。 */
const showSidebar = computed(
  () => !sidebarCollapsed.value && !shouldAutoCollapseSidebar(effectiveViewportWidth.value),
);
/** 右侧面板显隐由独立持久化偏好控制。 */
const showPanel = computed(() => rightPanelOpen.value);
/** 当前几何下的有效侧栏宽度；用户偏好本身不被动态边界改写。 */
const effectiveSidebarWidth = computed(() => {
  const reserved = showPanel.value
    ? BUSINESS_HARD_MIN + (layout.value === 'split' ? AI_HARD_MIN : 0)
    : AI_HARD_MIN;
  const dynamicMax = Math.max(SIDEBAR_HARD_MIN, effectiveViewportWidth.value - reserved);
  return Math.min(sidebarWidth.value, dynamicMax);
});
// ── AI 常驻层（单实例；会话侧栏数据经 defineExpose 上浮） ──
const aiRef = ref<InstanceType<typeof AIChatView> | null>(null);

// ── Global Composer host (§8)：壳拥有布局，AIChatView Teleport 真实输入 ──
const shellComposerMount = shallowRef<HTMLElement | null>(null);
const shellWorkflowMount = shallowRef<HTMLElement | null>(null);
const shellComposerDensity = ref<ComposerDensity>('comfortable');
const composerHeight = ref(0);
const workspaceMainRef = ref<HTMLElement | null>(null);
const aiColumnRef = ref<HTMLElement | null>(null);
const workspaceMainWidth = ref(0);
const aiColumnWidth = ref(0);
const isSidebarResizing = ref(false);
const isPanelResizing = ref(false);
provide(SHELL_COMPOSER_MOUNT_KEY, shellComposerMount);
provide(SHELL_COMPOSER_DENSITY_KEY, shellComposerDensity);
provide(SHELL_WORKFLOW_MOUNT_KEY, shellWorkflowMount);

const composerMode = computed(() => (shellState.value === 'focus' ? 'floating' : 'inline'));
const composerHostWidth = computed(() =>
  composerMode.value === 'floating' ? workspaceMainWidth.value : aiColumnWidth.value,
);
const focusComposerPad = computed(() => {
  if (shellState.value !== 'focus') return 0;
  return Math.max(composerHeight.value, 56) + COMPOSER_BOTTOM_GAP;
});

function onComposerHeightChange(height: number) {
  composerHeight.value = height;
}

function measureComposerHosts() {
  if (typeof window === 'undefined') return;
  workspaceMainWidth.value = workspaceMainRef.value?.clientWidth ?? 0;
  aiColumnWidth.value = aiColumnRef.value?.clientWidth ?? 0;
  shellComposerDensity.value = resolveComposerDensity(
    composerHostWidth.value || workspaceMainWidth.value,
    composerMode.value,
  );
}

let hostResizeObserver: ResizeObserver | null = null;

function bindHostResizeObserver() {
  hostResizeObserver?.disconnect();
  hostResizeObserver = null;
  if (typeof ResizeObserver === 'undefined') return;
  hostResizeObserver = new ResizeObserver(() => measureComposerHosts());
  if (workspaceMainRef.value) hostResizeObserver.observe(workspaceMainRef.value);
  if (aiColumnRef.value) hostResizeObserver.observe(aiColumnRef.value);
  measureComposerHosts();
}

const conversations = computed<ConversationSummary[]>(
  () => (aiRef.value?.conversationList ?? []) as ConversationSummary[],
);

function conversationTimestamp(item: ConversationSummary): number {
  const raw =
    (item as { lastMessageAt?: unknown }).lastMessageAt ??
    (item as { updatedAt?: unknown }).updatedAt ??
    (item as { createdAt?: unknown }).createdAt ??
    0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

/** 今天 / 近 7 天 / 更早（本地时区自然日边界，V2 §5）。 */
const conversationGroups = computed(() => {
  const time = getProductTime();
  const todayMs = Number(time.calendar.startOfDay(Date.now()));
  const weekMs = Number(time.calendar.addDays(todayMs, -6));

  const buckets: Record<'today' | 'last7Days' | 'earlier', { id: string; title: string }[]> = {
    today: [],
    last7Days: [],
    earlier: [],
  };
  for (const item of conversations.value) {
    const ts = conversationTimestamp(item);
    const entry = {
      id: String(item.id),
      title: (item as { name?: string }).name || t('common.untitled'),
    };
    if (ts >= todayMs) buckets.today.push(entry);
    else if (ts >= weekMs) buckets.last7Days.push(entry);
    else buckets.earlier.push(entry);
  }
  return (
    [
      { labelKey: 'shell.conversation.today', items: buckets.today },
      { labelKey: 'shell.conversation.last7Days', items: buckets.last7Days },
      { labelKey: 'shell.conversation.earlier', items: buckets.earlier },
    ] as const
  ).filter((group) => group.items.length > 0);
});

const activeConversationId = computed<string | null>(
  () => (aiRef.value?.chatConversationId as string | undefined) || null,
);
/** 新会话在首条消息落库前没有 conversation id，先暂存一次用户显式布局选择。 */
const pendingConversationLayoutPreference = ref<ShellLayout | null>(null);

function applyConversationLayoutPreference(conversationId = activeConversationId.value): void {
  const preferred = store.getConversationLayoutPreference(conversationId);
  store.setLayout(preferred ?? 'split', preferred ? 'user' : 'default');
}

function handleToggleWorkspaceFocus(): void {
  store.toggleFocus(activeConversationId.value);
  if (!activeConversationId.value) {
    pendingConversationLayoutPreference.value = store.layout;
  }
  // A narrow viewport may temporarily require focus even when the user records split as
  // the conversation preference. Re-apply geometry immediately so the actual layout stays valid.
  onViewportGeometryChange();
}

async function handleSelectConversation(id: string) {
  // Selecting an existing conversation must never inherit a pending preference from an unsaved draft.
  pendingConversationLayoutPreference.value = null;
  const summary = conversations.value.find((item) => String(item.id) === id);
  if (!summary) return;
  await aiRef.value?.selectConversation(summary);
}

function handleDeleteConversation(id: string) {
  store.forgetConversationLayout(id);
  void aiRef.value?.deleteConversation(id);
}

/** 「新对话」= 新建会话 + 关面板回 STATE A（V2 §5）。 */
async function handleNewConversation() {
  pendingConversationLayoutPreference.value = null;
  store.setLayout('split', 'default');
  aiRef.value?.startNewConversation('chat');
  await sync.goHome();
}

// ── 用户 / 账户入口（侧栏底部菜单，§9） ──
const authStore = useAuthenticationStore();
const accountStore = useAccountStore();
const { isAuthenticated } = storeToRefs(authStore);
const logout = inject(LOGOUT_HANDLER_KEY, null);
const desktopAccess = inject(DESKTOP_ACCESS_SNAPSHOT_KEY, ref(null));
const cloudConnectionOpen = ref(false);
const userName = computed<string | undefined>(
  () =>
    accountStore.currentAccount?.profile.nickname ??
    authStore.currentIdentity?.name ??
    desktopAccess.value?.profile?.displayName,
);
const shellIdentityKind = computed<'guest' | 'registered-local' | 'cloud'>(() => {
  if (isAuthenticated.value) return 'cloud';
  if (desktopAccess.value?.profile) {
    return desktopAccess.value.profile.profileKind === 'guest' ? 'guest' : 'registered-local';
  }
  return accountStore.currentAccount ? 'registered-local' : 'guest';
});

const needsEmailVerification = computed(
  () => isAuthenticated.value && authStore.currentIdentity?.emailVerified === false,
);

function goVerifyEmail() {
  void router.push({ path: '/auth', query: { scene: 'verify-email' } });
}

// ── 桌面窗控（既有 IPC 通道，V2 §9；Web 分支不渲染按钮） ──
const windowControls = useDesktopWindowControls();

onMounted(() => {
  if (isDesktop) windowControls.startListening();
});

onBeforeUnmount(() => {
  if (isDesktop) windowControls.stopListening();
});

// ── 拖拽调宽（侧栏 / 面板），状态回写 store ──
function maxSidebarWidth(): number {
  if (typeof window === 'undefined') return Number.POSITIVE_INFINITY;
  const reserved = showPanel.value
    ? BUSINESS_HARD_MIN + (shellState.value === 'split' ? AI_HARD_MIN : 0)
    : AI_HARD_MIN;
  return Math.max(SIDEBAR_HARD_MIN, window.innerWidth - reserved);
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
    if (shouldCollapseSidebarWidth(ev.clientX)) {
      cleanup();
      store.setSidebarCollapsed(true);
      return;
    }
    store.setSidebarWidth(ev.clientX, maxSidebarWidth());
  };
  const up = () => {
    cleanup();
  };
  const cancel = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') cleanup();
  };
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
  return showSidebar.value ? effectiveSidebarWidth.value : 0;
}

/** 分栏态会占用的侧栏宽度（不受 focus 隐藏影响，避免 canSplit 抖动）。 */
function prospectiveSidebarOccupied(): number {
  return showSidebar.value ? effectiveSidebarWidth.value : 0;
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
    applyConversationLayoutPreference();
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

  const cleanup = (pointerId?: number, restoreFocusAfterGesture = true) => {
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
      window.requestAnimationFrame(restoreFocusedElement);
    }
  };

  const move = (ev: PointerEvent) => {
    const width = panelWidthFromPointer(ev.clientX, window.innerWidth, occupiedSidebarWidth());
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

onMounted(() => {
  onViewportGeometryChange();
  window.addEventListener('resize', onViewportGeometryChange);
  bindHostResizeObserver();
  window.addEventListener('resize', measureComposerHosts);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', onViewportGeometryChange);
  window.removeEventListener('resize', measureComposerHosts);
  hostResizeObserver?.disconnect();
  hostResizeObserver = null;
});

// 侧栏折叠/改宽后重新派生有效面板宽（偏好不变，渲染层读 effectivePanelWidth）
watch([showSidebar, sidebarWidth, sidebarCollapsed, shellState, panelWidth], () => {
  measureComposerHosts();
});

watch([workspaceMainRef, aiColumnRef], () => {
  bindHostResizeObserver();
});

watch(activeConversationId, (conversationId, previousConversationId) => {
  if (
    conversationId &&
    !previousConversationId &&
    pendingConversationLayoutPreference.value !== null
  ) {
    store.rememberConversationLayout(conversationId, pendingConversationLayoutPreference.value);
    pendingConversationLayoutPreference.value = null;
  }
  applyConversationLayoutPreference(conversationId);
  // 会话偏好只表达 user intent；窄视口仍由几何规则临时强制 focus。
  onViewportGeometryChange();
});

watch([showSidebar, sidebarWidth, sidebarCollapsed], () => {
  // 触发一次布局派生，便于 focus 自动恢复规则与宽度消费保持一致
  onViewportGeometryChange();
});

// ── 业务工作区入口 / 面板动作（导航细节在 useShellRouterSync） ──
function openHeaderModule(payload: { id: string; route: string }): void {
  if (!headerCapsules.value.some((entry) => entry.id === payload.id)) return;
  const module = moduleForPath(payload.route);
  if (!module) {
    void router.push(payload.route).catch(() => {});
    return;
  }
  void sync.openModule(module, payload.route);
}

function openHeaderPreviewModule(
  closePreview: () => void,
  payload: { id: string; route: string },
): void {
  closePreview();
  openHeaderModule(payload);
}

/** Phase 1 deep-link：Goal preview 项目进入精确对象路由。 */
function openHeaderGoalPreview(closePreview: () => void, goalId: string): void {
  openHeaderPreviewModule(closePreview, {
    id: 'goal',
    route: `/goals/${encodeURIComponent(goalId)}`,
  });
}

/** Phase 1 deep-link：Task preview 项目进入精确对象路由。 */
function openHeaderTaskPreview(closePreview: () => void, taskId: string): void {
  openHeaderPreviewModule(closePreview, {
    id: 'task',
    route: `/tasks/${encodeURIComponent(taskId)}`,
  });
}

function openHeaderNotePreview(closePreview: () => void, noteId: string): void {
  openHeaderPreviewModule(closePreview, {
    id: 'note',
    route: `/repository?note=${encodeURIComponent(noteId)}`,
  });
}

function openPanelRoute(_module: 'goal' | 'task' | 'reminder', path: string) {
  void router.push(path).catch(() => {});
}

function openSettings(path = '/settings') {
  void sync.openSettings(path);
}

function openAccount() {
  void sync.openSettings('/settings?tab=account');
}

function openCloudConnection() {
  if (isDesktop) {
    cloudConnectionOpen.value = true;
    return;
  }
  void router.push('/auth').catch(() => {});
}

async function handleLogout() {
  await logout?.();
}

function returnFromSettings() {
  void sync.returnFromSettings();
}

/**
 * KeepAlive 缓存键 = 拥有该路由的 Tab id + 壳实际渲染的首个路由身份。
 * - Tab 维度：同模块多 Tab 各自保活（两个 note Tab 互不串状态）；
 * - 渲染记录维度：有 ModuleLayout 时列表 → 详情复用该布局；没有布局的
 *   Task 路由则按 leaf component 分键，避免 KeepAlive 以同 key 复用不同组件。
 * 过渡帧里路由还停在旧 Tab 的路由上时，归属仍解析到旧 Tab，避免缓存串键。
 */
function panelCacheKey(
  fullPath: string,
  matched: readonly {
    name?: unknown;
    path?: string;
    components?: Record<string, unknown> | null;
  }[],
): string {
  const owner =
    tabs.value.find((tab) => tab.route === fullPath)?.id ?? activeTabId.value ?? 'panel';
  return `${owner}:${resolvePanelRouteIdentity(matched, fullPath)}`;
}
</script>

<template>
  <div
    class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground"
    data-testid="app-shell"
    :data-shell-state="isSettingsScene ? 'settings' : shellState"
    :data-shell-scene="shellScene"
  >
    <div
      v-if="needsEmailVerification"
      data-testid="unverified-email-banner"
      class="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-100 px-4 py-2 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100"
      role="status"
    >
      <span>{{ t('shell.auth.unverifiedBanner') }}</span>
      <button
        type="button"
        class="rounded-md bg-amber-900/10 px-3 py-1 text-xs font-medium text-amber-950 hover:bg-amber-900/15 dark:bg-amber-400/20 dark:text-amber-50 dark:hover:bg-amber-400/30"
        data-testid="unverified-email-banner-action"
        @click="goVerifyEmail"
      >
        {{ t('shell.auth.unverifiedAction') }}
      </button>
    </div>

    <!-- 顶部窗口栏：工作区 launcher + 日程入口 + 窗控 -->
    <WindowHeader
      :mode="isSettingsScene ? 'settings' : 'workspace'"
      :sidebar-collapsed="sidebarCollapsed"
      :right-panel-open="rightPanelOpen"
      :workflow-attention-count="workflowAttentionCount"
      :is-desktop="isDesktop"
      :is-mac="isMac"
      :window-controls="windowControls.windowControlsState"
      :capsules="headerCapsules"
      @toggle-sidebar="store.toggleSidebar()"
      @toggle-right-panel="() => void sync.togglePanel()"
      @go-back="router.back()"
      @go-forward="router.forward()"
      @return-to-app="returnFromSettings"
      @open-module="openHeaderModule"
      @window-minimize="windowControls.minimizeWindow()"
      @window-toggle-maximize="windowControls.toggleMaximize()"
      @window-close="windowControls.closeWindow()"
    >
      <template #capsule-preview-goal="{ closePreview }">
        <GoalCapsulePreview
          @view-all="openHeaderPreviewModule(closePreview, { id: 'goal', route: '/goals' })"
          @select="openHeaderGoalPreview(closePreview, $event)"
        />
      </template>
      <template #capsule-preview-task="{ closePreview }">
        <TaskCapsulePreview
          @view-all="openHeaderPreviewModule(closePreview, { id: 'task', route: '/tasks' })"
          @select="openHeaderTaskPreview(closePreview, $event)"
        />
      </template>
      <template #capsule-preview-note="{ closePreview }">
        <NoteCapsulePreview
          @view-all="openHeaderPreviewModule(closePreview, { id: 'note', route: '/repository' })"
          @select="openHeaderNotePreview(closePreview, $event)"
        />
      </template>
      <template #capsule-preview-reminder="{ closePreview }">
        <ReminderCapsulePreview
          @view-all="openHeaderPreviewModule(closePreview, { id: 'reminder', route: '/reminders' })"
          @select="openHeaderPreviewModule(closePreview, { id: 'reminder', route: '/reminders' })"
        />
      </template>
      <template #capsule-preview-schedule="{ closePreview }">
        <ScheduleCapsulePreview
          @view-all="openHeaderPreviewModule(closePreview, { id: 'schedule', route: '/schedule' })"
        />
      </template>
      <template #capsule-preview-notification="{ closePreview }">
        <NotificationCapsulePreview
          @view-all="
            openHeaderPreviewModule(closePreview, {
              id: 'notification',
              route: '/notifications',
            })
          "
        />
      </template>
    </WindowHeader>

    <!-- STATE D：独立设置场景。设置路由只渲染 named view `settings`（UserSettingsView），
         业务 default view 为空；WorkspaceSceneHost 用 v-show 常驻——KeepAlive 实例、
         AIChatView 流式回复、Teleport 宿主都不随设置导航销毁（Phase 0 / UI-001）。 -->
    <StandaloneSettingsLayout v-if="isSettingsScene" class="min-h-0 flex-1">
      <router-view name="settings" />
    </StandaloneSettingsLayout>

    <!-- 主工作区（STATE A/B/C）：DOM 常驻，设置场景时隐藏而非卸载。 -->
    <div v-show="!isSettingsScene" class="relative flex min-h-0 flex-1 overflow-hidden">
      <!-- 会话侧栏只响应自己的 Toggle，和右栏/Focus 独立。 -->
      <Transition name="shell-sidebar">
        <ConversationSidebar
          v-if="showSidebar"
          class="shrink-0"
          :class="isSidebarResizing ? 'transition-none' : ''"
          :style="{ width: effectiveSidebarWidth + 'px' }"
          :groups="conversationGroups"
          :active-conversation-id="activeConversationId"
          :user-name="userName"
          :identity-kind="shellIdentityKind"
          :cloud-connected="isAuthenticated"
          :loading="Boolean(aiRef?.conversationListLoading)"
          :is-desktop="isDesktop"
          :width="effectiveSidebarWidth"
          @new-conversation="handleNewConversation"
          @select-conversation="handleSelectConversation"
          @delete-conversation="handleDeleteConversation"
          @open-search="handleNewConversation"
          @open-settings="openSettings"
          @open-account="openAccount"
          @open-help="openSettings('/settings?tab=advanced')"
          @open-cloud-connection="openCloudConnection"
          @logout="() => void handleLogout()"
          @start-resize="startSidebarResize"
          @resize-by="resizeSidebarBy"
        />
      </Transition>

      <!-- 中央区：AI 常驻层 + 业务面板 + GlobalComposer 宿主。
           三态只换 flex / 显隐，AI 实例永不卸载（流式不中断）。 -->
      <div
        ref="workspaceMainRef"
        data-testid="shell-workspace-main"
        class="relative flex min-h-0 min-w-0 flex-1 overflow-hidden"
        :class="shellState === 'focus' ? 'flex-col' : 'flex-row'"
      >
        <!-- AI 工作区（A/B 满列；C 隐藏列但实例保活，Composer 改浮动宿主） -->
        <div
          v-show="shellState !== 'focus'"
          ref="aiColumnRef"
          data-testid="shell-ai-column"
          class="order-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <AIChatView ref="aiRef" class="min-h-0 w-full flex-1" hide-conversation-sidebar />
          <GlobalComposer
            v-if="shellState !== 'focus'"
            mode="inline"
            :host-width="aiColumnWidth"
            @height-change="onComposerHeightChange"
          />
        </div>

        <!-- 右侧面板 DOM 常驻；Toggle 只显隐，Tab、草稿和工作流上下文继续保活。 -->
        <div
          :aria-hidden="showPanel ? undefined : 'true'"
          :class="
            shellState === 'focus'
              ? 'order-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
              : [
                  'order-2 flex h-full min-h-0 min-w-0 shrink-0 flex-col overflow-hidden transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none md:flex',
                  showPanel ? 'opacity-100' : 'pointer-events-none invisible w-0 opacity-0',
                  isPanelResizing ? 'transition-none' : '',
                ]
          "
          :style="{
            ...(shellState === 'split'
              ? { width: showPanel ? effectivePanelWidth() + 'px' : '0px' }
              : {}),
            ...(shellState === 'focus' ? { paddingBottom: focusComposerPad + 'px' } : {}),
          }"
        >
          <BusinessPanel
            :tabs="tabs"
            :active-tab-id="activeTabId"
            :layout="layout"
            :panel-surface="panelSurface"
            :workflow-available="workflowAvailable"
            :workflow-attention-count="workflowAttentionCount"
            @activate-tab="(id: string) => void sync.activateTab(id)"
            @close-tab="(id: string) => void sync.closeTab(id)"
            @show-home="() => void sync.goHome()"
            @show-workflow="store.requestWorkflowSurface('explicit')"
            @close-workflow="store.closeWorkflowSurface()"
            @toggle-focus="handleToggleWorkspaceFocus"
            @start-resize="startPanelResize"
            @reset-width="resetPanelWidth"
            @resize-by="resizePanelBy"
          >
            <template #home>
              <TodayOverviewPanel
                :active="showPanel && panelSurface === 'home'"
                @open-route="openPanelRoute"
              />
            </template>

            <PanelErrorBoundary :reset-key="activeTabId">
              <router-view v-slot="{ Component }">
                <KeepAlive :max="MAX_BUSINESS_TABS">
                  <component
                    :is="Component"
                    v-if="Component"
                    :key="panelCacheKey($route.fullPath, $route.matched)"
                  />
                </KeepAlive>
              </router-view>
            </PanelErrorBoundary>

            <template #workflow>
              <div
                ref="shellWorkflowMount"
                class="h-full min-h-0"
                data-testid="shell-workflow-surface"
              />
            </template>
          </BusinessPanel>
        </div>

        <!-- STATE C：相对业务工作区宿主居中的浮动 Composer（§8.4） -->
        <GlobalComposer
          v-if="shellState === 'focus'"
          mode="floating"
          :host-width="workspaceMainWidth"
          @height-change="onComposerHeightChange"
        />
      </div>
    </div>
  </div>
  <CloudConnectionDialog
    v-if="isDesktop"
    v-model:open="cloudConnectionOpen"
    :profile-name="desktopAccess?.profile?.displayName"
  />
</template>

<style scoped>
.shell-sidebar-enter-active,
.shell-sidebar-leave-active {
  overflow: hidden;
  transition:
    width 180ms ease-out,
    opacity 180ms ease-out;
}

.shell-sidebar-enter-from,
.shell-sidebar-leave-to {
  width: 0 !important;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .shell-sidebar-enter-active,
  .shell-sidebar-leave-active {
    transition: none;
  }
}
</style>
