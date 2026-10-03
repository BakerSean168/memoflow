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
import type { OwnerNativeEditSurface } from '../../shared/composables/ownerNativeEditSession';
import type { KnowledgeCaptureNativeEditSession } from '../../modules/repository/composables/knowledgeCaptureNativeEditSession';
import { navigateBusinessSurface } from './surface-leave-protocol';
import { useAppShellStore } from './useAppShellStore';

type KnowledgeNativeSurface = Pick<
  OwnerNativeEditSurface<KnowledgeCaptureNativeEditSession>,
  'openCreate' | 'locate'
>;
interface KnowledgeNativeSurfaceHost extends KnowledgeNativeSurface {
  register(fullPath: string, session: KnowledgeCaptureNativeEditSession): () => void;
}
const KnowledgeNativeSurfaceKey: InjectionKey<KnowledgeNativeSurfaceHost> =
  Symbol('KnowledgeNativeSurface');

/** Shell-scoped placement for the Repository-owned AI capture review surface. */
export function provideKnowledgeNativeSurface(): KnowledgeNativeSurfaceHost {
  const router = useRouter();
  const store = useAppShellStore();
  const { t } = useI18n();
  const live = shallowRef<{
    fullPath: string;
    session: KnowledgeCaptureNativeEditSession;
  } | null>(null);
  const disposed = shallowRef(false);

  onScopeDispose(() => {
    disposed.value = true;
    live.value = null;
  });

  function locate(): KnowledgeCaptureNativeEditSession | null {
    return !disposed.value &&
      store.panelSurface === 'business' &&
      store.activeTab?.route === router.currentRoute.value.fullPath &&
      live.value?.fullPath === router.currentRoute.value.fullPath
      ? live.value.session
      : null;
  }

  async function openCreate(): Promise<KnowledgeCaptureNativeEditSession> {
    await nextTick();
    if (disposed.value) throw new Error('Knowledge surface host is closed');

    const current = router.currentRoute.value;
    const query =
      current.name === 'repository'
        ? { ...current.query, dialog: 'knowledge-capture' }
        : { dialog: 'knowledge-capture' };
    const target = router.resolve({ name: 'repository', query });

    if (
      current.fullPath !== target.fullPath &&
      !(await navigateBusinessSurface(router, target.fullPath, t))
    ) {
      throw new Error('Knowledge surface navigation was declined');
    }

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

    if (!isActive()) throw new Error('Knowledge surface is not active');
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
            reject(new Error('Knowledge surface closed before becoming ready'));
            return;
          }
          const session = locate();
          if (session) {
            stop();
            resolve(session);
          }
        },
        { flush: 'sync' },
      );
    });
  }

  const host: KnowledgeNativeSurfaceHost = {
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

  provide(KnowledgeNativeSurfaceKey, host);
  return host;
}

export function useKnowledgeNativeSurface(): KnowledgeNativeSurface {
  const host = inject(KnowledgeNativeSurfaceKey);
  if (!host) throw new Error('Knowledge native surface requires AppShell');
  return { openCreate: host.openCreate, locate: host.locate };
}

export function useKnowledgeNativeSurfaceRegistration(): KnowledgeNativeSurfaceHost | null {
  return inject(KnowledgeNativeSurfaceKey, null);
}
