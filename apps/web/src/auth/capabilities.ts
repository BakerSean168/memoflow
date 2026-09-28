export interface WebAuthCapabilities {
  github: boolean;
}

const UNAVAILABLE_CAPABILITIES: WebAuthCapabilities = Object.freeze({ github: false });
const RETRY_DELAYS_MS = [0, 300, 700, 1_500, 3_000, 5_000, 8_000, 8_000] as const;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function requestWebAuthCapabilities(): Promise<
  | { kind: 'ok'; capabilities: WebAuthCapabilities }
  | { kind: 'terminal-error' }
  | { kind: 'transient-error' }
> {
  try {
    const response = await fetch('/api/auth/capabilities', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    });

    if (!response.ok) {
      return isTransientStatus(response.status)
        ? { kind: 'transient-error' }
        : { kind: 'terminal-error' };
    }

    const payload = (await response.json()) as {
      providers?: { github?: unknown };
    };

    return {
      kind: 'ok',
      capabilities: {
        github: payload.providers?.github === true,
      },
    };
  } catch {
    return { kind: 'transient-error' };
  }
}

/**
 * Read the public authentication capabilities exposed by the current API host.
 *
 * Explicit provider disablement still fails closed immediately. Temporary host-dev
 * API restarts (network errors / 5xx / retryable gateway responses) are retried for
 * roughly 26 seconds so an auth page opened during a backend hot restart can recover
 * without requiring a manual refresh.
 */
export async function loadWebAuthCapabilities(): Promise<WebAuthCapabilities> {
  for (const delayMs of RETRY_DELAYS_MS) {
    await sleep(delayMs);
    const result = await requestWebAuthCapabilities();

    if (result.kind === 'ok') return result.capabilities;
    if (result.kind === 'terminal-error') return UNAVAILABLE_CAPABILITIES;
  }

  return UNAVAILABLE_CAPABILITIES;
}
