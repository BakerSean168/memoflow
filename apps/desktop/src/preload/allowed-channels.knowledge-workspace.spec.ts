import { describe, expect, it } from 'vitest';
import { RepositoryChannels } from '@memoflow/desktop-contracts';
import { ALLOWED_CHANNELS } from './allowed-channels';

describe('Knowledge workspace bridge', () => {
  it('allows the local read-only Git observation channel', () => {
    expect(ALLOWED_CHANNELS).toContain(RepositoryChannels.LOCAL_VAULT_GIT_CHANGES);
  });
});
