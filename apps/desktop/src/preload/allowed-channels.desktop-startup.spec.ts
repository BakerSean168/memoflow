import { describe, expect, it } from 'vitest';
import { DesktopStartupChannels } from '@memoflow/desktop-contracts';
import { ALLOWED_CHANNELS } from './allowed-channels';

describe('startup IPC allowlist', () => {
  it('allows requests and cross-surface state notifications', () => {
    const allowed = new Set<string>(ALLOWED_CHANNELS);
    for (const channel of Object.values(DesktopStartupChannels))
      expect(allowed.has(channel)).toBe(true);
  });
});
