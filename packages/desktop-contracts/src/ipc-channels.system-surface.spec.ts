import { describe, expect, it } from 'vitest';
import { SystemChannels } from './ipc-channels';

describe('SystemChannels surface', () => {
  it('does not expose retired lazy-module diagnostics channels', () => {
    expect(SystemChannels).not.toHaveProperty('GET_LAZY_MODULE_STATS');
    expect(Object.values(SystemChannels)).not.toContain('system:getLazyModuleStats');
  });

  it('keeps the active system utility channels', () => {
    expect(SystemChannels.GET_APP_VERSION).toBe('system:getAppVersion');
    expect(SystemChannels.GET_MEMORY_USAGE).toBe('system:getMemoryUsage');
    expect(SystemChannels.GET_IPC_CACHE_STATS).toBe('system:getIpcCacheStats');
    expect(SystemChannels.OPEN_EXTERNAL_URL).toBe('system:openExternalUrl');
  });
});
