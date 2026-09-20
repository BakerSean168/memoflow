import { computed } from 'vue';
import { useRoute, useRouter, type LocationQueryRaw, type RouteLocationRaw } from 'vue-router';

export interface RouteDialogStateOptions {
  dialogValue: string;
  dialogQueryKey?: string;
  identityQueryKeys?: readonly string[];
}

/**
 * Route-owned dialog state.
 *
 * The URL is the source of truth. Closing uses replace so a cancelled dialog does
 * not become a browser-history entry that can be resurrected with Back.
 */
export function useRouteDialogState(options: RouteDialogStateOptions) {
  const route = useRoute();
  const router = useRouter();
  const dialogQueryKey = options.dialogQueryKey ?? 'dialog';
  const identityQueryKeys = options.identityQueryKeys ?? [];

  const isOpen = computed(() => route.query[dialogQueryKey] === options.dialogValue);

  function queryWithoutDialog(): LocationQueryRaw {
    const query: LocationQueryRaw = { ...route.query };
    delete query[dialogQueryKey];
    for (const key of identityQueryKeys) delete query[key];
    return query;
  }

  function open(target: RouteLocationRaw, extraQuery: LocationQueryRaw = {}) {
    const targetObject = typeof target === 'string' ? { path: target } : target;
    return router.push({
      ...targetObject,
      query: {
        ...route.query,
        ...extraQuery,
        [dialogQueryKey]: options.dialogValue,
      },
    } as RouteLocationRaw);
  }

  function close() {
    return router.replace({
      path: route.path,
      query: queryWithoutDialog(),
      hash: route.hash,
    });
  }

  return {
    isOpen,
    open,
    close,
    queryWithoutDialog,
  };
}
