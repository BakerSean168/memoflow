import { watch } from 'vue';
import type { AIWorkflowRunView } from '@memoflow/contracts/ai';
import type { IWorkflowRuntimeService } from '../../../di/types';

export type WorkflowReadStopReason = 'missing' | 'invalid' | 'unavailable';

/** Reconcile a durable pointer; a failed read never changes server-owned run state. */
export function useAIWorkflowReconciliation(options: {
  current: () => AIWorkflowRunView | null;
  get: IWorkflowRuntimeService['get'];
  project: (run: AIWorkflowRunView) => Promise<void>;
  stopped: (run: AIWorkflowRunView, reason: WorkflowReadStopReason) => void;
}): void {
  watch(
    options.current,
    (run, _previous, onCleanup) => {
      if (!run || run.status !== 'running') return;
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let delayMs = 500;
      let failures = 0;
      onCleanup(() => {
        cancelled = true;
        clearTimeout(timer);
      });
      const schedule = () => {
        if (!cancelled) timer = setTimeout(() => void poll(), delayMs);
      };
      const stop = (reason: WorkflowReadStopReason) => {
        cancelled = true;
        options.stopped(run, reason);
      };
      const poll = async () => {
        try {
          const next = await options.get({ runId: run.runId });
          if (cancelled) return;
          if (!next) return stop('missing');
          if (
            next.runId !== run.runId ||
            next.conversationId !== run.conversationId ||
            next.kind !== run.kind
          )
            return stop('invalid');
          if (next.status !== 'running') {
            await options.project(next);
            return;
          }
          failures = 0;
        } catch {
          if (cancelled) return;
          if (++failures >= 5) return stop('unavailable');
        }
        delayMs = Math.min(Math.ceil(delayMs * 1.5), 2_000);
        schedule();
      };
      schedule();
    },
    { immediate: true, flush: 'sync' },
  );
}
