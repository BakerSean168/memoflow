import { describe, expect, it, vi } from 'vitest';
import type { LookupOptions } from 'node:dns';
import { createPinnedLookup } from './provider-safe-fetch';

function invokeLookup(
  lookup: ReturnType<typeof createPinnedLookup>,
  hostname: string,
  options: LookupOptions,
): Promise<{ address: string | Array<{ address: string; family: number }>; family?: number }> {
  return new Promise((resolve, reject) => {
    lookup(hostname, options, (error, address, family) => {
      if (error) reject(error);
      else resolve({ address, family });
    });
  });
}

describe('createPinnedLookup', () => {
  const authorization = {
    hostname: 'provider.example',
    port: 443,
    addresses: [
      { address: '8.8.8.8', family: 4 as const },
      { address: '2606:4700:4700::1111', family: 6 as const },
    ],
    privateAllowlisted: false,
  };

  it('returns only the DNS addresses authorized for the current socket connection', async () => {
    const lookup = createPinnedLookup(authorization);
    await expect(
      invokeLookup(lookup, 'provider.example', { all: true, verbatim: true }),
    ).resolves.toMatchObject({
      address: authorization.addresses,
    });
  });

  it('honors the socket family without performing another resolver call', async () => {
    const lookup = createPinnedLookup(authorization);
    await expect(invokeLookup(lookup, 'provider.example', { family: 4 })).resolves.toEqual({
      address: '8.8.8.8',
      family: 4,
    });
  });

  it('fails closed if the connector asks for a different hostname', async () => {
    const lookup = createPinnedLookup(authorization);
    await expect(invokeLookup(lookup, 'rebound.internal', { family: 4 })).rejects.toMatchObject({
      code: 'ENOTFOUND',
    });
  });
});
