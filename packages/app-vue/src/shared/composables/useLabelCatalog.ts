/**
 * Shared identity-scoped Label catalog for Goal/Task product surfaces.
 *
 * The renderer owns only current-user LabelClientDTOs. Identity is injected by
 * the Web/Desktop host transports, so this composable never sends identityId.
 */
import { computed } from 'vue';
import { useMutation, useQuery } from '@tanstack/vue-query';
import { unwrap } from '@memoflow/contracts/result';
import type { LabelClientDTO } from '@memoflow/contracts/label';
import { LABEL_SERVICE_KEY } from '../../di/keys';
import { useServerStateIdentityScope, useServerStateRuntime } from '../../platform/server-state';
import { useStrictInject } from '../utils/useStrictInject';
import type { LabelPickerOption } from '../components/label-selection.types';

const LABEL_CATALOG_STALE_TIME_MS = 60_000;

export const labelCatalogQueryKeys = {
  all: ['server-state', 'label-catalog'] as const,
  identity: (identityScope: string) => [...labelCatalogQueryKeys.all, identityScope] as const,
};

export function useLabelCatalog() {
  const service = useStrictInject(LABEL_SERVICE_KEY, 'LabelService');
  const runtime = useServerStateRuntime();
  const resolveIdentityScope = useServerStateIdentityScope();

  const query = useQuery(() => {
    const identityScope = resolveIdentityScope();
    return {
      queryKey: labelCatalogQueryKeys.identity(identityScope),
      queryFn: async () => unwrap(await service.listLabels({ limit: 500 })),
      staleTime: LABEL_CATALOG_STALE_TIME_MS,
    };
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const identityScope = resolveIdentityScope();
      const label = unwrap(await service.createLabel({ name }));
      return { identityScope, label };
    },
    onSuccess: ({ identityScope, label }) => {
      runtime.queryClient.setQueryData<LabelClientDTO[]>(
        labelCatalogQueryKeys.identity(identityScope),
        (current = []) => {
          const withoutDuplicate = current.filter((item) => item.id !== label.id);
          return [...withoutDuplicate, label].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
          );
        },
      );
    },
  });

  const labels = computed<LabelClientDTO[]>(() => query.data.value ?? []);
  const options = computed<LabelPickerOption[]>(() =>
    labels.value.map((label) => ({ id: label.id, name: label.name, color: label.color })),
  );

  async function createLabel(name: string): Promise<LabelClientDTO> {
    return (await createMutation.mutateAsync(name)).label;
  }

  return {
    query,
    async existingNames(names: readonly string[]) {
      const result = await query.refetch();
      if (result.error) throw result.error;
      return names.map((name) => ({
        name,
        label:
          result.data?.find(
            (item) =>
              item.name.normalize('NFKC').trim().toLowerCase() ===
              name.normalize('NFKC').trim().toLowerCase(),
          ) ?? null,
      }));
    },
    labels,
    options,
    isLoading: computed(() => query.isPending.value),
    createLabel,
    async resolveNames(names: readonly string[]): Promise<string[]> {
      // Label commands own validation/uniqueness. Re-read after a concurrent create.
      const catalog = await query.refetch();
      if (catalog.error) throw catalog.error;
      const resolved: string[] = [];
      for (const name of names) {
        let label = catalog.data?.find(
          (item) =>
            item.name.normalize('NFKC').trim().toLowerCase() ===
            name.normalize('NFKC').trim().toLowerCase(),
        );
        if (!label) {
          try {
            label = await createLabel(name);
          } catch (cause) {
            const fresh = await query.refetch();
            label = fresh.data?.find(
              (item) =>
                item.name.normalize('NFKC').trim().toLowerCase() ===
                name.normalize('NFKC').trim().toLowerCase(),
            );
            if (!label) throw cause;
          }
        }
        resolved.push(label.id);
      }
      return [...new Set(resolved)];
    },
    isCreating: computed(() => createMutation.isPending.value),
  };
}
