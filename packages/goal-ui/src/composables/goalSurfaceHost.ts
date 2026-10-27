import {
  inject,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  watch,
  type InjectionKey,
  type Ref,
} from 'vue';
import type { RouteLocationNormalized } from 'vue-router';
import type { GoalNativeDraftState, GoalNativeEditSession } from '@memoflow/goal-client';

/**
 * Goal surface host ports (P2 goal-ui step 0: goal ↔ shell dependency inversion).
 *
 * The Goal module owns these contracts; the host shell (AppShell) provides the
 * implementations backed by the shell store and the shell leave protocol.
 * Goal code never imports the shell: views publish through the status sink,
 * ask the leave guard port, and register native edit sessions through the
 * native surface key. Without a host (standalone rendering, unit tests) the
 * ports degrade exactly like the previous no-shell behavior: status is not
 * published anywhere and navigation is allowed.
 */

export type GoalSurfaceStatus = 'clean' | 'dirty' | 'busy';

/** Host sink receiving the active goal view's explicit transition status. */
export interface GoalSurfaceStatusSink {
  setSurfaceStatus(status: GoalSurfaceStatus): void;
}

export const GoalSurfaceStatusSinkKey: InjectionKey<GoalSurfaceStatusSink> =
  Symbol('GoalSurfaceStatusSink');

/**
 * Registers the active business view's explicit transition status with the host.
 * Cached views re-publish on activation; hidden views never compete for ownership.
 */
export function useGoalSurfaceStatus(status: Ref<GoalSurfaceStatus>): void {
  const sink = inject(GoalSurfaceStatusSinkKey, null);
  let active = true;

  const publish = () => {
    if (active) sink?.setSurfaceStatus(status.value);
  };

  watch(status, publish, { immediate: true });

  onActivated(() => {
    active = true;
    publish();
  });

  onDeactivated(() => {
    active = false;
  });

  onBeforeUnmount(() => {
    if (active) sink?.setSurfaceStatus('clean');
  });
}

/**
 * Host leave protocol for the current business surface: returns true when the
 * navigation may proceed; false when it was declined (busy hint or the user
 * cancelled the dirty confirmation).
 */
export type GoalSurfaceLeaveGuard = (
  t?: (key: string) => string,
  to?: RouteLocationNormalized,
) => boolean;

export const GoalSurfaceLeaveGuardKey: InjectionKey<GoalSurfaceLeaveGuard> =
  Symbol('GoalSurfaceLeaveGuard');

export function useGoalSurfaceLeaveGuard(): GoalSurfaceLeaveGuard {
  return inject(GoalSurfaceLeaveGuardKey, () => true);
}

export interface GoalAIEditSurface {
  openCreate(): Promise<GoalNativeEditSession>;
  openExisting(id: string): Promise<GoalNativeEditSession>;
  locate(): GoalNativeEditSession | null;
  isAvailable(): boolean;
  openControlledCreate(ownerId: string): Promise<GoalNativeEditSession>;
  /** Explicit restart intent may reclaim this exact mounted user draft without reopening it. */
  reclaimControlledCreate(
    ownerId: string,
    session: GoalNativeEditSession,
    snapshot: GoalNativeDraftState,
  ): GoalNativeEditSession;
  openControlled(
    ownerId: string,
    options?: { mode?: 'create' | 'edit'; goalId?: string },
  ): Promise<GoalNativeEditSession>;
  getControlledSession(ownerId: string): GoalNativeEditSession | null;
  releaseControlledSession(ownerId: string): void;
}

export interface GoalNativeSurfaceHost extends GoalAIEditSurface {
  register(fullPath: string, session: GoalNativeEditSession): () => void;
}

export const GoalNativeSurfaceKey: InjectionKey<GoalNativeSurfaceHost> =
  Symbol('GoalNativeSurface');

/** Consumers get only semantic opening/location. Registration belongs to the owner. */
export function useGoalNativeSurface(): GoalAIEditSurface {
  const host = inject(GoalNativeSurfaceKey);
  if (!host) throw new Error('Goal native surface requires AppShell');
  return {
    openCreate: host.openCreate,
    openExisting: host.openExisting,
    locate: host.locate,
    isAvailable: host.isAvailable,
    openControlledCreate: host.openControlledCreate,
    reclaimControlledCreate: host.reclaimControlledCreate,
    openControlled: host.openControlled,
    getControlledSession: host.getControlledSession,
    releaseControlledSession: host.releaseControlledSession,
  };
}

export function useGoalNativeSurfaceRegistration(): GoalNativeSurfaceHost | null {
  return inject(GoalNativeSurfaceKey, null);
}
