import { describe, expect, it } from 'vitest';
import { resolveDesktopUpdateFeed } from './desktop-update-feed';

describe('resolveDesktopUpdateFeed', () => {
  it('maps MemoFlow stable to electron-builder latest on the canonical GitHub release feed', () => {
    expect(resolveDesktopUpdateFeed('stable')).toEqual({
      provider: 'github',
      owner: 'BakerSean168',
      repo: 'memoflow',
      channel: 'latest',
      tagNamePrefix: 'v',
    });
  });

  it.each([
    ['beta', 'beta'],
    ['canary', 'canary'],
  ] as const)('maps %s to the matching release metadata channel', (productChannel, feedChannel) => {
    expect(resolveDesktopUpdateFeed(productChannel)).toMatchObject({
      provider: 'github',
      channel: feedChannel,
    });
  });
});
