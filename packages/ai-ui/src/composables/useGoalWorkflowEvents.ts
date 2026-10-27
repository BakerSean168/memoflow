import { aiUiHost } from '../ai-ui-host';
import { ref, watch } from 'vue';
import {
  GoalWorkflowLiveActionJournalSchema,
  type AIWorkflowRunView,
  type WorkspaceEvent,
} from '@memoflow/ai-contracts';
import { type IWorkflowRuntimeService } from '../ai-ui-host';

type GoalRun = Extract<AIWorkflowRunView, { kind: 'goal.create' }>;

/** One Goal subscription replaces its progress timers; reads only initialize or repair a projection. */
export function useGoalWorkflowEvents(options: {
  current: () => GoalRun | null;
  runtime: IWorkflowRuntimeService;
  project: (run: GoalRun | null) => Promise<void>;
  missing?: () => void;
}) {
  const connected = ref(false);
  watch(
    () => {
      const run = options.current();
      return run && (run.status === 'running' || run.status === 'suspended')
        ? JSON.stringify([run.conversationId, run.runId])
        : null;
    },
    (key, _previous, onCleanup) => {
      connected.value = false;
      const initial = options.current();
      const stream = options.runtime.streamWorkspaceEvents;
      if (!key || !initial || !stream) return;
      const controller = new AbortController();
      let cursor: string | undefined;
      let known: GoalRun | null = null;
      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      let failures = 0;
      const active = () =>
        !controller.signal.aborted &&
        options.current()?.runId === initial.runId &&
        options.current()?.conversationId === initial.conversationId;
      onCleanup(() => {
        controller.abort();
        clearTimeout(retryTimer);
        connected.value = false;
      });
      const calibrate = async () => {
        const snapshot = await options.runtime.get({ runId: initial.runId });
        if (!active()) return;
        if (!snapshot) {
          if (options.missing) options.missing();
          else await options.project(null);
          return;
        }
        if (
          snapshot.kind !== 'goal.create' ||
          snapshot.runId !== initial.runId ||
          snapshot.conversationId !== initial.conversationId ||
          !snapshot.resourceVersion
        )
          throw new Error('Invalid Goal event snapshot');
        const waitingAfter = options.current()?.awaitAfterVersion;
        if (waitingAfter && snapshot.resourceVersion <= waitingAfter) {
          if (!known || snapshot.resourceVersion > (known.resourceVersion ?? 0)) known = snapshot;
          return;
        }
        if (known && snapshot.resourceVersion < (known.resourceVersion ?? 0)) return;
        await options.project(snapshot);
        if (active()) known = snapshot;
      };
      const receive = async (event: WorkspaceEvent) => {
        if (!active()) return;
        if (event.type === 'stream.reset_required') {
          cursor = undefined;
          known = null;
          await calibrate();
          return;
        }
        if (event.type === 'stream.ready') {
          await calibrate();
          if (!active()) return;
          connected.value = true;
          failures = 0;
          cursor = event.cursor;
          return;
        }
        if (event.type !== 'workflow.updated') {
          cursor = event.cursor;
          return;
        }
        if (
          event.data.runId !== initial.runId ||
          event.data.conversationId !== initial.conversationId ||
          event.data.kind !== 'goal.create'
        ) {
          cursor = event.cursor;
          return;
        }
        const waitingAfter = options.current()?.awaitAfterVersion;
        if (waitingAfter && event.resourceVersion <= waitingAfter) {
          cursor = event.cursor;
          return;
        }
        if (!known || event.resourceVersion > (known.resourceVersion ?? 0)) {
          if (
            !known ||
            event.resourceVersion !== (known.resourceVersion ?? 0) + 1 ||
            event.baseActionSequence !== (known.liveActions?.length ?? 0)
          ) {
            await calibrate();
            if (!active()) return;
          }
          if (known && event.resourceVersion > (known.resourceVersion ?? 0)) {
            if (
              event.resourceVersion !== (known.resourceVersion ?? 0) + 1 ||
              event.baseActionSequence !== (known.liveActions?.length ?? 0)
            )
              throw new Error('Goal event gap remains after calibration');
            const next: GoalRun = {
              ...event.data,
              liveActions: GoalWorkflowLiveActionJournalSchema.parse([
                ...(known.liveActions ?? []),
                ...event.actions,
              ]),
              ...(known.usage && !event.data.usage ? { usage: known.usage } : {}),
            };
            await options.project(next);
            if (active()) known = next;
          }
        }
        if (active()) cursor = event.cursor;
      };
      const connect = async () => {
        try {
          await aiUiHost.subscribeWorkspaceEvents(options.runtime, {
            cursor,
            signal: controller.signal,
            onEvent: receive,
          });
        } catch {
          /* Transport loss preserves the last authoritative run and the native draft. */
        }
        if (!active()) return;
        connected.value = false;
        failures += 1;
        retryTimer = setTimeout(
          () => {
            void connect();
          },
          Math.min(30_000, 1000 * 2 ** Math.min(failures - 1, 5)),
        );
      };
      void connect();
    },
    { immediate: true, flush: 'sync' },
  );
  return { connected };
}
