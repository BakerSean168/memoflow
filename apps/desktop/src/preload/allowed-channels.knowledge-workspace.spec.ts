import { describe, expect, it } from 'vitest';
import * as desktopContracts from '@memoflow/desktop-contracts';
import { RelationChannels, RepositoryChannels } from '@memoflow/desktop-contracts';
import { ALLOWED_CHANNELS } from './allowed-channels';

const allowed = new Set<string>(ALLOWED_CHANNELS);

/**
 * Channels defined for Main but deliberately unreachable from the renderer:
 * debug-only memory instrumentation and the main-process IPC cache diagnostics
 * (the renderer reads cache stats through `SystemChannels.GET_IPC_CACHE_STATS`).
 */
const MAIN_ONLY_CHANNELS = new Set<string>([
  ...Object.values(desktopContracts.CacheChannels),
  ...Object.values(desktopContracts.DevChannels),
]);

/** Knowledge repository sync channels are HTTP-owned; Main registers no handler. */
const HTTP_OWNED_REPOSITORY_PREFIXES = [
  'repository:knowledge-connection:',
  'repository:knowledge-write-request:',
] as const;

function isHttpOwnedRepositoryChannel(channel: string) {
  return HTTP_OWNED_REPOSITORY_PREFIXES.some((prefix) => channel.startsWith(prefix));
}

describe('Knowledge workspace bridge', () => {
  it('allows the local read-only Git observation channel', () => {
    expect(ALLOWED_CHANNELS).toContain(RepositoryChannels.LOCAL_VAULT_GIT_CHANGES);
  });

  it('allows every Goal↔Knowledge relation channel', () => {
    for (const channel of Object.values(RelationChannels))
      expect(allowed.has(channel), channel).toBe(true);
  });

  it('allows every contract channel that is not a Main-only or HTTP-owned surface', () => {
    const groups = Object.entries(desktopContracts).filter(
      ([name, value]) => name.endsWith('Channels') && typeof value === 'object' && value !== null,
    ) as [string, Record<string, string>][];
    const uncovered = groups.flatMap(([, group]) =>
      Object.values(group).filter(
        (channel) =>
          !allowed.has(channel) &&
          !MAIN_ONLY_CHANNELS.has(channel) &&
          !isHttpOwnedRepositoryChannel(channel),
      ),
    );
    expect(uncovered).toEqual([]);
  });
});
