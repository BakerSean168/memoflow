import fs from 'node:fs';
import crypto from 'node:crypto';
import type { SharedPathResolver } from '../paths';
import { computeProfileId } from '../paths';
import { IdentityId } from '@memoflow/domain-shared';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('ProfileRegistry');

export interface ProfileDescriptor {
  profileId: string;
  profileKind: 'guest' | 'registered';
  localOwnerId: string;
  displayName: string;
  avatarSeed: string;
  keyEnvelopeId: string;
  identifier: string | null;
  cloudBinding: CloudBinding | null;
  lastActiveAt: number;
  createdAt: number;
  hasSnapshot: boolean;
  lastSnapshotVersion: string | null;
  lastSnapshotHydratedAt: number | null;
  status: 'pending' | 'ready' | 'error';
}

export interface CloudBinding {
  cloudAccountId: string;
  boundAt: number;
  lastValidatedAt: number | null;
}

interface RegistryFile {
  version: number;
  activeProfileId: string | null;
  profiles: ProfileDescriptor[];
}

const EMPTY_REGISTRY: RegistryFile = {
  version: 2,
  activeProfileId: null,
  profiles: [],
};

function assertProfileDescriptor(value: unknown): asserts value is ProfileDescriptor {
  if (!value || typeof value !== 'object') throw new Error('Invalid Profile descriptor');
  const profile = value as Record<string, unknown>;
  const requiredStrings = [
    'profileId',
    'localOwnerId',
    'displayName',
    'avatarSeed',
    'keyEnvelopeId',
  ];
  if (requiredStrings.some((key) => typeof profile[key] !== 'string' || profile[key] === '')) {
    throw new Error('Invalid Profile descriptor');
  }
  if (profile.profileKind !== 'guest' && profile.profileKind !== 'registered') {
    throw new Error('Invalid Profile kind');
  }
  if (profile.profileKind === 'guest' && profile.cloudBinding !== null) {
    throw new Error('Guest Profile cannot have a cloud binding');
  }
  if (
    profile.profileKind === 'registered' &&
    (!profile.cloudBinding || typeof profile.cloudBinding !== 'object')
  ) {
    throw new Error('Registered Profile requires a cloud binding');
  }
  if (typeof profile.lastActiveAt !== 'number' || typeof profile.createdAt !== 'number') {
    throw new Error('Invalid Profile timestamps');
  }
  if (typeof profile.hasSnapshot !== 'boolean') throw new Error('Invalid Profile snapshot state');
  if (profile.status !== 'pending' && profile.status !== 'ready' && profile.status !== 'error') {
    throw new Error('Invalid Profile status');
  }
}

/**
 * Manages the profile registry at shared/profiles/registry.json.
 */
export class ProfileRegistry {
  private readonly registryPath: string;
  private readonly registryDir: string;
  private cached: RegistryFile | null = null;
  private loadPromise: Promise<RegistryFile> | null = null;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(private readonly sharedResolver: SharedPathResolver) {
    this.registryPath = sharedResolver.registryPath;
    this.registryDir = sharedResolver.profilesRegistryDir;
  }

  /**
   * Load and cache the registry file. Creates it if absent.
   * Concurrent calls await the same in-flight load to prevent races.
   */
  async load(): Promise<RegistryFile> {
    if (this.cached) return this.cached;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.doLoad();

    try {
      return await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  private async doLoad(): Promise<RegistryFile> {
    try {
      const raw = await fs.promises.readFile(this.registryPath, 'utf-8');
      const parsed = JSON.parse(raw) as RegistryFile;
      if (parsed.version !== EMPTY_REGISTRY.version) {
        throw new Error(`Unsupported Profile registry version: ${String(parsed.version)}`);
      }
      if (!Array.isArray(parsed.profiles)) throw new Error('Invalid Profile registry');
      parsed.profiles.forEach(assertProfileDescriptor);
      this.cached = {
        version: parsed.version,
        activeProfileId: parsed.activeProfileId ?? null,
        profiles: parsed.profiles,
      };
    } catch (err: unknown) {
      if (err instanceof SyntaxError) {
        // JSON is corrupt — backup and start fresh
        logger.error('Registry JSON is corrupt, backing up and resetting', { error: err });
        await this.backupCorruptFile();
      } else if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        // File doesn't exist — start fresh (expected on first run)
        logger.debug('Registry file not found, creating empty registry');
      } else {
        // Other errors (EPERM, EACCES, etc.) — re-throw to avoid overwriting valid data
        logger.error('Failed to read registry file', { error: err });
        throw err;
      }
      const initial = { ...EMPTY_REGISTRY, profiles: [] };
      await this.persist(initial);
      this.cached = initial;
    }

    return this.cached!;
  }

  /**
   * Backup a corrupt registry file before resetting.
   */
  private async backupCorruptFile(): Promise<void> {
    try {
      const backupPath = `${this.registryPath}.corrupt.${Date.now()}`;
      await fs.promises.copyFile(this.registryPath, backupPath);
      logger.info('Corrupt registry backed up', { backupPath });
    } catch (err) {
      logger.warn('Failed to backup corrupt registry file', { error: err });
    }
  }

  /**
   * List all profiles sorted by lastActiveAt descending.
   */
  async list(): Promise<ProfileDescriptor[]> {
    const data = await this.load();
    return [...data.profiles].sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  /**
   * Find a profile by identityId.
   */
  async findByOwnerId(localOwnerId: string): Promise<ProfileDescriptor | null> {
    const data = await this.load();
    return data.profiles.find((p) => p.localOwnerId === localOwnerId) ?? null;
  }

  async findByCloudAccountId(cloudAccountId: string): Promise<ProfileDescriptor | null> {
    const data = await this.load();
    return (
      data.profiles.find((profile) => profile.cloudBinding?.cloudAccountId === cloudAccountId) ??
      null
    );
  }

  async updateProfileMetadata(
    profileId: string,
    patch: Partial<Pick<ProfileDescriptor, 'displayName' | 'avatarSeed' | 'identifier'>>,
  ): Promise<ProfileDescriptor> {
    return this.mutate((data) => {
      const profile = data.profiles.find((entry) => entry.profileId === profileId);
      if (!profile) throw new Error(`Profile not found: ${profileId}`);
      Object.assign(profile, patch);
      return profile;
    });
  }

  async findByIdentifier(identifier: string): Promise<ProfileDescriptor | null> {
    const normalized = identifier.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const data = await this.load();
    const profile =
      data.profiles.find((p) => p.identifier?.trim().toLowerCase() === normalized) ?? null;
    return profile;
  }

  /**
   * Register a new profile. If one already exists for this identityId, returns it.
   */
  async register(
    cloudAccountId: string,
    displayName: string,
    identifier?: string | null,
  ): Promise<ProfileDescriptor> {
    return this.mutate((data) => {
      const normalizedIdentifier = identifier?.trim().toLowerCase() || null;

      const existing = data.profiles.find((p) => p.cloudBinding?.cloudAccountId === cloudAccountId);
      if (existing) {
        existing.identifier = normalizedIdentifier;
        return existing;
      }

      const now = Date.now();
      const descriptor: ProfileDescriptor = {
        profileId: computeProfileId(cloudAccountId),
        profileKind: 'registered',
        localOwnerId: cloudAccountId,
        displayName,
        avatarSeed: crypto.randomUUID(),
        keyEnvelopeId: computeProfileId(cloudAccountId),
        identifier: normalizedIdentifier,
        cloudBinding: { cloudAccountId, boundAt: now, lastValidatedAt: null },
        lastActiveAt: now,
        createdAt: now,
        hasSnapshot: false,
        lastSnapshotVersion: null,
        lastSnapshotHydratedAt: null,
        status: 'pending',
      };

      data.profiles.push(descriptor);

      logger.info('Profile registered', { profileId: descriptor.profileId, cloudAccountId });
      return descriptor;
    });
  }

  /** Explicit creation is idempotent per request, separate from startup fallback. */
  async createGuest(requestId: string, displayName?: string): Promise<ProfileDescriptor> {
    if (!requestId.trim()) throw new Error('Profile creation request ID is required');
    const profileId = computeProfileId(`guest:${requestId}`);
    return this.mutate((data) => {
      const existing = data.profiles.find((profile) => profile.profileId === profileId);
      if (existing) {
        if (existing.profileKind !== 'guest') throw new Error('Profile identity conflict');
        return existing;
      }
      return this.addGuest(data, profileId, displayName);
    });
  }

  /** Startup fallback; explicit creation must use createGuest. */
  async ensureGuest(): Promise<ProfileDescriptor> {
    return this.mutate((data) => {
      const existing = data.profiles.find((profile) => profile.profileKind === 'guest');
      return existing ?? this.addGuest(data, `p_${crypto.randomBytes(12).toString('hex')}`);
    });
  }

  private addGuest(data: RegistryFile, profileId: string, displayName?: string): ProfileDescriptor {
    const now = Date.now();
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const localOwnerId = IdentityId.generate();
    const descriptor: ProfileDescriptor = {
      profileId,
      profileKind: 'guest',
      localOwnerId,
      displayName: displayName?.trim() || `访客 ${suffix}`,
      avatarSeed: crypto.randomUUID(),
      keyEnvelopeId: `key_${crypto.randomUUID().replace(/-/g, '')}`,
      identifier: null,
      cloudBinding: null,
      lastActiveAt: now,
      createdAt: now,
      hasSnapshot: false,
      lastSnapshotVersion: null,
      lastSnapshotHydratedAt: null,
      status: 'pending',
    };
    data.profiles.push(descriptor);
    return descriptor;
  }

  /**
   * Remove a profile entry from the registry.
   * Does NOT delete the profile directory — caller is responsible for that.
   */
  async remove(profileId: string): Promise<void> {
    return this.mutate((data) => {
      const index = data.profiles.findIndex((p) => p.profileId === profileId);
      if (index === -1) return;

      data.profiles.splice(index, 1);

      if (data.activeProfileId === profileId) {
        data.activeProfileId = null;
      }

      logger.info('Profile removed from registry', { profileId });
    });
  }

  /**
   * Set the active profile ID. Validates that the profile exists.
   */
  async setActiveProfile(profileId: string | null): Promise<void> {
    return this.mutate((data) => {
      if (profileId !== null) {
        const exists = data.profiles.some((p) => p.profileId === profileId);
        if (!exists) {
          throw new Error(`Profile not found: ${profileId}`);
        }
      }

      data.activeProfileId = profileId;
    });
  }

  /**
   * Get the active profile ID.
   */
  async getActiveProfileId(): Promise<string | null> {
    const data = await this.load();
    return data.activeProfileId;
  }

  /**
   * Update lastActiveAt for a profile.
   */
  async touch(profileId: string): Promise<void> {
    return this.mutate((data) => {
      const profile = data.profiles.find((p) => p.profileId === profileId);
      if (!profile) return;

      profile.lastActiveAt = Date.now();
    });
  }

  async markReady(profileId: string): Promise<void> {
    await this.updateProfile(profileId, { status: 'ready' });
  }

  async markError(profileId: string): Promise<void> {
    await this.updateProfile(profileId, { status: 'error' });
  }

  async recordSnapshotHydration(
    profileId: string,
    snapshot: { version: string | null; hydratedAt?: number },
  ): Promise<void> {
    await this.updateProfile(profileId, {
      hasSnapshot: true,
      lastSnapshotVersion: snapshot.version,
      lastSnapshotHydratedAt: snapshot.hydratedAt ?? Date.now(),
    });
  }

  async clearSnapshotState(profileId: string): Promise<void> {
    await this.updateProfile(profileId, {
      hasSnapshot: false,
      lastSnapshotVersion: null,
      lastSnapshotHydratedAt: null,
    });
  }

  /**
   * Get the active profile descriptor, or null.
   */
  async getActiveProfile(): Promise<ProfileDescriptor | null> {
    const data = await this.load();
    if (!data.activeProfileId) return null;
    const profile = data.profiles.find((p) => p.profileId === data.activeProfileId) ?? null;
    return profile;
  }

  private async updateProfile(profileId: string, patch: Partial<ProfileDescriptor>): Promise<void> {
    return this.mutate((data) => {
      const profile = data.profiles.find((entry) => entry.profileId === profileId);
      if (!profile) {
        return;
      }

      Object.assign(profile, patch);
    });
  }

  /** Single writer: failed persistence never publishes a half-committed cache. */
  private mutate<T>(change: (data: RegistryFile) => T): Promise<T> {
    const mutation = this.mutationTail.then(async () => {
      const data = structuredClone(await this.load());
      const result = change(data);
      await this.persist(data);
      this.cached = data;
      return structuredClone(result);
    });
    this.mutationTail = mutation.then(
      () => undefined,
      () => undefined,
    );
    return mutation;
  }

  private async persist(data: RegistryFile): Promise<void> {
    await fs.promises.mkdir(this.registryDir, { recursive: true });
    const tmpPath = `${this.registryPath}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.promises.rename(tmpPath, this.registryPath);
    } finally {
      await fs.promises.rm(tmpPath, { force: true }).catch(() => undefined);
    }
  }
}
