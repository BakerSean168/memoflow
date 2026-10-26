import { describe, expect, it } from 'vitest';
import {
  resolveDesktopUpdateFeed,
  resolveDesktopUpdateChannelForVersion,
} from './desktop-update-feed';

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
    ['nightly', 'nightly'],
  ] as const)('maps %s to the matching release metadata channel', (productChannel, feedChannel) => {
    expect(resolveDesktopUpdateFeed(productChannel)).toMatchObject({
      provider: 'github',
      channel: feedChannel,
    });
  });
});

describe('installed version update channel', () => {
  it('keeps an installed Nightly on its isolated GitHub prerelease channel', () => {
    expect(resolveDesktopUpdateChannelForVersion('1.2.3-nightly.20261026.17')).toBe('nightly');
  });
  it.each([
    '1.2.3',
    '1.2.3-beta.1',
    '1.2.3-nightly',
    'garbage-nightly.20261026.1',
    '1.2.3-nightly.20261026.1-extra',
  ])('does not opt %s into the Nightly channel', (version) => {
    expect(resolveDesktopUpdateChannelForVersion(version)).toBe('stable');
  });
});
