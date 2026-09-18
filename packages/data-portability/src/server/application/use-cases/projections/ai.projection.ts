/** AI module export projection: product-owned Conversation shells only. */

import type { ExportContext } from '../../portable-runtime';
import type { PortableAIConversation } from '@memoflow/contracts/data-portability';
import { toDateString } from './projection-helpers';

export function projectAIConversations(
  conversations: unknown[],
  ctx: ExportContext,
): PortableAIConversation[] {
  return conversations.map((value) => {
    const entity = value as Record<string, unknown>;
    const ref = ctx.refAllocator.allocate('aiConversation');
    ctx.refToIdMap.set(entity.id as string, ref);
    return {
      _ref: ref,
      name: entity.name as string,
      status: entity.status as string,
      createdAt: toDateString(entity.createdAt),
      updatedAt: toDateString(entity.updatedAt),
    };
  });
}
