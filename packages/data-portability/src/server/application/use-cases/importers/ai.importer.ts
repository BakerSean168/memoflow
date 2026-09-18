/** AI module importer: restores product-owned Conversation shells only. */

import type { ImportContext } from '../../portable-runtime';
import type { PortableAIData } from '@memoflow/contracts/data-portability';
import type { TxClient } from './import-helpers';
import { allocateId, inc, rec, timestamps } from './import-helpers';

export async function importAI(
  tx: TxClient,
  ctx: ImportContext,
  data: PortableAIData,
): Promise<void> {
  for (const conversation of data.conversations) {
    const c = rec(conversation);
    await tx.createAIConversation({
      id: allocateId(ctx, c._ref as string),
      identityId: ctx.identityId,
      name: c.name as string,
      status: (c.status as string) ?? 'ACTIVE',
      ...timestamps(c),
    });
    inc(ctx, 'aiConversations');
  }
}
