import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici';

/**
 * @powersync/node creates an EnvHttpProxyAgent from its own undici package but
 * uses Node/Electron's global fetch. Those two undici versions can implement
 * incompatible Dispatcher hooks (UND_ERR_INVALID_ARG: invalid onRequestStart).
 *
 * Keep fetch AND its dispatcher on the same undici implementation.
 * The SDK still owns retries, auth and the HTTP sync-stream protocol.
 */
let httpAgent: EnvHttpProxyAgent | null = null;

function proxyFor(protocol: 'http' | 'https'): string | undefined {
  return (
    process.env[`${protocol}_proxy`] ??
    process.env[`${protocol.toUpperCase()}_PROXY`] ??
    process.env.all_proxy ??
    process.env.ALL_PROXY
  );
}

function getAgent(): EnvHttpProxyAgent {
  httpAgent ??= new EnvHttpProxyAgent({
    httpProxy: proxyFor('http'),
    httpsProxy: proxyFor('https'),
  });
  return httpAgent;
}

/** Compatible with NodeRemoteOptions.customFetch, including the streaming body. */
export const powerSyncHttpFetch: typeof fetch = (input, init) => {
  return undiciFetch(input as unknown as Parameters<typeof undiciFetch>[0], {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: getAgent(),
  }) as unknown as Promise<Response>;
};

/** Called only after the Profile SDK has disconnected and its DB has closed. */
export async function closePowerSyncHttpTransport(): Promise<void> {
  const agent = httpAgent;
  httpAgent = null;
  await agent?.close();
}
