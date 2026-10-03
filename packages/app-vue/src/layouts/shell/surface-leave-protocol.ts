/**
 * 统一离开协议（Phase 0 / 诊断 UI-001、UI-002、UI-004）
 *
 * 所有会离开业务 surface 的导航意图都必须经过同一个协议：
 * - `busy`：禁止离开（toast 提示）；
 * - `dirty`：用户确认后离开，取消则路由和草稿都不变；
 * - `clean`：直接放行。
 *
 * 该协议被两处消费：
 * 1. `useShellRouterSync` 的用户显式动作（切 Tab、关面板、回 Home）；
 * 2. `createSettingsSceneGuard` 全局守卫——任何入口进入设置场景
 *    （顶栏设置按钮、AI settings、Home widget、浏览器后退/前进）都会检查，
 *    不再依赖调用方主动接入 coordinator。
 */
import type {
  NavigationGuard,
  RouteLocationNormalized,
  RouteLocationRaw,
  Router,
} from 'vue-router';
import { getActivePinia } from 'pinia';
import { toast } from 'vue-sonner';
import { getI18nGlobal } from '../../plugins/i18n';
import { useAppShellStore } from './useAppShellStore';
import { isStandaloneSettingsPath } from './shell-scene';

type Translate = (key: string) => string;
type ShellStore = ReturnType<typeof useAppShellStore>;

// Approval belongs to one navigation, never to the draft's dirty/clean status.
const approvedNavigations = new WeakMap<RouteLocationNormalized, ShellStore>();
const shellNavigations = new WeakMap<ShellStore, { fullPath: string }>();

/**
 * 检查当前业务 surface 是否允许离开。
 * 返回 true 表示可以离开；false 表示已拒绝（busy toast 或 dirty confirm 取消）。
 * Home / Workflow surface 与壳外（无 pinia 的测试环境）直接放行。
 *
 * 未显式传入 `t` 时使用全局 i18n 插件实例（场景守卫路径）；组件上下文
 * （useShellRouterSync）可传入 useI18n() 的 t，避免测试环境强制装插件。
 */
export function canLeaveBusinessSurface(t?: Translate, to?: RouteLocationNormalized): boolean {
  const store = getActivePinia() ? useAppShellStore() : null;
  if (!store) return true;
  if (store.panelSurface !== 'business') return true;

  const translate: Translate = t ?? ((key: string) => getI18nGlobal().t(key));

  if (store.surfaceStatus === 'busy') {
    toast.info(translate('shell.panel.busyTransitionHint'));
    return false;
  }
  if (store.surfaceStatus !== 'dirty') return true;
  if (
    to &&
    (approvedNavigations.get(to) === store || shellNavigations.get(store)?.fullPath === to.fullPath)
  ) {
    return true;
  }
  if (typeof window === 'undefined') return false;
  const approved = window.confirm(translate('shell.panel.dirtyTransitionConfirm'));
  if (approved && to) approvedNavigations.set(to, store);
  return approved;
}

/** Share shell preflight approval with component/settings guards for this destination only. */
export async function navigateBusinessSurface(
  router: Router,
  target: RouteLocationRaw,
  t: Translate,
  replace = false,
): Promise<boolean> {
  if (!canLeaveBusinessSurface(t)) return false;
  const store = getActivePinia() ? useAppShellStore() : null;
  const navigation = { fullPath: router.resolve(target).fullPath };
  if (store) shellNavigations.set(store, navigation);
  try {
    return !(await (replace ? router.replace(target) : router.push(target)));
  } catch {
    return false;
  } finally {
    if (store && shellNavigations.get(store) === navigation) shellNavigations.delete(store);
  }
}

/**
 * 进入独立设置场景的全局守卫。
 *
 * 当导航从 workspace 业务 surface 进入 settings 场景时，统一执行
 * dirty/busy 检查——覆盖所有壳层入口（顶栏设置、侧栏设置/账户、AI settings、
 * Home widget、浏览器后退/前进），取消时返回 false，路由与草稿都不变。
 * 设置场景内部的 tab/query 切换直接放行。
 */
export function createSettingsSceneGuard(): NavigationGuard {
  return (to, from) => {
    const enteringSettings =
      isStandaloneSettingsPath(to.path) || to.meta?.shellScene === 'settings';
    if (!enteringSettings) return true;

    const leavingWorkspace =
      !isStandaloneSettingsPath(from.path) && from.meta?.shellScene !== 'settings';
    if (!leavingWorkspace) return true;

    return canLeaveBusinessSurface(undefined, to);
  };
}
