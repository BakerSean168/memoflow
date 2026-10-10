import { LocalAgentError } from '../../shared/local-agent-error';
import type { NativeAgentEvent } from './codex-driver';

/** Bounded transport events, never a native checkpoint or execution queue. */
export class NativeEventQueue implements AsyncIterable<NativeAgentEvent> {
  private readonly events: NativeAgentEvent[] = [];
  private wake?: () => void;
  private error?: Error;
  private ended = false;
  push(event: NativeAgentEvent) {
    if (this.ended || this.error) return;
    if (this.events.length >= 256)
      return this.fail(new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR'));
    this.events.push(event);
    if (event.type === 'completed' || event.type === 'cancelled') this.ended = true;
    this.wake?.();
  }
  fail(error: Error) {
    this.error ??= error;
    this.wake?.();
  }
  async *[Symbol.asyncIterator](): AsyncGenerator<NativeAgentEvent> {
    for (;;) {
      if (this.error) throw this.error;
      const event = this.events.shift();
      if (event) yield event;
      else if (this.ended) return;
      else
        await new Promise<void>((resolve) => {
          this.wake = resolve;
        });
    }
  }
}
