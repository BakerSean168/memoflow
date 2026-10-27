import { nextTick, onScopeDispose, provide, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  GoalNativeSurfaceKey,
  type GoalNativeEditSession,
  type GoalNativeSurfaceHost,
} from '@memoflow/goal-ui';
import { navigateBusinessSurface } from './surface-leave-protocol';
import { useAppShellStore } from './useAppShellStore';

/**
 * Host implementation of the Goal native surface port (the port contracts —
 * GoalNativeSurfaceKey, GoalAIEditSurface, useGoalNativeSurface — are owned by
 * modules/goal/composables/goalSurfaceHost). One registry per mounted shell;
 * this provider wires it to the shell store and the shell leave protocol.
 */
/** One registry per mounted shell; route and owner lifecycle determine readiness. */
export function provideGoalNativeSurface(): GoalNativeSurfaceHost {
  const router = useRouter();
  const store = useAppShellStore();
  const { t } = useI18n();
  const live = shallowRef<{ fullPath: string; session: GoalNativeEditSession } | null>(null);
  const disposed = shallowRef(false);
  let releaseControl: (() => void) | null = null;
  let activeControlledSession: GoalNativeEditSession | null = null;
  let activeControlledOwnerId: string | null = null;
  const removeGuard = router.beforeEach(
    (to) => !store.businessControl || to.fullPath === store.businessControl.route,
  );
  function releaseHostControl() {
    // A BYOA run cannot resume after this renderer/host is disposed. Unlike a
    // durable Mastra workflow, its run marker must not strand the saved draft.
    try {
      if (activeControlledOwnerId?.startsWith('local-agent:')) {
        activeControlledSession?.detachWorkflow();
      }
    } catch {
      /* The owner may already have disposed its capability. */
    } finally {
      releaseControl?.();
    }
  }
  onScopeDispose(() => {
    releaseHostControl();
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

  function claimSession(ownerId: string, session: GoalNativeEditSession, allowDirty = false) {
    const version = store.claimBusinessControl(
      ownerId,
      router.currentRoute.value.fullPath,
      allowDirty,
    );
    let controlled: GoalNativeEditSession;
    try {
      controlled = session.claimControl(ownerId);
    } catch (error) {
      store.releaseBusinessControl(ownerId, version);
      throw error;
    }
    activeControlledOwnerId = ownerId;
    const release = () => {
      try {
        controlled.releaseControl();
      } catch {
        /* Owner may already have closed the handle. */
      }
      store.releaseBusinessControl(ownerId, version);
      if (releaseControl === release) releaseControl = null;
      if (activeControlledSession === wrapped) activeControlledSession = null;
      if (activeControlledOwnerId === ownerId) activeControlledOwnerId = null;
    };
    releaseControl = release;
    const wrapped: GoalNativeEditSession = {
      ...controlled,
      releaseControl() {
        controlled.releaseControl();
        release();
      },
      detachWorkflow() {
        controlled.detachWorkflow();
        release();
      },
      requestCancel() {
        controlled.requestCancel();
        release();
      },
    };
    activeControlledSession = wrapped;
    return wrapped;
  }

  const host: GoalNativeSurfaceHost = {
    isAvailable,
    async openControlledCreate(ownerId) {
      await nextTick();
      if (!isAvailable()) throw new Error('Business surface conflict');
      const session = await open(undefined, true);
      const state = session.readDraftState();
      if (state.dirty || state.busy) throw new Error('Business surface changed while opening');
      return claimSession(ownerId, session);
    },
    reclaimControlledCreate(ownerId, session, snapshot) {
      const current = session.readDraftState();
      if (
        disposed.value ||
        locate() !== session ||
        current.mode !== 'create' ||
        current.busy ||
        current.revision !== snapshot.revision ||
        JSON.stringify(current.draft) !== JSON.stringify(snapshot.draft)
      )
        throw new Error('Goal surface changed before restart');
      // The native snapshot is authoritative; its busy/dirty publication may still be queued.
      store.setSurfaceStatus(current.dirty ? 'dirty' : 'clean');
      return claimSession(ownerId, session, true);
    },
    openCreate: () => open(),
    openExisting: (id) => {
      if (!id.trim()) return Promise.reject(new Error('Goal identity is required'));
      return open(id);
    },
    async openControlled(ownerId, options) {
      await nextTick();
      const mode = options?.mode ?? 'create';
      const goalId = options?.goalId;
      if (mode === 'edit' && (!goalId || !goalId.trim())) {
        throw new Error('Goal ID is required for edit mode');
      }
      if (activeControlledOwnerId === ownerId && activeControlledSession) {
        const current = activeControlledSession.readDraftState();
        if (current.mode === mode && (!goalId || current.goalId === goalId)) {
          return activeControlledSession;
        }
      }
      if (!isAvailable()) throw new Error('Business surface conflict');
      const session = await open(mode === 'edit' ? goalId : undefined, true);
      const state = session.readDraftState();
      if (state.dirty || state.busy) throw new Error('Business surface changed while opening');
      return claimSession(ownerId, session);
    },
    getControlledSession(ownerId) {
      if (activeControlledOwnerId === ownerId && activeControlledSession) {
        return activeControlledSession;
      }
      return null;
    },
    releaseControlledSession(ownerId) {
      if (activeControlledOwnerId === ownerId && activeControlledSession) {
        try {
          // A finished BYOA run must not leave durable workflow ownership on its draft.
          activeControlledSession.detachWorkflow();
        } catch {
          /* ignore */
        }
      }
    },
    locate,
    register(fullPath, session) {
      const entry = { fullPath, session };
      live.value = entry;
      return () => {
        if (live.value === entry) {
          releaseHostControl();
          live.value = null;
        }
      };
    },
  };
  provide(GoalNativeSurfaceKey, host);
  return host;
}
