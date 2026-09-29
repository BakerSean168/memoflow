/**
 * 业务面板几何纯函数（2026-07-14 壳层诊断修订 §6）
 *
 * 动态约束：任意合法 split 下 AI 列 >= AI_HARD_MIN，
 * 业务面板 >= BUSINESS_HARD_MIN，且业务硬下限始终更大。
 */

// Residual 1001: sole clamp (local dual retired).
import { clamp } from './clamp';

export const AI_HARD_MIN = 320;
export const BUSINESS_HARD_MIN = 520;
export const SIDEBAR_HARD_MIN = 200;
export const BUSINESS_PREFERRED_RATIO = 0.64;
/** Dragging past this distance below a usable minimum enters collapsed state. */
export const PANEL_COLLAPSE_THRESHOLD = 96;
export const SIDEBAR_COLLAPSE_THRESHOLD = 96;
/** Below this effective viewport, release the sidebar budget without changing user preference. */
export const SIDEBAR_AUTO_COLLAPSE_VIEWPORT = 960;

/**
 * Hybrid workspace chrome. The sidebar stays flush with the shell while the
 * shared Chat + Business content well is inset from the shell edge.
 * Geometry reserves the exact horizontal margins consumed by CSS.
 */
export const WORKSPACE_COMPACT_BREAKPOINT = 768;
export const WORKSPACE_DESKTOP_BREAKPOINT = 1200;
export const WORKSPACE_DESKTOP_INSET = 6;
export const WORKSPACE_DESKTOP_GAP = 6;
export const WORKSPACE_MID_INSET = 4;
export const WORKSPACE_MID_GAP = 4;

export interface WorkspaceChromeMetrics {
  inset: number;
  gap: number;
}

export function resolveWorkspaceChromeMetrics(viewportWidth: number): WorkspaceChromeMetrics {
  const width = Math.max(0, Math.floor(viewportWidth));
  if (width < WORKSPACE_COMPACT_BREAKPOINT) return { inset: 0, gap: 0 };
  if (width < WORKSPACE_DESKTOP_BREAKPOINT) {
    return { inset: WORKSPACE_MID_INSET, gap: WORKSPACE_MID_GAP };
  }
  return { inset: WORKSPACE_DESKTOP_INSET, gap: WORKSPACE_DESKTOP_GAP };
}

/**
 * The content well always consumes a left margin and a right inset.
 * When the sidebar is visible that left margin is the sidebar-to-well gap;
 * when it is collapsed the same value becomes the shell's left inset.
 */
export function workspaceChromeBudget(
  viewportWidth: number,
  sidebarOccupiedWidth: number,
): number {
  void sidebarOccupiedWidth;
  const { inset, gap } = resolveWorkspaceChromeMetrics(viewportWidth);
  return inset + gap;
}

/** Global Composer 宿主几何（§8.4）。 */
export const COMPOSER_MAX = 740;
export const COMPOSER_SIDE_GAP = 28;
export const COMPOSER_BOTTOM_GAP = 24;
/** textarea 自动增高上限（约 5–6 行）。 */
export const COMPOSER_TEXTAREA_MAX_PX = 168;
/** split 下 AI 列宽低于此值时仅显示图标控件。 */
export const COMPOSER_ICON_DENSITY_MAX = 480;
/** split 下 AI 列宽低于此值时使用紧凑控件。 */
export const COMPOSER_COMPACT_DENSITY_MAX = 640;

export type ComposerDensity = 'comfortable' | 'compact' | 'icon';
export type ComposerLayoutMode = 'inline' | 'floating';

export interface PanelGeometryInput {
  viewportWidth: number;
  /** 侧栏实际占用宽度；折叠或隐藏时为 0。 */
  sidebarOccupiedWidth: number;
  /** 用户偏好的面板宽度（可能越界，调用方负责 clamp）。 */
  preferredPanelWidth?: number;
}

export interface PanelGeometry {
  workspaceWidth: number;
  panelMin: number;
  panelMax: number;
  /** 当前偏好宽度经 clamp 后的有效宽度。 */
  panelWidth: number;
  /** 默认推荐宽度（未持久化偏好时使用）。 */
  defaultPanelWidth: number;
  /** 分栏是否几何上可行；false 时应使用 viewport focus。 */
  canSplit: boolean;
  /** AI 列剩余宽度（split 下）。 */
  aiWidth: number;
}

export interface ComposerLayout {
  width: number;
  left: number;
}

export function shouldAutoCollapseSidebar(viewportWidth: number): boolean {
  return Math.max(0, Math.floor(viewportWidth)) < SIDEBAR_AUTO_COLLAPSE_VIEWPORT;
}

// Residual 1001: clamp elevated to ./clamp.

/** 计算当前视口下的业务面板可用宽度区间与默认值。 */
export function computePanelGeometry(input: PanelGeometryInput): PanelGeometry {
  const viewportWidth = Math.max(0, Math.floor(input.viewportWidth));
  const sidebarOccupiedWidth = Math.max(0, Math.floor(input.sidebarOccupiedWidth));
  const chromeBudget = workspaceChromeBudget(viewportWidth, sidebarOccupiedWidth);
  const workspaceWidth = Math.max(0, viewportWidth - sidebarOccupiedWidth - chromeBudget);
  // There is no product maximum. The upper bound is only the current legal
  // split range after reserving the AI minimum; this changes with the window.
  const panelMax = Math.max(0, workspaceWidth - AI_HARD_MIN);
  const canSplit = panelMax >= BUSINESS_HARD_MIN;
  const effectiveMax = canSplit ? panelMax : Math.max(BUSINESS_HARD_MIN, workspaceWidth);
  const defaultPanelWidth = canSplit
    ? clamp(Math.round(workspaceWidth * BUSINESS_PREFERRED_RATIO), BUSINESS_HARD_MIN, effectiveMax)
    : BUSINESS_HARD_MIN;

  const preferred =
    typeof input.preferredPanelWidth === 'number' && Number.isFinite(input.preferredPanelWidth)
      ? input.preferredPanelWidth
      : defaultPanelWidth;

  const panelWidth = canSplit
    ? clamp(Math.round(preferred), BUSINESS_HARD_MIN, effectiveMax)
    : Math.min(BUSINESS_HARD_MIN, workspaceWidth);
  const aiWidth = Math.max(0, workspaceWidth - panelWidth);

  return {
    workspaceWidth,
    panelMin: BUSINESS_HARD_MIN,
    panelMax: effectiveMax,
    panelWidth,
    defaultPanelWidth,
    canSplit,
    aiWidth,
  };
}

/** 拖拽过程中按指针位置计算面板宽度（面板贴右边缘）。 */
export function panelWidthFromPointer(
  clientX: number,
  viewportWidth: number,
  sidebarOccupiedWidth: number,
): number {
  void sidebarOccupiedWidth;
  const { inset } = resolveWorkspaceChromeMetrics(viewportWidth);
  // Business content ends at the content well's right inset.
  const raw = Math.max(0, Math.round(viewportWidth - inset - clientX));
  return raw;
}

export function sidebarWidthFromPointer(clientX: number, viewportWidth: number): number {
  const { gap } = resolveWorkspaceChromeMetrics(viewportWidth);
  // Sidebar resizer is centered inside the sidebar-to-content-well gap.
  return Math.max(0, Math.round(clientX - gap / 2));
}

export function shouldCollapsePanelWidth(width: number): boolean {
  return width < BUSINESS_HARD_MIN - PANEL_COLLAPSE_THRESHOLD;
}

export function shouldCollapseSidebarWidth(width: number): boolean {
  return width < SIDEBAR_HARD_MIN - SIDEBAR_COLLAPSE_THRESHOLD;
}

/**
 * 按宿主矩形计算 Composer 宽度与相对宿主的 left。
 * 宿主是 AI 列（A/B）或业务工作区（C），不是整窗。
 */
export function computeComposerLayout(
  hostWidth: number,
  hostLeft = 0,
  maxWidth = COMPOSER_MAX,
  sideGap = COMPOSER_SIDE_GAP,
): ComposerLayout {
  const safeHostWidth = Math.max(0, Math.floor(hostWidth));
  const width = Math.min(maxWidth, Math.max(0, safeHostWidth - 2 * sideGap));
  const left = hostLeft + (safeHostWidth - width) / 2;
  return { width, left };
}

/** 根据壳态与宿主宽度推导 Composer 控件密度。 */
export function resolveComposerDensity(
  hostWidth: number,
  mode: ComposerLayoutMode,
): ComposerDensity {
  if (mode === 'floating') return 'compact';
  if (hostWidth < COMPOSER_ICON_DENSITY_MAX) return 'icon';
  if (hostWidth < COMPOSER_COMPACT_DENSITY_MAX) return 'compact';
  return 'comfortable';
}
