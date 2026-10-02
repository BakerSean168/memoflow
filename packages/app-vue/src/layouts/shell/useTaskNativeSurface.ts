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
import type { TaskNativeEditSession } from '../../modules/task/composables/taskNativeEditSession';
import type { OwnerNativeEditSurface } from '../../shared/composables/ownerNativeEditSession';
import { navigateBusinessSurface } from './surface-leave-protocol';
import { useAppShellStore } from './useAppShellStore';

type TaskNativeSurface = Pick<
  OwnerNativeEditSurface<TaskNativeEditSession>,
  'openCreate' | 'locate'
>;
interface TaskNativeSurfaceHost extends TaskNativeSurface {
  register(fullPath: string, session: TaskNativeEditSession): () => void;
}
const TaskNativeSurfaceKey: InjectionKey<TaskNativeSurfaceHost> = Symbol('TaskNativeSurface');

/** Shell-scoped placement; the Task owner registers only its full-create dialog. */
export function provideTaskNativeSurface(): TaskNativeSurfaceHost {
  const router = useRouter();
  const store = useAppShellStore();
  const { t } = useI18n();
  const live = shallowRef<{ fullPath: string; session: TaskNativeEditSession } | null>(null);
  const disposed = shallowRef(false);
  onScopeDispose(() => {
    disposed.value = true;
    live.value = null;
  });

  function locate(): TaskNativeEditSession | null {
    return !disposed.value &&
      store.panelSurface === 'business' &&
      store.activeTab?.route === router.currentRoute.value.fullPath &&
      live.value?.fullPath === router.currentRoute.value.fullPath
      ? live.value.session
      : null;
  }
  async function openCreate(): Promise<TaskNativeEditSession> {
    await nextTick();
    if (disposed.value) throw new Error('Task surface host is closed');
    const target = router.resolve({ name: 'task-list', query: { dialog: 'task-plan' } });
    if (
      router.currentRoute.value.fullPath !== target.fullPath &&
      !(await navigateBusinessSurface(router, target.fullPath, t))
    )
      throw new Error('Task surface navigation was declined');
    await nextTick();
    const tab = store.tabs.find((item) => item.route === target.fullPath);
    if (tab && router.currentRoute.value.fullPath === target.fullPath) store.activateTab(tab.id);
    function isActive() {
      return (
        !disposed.value &&
        router.currentRoute.value.fullPath === target.fullPath &&
        store.panelSurface === 'business' &&
        store.activeTab?.route === target.fullPath
      );
    }
    if (!isActive()) throw new Error('Task surface is not active');
    const ready = locate();
    if (ready) return ready;
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
          if (!isActive()) {
            stop();
            reject(new Error('Task surface closed before becoming ready'));
          } else {
            const session = locate();
            if (session) {
              stop();
              resolve(session);
            }
          }
        },
        { flush: 'sync' },
      );
    });
  }
  const host: TaskNativeSurfaceHost = {
    openCreate,
    locate,
    register(fullPath, session) {
      const entry = { fullPath, session };
      live.value = entry;
      return () => {
        if (live.value === entry) live.value = null;
      };
    },
  };
  provide(TaskNativeSurfaceKey, host);
  return host;
}
export function useTaskNativeSurface(): TaskNativeSurface {
  const host = inject(TaskNativeSurfaceKey);
  if (!host) throw new Error('Task native surface requires AppShell');
  return { openCreate: host.openCreate, locate: host.locate };
}
export function useTaskNativeSurfaceRegistration(): TaskNativeSurfaceHost | null {
  return inject(TaskNativeSurfaceKey, null);
}
