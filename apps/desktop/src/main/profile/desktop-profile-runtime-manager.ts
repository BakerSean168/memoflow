import type { Clock } from '@memoflow/time';
import fs from 'node:fs';
import type { PowerSyncDatabase } from '@powersync/node';
import { createLogger } from '@memoflow/utils/logger';
import { createAccountPowerSyncRepositories } from '@memoflow/account';
import type { ScheduleRuntimeController } from '../runtime/compose-schedule';
import {
  type SharedPathResolver,
  type ProfilePathResolver,
  createProfilePathResolver,
  ensureProfileDirs,
} from '../paths';
import { ProfileRegistry, type ProfileDescriptor } from './profile-registry';
import { ProfileSnapshotService } from './profile-snapshot-service';
import { DesktopProfileAccessContext } from './profile-access-context';
import { ElectronBootstrapper } from '../bootstrap';
import type { IElectronAuthContext } from '@memoflow/contracts/electron';
import type { WindowManager } from '../lifecycle/window-manager';
import { Account } from '@memoflow/account/electron';
import type { AccountClientDTO } from '@memoflow/contracts/account';
import { ElectronProfileKeyStore } from './profile-key-store';
import { ProfilePinStore } from './profile-pin-store';
import { CloudSessionStore } from './cloud-session-store';
import { LocalTenantAdoptionService } from './local-tenant-adoption-service';
import {
  type CloudCredentialProvider,
  ensurePowerSyncSyncMode,
  disablePowerSyncSyncMode,
  openPowerSyncLocalOnly,
  shutdownPowerSync,
} from '../database/powersync';

const logger = createLogger('DesktopProfileRuntimeManager');

export interface PreparedProfileRuntime {
  descriptor: ProfileDescriptor;
  profileResolver: ProfilePathResolver;
  db: PowerSyncDatabase;
  profileAccessContext: IElectronAuthContext;
}

interface PrepareProfileOptions {
  displayName?: string;
  identifier?: string | null;
  snapshotAccessToken?: string | null;
}

interface ActiveProfileRuntime extends PreparedProfileRuntime {
  bootstrapper: ElectronBootstrapper;
}

type ProfileModuleRegistration = (
  bootstrapper: ElectronBootstrapper,
  db: PowerSyncDatabase,
  profilePaths: ProfilePathResolver,
) => Promise<void>;

type ProfileActivationHook = (profile: ProfileDescriptor) => Promise<void>;

/** Owns local Profile lifecycle. Cloud authentication is deliberately absent. */
export class DesktopProfileRuntimeManager {
  private readonly profileSnapshotService = new ProfileSnapshotService();
  private activeRuntime: ActiveProfileRuntime | null = null;
  private preparedRuntime: PreparedProfileRuntime | null = null;
  private activationLock: Promise<void> | null = null;
  private registerModules: ProfileModuleRegistration | null = null;
  private afterActivation: ProfileActivationHook | null = null;
  private beforeDeactivation: (() => void) | null = null;
  private scheduleRuntimeController: ScheduleRuntimeController | null = null;
  private readonly keyStore: ElectronProfileKeyStore;
  private readonly pinStore: ProfilePinStore;
  private readonly cloudSessionStore: CloudSessionStore;
  private preparedUnlockKey: Buffer | null = null;
  private preparedUnlockProfileId: string | null = null;
  private activeProfileKey: Buffer | null = null;

  constructor(
    private readonly sharedResolver: SharedPathResolver,
    private readonly profileRegistry: ProfileRegistry,
    private readonly accountClock: Clock,
  ) {
    this.keyStore = new ElectronProfileKeyStore(sharedResolver.rootDir);
    this.pinStore = new ProfilePinStore(sharedResolver.rootDir);
    this.cloudSessionStore = new CloudSessionStore(sharedResolver.rootDir);
  }

  setModuleRegistration(fn: ProfileModuleRegistration): void {
    this.registerModules = fn;
  }

  setAfterActivation(fn: ProfileActivationHook): void {
    this.afterActivation = fn;
  }

  setBeforeDeactivation(fn: () => void): void {
    this.beforeDeactivation = fn;
  }

  /**
   * Set the bound schedule runtime controller for the active profile.
   * 为当前激活 profile 设置绑定的 schedule runtime controller。
   *
   * The controller is the ONLY schedule start/stop owner in the desktop lane;
   * profile deactivation stops the same instance that the profile's module
   * handle owns, then clears the reference before teardown.
   *
   * controller 是桌面 lane 中 schedule 启停的唯一所有者；profile 停用会停止同一
   * profile 的 module handle 所持有的同一实例，随后在拆除前清除引用。
   */
  setScheduleRuntimeController(controller: ScheduleRuntimeController | null): void {
    this.scheduleRuntimeController = controller;
  }

  getSharedResolver(): SharedPathResolver {
    return this.sharedResolver;
  }

  getActiveProfileResolver(): ProfilePathResolver | null {
    return this.activeRuntime?.profileResolver ?? null;
  }

  getActiveProfileId(): string | null {
    return this.activeRuntime?.descriptor.profileId ?? null;
  }

  getActiveProfileDescriptorSync(): ProfileDescriptor | null {
    return this.activeRuntime?.descriptor ?? null;
  }

  getActiveProfileDescriptor(): Promise<ProfileDescriptor | null> {
    return this.profileRegistry.getActiveProfile();
  }

  getActiveProfileAccessContext(): IElectronAuthContext | null {
    return this.activeRuntime?.profileAccessContext ?? null;
  }

  getCurrentIdentityId(): string | null {
    return (
      this.activeRuntime?.descriptor.localOwnerId ??
      this.preparedRuntime?.descriptor.localOwnerId ??
      null
    );
  }

  async updateProfileDisplayName(profileId: string, displayName: string): Promise<void> {
    await this.profileRegistry.updateProfileMetadata(profileId, { displayName });
    if (this.activeRuntime?.descriptor.profileId === profileId) {
      this.activeRuntime.descriptor = { ...this.activeRuntime.descriptor, displayName };
    }
    if (this.preparedRuntime?.descriptor.profileId === profileId) {
      this.preparedRuntime.descriptor = { ...this.preparedRuntime.descriptor, displayName };
    }
  }

  async hasPin(profileId: string): Promise<boolean> {
    return this.pinStore.hasPin(profileId);
  }

  async preparePinUnlock(profileId: string, pin: string): Promise<void> {
    this.preparedUnlockKey?.fill(0);
    this.preparedUnlockKey = null;
    this.preparedUnlockProfileId = null;
    const key = await this.pinStore.unlock(profileId, pin);
    this.preparedUnlockKey = key;
    this.preparedUnlockProfileId = profileId;
  }

  async setCurrentProfilePin(pin: string): Promise<void> {
    const profileId = this.getActiveProfileId();
    if (!profileId || !this.activeProfileKey) throw new Error('必须先解锁 Profile');
    await this.pinStore.setPin(profileId, pin, this.activeProfileKey);
  }

  async removeCurrentProfilePin(): Promise<void> {
    const profileId = this.getActiveProfileId();
    if (!profileId || !this.activeProfileKey) throw new Error('必须先解锁 Profile');
    await this.pinStore.remove(profileId);
  }

  async enableCloudSync(credentialProvider: CloudCredentialProvider): Promise<void> {
    if (!this.activeRuntime) throw new Error('Cloud sync requires an unlocked Profile');
    await ensurePowerSyncSyncMode(credentialProvider);
  }

  async disableCloudSync(): Promise<void> {
    await disablePowerSyncSyncMode().catch((error) => {
      logger.warn('Failed to disconnect cloud sync; local Profile remains active', { error });
    });
  }

  async listProfiles(): Promise<ProfileDescriptor[]> {
    return this.profileRegistry.list();
  }

  async getCurrentLocalAccount(): Promise<AccountClientDTO> {
    const current = this.activeRuntime ?? this.preparedRuntime;
    if (!current) throw new Error('No active Profile');
    const account = await createAccountPowerSyncRepositories(current.db).accountRepository.findById(
      current.descriptor.localOwnerId,
    );
    if (!account) throw new Error('Current Profile Account is missing');
    return account.toClientDTO();
  }

  async findRegisteredProfileByIdentifier(identifier: string): Promise<ProfileDescriptor | null> {
    return this.profileRegistry.findByIdentifier(identifier);
  }

  async prepareProfile(
    localOwnerId: string,
    options?: PrepareProfileOptions,
  ): Promise<PreparedProfileRuntime> {
    if (this.activationLock) await this.activationLock;

    if (this.activeRuntime?.descriptor.localOwnerId === localOwnerId) return this.activeRuntime;
    if (this.preparedRuntime?.descriptor.localOwnerId === localOwnerId) return this.preparedRuntime;

    if (this.activeRuntime) await this.deactivateProfile();
    await this.disposePreparedRuntime();

    const descriptor = await this.profileRegistry.register(
      localOwnerId,
      options?.displayName ?? options?.identifier ?? localOwnerId,
      options?.identifier,
    );
    return this.prepareDescriptor(descriptor, options);
  }

  async prepareGuestProfile(): Promise<PreparedProfileRuntime> {
    const guest = await this.profileRegistry.ensureGuest();
    if (this.activeRuntime?.descriptor.profileId === guest.profileId) return this.activeRuntime;
    if (this.preparedRuntime?.descriptor.profileId === guest.profileId) return this.preparedRuntime;
    if (this.activeRuntime) await this.deactivateProfile();
    await this.disposePreparedRuntime();
    return this.prepareDescriptor(guest);
  }

  async activateStartupProfile(): Promise<PreparedProfileRuntime> {
    const active = await this.profileRegistry.getActiveProfile();
    const descriptor = active ?? (await this.profileRegistry.ensureGuest());
    const prepared =
      descriptor.profileKind === 'guest'
        ? await this.prepareGuestProfile()
        : await this.prepareProfile(descriptor.localOwnerId, {
            displayName: descriptor.displayName,
            identifier: descriptor.identifier,
          });
    await this.activatePreparedProfile();
    return prepared;
  }

  async getStartupProfile(): Promise<ProfileDescriptor> {
    return (
      (await this.profileRegistry.getActiveProfile()) ?? (await this.profileRegistry.ensureGuest())
    );
  }

  async bindCurrentProfile(
    cloudAccountId: string,
    displayName: string,
    identifier: string,
  ): Promise<void> {
    const current = this.activeRuntime?.descriptor ?? this.preparedRuntime?.descriptor;
    if (!current) throw new Error('No active Profile to bind');
    if (current.profileKind === 'guest') {
      const existingCloudProfile = await this.profileRegistry.findByCloudAccountId(cloudAccountId);
      if (existingCloudProfile && existingCloudProfile.profileId !== current.profileId) {
        throw new Error(
          `目标云端账号已绑定本机 Profile (${existingCloudProfile.profileId})，拒绝静默合并`,
        );
      }
      const db = this.activeRuntime?.db ?? this.preparedRuntime?.db;
      if (!db) throw new Error('Profile database is not open');
      const adoption = new LocalTenantAdoptionService(db);
      await adoption.adopt({
        fromOwnerId: current.localOwnerId,
        toOwnerId: cloudAccountId,
        displayName: current.displayName,
        identifier,
      });
      const rebound = await this.profileRegistry.rebindIdentityOwnership({
        fromOwnerId: current.localOwnerId,
        toCloudAccountId: cloudAccountId,
        displayName: current.displayName,
        identifier,
      });
      if (this.activeRuntime) this.activeRuntime.descriptor = rebound;
      if (this.preparedRuntime) this.preparedRuntime.descriptor = rebound;
      await adoption.clearCompleted().catch((error) => {
        logger.warn('Profile binding committed but adoption journal cleanup failed', {
          profileId: rebound.profileId,
          cloudAccountId,
          error,
        });
      });
      return;
    }
    if (current.cloudBinding?.cloudAccountId !== cloudAccountId) {
      throw new Error('当前 Profile 已绑定其他云端账号');
    }
  }

  async activatePreparedProfile(): Promise<void> {
    if (!this.preparedRuntime) throw new Error('No prepared profile is available for activation');
    if (this.activationLock) {
      await this.activationLock;
      return;
    }

    const preparedProfileId = this.preparedRuntime.descriptor.profileId;
    const activation = (async () => {
      const prepared = this.preparedRuntime!;
      await this.keyStore.ensure(prepared.descriptor.profileId);
      const pinRequired = await this.pinStore.hasPin(prepared.descriptor.profileId);
      if (pinRequired && this.preparedUnlockProfileId !== prepared.descriptor.profileId) {
        throw new Error('此 Profile 需要本地 PIN 解锁');
      }
      this.activeProfileKey =
        this.preparedUnlockKey ?? (await this.keyStore.unlock(prepared.descriptor.profileId));
      this.preparedUnlockKey = null;
      this.preparedUnlockProfileId = null;
      const bootstrapper = new ElectronBootstrapper(prepared.db);
      if (this.registerModules)
        await this.registerModules(bootstrapper, prepared.db, prepared.profileResolver);
      await bootstrapper.init(prepared.profileAccessContext);
      this.activeRuntime = { ...prepared, bootstrapper };
      this.preparedRuntime = null;
      await this.profileRegistry.setActiveProfile(preparedProfileId);
      await this.profileRegistry.touch(preparedProfileId);
      if (this.afterActivation) {
        await this.afterActivation(this.activeRuntime.descriptor).catch((error) => {
          logger.warn('Cloud connection restore failed; Profile remains locally available', {
            error,
          });
        });
      }
      logger.info('Local profile activated', {
        profileId: preparedProfileId,
        localOwnerId: prepared.descriptor.localOwnerId,
        profileKind: prepared.descriptor.profileKind,
      });
    })();

    this.activationLock = activation;
    try {
      await activation;
    } catch (error) {
      // A failed activation may still have composed business modules (and so
      // published their repositories to the shell bridge); clear those
      // references here so the failed attempt never leaves stale repos.
      this.beforeDeactivation?.();
      await this.profileRegistry.markError(preparedProfileId).catch(() => undefined);
      await this.disposePreparedRuntime();
      throw error;
    } finally {
      this.activationLock = null;
    }
  }

  async deactivateProfile(options: { preserveSelection?: boolean } = {}): Promise<void> {
    if (!this.activeRuntime) return;
    const profileId = this.activeRuntime.descriptor.profileId;
    // Stop the bound schedule runtime controller (idempotent; the SAME instance
    // the profile's module handle owns), then clear the reference BEFORE the
    // modules are torn down so no stale controller outlives its instance.
    // 先停止绑定的 schedule runtime controller（幂等；与 profile 的 module handle
    // 所持实例是同一实例），再在模块拆除前清除引用，避免过期 controller 越过其实例存活。
    const scheduleController = this.scheduleRuntimeController;
    this.scheduleRuntimeController = null;
    try {
      await scheduleController?.stop();
    } catch (error) {
      logger.warn('Failed to stop schedule runtime', { error });
    }
    // Clear any shell-held references to the active module instances (e.g. the
    // dashboard repository view) BEFORE tearing the modules down: a concurrent
    // IPC request that resolves the lazy getter during destruction then sees
    // null (the auth gate already guards it), never a half-destroyed
    // repository. Once the modules are gone there is nothing left to null out.
    this.beforeDeactivation?.();
    await this.activeRuntime.bootstrapper
      .destroy()
      .catch((error) => logger.error('Failed to destroy profile modules', { error }));
    // NOTE: the closure-request marker is intentionally NOT cleared here —
    // deactivateProfile also runs on profile switch/lock where the profile can
    // be reactivated; clearing the marker there would reopen the local
    // new-work gate while the account is still closed. The marker is cleared
    // ONLY when the cloud close FAILS (close handler catch path).
    await shutdownPowerSync();
    this.activeRuntime = null;
    this.activeProfileKey?.fill(0);
    this.activeProfileKey = null;
    this.preparedUnlockKey?.fill(0);
    this.preparedUnlockKey = null;
    this.preparedUnlockProfileId = null;
    if (!options.preserveSelection) {
      await this.profileRegistry.setActiveProfile(null).catch(() => undefined);
    }
    logger.info('Local profile deactivated', { profileId });
  }

  async discardPreparedProfile(): Promise<void> {
    await this.disposePreparedRuntime();
  }

  async removeProfile(profileId: string): Promise<void> {
    const descriptor = (await this.profileRegistry.list()).find(
      (profile) => profile.profileId === profileId,
    );
    if (!descriptor) return;
    if (descriptor.profileId === this.activeRuntime?.descriptor.profileId)
      throw new Error('Cannot remove active profile');
    if (descriptor.profileId === this.preparedRuntime?.descriptor.profileId)
      throw new Error('Cannot remove prepared profile');
    await this.cloudSessionStore.remove(descriptor.profileId);
    await this.pinStore.remove(descriptor.profileId);
    await this.keyStore.remove(descriptor.profileId);
    await fs.promises.rm(
      createProfilePathResolver(this.sharedResolver.rootDir, descriptor.profileId).profileDir,
      { recursive: true, force: true },
    );
    await this.profileRegistry.remove(descriptor.profileId);
  }

  private async prepareDescriptor(
    descriptor: ProfileDescriptor,
    options?: PrepareProfileOptions,
  ): Promise<PreparedProfileRuntime> {
    if (this.preparedUnlockProfileId && this.preparedUnlockProfileId !== descriptor.profileId) {
      this.preparedUnlockKey?.fill(0);
      this.preparedUnlockKey = null;
      this.preparedUnlockProfileId = null;
    }
    const profileResolver = createProfilePathResolver(
      this.sharedResolver.rootDir,
      descriptor.profileId,
    );
    ensureProfileDirs(profileResolver);
    const snapshotResult = await this.profileSnapshotService.hydrateIfNeeded({
      sharedResolver: this.sharedResolver,
      profileResolver,
      descriptor,
      accessToken: options?.snapshotAccessToken,
    });
    if (snapshotResult.metadata) {
      await this.profileRegistry.recordSnapshotHydration(
        descriptor.profileId,
        snapshotResult.metadata,
      );
    }
    const db = await openPowerSyncLocalOnly(profileResolver.dbPath);
    const recoveredDescriptor = await this.recoverCompletedAdoption(db, descriptor);
    await this.ensureLocalAccount(db, recoveredDescriptor);
    const profileAccessContext = new DesktopProfileAccessContext(
      () =>
        this.activeRuntime?.descriptor.localOwnerId ??
        this.preparedRuntime?.descriptor.localOwnerId ??
        recoveredDescriptor.localOwnerId,
    );
    this.preparedRuntime = {
      descriptor: recoveredDescriptor,
      profileResolver,
      db,
      profileAccessContext,
    };
    await this.profileRegistry.markReady(recoveredDescriptor.profileId);
    logger.info('Profile prepared', {
      profileId: recoveredDescriptor.profileId,
      snapshotHydrated: snapshotResult.hydrated,
    });
    return this.preparedRuntime;
  }

  private async recoverCompletedAdoption(
    db: PowerSyncDatabase,
    descriptor: ProfileDescriptor,
  ): Promise<ProfileDescriptor> {
    const adoption = new LocalTenantAdoptionService(db);
    const completed = await adoption.getCompleted();
    if (!completed) return descriptor;

    if (descriptor.profileKind === 'registered') {
      if (descriptor.cloudBinding?.cloudAccountId !== completed.toOwnerId) {
        throw new Error('Profile adoption journal conflicts with the registered cloud binding');
      }
      await adoption.clearCompleted();
      return descriptor;
    }

    if (descriptor.localOwnerId !== completed.fromOwnerId) {
      throw new Error('Profile adoption journal does not belong to the current Profile');
    }

    const rebound = await this.profileRegistry.rebindIdentityOwnership({
      fromOwnerId: completed.fromOwnerId,
      toCloudAccountId: completed.toOwnerId,
      displayName: completed.displayName,
      identifier: completed.identifier,
    });
    await adoption.clearCompleted();
    logger.warn('Recovered completed tenant adoption after interrupted registry rebind', {
      profileId: rebound.profileId,
      cloudAccountId: completed.toOwnerId,
    });
    return rebound;
  }

  private async ensureLocalAccount(
    db: PowerSyncDatabase,
    descriptor: ProfileDescriptor,
  ): Promise<void> {
    const repository = createAccountPowerSyncRepositories(db).accountRepository;
    const existing = await repository.findById(descriptor.localOwnerId);
    if (existing) return;
    const account = Account.create({
      id: descriptor.localOwnerId as Parameters<typeof Account.create>[0]['id'],
      nicknameSeed: descriptor.displayName,
      now: this.accountClock.now(),
    });
    await repository.save(account);
  }

  private async disposePreparedRuntime(): Promise<void> {
    if (this.preparedRuntime) {
      await shutdownPowerSync();
      this.preparedRuntime = null;
    }
    this.preparedUnlockKey?.fill(0);
    this.preparedUnlockKey = null;
    this.preparedUnlockProfileId = null;
  }
}
