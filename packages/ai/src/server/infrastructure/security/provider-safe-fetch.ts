import type { LookupFunction } from 'node:net';
import { Agent, buildConnector, fetch as undiciFetch } from 'undici';
import type { Dispatcher } from 'undici';
import { AIExecutionError } from '../../../shared/ai-execution-error';
import {
  ProviderEndpointPolicy,
  type AuthorizedProviderConnection,
  type ProviderEndpointAddress,
} from './provider-endpoint-policy';

function normalizedHostname(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

/**
 * DNS lookup used by the real socket connector. It never performs DNS itself;
 * it can only return addresses already authorized for this exact connection.
 */
export function createPinnedLookup(authorization: AuthorizedProviderConnection): LookupFunction {
  const expectedHostname = normalizedHostname(authorization.hostname);
  const addresses = [...authorization.addresses];

  return ((hostname, options, callback) => {
    if (normalizedHostname(hostname) !== expectedHostname) {
      const error = Object.assign(new Error('Pinned provider lookup hostname mismatch'), {
        code: 'ENOTFOUND',
      });
      callback(error, '', 0);
      return;
    }

    const requestedFamily = typeof options.family === 'number' ? options.family : 0;
    const candidates = requestedFamily
      ? addresses.filter((item) => item.family === requestedFamily)
      : addresses;
    if (!candidates.length) {
      const error = Object.assign(
        new Error('Pinned provider lookup has no address for requested family'),
        {
          code: 'ENOTFOUND',
        },
      );
      callback(error, '', 0);
      return;
    }

    if (options.all) {
      callback(
        null,
        candidates.map((item) => ({ ...item })),
      );
      return;
    }
    const first = candidates[0]!;
    callback(null, first.address, first.family);
  }) as LookupFunction;
}

export function createProviderSecureConnector(
  policy: ProviderEndpointPolicy,
): ReturnType<typeof buildConnector> {
  return ((options, callback) => {
    if (options.protocol !== 'https:') {
      callback(new AIExecutionError('validation', 'Provider egress must use HTTPS'), null);
      return;
    }

    const hostname = normalizedHostname(options.hostname);
    const port = Number(options.port || '443');
    void policy
      .authorizeConnection({ hostname, port })
      .then((authorization) => {
        const connector = buildConnector({ lookup: createPinnedLookup(authorization) });
        connector(options, callback);
      })
      .catch((cause) => {
        callback(
          cause instanceof Error
            ? cause
            : new AIExecutionError('transport', 'Provider endpoint authorization failed', {
                cause,
              }),
          null,
        );
      });
  }) as ReturnType<typeof buildConnector>;
}

export interface ProviderSafeFetchOptions {
  readonly policy?: ProviderEndpointPolicy;
  readonly dispatcher?: Dispatcher;
}

/**
 * Fetch boundary for every user-configurable OpenAI-compatible endpoint.
 * Redirects are always manual and the socket connector performs DNS policy
 * enforcement at connect time, eliminating the validate-then-resolve TOCTOU.
 */
export class ProviderSafeFetch {
  private readonly policy: ProviderEndpointPolicy;
  private readonly agent: Agent;

  constructor(options: ProviderSafeFetchOptions = {}) {
    this.policy = options.policy ?? new ProviderEndpointPolicy();
    this.agent =
      options.dispatcher instanceof Agent
        ? options.dispatcher
        : new Agent({
            connect: createProviderSecureConnector(this.policy),
            maxResponseSize: 16 * 1024 * 1024,
          });
  }

  readonly fetch: typeof globalThis.fetch = async (input, init) => {
    const rawUrl =
      typeof input === 'string' || input instanceof URL
        ? String(input)
        : String((input as Request).url);
    this.policy.validateUrl(rawUrl);

    const requestInit = {
      ...(init ?? {}),
      redirect: 'manual' as const,
      dispatcher: this.agent,
    };
    return (await undiciFetch(input as never, requestInit as never)) as unknown as Response;
  };

  async close(): Promise<void> {
    await this.agent.close();
  }
}

export type ProviderFetch = typeof globalThis.fetch;
export type { ProviderEndpointAddress };
