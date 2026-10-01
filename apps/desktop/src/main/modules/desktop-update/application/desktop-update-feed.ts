import type { DesktopUpdateChannelDTO } from '@memoflow/contracts/electron';
import releaseConfig from '../../../../../desktop-update-release.json';
import type { DesktopUpdateFeed } from './desktop-update-engine';

interface DesktopUpdateReleaseConfig {
  readonly provider: 'github';
  readonly owner: string;
  readonly repo: string;
  readonly tagNamePrefix: string;
  readonly channels: Readonly<Record<DesktopUpdateChannelDTO, string>>;
}

function assertReleaseConfig(value: unknown): asserts value is DesktopUpdateReleaseConfig {
  if (!value || typeof value !== 'object') {
    throw new Error('Desktop Update release configuration is missing');
  }
  const config = value as Partial<DesktopUpdateReleaseConfig>;
  if (
    config.provider !== 'github' ||
    typeof config.owner !== 'string' ||
    config.owner.length === 0 ||
    typeof config.repo !== 'string' ||
    config.repo.length === 0 ||
    typeof config.tagNamePrefix !== 'string' ||
    !config.channels ||
    typeof config.channels.stable !== 'string' ||
    typeof config.channels.beta !== 'string' ||
    typeof config.channels.canary !== 'string'
  ) {
    throw new Error('Desktop Update release configuration is invalid');
  }
}

/**
 * MemoFlow-owned feed resolver.
 *
 * Runtime update discovery is explicit and independent from electron-builder's
 * generated app-update.yml. CI verifies that builder publishing configuration
 * stays aligned with this source of truth.
 */
export function resolveDesktopUpdateFeed(channel: DesktopUpdateChannelDTO): DesktopUpdateFeed {
  assertReleaseConfig(releaseConfig);

  return Object.freeze({
    provider: 'github',
    owner: releaseConfig.owner,
    repo: releaseConfig.repo,
    channel: releaseConfig.channels[channel],
    tagNamePrefix: releaseConfig.tagNamePrefix,
  });
}
