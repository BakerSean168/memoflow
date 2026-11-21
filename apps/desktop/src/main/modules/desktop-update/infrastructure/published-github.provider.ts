import { createLogger } from '@memoflow/utils/logger';
import {
  HttpError,
  newError,
  type CustomPublishOptions,
  CancellationToken,
} from 'builder-util-runtime';
import type { OutgoingHttpHeaders } from 'node:http';
import type { AppUpdater, UpdateInfo } from 'electron-updater';
import {
  Provider,
  parseUpdateInfo,
  resolveFiles,
  type ProviderRuntimeOptions,
} from 'electron-updater/out/providers/Provider';
import { prerelease, rcompare, valid } from 'semver';
import { z } from 'zod';
import { DESKTOP_UPDATE_FEED_CONTRACT } from '../../../../../desktop-update-feed-projection.mjs';
import type { DesktopUpdateFeed } from '../application/desktop-update-engine';

const logger = createLogger('PublishedGitHubProvider');
const PAGE_SIZE = 100;
const MAX_PAGES = 3;
const MAX_METADATA_REQUESTS = 5;
const CACHE_MS = 60_000;
const RATE_LIMIT_COOLDOWN_MS = 60 * 60_000;
const assetSchema = z.object({
  name: z.string(),
  state: z.string(),
  size: z.number().int().nonnegative(),
});
const releaseSchema = z.object({
  tag_name: z.string(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: z.string().nullable(),
  name: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  assets: z.array(assetSchema),
});
const metadataSchema = z.object({
  version: z.string(),
  files: z
    .array(
      z.object({
        url: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/u),
        sha512: z.string().regex(/^[A-Za-z0-9+/]{86}==$/u),
        size: z.number().int().positive().optional(),
      }),
    )
    .min(1),
});
type GitHubRelease = z.infer<typeof releaseSchema>;
type GitHubFeed = Extract<DesktopUpdateFeed, { provider: 'github' }>;

interface PublishedUpdateInfo extends UpdateInfo {
  readonly tag: string;
  readonly assetBaseUrl: string;
}

function invalidMetadata(): Error {
  return newError('Published release metadata is invalid.', 'ERR_UPDATER_INVALID_UPDATE_INFO');
}

function uploaded(release: GitHubRelease, name: string): boolean {
  const matches = release.assets.filter((asset) => asset.name === name);
  return matches.length === 1 && matches[0].state === 'uploaded' && matches[0].size > 0;
}

/**
 * GitHub's Atom feed includes tag-only entries, including tags attached to
 * unpublished drafts. Discover published Releases instead; keep downloads,
 * checksums, signatures, differential fallback and installation in the SDK.
 *
 * The SDK HTTP executor preserves Electron's system proxy behavior. This
 * public feed never uses GH_TOKEN or a token embedded in the application.
 */
export class PublishedGitHubProvider extends Provider<PublishedUpdateInfo> {
  private readonly feed: GitHubFeed;
  private readonly apiBase: string;
  private readonly downloadBase: string;
  private readonly metadataName: string;
  private readonly primaryExtension: string;
  private cached: { expiresAt: number; info: PublishedUpdateInfo } | null = null;
  private rateLimit: { expiresAt: number; error: Error } | null = null;

  constructor(
    options: CustomPublishOptions,
    _updater: AppUpdater,
    runtime: ProviderRuntimeOptions,
  ) {
    super({ ...runtime, isUseMultipleRangeRequest: false });
    this.feed = options.github as GitHubFeed;
    if (
      !this.feed ||
      typeof this.feed.owner !== 'string' ||
      typeof this.feed.repo !== 'string' ||
      !/^[a-zA-Z0-9_.-]+$/u.test(this.feed.owner) ||
      !/^[a-zA-Z0-9_.-]+$/u.test(this.feed.repo) ||
      !['latest', 'beta', 'canary', 'nightly'].includes(this.feed.channel)
    ) {
      throw newError(
        'Invalid GitHub release source.',
        'ERR_UPDATER_INVALID_PROVIDER_CONFIGURATION',
      );
    }
    const platform = runtime.platform === 'win32' ? 'windows' : runtime.platform;
    const lane = DESKTOP_UPDATE_FEED_CONTRACT.lanes.find(
      (entry) => entry.platform === platform && entry.arch === process.arch,
    );
    if (!lane) {
      throw newError(
        'No update lane for this platform.',
        'ERR_UPDATER_INVALID_PROVIDER_CONFIGURATION',
      );
    }
    this.metadataName = lane.sourceMetadataAsset;
    this.primaryExtension = lane.primaryArtifactExtension;
    const repository = `${encodeURIComponent(this.feed.owner)}/${encodeURIComponent(this.feed.repo)}`;
    this.apiBase = `https://api.github.com/repos/${repository}/releases`;
    this.downloadBase = `https://github.com/${repository}/releases/download/`;
  }

  override async getLatestVersion(): Promise<PublishedUpdateInfo> {
    if (this.rateLimit && Date.now() < this.rateLimit.expiresAt) throw this.rateLimit.error;
    if (this.cached && Date.now() < this.cached.expiresAt) return this.cached.info;

    let selectedTag: string | null = null;
    let metadataRequests = 0;
    try {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const stable = this.feed.channel === 'latest';
        const url = new URL(
          stable ? `${this.apiBase}/latest` : `${this.apiBase}?per_page=${PAGE_SIZE}&page=${page}`,
        );
        const raw = await this.httpRequest(url, {
          Accept: 'application/vnd.github+json',
        });
        let decoded: unknown;
        try {
          decoded = JSON.parse(raw ?? '');
        } catch {
          throw invalidMetadata();
        }
        const parsed = z.array(releaseSchema).safeParse(stable ? [decoded] : decoded);
        if (!parsed.success) throw invalidMetadata();
        const candidates = parsed.data
          .filter((release) => this.isEligible(release))
          .sort((a, b) => rcompare(this.version(a), this.version(b)));
        for (const release of candidates) {
          if (++metadataRequests > MAX_METADATA_REQUESTS) {
            throw newError(
              'Published release metadata search exceeded its request budget.',
              'ERR_UPDATER_RELEASE_LOOKUP_LIMIT',
            );
          }
          selectedTag = release.tag_name;
          const info = await this.readUpdateInfo(release);
          if (info) {
            this.cached = { info, expiresAt: Date.now() + CACHE_MS };
            logger.info('Selected published Desktop update release', {
              channel: this.feed.channel,
              releaseTag: info.tag,
              metadataAsset: this.metadataName,
            });
            return info;
          }
        }
        if (stable || parsed.data.length < PAGE_SIZE) {
          throw newError(
            'No complete published release for this channel.',
            'ERR_UPDATER_NO_PUBLISHED_VERSIONS',
          );
        }
      }
      // A bounded search that cannot find a candidate is not proof of up-to-date.
      throw newError(
        'Published release search exceeded its request budget.',
        'ERR_UPDATER_RELEASE_LOOKUP_LIMIT',
      );
    } catch (error) {
      const status = error instanceof HttpError ? error.statusCode : null;
      const code =
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'ERR_UPDATER_RELEASE_REQUEST_FAILED';
      // Do not let SDK errors with raw HTTP bodies/redirect URLs reach logs.
      const safe = Object.assign(newError('Unable to resolve a published Desktop update.', code), {
        httpStatus: status,
        channel: this.feed.channel,
        releaseTag: selectedTag,
      });
      if (status === 403 || status === 429) {
        // The v6 executor does not expose response headers. One full quota
        // window avoids hammering a shared anonymous GitHub API allowance.
        this.rateLimit = {
          expiresAt: Date.now() + RATE_LIMIT_COOLDOWN_MS,
          error: safe,
        };
      }
      throw safe;
    }
  }

  override resolveFiles(info: PublishedUpdateInfo) {
    return resolveFiles(info, new URL(info.assetBaseUrl));
  }

  protected override async httpRequest(
    url: URL,
    headers?: OutgoingHttpHeaders | null,
    cancellationToken?: CancellationToken,
  ) {
    // Electron ClientRequest has no Node socket event. Cancel the SDK request
    // explicitly so stalled requests and redirects actually release resources.
    const token = new CancellationToken(cancellationToken);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      token.cancel();
    }, 15_000);
    try {
      return await this.executor.request(this.createRequestOptions(url, headers), token);
    } catch (error) {
      if (timedOut) {
        throw newError('Published release request timed out.', 'ERR_UPDATER_REQUEST_TIMEOUT');
      }
      throw error;
    } finally {
      clearTimeout(timer);
      token.dispose();
    }
  }

  private version(release: GitHubRelease): string {
    return release.tag_name.slice((this.feed.tagNamePrefix ?? 'v').length);
  }

  private isEligible(release: GitHubRelease): boolean {
    const prefix = this.feed.tagNamePrefix ?? 'v';
    if (
      release.draft ||
      !release.published_at ||
      !Number.isFinite(Date.parse(release.published_at)) ||
      !release.tag_name.startsWith(prefix) ||
      !valid(this.version(release))
    )
      return false;
    const channel = prerelease(this.version(release))?.[0];
    if (
      this.feed.channel === 'latest'
        ? release.prerelease || channel !== undefined
        : !release.prerelease || channel !== this.feed.channel
    )
      return false;
    if (
      !uploaded(release, this.metadataName) ||
      !release.assets.some(
        (asset) => asset.name.endsWith(this.primaryExtension) && uploaded(release, asset.name),
      )
    ) {
      this.logIncomplete(release);
      return false;
    }
    return true;
  }

  private async readUpdateInfo(release: GitHubRelease): Promise<PublishedUpdateInfo | null> {
    const assetBaseUrl = `${this.downloadBase}${encodeURIComponent(release.tag_name)}/`;
    const metadataUrl = new URL(this.metadataName, assetBaseUrl);
    const info = parseUpdateInfo(
      await this.httpRequest(metadataUrl),
      this.metadataName,
      metadataUrl,
    );
    const parsed = metadataSchema.safeParse(info);
    if (!parsed.success || parsed.data.version !== this.version(release)) throw invalidMetadata();
    const files = parsed.data.files;
    if (
      !files.some((file) => file.url.endsWith(this.primaryExtension)) ||
      files.some((file) => !uploaded(release, file.url))
    ) {
      this.logIncomplete(release);
      return null;
    }
    // This application ships full installers, never a separate web package.
    if ('packages' in info && info.packages) throw invalidMetadata();
    for (const file of files) {
      const asset = release.assets.find((entry) => entry.name === file.url)!;
      if (file.size !== undefined && file.size !== asset.size) throw invalidMetadata();
    }
    return {
      ...info,
      tag: release.tag_name,
      assetBaseUrl,
      releaseName: release.name ?? release.tag_name,
      releaseNotes: release.body ?? info.releaseNotes,
      releaseDate: release.published_at!,
    };
  }

  private logIncomplete(release: GitHubRelease): void {
    logger.warn('Skipped incomplete published Desktop release', {
      channel: this.feed.channel,
      releaseTag: release.tag_name,
      metadataAsset: this.metadataName,
    });
  }
}
