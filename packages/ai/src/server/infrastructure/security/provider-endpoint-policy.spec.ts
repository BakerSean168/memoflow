import { describe, expect, it, vi } from 'vitest';
import {
  parseProviderPrivateEndpointAllowlist,
  ProviderEndpointPolicy,
  type ProviderDnsResolver,
} from './provider-endpoint-policy';

function resolver(
  entries: Record<string, Array<{ address: string; family: 4 | 6 }>>,
): ProviderDnsResolver {
  return vi.fn(
    async (hostname: string) => entries[hostname] ?? [{ address: '8.8.8.8', family: 4 }],
  );
}

describe('ProviderEndpointPolicy', () => {
  it('accepts public HTTPS endpoints and returns the exact authorized addresses', async () => {
    const policy = new ProviderEndpointPolicy(
      new Set(),
      resolver({
        'public.example': [{ address: '8.8.8.8', family: 4 }],
      }),
    );

    await expect(
      policy.validate({ baseUrl: 'https://public.example/v1' }),
    ).resolves.toBeUndefined();
    await expect(
      policy.authorizeConnection({ hostname: 'public.example', port: 443 }),
    ).resolves.toMatchObject({
      hostname: 'public.example',
      port: 443,
      addresses: [{ address: '8.8.8.8', family: 4 }],
      privateAllowlisted: false,
    });
  });

  it.each([
    'http://public.example/v1',
    'https://127.0.0.1/v1',
    'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.5/v1',
    'https://metadata.google.internal/computeMetadata/v1',
    'https://private.example/v1',
  ])('rejects unsafe provider endpoint %s', async (baseUrl) => {
    const policy = new ProviderEndpointPolicy(
      new Set(),
      resolver({
        'private.example': [{ address: '10.0.0.8', family: 4 }],
      }),
    );
    await expect(policy.validate({ baseUrl })).rejects.toMatchObject({ category: 'validation' });
  });

  it('allows only an explicitly deployment-approved private host:port', async () => {
    const policy = new ProviderEndpointPolicy(new Set(['10.0.0.5:8443']), resolver({}));
    await expect(
      policy.authorizeConnection({ hostname: '10.0.0.5', port: 8443 }),
    ).resolves.toMatchObject({ privateAllowlisted: true });
    await expect(
      policy.authorizeConnection({ hostname: '10.0.0.5', port: 443 }),
    ).rejects.toMatchObject({ category: 'validation' });
  });

  it('never permits metadata/link-local targets even when an administrator allowlists them', async () => {
    const policy = new ProviderEndpointPolicy(
      new Set(['metadata.google.internal:443', '169.254.169.254:443']),
      resolver({ 'metadata.google.internal': [{ address: '169.254.169.254', family: 4 }] }),
    );
    await expect(
      policy.authorizeConnection({ hostname: 'metadata.google.internal', port: 443 }),
    ).rejects.toMatchObject({ category: 'validation' });
    await expect(
      policy.authorizeConnection({ hostname: '169.254.169.254', port: 443 }),
    ).rejects.toMatchObject({ category: 'validation' });
  });
});

describe('parseProviderPrivateEndpointAllowlist', () => {
  it('normalizes exact host:port entries and IPv6 literals', () => {
    expect([
      ...parseProviderPrivateEndpointAllowlist('localhost:11434,10.0.0.5:8443,[fd00::1]:9443'),
    ]).toEqual(['localhost:11434', '10.0.0.5:8443', '[fd00::1]:9443']);
  });

  it.each(['localhost', 'https://localhost:11434', 'localhost:11434/path', 'user@localhost:11434'])(
    'rejects malformed deployment allowlist entry %s',
    (entry) => {
      expect(() => parseProviderPrivateEndpointAllowlist(entry)).toThrow(/ALLOWLIST/);
    },
  );
});
