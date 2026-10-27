import {
  GoalWorkflowLiveActionJournalSchema,
  GoalWorkflowLiveActionSchema,
  type GoalWorkflowLiveActionRecord,
} from '@memoflow/ai-contracts';

import type { MastraCompositeStore } from '@mastra/core/storage';
import type { RequestContext } from '@mastra/core/request-context';
import type { GoalWorkflowLiveAction } from '@memoflow/ai-contracts';

export const GOAL_WORKFLOW_LIVE_ACTION_SINK_KEY = 'goalWorkflowLiveActionSink';

export interface GoalWorkflowLiveActionSink {
  readonly identityId: string;
  readonly runId: string;
  readonly revision: number;
  append(command: GoalWorkflowLiveAction): Promise<GoalWorkflowLiveActionRecord>;
}

export function requireGoalWorkflowLiveActionSink(
  context: RequestContext,
): GoalWorkflowLiveActionSink {
  const candidate = context.getRaw(GOAL_WORKFLOW_LIVE_ACTION_SINK_KEY);
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    typeof (candidate as GoalWorkflowLiveActionSink).append !== 'function' ||
    typeof (candidate as GoalWorkflowLiveActionSink).identityId !== 'string' ||
    typeof (candidate as GoalWorkflowLiveActionSink).runId !== 'string' ||
    typeof (candidate as GoalWorkflowLiveActionSink).revision !== 'number'
  ) {
    throw new Error('Goal live action sink is unavailable');
  }
  const sink = candidate as GoalWorkflowLiveActionSink;
  if (
    sink.identityId !== context.getRaw('identityId') ||
    sink.runId !== context.getRaw('workflowRunId')
  ) {
    throw new Error('Goal live action sink does not match authenticated workflow');
  }
  return sink;
}

/**
 * Append a validated operation to an already owner-scoped durable workflow state.
 * The workflow is the serialization/persistence boundary; this helper performs
 * no domain mutation and never grants a client the right to save a Goal.
 */
export function appendGoalWorkflowLiveAction(input: {
  journal: readonly GoalWorkflowLiveActionRecord[];
  command: unknown;
  revision: number;
}): {
  journal: GoalWorkflowLiveActionRecord[];
  record: GoalWorkflowLiveActionRecord;
  duplicate: boolean;
} {
  const journal = GoalWorkflowLiveActionJournalSchema.parse(input.journal);
  const command = GoalWorkflowLiveActionSchema.parse(input.command);
  if (command.revision !== input.revision) {
    throw new Error('Stale Goal action revision');
  }
  const existing = journal.find(
    (item) =>
      item.command.actionId === command.actionId && item.command.revision === command.revision,
  );
  if (existing) {
    if (JSON.stringify(existing.command) !== JSON.stringify(command)) {
      throw new Error('Goal action idempotency conflict');
    }
    return { journal, record: existing, duplicate: true };
  }
  const record: GoalWorkflowLiveActionRecord = {
    sequence: journal.length + 1,
    command,
  };
  const next = GoalWorkflowLiveActionJournalSchema.parse([...journal, record]);
  return { journal: next, record, duplicate: false };
}

/**
 * During a running step, Mastra's setState updates the engine's internal
 * state but not the externally readable workflow snapshot until the step
 * yields. Publish only a separate top-level preview; never overwrite the
 * engine-owned snapshot.value, context, step graph, or result.
 *
 * @mastra/pg and @mastra/libsql 1.70 storage domains transactionally merge
 * updateWorkflowState options and support expectedStatus CAS. This is a
 * deliberately isolated, version-pinned compatibility seam; its presence
 * and the running-time read are covered by a real storage integration test.
 * Do not replace it with full persistWorkflowSnapshot() calls.
 */
export async function publishRunningGoalActions(input: {
  storage: Pick<MastraCompositeStore, 'getStore'>;
  identityId: string;
  runId: string;
  journal: readonly GoalWorkflowLiveActionRecord[];
}): Promise<void> {
  const store = await input.storage.getStore('workflows');
  if (!store || !store.supportsConcurrentUpdates()) {
    throw new Error('Goal live action publishing requires transactional workflow storage');
  }
  const row = await store.getWorkflowRunById({ workflowName: 'goal-create', runId: input.runId });
  if (!row || row.resourceId !== input.identityId) {
    throw new Error('Goal workflow live action owner mismatch');
  }
  const snapshot =
    typeof row.snapshot === 'string' ? (JSON.parse(row.snapshot) as unknown) : row.snapshot;
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    Array.isArray(snapshot) ||
    (snapshot as Record<string, unknown>).status !== 'running'
  ) {
    throw new Error('Goal workflow is no longer running');
  }
  const previous = GoalWorkflowLiveActionJournalSchema.parse(
    (snapshot as Record<string, unknown>).goalLiveActions ?? [],
  );
  const journal = GoalWorkflowLiveActionJournalSchema.parse(input.journal);
  if (
    previous.length > journal.length ||
    JSON.stringify(previous) !== JSON.stringify(journal.slice(0, previous.length))
  ) {
    throw new Error('Goal workflow preview journal diverged');
  }
  if (previous.length === journal.length) return;
  const result = await store.updateWorkflowState({
    workflowName: 'goal-create',
    runId: input.runId,
    // Only the two pinned storage implementations support an extra top-level
    // preview field. Never use this adapter without supportsConcurrentUpdates.
    opts: {
      status: 'running',
      expectedStatus: 'running',
      goalLiveActions: journal,
    } as Parameters<typeof store.updateWorkflowState>[0]['opts'],
  });
  if (
    !result ||
    JSON.stringify((result as unknown as Record<string, unknown>).goalLiveActions) !==
      JSON.stringify(journal)
  ) {
    throw new Error('Goal workflow preview publish failed');
  }
}
