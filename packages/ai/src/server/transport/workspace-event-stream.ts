import { createHash } from 'node:crypto';
import { z } from 'zod';
import { WorkspaceEventSchema, type WorkspaceEvent } from '@memoflow/ai-contracts';
import type { AttentionEventSource } from '../application/ports/attention-events.port';
import type { GoalWorkflowEventSource } from '../application/ports/goal-workflow-events.port';
import type { ConversationEventSource } from '../domain/repositories/conversation-events.port';

const position = z
  .object({ epoch: z.string().uuid(), sequence: z.number().int().nonnegative().safe() })
  .strict();
const cursorState = z
  .object({
    owner: z.string().length(64),
    positions: z.partialRecord(z.enum(['goal', 'attention', 'conversation']), position),
  })
  .strict();
type OwnerName = 'goal' | 'attention' | 'conversation';
type CommittedSource<T extends { sequence: number }> = {
  readonly epoch: string;
  init(): Promise<void>;
  head(identityId: string): Promise<{ first: number; last: number }>;
  read(identityId: string, after: number): Promise<T[]>;
  subscribe(wake: () => void): () => void;
};

/** Each durable owner keeps its own ordering. There is no cross-store transaction or global sequence. */
export async function* workspaceEventStream(input: {
  source: GoalWorkflowEventSource | null;
  attention?: AttentionEventSource;
  conversations?: ConversationEventSource;
  identityId: string;
  cursor?: string;
  signal: AbortSignal;
}): AsyncGenerator<WorkspaceEvent> {
  const { identityId, signal } = input;
  const lane = <T extends { sequence: number }>(
    name: OwnerName,
    source: CommittedSource<T>,
    project: (change: T, cursor: string) => WorkspaceEvent,
  ) => ({
    name,
    source,
    after: 0,
    read: async (after: number) =>
      (await source.read(identityId, after)).map((change) => ({
        sequence: change.sequence,
        project: (cursor: string) => project(change, cursor),
      })),
  });
  const lanes = [
    ...(input.source
      ? [
          lane('goal', input.source, (change, cursor) =>
            WorkspaceEventSchema.parse({
              type: 'workflow.updated',
              eventId: change.eventId,
              cursor,
              resourceVersion: change.resourceVersion,
              data: change.run,
              actions: change.actions,
              baseActionSequence: change.baseActionSequence,
              lastActionSequence: change.lastActionSequence,
            }),
          ),
        ]
      : []),
    ...(input.attention
      ? [
          lane('attention', input.attention, (change, cursor) =>
            WorkspaceEventSchema.parse({
              type: 'attention.changed',
              eventId: change.eventId,
              cursor,
              resourceVersion: change.resourceVersion,
              data: change.data,
            }),
          ),
        ]
      : []),
    ...(input.conversations
      ? [
          lane('conversation', input.conversations, (change, cursor) =>
            WorkspaceEventSchema.parse({
              type: 'conversation.updated',
              eventId: change.eventId,
              cursor,
              resourceVersion: change.resourceVersion,
              data: change.data,
            }),
          ),
        ]
      : []),
  ];
  if (!lanes.length) throw new Error('Workspace events unavailable');
  for (const item of lanes) await item.source.init();
  if (signal.aborted) return;
  const owner = createHash('sha256').update(identityId).digest('hex');
  const encode = () =>
    Buffer.from(
      JSON.stringify({
        owner,
        positions: Object.fromEntries(
          lanes.map((item) => [item.name, { epoch: item.source.epoch, sequence: item.after }]),
        ),
      }),
    ).toString('base64url');
  let wakeVersion = 0;
  let resume: (() => void) | undefined;
  const wake = () => {
    wakeVersion += 1;
    resume?.();
  };
  const unsubscribers: (() => void)[] = [];
  signal.addEventListener('abort', wake, { once: true });
  try {
    // Subscribe before heads: a commit during calibration must still wake the reader.
    for (const item of lanes) unsubscribers.push(item.source.subscribe(wake));
    const heads: Array<{ first: number; last: number }> = [];
    for (const item of lanes) {
      const head = await item.source.head(identityId);
      heads.push(head);
      item.after = head.last;
    }
    let invalid = false;
    let expired = false;
    if (input.cursor) {
      try {
        if (input.cursor.length > 2048) throw new Error('Oversized cursor');
        const decoded = cursorState.parse(
          JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')),
        );
        if (decoded.owner !== owner || Object.keys(decoded.positions).length !== lanes.length)
          invalid = true;
        for (let index = 0; index < lanes.length; index++) {
          const item = lanes[index]!;
          const prior = decoded.positions[item.name];
          const head = heads[index]!;
          if (!prior || prior.epoch !== item.source.epoch || prior.sequence > head.last)
            invalid = true;
          else {
            item.after = prior.sequence;
            if (prior.sequence < head.first - 1) expired = true;
          }
        }
      } catch {
        invalid = true;
      }
    }
    if (invalid || expired) {
      lanes.forEach((item, index) => {
        item.after = heads[index]!.last;
      });
      yield WorkspaceEventSchema.parse({
        type: 'stream.reset_required',
        cursor: encode(),
        reason: invalid ? 'invalid' : 'expired',
      });
      return;
    }
    yield WorkspaceEventSchema.parse({ type: 'stream.ready', cursor: encode() });
    while (!signal.aborted) {
      const observed = wakeVersion;
      let count = 0;
      try {
        const current: Array<{ first: number; last: number }> = [];
        for (const item of lanes) current.push(await item.source.head(identityId));
        if (lanes.some((item, index) => item.after < current[index]!.first - 1)) {
          lanes.forEach((item, index) => {
            item.after = current[index]!.last;
          });
          yield WorkspaceEventSchema.parse({
            type: 'stream.reset_required',
            cursor: encode(),
            reason: 'expired',
          });
          return;
        }
        for (const item of lanes) {
          const changes = await item.read(item.after);
          count += changes.length;
          for (const change of changes) {
            if (signal.aborted) return;
            const previous = item.after;
            item.after = change.sequence;
            try {
              yield change.project(encode());
            } catch (error) {
              item.after = previous;
              throw error;
            }
          }
        }
      } catch {
        yield WorkspaceEventSchema.parse({
          type: 'stream.reset_required',
          cursor: encode(),
          reason: 'projection_failed',
        });
        return;
      }
      if (count || observed !== wakeVersion) continue;
      await new Promise<void>((resolve) => {
        resume = resolve;
        if (signal.aborted || observed !== wakeVersion) resolve();
      });
      resume = undefined;
    }
  } finally {
    for (const unsubscribe of unsubscribers.reverse()) unsubscribe();
    signal.removeEventListener('abort', wake);
  }
}
