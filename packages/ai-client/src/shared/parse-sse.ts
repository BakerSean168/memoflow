/**
 * Residual 977: sole parseSSE generator for AI SSE stream consumers.
 * Client HTTP adapters (assistant/message) and server chat-execution adapter
 * import this; local duals retired.
 * Uses sole findSSEBoundary (residual 963) for CRLF/LF blank-line framing.
 */

import { findSSEBoundary } from "./find-sse-boundary";

export async function* parseSSE(
  response: Response,
): AsyncGenerator<{ event: string; data: string }, void, void> {
  if (!response.body) {
    return;
  }

  // Manual SSE parsing is used instead of EventSource because the request may be a
  // POST carrying JSON body data (better fit than the GET-only EventSource API).
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const emitBufferedEvents = function* (): Generator<
    { event: string; data: string },
    void,
    void
  > {
    while (true) {
      // An SSE event may span multiple network chunks. Keep buffering until a
      // blank-line boundary is found, then emit exactly one parsed event.
      const boundary = findSSEBoundary(buffer);
      if (!boundary) {
        break;
      }

      const rawEvent = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.length);

      let event = "message";
      const dataLines: string[] = [];
      for (const line of rawEvent.split(/\r?\n/)) {
        if (line.startsWith("event:")) {
          event = line.slice(6).trim();
          continue;
        }
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      yield {
        event,
        data: dataLines.join("\n"),
      };
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      // Residual 1333: some runtimes deliver the final chunk with done=true.
      // Decode that last value and flush framed events before exiting.
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        if (buffer.length > 1_048_576)
          throw new Error("AI SSE frame exceeds the supported size");
      }
      if (done) {
        buffer += decoder.decode();
        yield* emitBufferedEvents();
        break;
      }

      yield* emitBufferedEvents();
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
