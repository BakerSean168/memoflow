import {
  inject,
  nextTick,
  onScopeDispose,
  provide,
  shallowRef,
  watch,
  type InjectionKey,
} from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { GoalNativeEditSession } from '../../modules/goal/composables/goalNativeEditSession';
import type { OwnerNativeEditSurface } from '../../shared/composables/ownerNativeEditSession';
import { navigateBusinessSurface } from './surface-leave-protocol';
import { useAppShellStore } from './useAppShellStore';

export interface GoalAIEditSurface extends OwnerNativeEditSurface<GoalNativeEditSession> {
  isAvailable(): boolean;
  openControlledCreate(ownerId: string): Promise<GoalNativeEditSession>;
}
interface GoalNativeSurfaceHost extends GoalAIEditSurface {
  register(fullPath: string, session: GoalNativeEditSession): () => void;
}
const GoalNativeSurfaceKey: InjectionKey<GoalNativeSurfaceHost> = Symbol('GoalNativeSurface');

/** One registry per mounted shell; route and owner lifecycle determine readiness. */
export function provideGoalNativeSurface(): GoalNativeSurfaceHost {
  const router = useRouter();
  const store = useAppShellStore();
  const { t } = useI18n();
  const live = shallowRef<{ fullPath: string; session: GoalNativeEditSession } | null>(null);
  const disposed = shallowRef(false);
  let releaseControl: (() => void) | null = null;
  const removeGuard = router.beforeEach(
    (to) => !store.businessControl || to.fullPath === store.businessControl.route,
  );
  onScopeDispose(() => {
    releaseControl?.();
    removeGuard();
    disposed.value = true;
    live.value = null;
  });

  function isAvailable(): boolean {
    return (
      !disposed.value &&
      !store.businessControl &&
      store.surfaceStatus === 'clean' &&
      !live.value &&
      !router.currentRoute.value.query.dialog &&
      // Neither create nor edit can be taken over while its native owner
      // is opening (before it has registered a live session).
      !router.currentRoute.value.query.goalForm
    );
  }

  function locate(): GoalNativeEditSession | null {
    return !disposed.value &&
      store.panelSurface === 'business' &&
      store.activeTab?.route === router.currentRoute.value.fullPath &&
      live.value?.fullPath === router.currentRoute.value.fullPath
      ? live.value.session
      : null;
  }

  async function open(goalId?: string, requireClean = false): Promise<GoalNativeEditSession> {
    // Flush native dirty/busy publication before checking the shell leave protocol.
    await nextTick();
    if (disposed.value) throw new Error('Goal surface host is closed');
    if (requireClean && !isAvailable()) throw new Error('Business surface conflict');
    const query =
      router.currentRoute.value.name === 'goal-list' ? { ...router.currentRoute.value.query } : {};
    delete query.goalId;
    delete query.dialog;
    delete query.goalForm;
    const target = router.resolve({
      name: 'goal-list',
      query: { ...query, ...(goalId ? { dialog: 'goal', goalId } : { goalForm: 'create' }) },
    });
    if (router.currentRoute.value.fullPath !== target.fullPath) {
      if (!(await navigateBusinessSurface(router, target.fullPath, t))) {
        throw new Error('Goal surface navigation was declined');
      }
    }
    await nextTick();
    if (disposed.value) throw new Error('Goal surface host is closed');
    // Shell synchronization has already applied tab-limit/rollback decisions.
    // Explicit opening also reveals a hidden/workflow panel for a same-module route.
    if (router.currentRoute.value.fullPath === target.fullPath) {
      const tab = store.tabs.find((item) => item.route === target.fullPath);
      if (tab) store.activateTab(tab.id);
    }
    if (
      router.currentRoute.value.fullPath !== target.fullPath ||
      store.panelSurface !== 'business' ||
      store.activeTab?.route !== target.fullPath
    ) {
      throw new Error('Goal surface is not active');
    }
    const session = locate();
    if (session) return session;
    // Aggregate loading resolves through owner registration; route exit/load failure
    // or shell disposal rejects the wait. No polling, sleeps, or global registry.
    return new Promise((resolve, reject) => {
      const stop = watch(
        [
          live,
          disposed,
          () => router.currentRoute.value.fullPath,
          () => store.panelSurface,
          () => store.activeTab?.route,
        ],
        () => {
          if (
            disposed.value ||
            router.currentRoute.value.fullPath !== target.fullPath ||
            store.panelSurface !== 'business' ||
            store.activeTab?.route !== target.fullPath
          ) {
            stop();
            reject(new Error('Goal surface closed before becoming ready'));
          } else {
            const ready = locate();
            if (ready) {
              stop();
              resolve(ready);
            }
          }
        },
        { flush: 'sync' },
      );
    });
  }

  const host: GoalNativeSurfaceHost = {
    isAvailable,
    async openControlledCreate(ownerId) {
      await nextTick();
      if (!isAvailable()) throw new Error('Business surface conflict');
      const session = await open(undefined, true);
      const state = session.readDraftState();
      if (state.dirty || state.busy) throw new Error('Business surface changed while opening');
      const version = store.claimBusinessControl(ownerId, router.currentRoute.value.fullPath);
      let controlled: GoalNativeEditSession;
      try {
        controlled = session.claimControl(ownerId);
      } catch (error) {
        store.releaseBusinessControl(ownerId, version);
        throw error;
      }
      const release = () => {
        try {
          controlled.releaseControl();
        } catch {
          /* Owner may already have closed the handle. */
        }
        store.releaseBusinessControl(ownerId, version);
        if (releaseControl === release) releaseControl = null;
      };
      releaseControl = release;
      return {
        ...controlled,
        releaseControl() {
          controlled.releaseControl();
          release();
        },
        requestCancel() {
          controlled.requestCancel();
          release();
        },
      };
    },
    openCreate: () => open(),
    openExisting: (id) => {
      if (!id.trim()) return Promise.reject(new Error('Goal identity is required'));
      return open(id);
    },
    locate,
    register(fullPath, session) {
      const entry = { fullPath, session };
      live.value = entry;
      return () => {
        if (live.value === entry) {
          releaseControl?.();
          live.value = null;
        }
      };
    },
  };
  provide(GoalNativeSurfaceKey, host);
  return host;
}

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
  };
}

export function useGoalNativeSurfaceRegistration(): GoalNativeSurfaceHost | null {
  return inject(GoalNativeSurfaceKey, null);
}
