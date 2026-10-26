import type { WorkspaceEventStreamOptions, WorkflowRuntimeClient } from '@memoflow/ai/client';
import type { WorkspaceEvent } from '@memoflow/contracts/ai';

type Listener = { receive(event: WorkspaceEvent): Promise<void>; stop(): void };
type WorkspaceEventSource = Pick<WorkflowRuntimeClient, 'streamWorkspaceEvents'>;
const subscriptions = new WeakMap<WorkspaceEventSource, WorkspaceSubscription>();

/** One authenticated transport per host client; projections own their snapshot calibration. */
class WorkspaceSubscription {
  private readonly listeners = new Set<Listener>();
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private cursor: string | undefined;
  private ready = false;
  constructor(private readonly runtime: WorkspaceEventSource) {}

  reset(): void {
    this.controller?.abort();
    clearTimeout(this.timer);
    this.timer = undefined;
    this.ready = false;
    this.cursor = undefined;
    if (!this.listeners.size) {
      this.controller = null;
      return;
    }
    const controller = new AbortController();
    this.controller = controller;
    void this.connect(controller, 0);
  }

  listen(options: WorkspaceEventStreamOptions): Promise<void> {
    if (options.signal.aborted) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let chain = Promise.resolve();
      let stopped = false;
      const listener: Listener = {
        receive: (event) => {
          const deliver = async () => {
            if (!stopped) await options.onEvent(event);
          };
          chain = chain.then(deliver, deliver);
          // Keep the projection registered for reconnect calibration. Rejection
          // propagates to the transport so it cannot ACK this cursor.
          return chain;
        },
        stop: () => {
          if (stopped) return;
          stopped = true;
          options.signal.removeEventListener('abort', listener.stop);
          this.listeners.delete(listener);
          if (!this.listeners.size) {
            this.controller?.abort();
            this.controller = null;
            clearTimeout(this.timer);
            this.timer = undefined;
            this.ready = false;
            this.cursor = undefined;
          }
          resolve();
        },
      };
      this.listeners.add(listener);
      options.signal.addEventListener('abort', listener.stop, { once: true });
      // A late consumer calibrates from a current snapshot before receiving deltas.
      if (this.ready && this.cursor)
        void listener.receive({ type: 'stream.ready', cursor: this.cursor }).catch(() => {
          // Synthetic ready has no transport callback to reject. Re-establish
          // the live/snapshot boundary for this still-active late consumer.
          if (!stopped) this.reset();
        });
      if (!this.controller) {
        const controller = new AbortController();
        this.controller = controller;
        void this.connect(controller, 0);
      }
    });
  }

  private async connect(controller: AbortController, failures: number): Promise<void> {
    const stream = this.runtime.streamWorkspaceEvents;
    if (!stream || controller.signal.aborted) return;
    try {
      await stream.call(this.runtime, {
        cursor: this.cursor,
        signal: controller.signal,
        onEvent: async (event) => {
          if (controller.signal.aborted || this.controller !== controller) return;
          if (event.type === 'stream.reset_required') {
            this.ready = false;
            this.cursor = undefined;
          }
          const delivered = new Set(this.listeners);
          await Promise.all([...delivered].map((listener) => listener.receive(event)));
          if (event.type === 'stream.ready') {
            // A consumer can join while another projection is still calibrating.
            // Deliver ready to those consumers before committing the shared cursor.
            while (true) {
              if (controller.signal.aborted || this.controller !== controller) return;
              const newlyJoined = [...this.listeners].filter(
                (listener) => !delivered.has(listener),
              );
              if (!newlyJoined.length) break;
              newlyJoined.forEach((listener) => delivered.add(listener));
              await Promise.all(newlyJoined.map((listener) => listener.receive(event)));
            }
          }
          if (controller.signal.aborted || this.controller !== controller) return;
          if (event.type === 'stream.ready') {
            this.ready = true;
            failures = 0;
          }
          if (event.type !== 'stream.reset_required') this.cursor = event.cursor;
        },
      });
    } catch {
      /* Read projections retain their authoritative state across transport loss. */
    }
    if (controller.signal.aborted || this.controller !== controller) return;
    this.ready = false;
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        void this.connect(controller, failures + 1);
      },
      Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)),
    );
  }
}

export function subscribeWorkspaceEvents(
  runtime: WorkspaceEventSource,
  options: WorkspaceEventStreamOptions,
): Promise<void> {
  if (!runtime.streamWorkspaceEvents)
    return Promise.reject(new Error('Workspace events unavailable'));
  let subscription = subscriptions.get(runtime);
  if (!subscription) {
    subscription = new WorkspaceSubscription(runtime);
    subscriptions.set(runtime, subscription);
  }
  return subscription.listen(options);
}

/** Establish a fresh live/snapshot boundary before dropping bounded projection metadata. */
export function resetWorkspaceEvents(runtime: WorkspaceEventSource): void {
  subscriptions.get(runtime)?.reset();
}
