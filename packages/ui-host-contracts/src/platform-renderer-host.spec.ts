import { describe, expect, it, vi } from 'vitest';

describe('platform renderer host binding', () => {
  it('throws before the renderer composition root binds the base', async () => {
    vi.resetModules();
    const mod = await import('./platform-renderer-host');

    expect(() => mod.getPlatformRendererHost()).toThrow(
      '[ui-host-contracts] PlatformRendererHost is not bound',
    );
  });

  it('returns the base bound by the renderer composition root', async () => {
    vi.resetModules();
    const mod = await import('./platform-renderer-host');
    const host = Object.create(null) as mod.PlatformRendererHost;

    mod.bindPlatformRendererHost(host);

    expect(mod.getPlatformRendererHost()).toBe(host);
  });
});
