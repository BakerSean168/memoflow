import { describe, expect, it } from 'vitest';
import { SyncStatusChannels } from '@memoflow/desktop-contracts';
import { ALLOWED_CHANNELS } from './allowed-channels';

describe('sync status preload allow-list', () => {
  it('allows every sanitized sync status channel', () => {
    const allowed = new Set<string>(ALLOWED_CHANNELS);
    expect(Object.values(SyncStatusChannels).every((channel) => allowed.has(channel))).toBe(true);
  });
});
