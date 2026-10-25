import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { LookupAddress } from 'node:dns';
import { AIExecutionError } from '../../../shared/ai-execution-error';
import type {
  IAIProviderEndpointPolicyPort,
  ProviderEndpointValidationInput,
} from '../../application/ports/provider-endpoint-policy.port';

const NEVER_ALLOW_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.google.com',
  'instance-data.ec2.internal',
]);

export type ProviderEndpointAddress = Readonly<Pick<LookupAddress, 'address' | 'family'>>;

export type ProviderDnsResolver = (hostname: string) => Promise<readonly ProviderEndpointAddress[]>;

export interface AuthorizedProviderConnection {
  readonly hostname: string;
  readonly port: number;
  readonly addresses: readonly ProviderEndpointAddress[];
  readonly privateAllowlisted: boolean;
}

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

function normalizeHostPort(hostname: string, port: number): string {
  const normalized = normalizeHostname(hostname);
  return normalized.includes(':') ? `[${normalized}]:${port}` : `${normalized}:${port}`;
}

export function parseProviderPrivateEndpointAllowlist(
  value: string | undefined,
): ReadonlySet<string> {
  if (!value?.trim()) return new Set();
  const entries = new Set<string>();
  for (const raw of value.split(',')) {
    const candidate = raw.trim();
    if (!candidate) continue;
    let parsed: URL;
    try {
      parsed = new URL(`https://${candidate}`);
    } catch {
      throw new Error(`Invalid AI_PROVIDER_PRIVATE_ENDPOINT_ALLOWLIST entry: ${candidate}`);
    }
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      !parsed.port
    ) {
      throw new Error(
        `AI_PROVIDER_PRIVATE_ENDPOINT_ALLOWLIST entries must be exact host:port values: ${candidate}`,
      );
    }
    entries.add(normalizeHostPort(parsed.hostname, Number(parsed.port)));
  }
  return entries;
}

const defaultResolver: ProviderDnsResolver = async (hostname) =>
  lookup(hostname, { all: true, verbatim: true }) as Promise<ProviderEndpointAddress[]>;

/**
 * Authorizes user-controlled provider egress.
 *
 * `validate()` is useful for early UX feedback. `authorizeConnection()` is the
 * security-critical method used by the actual Undici connector immediately
 * before TCP/TLS connect so DNS validation and connection use the same resolved
 * addresses rather than two independent lookups.
 */
export class ProviderEndpointPolicy implements IAIProviderEndpointPolicyPort {
  constructor(
    private readonly allowedPrivateHostPorts: ReadonlySet<string> = parseProviderPrivateEndpointAllowlist(
      process.env.AI_PROVIDER_PRIVATE_ENDPOINT_ALLOWLIST,
    ),
    private readonly resolver: ProviderDnsResolver = defaultResolver,
  ) {}

  validateUrl(baseUrl: string): URL {
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw invalidEndpoint('Provider Base URL is invalid');
    }
    if (url.protocol !== 'https:') {
      throw invalidEndpoint('Provider Base URL must use HTTPS');
    }
    if (url.username || url.password) {
      throw invalidEndpoint('Provider Base URL must not contain credentials');
    }
    return url;
  }

  async validate(input: ProviderEndpointValidationInput): Promise<void> {
    const url = this.validateUrl(input.baseUrl);
    await this.authorizeConnection({
      hostname: url.hostname,
      port: Number(url.port || '443'),
    });
  }

  async authorizeConnection(input: {
    readonly hostname: string;
    readonly port: number;
  }): Promise<AuthorizedProviderConnection> {
    const hostname = normalizeHostname(input.hostname);
    const port = input.port || 443;
    const hostPort = normalizeHostPort(hostname, port);
    const privateAllowlisted = this.allowedPrivateHostPorts.has(hostPort);

    if (NEVER_ALLOW_HOSTS.has(hostname)) {
      throw invalidEndpoint('Provider endpoint resolves to a forbidden metadata host');
    }

    const literalFamily = isIP(hostname);
    const addresses: readonly ProviderEndpointAddress[] = literalFamily
      ? [{ address: hostname, family: literalFamily }]
      : await this.resolveHostname(hostname);

    if (!addresses.length) {
      throw new AIExecutionError('transport', 'Provider endpoint DNS returned no addresses');
    }

    for (const { address } of addresses) {
      if (isNeverAllowedAddress(address)) {
        throw invalidEndpoint(
          'Provider endpoint resolves to a forbidden link-local or metadata address',
        );
      }
      if (!privateAllowlisted && !isPublicAddress(address)) {
        throw invalidEndpoint('Provider endpoint DNS resolves to a non-public address');
      }
    }

    return { hostname, port, addresses, privateAllowlisted };
  }

  private async resolveHostname(hostname: string): Promise<readonly ProviderEndpointAddress[]> {
    try {
      return await this.resolver(hostname);
    } catch (error) {
      throw new AIExecutionError('transport', 'Provider endpoint DNS resolution failed', {
        cause: error,
      });
    }
  }
}

function invalidEndpoint(message: string): AIExecutionError {
  return new AIExecutionError('validation', message);
}

function isNeverAllowedAddress(address: string): boolean {
  const value = normalizeHostname(address);
  if (value === '169.254.169.254') return true;
  if (value.includes(':')) {
    return /^fe[89ab]/i.test(value);
  }
  const parts = value.split('.').map(Number);
  return parts.length === 4 && parts[0] === 169 && parts[1] === 254;
}

function isPublicAddress(address: string): boolean {
  const value = normalizeHostname(address);
  if (value.includes(':')) return isPublicIpv6(value);
  const parts = value.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const value = address.toLowerCase();
  if (value === '::' || value === '::1') return false;
  if (/^fe[89ab]/i.test(value)) return false;
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('ff')) return false;
  if (value.startsWith('2001:db8:')) return false;
  if (value.startsWith('::ffff:')) return isPublicAddress(value.slice('::ffff:'.length));
  return true;
}
