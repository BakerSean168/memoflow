import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PowerSyncDatabase } from '@powersync/node';
import { expect, it } from 'vitest';
import type { WorkflowRunState } from '@mastra/core/workflows';
import { createMastraStorage } from '../mastra/runtime/storage';
import { getGoalWorkflowEventSource } from '../mastra/runtime/goal-workflow-events.registry';
import { AttentionEventsPowerSync } from '../infrastructure/adapters/powersync/attention-events.powersync';
import { ConversationAttentionPowerSyncAdapter } from '../infrastructure/adapters/powersync/ai-conversation-attention-powersync.adapter';
import { workspaceEventStream } from './workspace-event-stream';
import { ConversationEventsPowerSync } from '../infrastructure/adapters/powersync/conversation-events.powersync';
import { PowerSyncAIConversationRepository } from '../infrastructure/adapters/powersync/ai-conversation-powersync.repository';
import { AIConversation } from '../domain/aggregates/ai-conversation';

it('resumes all three committed owners from one cursor across distinct real databases', async () => {
  const { PowerSyncAppSchema } = await import('@memoflow/powersync-schema');
  const root = await mkdtemp(path.join(tmpdir(), 'workspace-owners-'));
  const db = new PowerSyncDatabase({
    schema: PowerSyncAppSchema,
    database: { dbFilename: path.join(root, 'profile.sqlite') },
  });
  const storage = createMastraStorage({
    kind: 'libsql',
    url: `file:${path.join(root, 'workflows.sqlite')}`,
  });
  const attention = new AttentionEventsPowerSync(db);
  const conversations = new ConversationEventsPowerSync(db);
  const conversationRepository = new PowerSyncAIConversationRepository(db, conversations);
  const adapter = new ConversationAttentionPowerSyncAdapter(db, attention);
  const controller = new AbortController();
  try {
    await db.init();
    await storage.init();
    const source = getGoalWorkflowEventSource(storage)!;
    const workflows = await storage.getStore('workflows');
    if (!workflows) throw new Error('Workflow storage unavailable');
    const stream = workspaceEventStream({
      source,
      attention,
      conversations,
      identityId: '550e8400-e29b-41d4-a716-446655440000',
      signal: controller.signal,
    });
    const ready = await stream.next();
    expect(ready.value.type).toBe('stream.ready');
    const cursor = ready.value.cursor;
    const next = stream.next();
    await adapter.transition({
      identityId: '550e8400-e29b-41d4-a716-446655440000',
      runtimeKind: 'local_agent',
      conversationId: 'native',
      runId: 'native-run',
      sequence: 1,
      state: 'working',
      occurredAt: Date.now(),
    });
    const first = await next;
    expect(first.value).toMatchObject({ type: 'attention.changed', resourceVersion: 1 });
    await workflows.persistWorkflowSnapshot({
      workflowName: 'goal-create',
      runId: 'goal-run',
      resourceId: '550e8400-e29b-41d4-a716-446655440000',
      snapshot: {
        status: 'running',
        context: {
          input: {
            idea: 'Plan',
            identityId: '550e8400-e29b-41d4-a716-446655440000',
            conversationId: 'goal-thread',
          },
        },
        value: { liveActions: [] },
      } as unknown as WorkflowRunState,
    });
    const second = await stream.next();
    expect(second.value).toMatchObject({
      type: 'workflow.updated',
      data: { runId: 'goal-run' },
      resourceVersion: 1,
    });
    await conversationRepository.save(
      AIConversation.create({
        identityId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Native shell',
      }),
    );
    const third = await stream.next();
    expect(third.value).toMatchObject({
      type: 'conversation.updated',
      resourceVersion: 1,
      data: { conversation: { name: 'Native shell' } },
    });
    await stream.return(undefined);
    const replay = workspaceEventStream({
      source,
      attention,
      conversations,
      identityId: '550e8400-e29b-41d4-a716-446655440000',
      cursor,
      signal: controller.signal,
    });
    expect((await replay.next()).value.type).toBe('stream.ready');
    const types = [
      (await replay.next()).value.type,
      (await replay.next()).value.type,
      (await replay.next()).value.type,
    ];
    expect(types.sort()).toEqual(['attention.changed', 'conversation.updated', 'workflow.updated']);
    await replay.return(undefined);
    const caughtUp = workspaceEventStream({
      source,
      attention,
      conversations,
      identityId: '550e8400-e29b-41d4-a716-446655440000',
      cursor: third.value.cursor,
      signal: controller.signal,
    });
    expect((await caughtUp.next()).value.type).toBe('stream.ready');
    const pending = caughtUp.next();
    controller.abort();
    expect((await pending).done).toBe(true);
    const foreign = workspaceEventStream({
      source,
      attention,
      conversations,
      identityId: 'foreign',
      cursor,
      signal: new AbortController().signal,
    });
    expect((await foreign.next()).value).toMatchObject({
      type: 'stream.reset_required',
      reason: 'invalid',
    });
    await foreign.return(undefined);
  } finally {
    controller.abort();
    await attention.dispose();
    await conversations.dispose();
    const close = (storage as { close?: () => Promise<void> }).close;
    await close?.call(storage);
    await db.close();
    await rm(root, { recursive: true, force: true });
  }
});
