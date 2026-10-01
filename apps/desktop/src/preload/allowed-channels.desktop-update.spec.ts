import { describe, expect, it } from 'vitest';
import { DesktopUpdateChannels } from '@memoflow/contracts/electron';
import { ALLOWED_CHANNELS } from './allowed-channels';

describe('Desktop Update preload allow-list', () => {
  const allowed = new Set<string>(ALLOWED_CHANNELS);

  it('exposes the complete narrow Desktop Update contract', () => {
    expect(allowed.has('desktop-update:get-diagnostics')).toBe(true);
    expect(Object.values(DesktopUpdateChannels).every((channel) => allowed.has(channel))).toBe(
      true,
    );
  });

  it('does not expose the retired mutable auto-update transport', () => {
    for (const channel of [
      'auto-update:check',
      'auto-update:download',
      'auto-update:install',
      'auto-update:status',
      'auto-update:config',
    ]) {
      expect(allowed.has(channel)).toBe(false);
    }
  });
});
