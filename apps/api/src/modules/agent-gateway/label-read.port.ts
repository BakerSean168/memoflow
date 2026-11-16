import type { LabelService } from '@memoflow/label';
import { toLabelClientDTO } from '@memoflow/label/client';
import type { LabelReadPort } from '@memoflow/agent-gateway';

/**
 * Binds the existing LabelService application service without granting
 * Agent Gateway direct access to the database repository.
 */
export function bindLabelReadPort(
  service: Pick<LabelService, 'list' | 'resolveNames'>,
): LabelReadPort {
  return {
    async list(input, context) {
      const labels = await service.list({
        identityId: context.identityId,
        search: input.search,
        limit: input.limit,
      });
      return labels.map(toLabelClientDTO);
    },
    async resolveNames(names, context) {
      const labels = await service.resolveNames(context.identityId, names);
      return labels.map(toLabelClientDTO);
    },
  };
}
