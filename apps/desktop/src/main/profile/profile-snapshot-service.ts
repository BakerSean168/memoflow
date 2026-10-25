import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '@memoflow/utils/logger';
import type { SharedPathResolver, ProfilePathResolver } from '../paths';
import type { ProfileDescriptor } from './profile-registry';
import { createApiUrl, getApiBaseUrl } from '../utils/api-config';

const logger = createLogger('ProfileSnapshotService');
const SQLITE_HEADER = Buffer.from('SQLite format 3\u0000', 'utf8');

export interface ProfileSnapshotManifest {
  available: boolean;
  version: string | null;
  downloadUrl: string | null;
  checksumSha256: string | null;
  generatedAt: string | null;
}

export interface LocalProfileSnapshotMetadata {
  profileId: string;
  identityId: string;
  version: string | null;
  checksumSha256: string | null;
  generatedAt: string | null;
  hydratedAt: number;
  sourceUrl: string;
  fileSize: number;
}

export interface HydrateSnapshotResult {
  hydrated: boolean;
  skippedReason: string | null;
  metadata: LocalProfileSnapshotMetadata | null;
}

interface SnapshotManifestEnvelope {
  ok?: boolean;
  data?: Record<string, unknown>;
  message?: string;
}

export class ProfileSnapshotService {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async hydrateIfNeeded(input: {
    sharedResolver: SharedPathResolver;
    profileResolver: ProfilePathResolver;
    descriptor: ProfileDescriptor;
    accessToken: string | null | undefined;
  }): Promise<HydrateSnapshotResult> {
    const { sharedResolver, profileResolver, descriptor, accessToken } = input;

    if (fs.existsSync(profileResolver.dbPath)) {
      return { hydrated: false, skippedReason: 'local-db-exists', metadata: null };
    }

    if (!accessToken) {
      return { hydrated: false, skippedReason: 'missing-access-token', metadata: null };
    }

    const manifest = await this.fetchManifest(accessToken);
    if (!manifest.available || !manifest.downloadUrl) {
      return { hydrated: false, skippedReason: 'snapshot-unavailable', metadata: null };
    }

    const stagingDir = path.join(sharedResolver.snapshotStagingDir, descriptor.profileId);
    await fs.promises.mkdir(stagingDir, { recursive: true });

    const stagingDownloadPath = path.join(stagingDir, 'powersync.sqlite.download');
    const targetTempPath = `${profileResolver.dbPath}.importing`;
    const targetMetaTempPath = `${profileResolver.snapshotMetaPath}.tmp`;
    const downloadUrl = this.resolveDownloadUrl(manifest.downloadUrl);

    try {
      const buffer = await this.downloadSnapshot(downloadUrl, accessToken);
      this.validateSnapshotBuffer(buffer, manifest.checksumSha256);

      await fs.promises.writeFile(stagingDownloadPath, buffer);
      await fs.promises.mkdir(profileResolver.dbDir, { recursive: true });
      await fs.promises.rename(stagingDownloadPath, targetTempPath);
      await fs.promises.rename(targetTempPath, profileResolver.dbPath);

      const metadata: LocalProfileSnapshotMetadata = {
        profileId: descriptor.profileId,
        identityId: descriptor.localOwnerId,
        version: manifest.version,
        checksumSha256: manifest.checksumSha256,
        generatedAt: manifest.generatedAt,
        hydratedAt: Date.now(),
        sourceUrl: downloadUrl,
        fileSize: buffer.byteLength,
      };

      await fs.promises.writeFile(targetMetaTempPath, JSON.stringify(metadata, null, 2), 'utf8');
      await fs.promises.rename(targetMetaTempPath, profileResolver.snapshotMetaPath);

      logger.info('Profile snapshot hydrated', {
        profileId: descriptor.profileId,
        version: manifest.version,
        fileSize: metadata.fileSize,
      });

      return {
        hydrated: true,
        skippedReason: null,
        metadata,
      };
    } catch (error) {
      logger.warn('Profile snapshot hydration failed; falling back to empty local db', {
        error,
        profileId: descriptor.profileId,
      });

      await Promise.allSettled([
        fs.promises.rm(stagingDownloadPath, { force: true }),
        fs.promises.rm(targetTempPath, { force: true }),
        fs.promises.rm(targetMetaTempPath, { force: true }),
      ]);

      return {
        hydrated: false,
        skippedReason: error instanceof Error ? error.message : 'snapshot-hydration-failed',
        metadata: null,
      };
    }
  }

  private async fetchManifest(accessToken: string): Promise<ProfileSnapshotManifest> {
    const response = await this.fetchImpl(createApiUrl('/powersync/profile-snapshot'), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      logger.info('Profile snapshot manifest unavailable', { status: response.status });
      return {
        available: false,
        version: null,
        downloadUrl: null,
        checksumSha256: null,
        generatedAt: null,
      };
    }

    const payload = (await response.json()) as SnapshotManifestEnvelope | Record<string, unknown>;
    // First-party snapshot API must use HttpResponse data envelope (no raw dual-track body).
    if (!('data' in payload) || !payload.data || typeof payload.data !== 'object') {
      logger.info('Profile snapshot manifest missing data envelope');
      return {
        available: false,
        version: null,
        downloadUrl: null,
        checksumSha256: null,
        generatedAt: null,
      };
    }
    const data = this.toRecord(payload.data);

    const available = this.readBoolean(data, ['available', 'hasSnapshot'], false);
    const downloadUrl = this.readString(data, ['downloadUrl', 'url', 'download_path']);
    const version = this.readString(data, ['version', 'snapshotVersion']);
    const checksumSha256 = this.readString(data, ['checksumSha256', 'sha256', 'checksum', 'hash']);
    const generatedAt = this.readString(data, ['generatedAt', 'createdAt']);

    return {
      available,
      version,
      downloadUrl,
      checksumSha256,
      generatedAt,
    };
  }

  private async downloadSnapshot(downloadUrl: string, accessToken: string): Promise<Buffer> {
    const response = await this.fetchImpl(downloadUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`snapshot-download-failed:${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private validateSnapshotBuffer(buffer: Buffer, checksumSha256: string | null): void {
    if (buffer.byteLength < SQLITE_HEADER.byteLength) {
      throw new Error('snapshot-buffer-too-small');
    }

    if (!buffer.subarray(0, SQLITE_HEADER.byteLength).equals(SQLITE_HEADER)) {
      throw new Error('snapshot-invalid-sqlite-header');
    }

    if (checksumSha256) {
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      if (hash !== checksumSha256.toLowerCase()) {
        throw new Error('snapshot-checksum-mismatch');
      }
    }
  }

  private resolveDownloadUrl(downloadUrl: string): string {
    return new URL(downloadUrl, `${getApiBaseUrl()}/`).toString();
  }

  private readBoolean(
    payload: Record<string, unknown>,
    keys: string[],
    fallback: boolean,
  ): boolean {
    for (const key of keys) {
      if (typeof payload[key] === 'boolean') {
        return payload[key] as boolean;
      }
    }
    return fallback;
  }

  private readString(payload: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
    return null;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  }
}
