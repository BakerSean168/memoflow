/**
 * Residual 963: sole findSSEBoundary helper for AI SSE stream framing.
 * Client HTTP adapters (assistant/message) and server chat-execution adapter
 * import this; local duals retired.
 * Supports both CRLF and LF blank-line boundaries used by SSE servers/proxies.
 */

export function findSSEBoundary(buffer: string): { index: number; length: number } | null {
  const crlfBoundaryIndex = buffer.indexOf('\r\n\r\n');
  if (crlfBoundaryIndex >= 0) {
    return { index: crlfBoundaryIndex, length: 4 };
  }

  const lfBoundaryIndex = buffer.indexOf('\n\n');
  if (lfBoundaryIndex >= 0) {
    return { index: lfBoundaryIndex, length: 2 };
  }

  return null;
}
