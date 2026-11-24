import type { LabelReadPort } from '@memoflow/agent-gateway';
import type { LabelService } from '@memoflow/label';
import { toLabelClientDTO } from '@memoflow/label/client';

/**
 * Binds the Local Profile's existing LabelService instead of letting the MCP
 * surface read the database repository directly.
 */
export function bindLocalLabelReadPort(
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
