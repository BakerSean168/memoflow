import { session } from 'electron';
import { ResultErrorException } from '@memoflow/transport-contracts/result';
import { ProfileCleanup, LocalProfileIdSchema } from './profile-cleanup';
import { randomBytes } from 'node:crypto';
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
import type { IElectronAuthContext } from '@memoflow/desktop-contracts';
import type { WindowManager } from '../lifecycle/window-manager';
import { Account } from '@memoflow/account/electron';
import type { AccountClientDTO } from '@memoflow/account-contracts';
import { ElectronProfileKeyStore } from './profile-key-store';
import { ProfilePasswordStore } from './profile-password-store';
import { CloudSessionStore } from './cloud-session-store';
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

/** Open intent for a local account; `remember` is the Steam-style "remember me". */
export interface OpenProfileOptions {
  remember?: boolean;
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
type ProfileDeactivationHook = () => void | Promise<void>;

/** Owns local Profile lifecycle. Cloud authentication is deliberately absent. */
export class DesktopProfileRuntimeManager {
  private readonly profileSnapshotService = new ProfileSnapshotService();
  private profileGeneration = 0;
  private activeRuntime: ActiveProfileRuntime | null = null;
  private preparedRuntime: PreparedProfileRuntime | null = null;
  private lifecycleTail: Promise<void> = Promise.resolve();
  private registerModules: ProfileModuleRegistration | null = null;
  private afterActivation: ProfileActivationHook | null = null;
  private beforeDeactivation: ProfileDeactivationHook | null = null;
  private scheduleRuntimeController: ScheduleRuntimeController | null = null;
  private readonly keyStore: ElectronProfileKeyStore;
  private readonly rememberedKeyStore: ElectronProfileKeyStore;
  private readonly passwordStore: ProfilePasswordStore;
  private readonly cloudSessionStore: CloudSessionStore;
  private preparedUnlockKey: Buffer | null = null;
  private preparedUnlockProfileId: string | null = null;
  private activeProfileKey: Buffer | null = null;
  private databaseCleanupRequired = false;
  private readonly cleanup: ProfileCleanup;

  constructor(
    private readonly sharedResolver: SharedPathResolver,
    private readonly profileRegistry: ProfileRegistry,
    private readonly accountClock: Clock,
  ) {
    this.cleanup = new ProfileCleanup(sharedResolver.roots, (partition) =>
      session.fromPartition(partition),
    );
    this.keyStore = new ElectronProfileKeyStore(sharedResolver.roots.dataRoot);
    this.rememberedKeyStore = new ElectronProfileKeyStore(
      sharedResolver.roots.dataRoot,
      'remembered',
    );
    this.passwordStore = new ProfilePasswordStore(sharedResolver.roots.dataRoot);
    this.cloudSessionStore = new CloudSessionStore(sharedResolver.roots.dataRoot);
  }

  setModuleRegistration(fn: ProfileModuleRegistration): void {
    this.registerModules = fn;
  }

  setAfterActivation(fn: ProfileActivationHook): void {
    this.afterActivation = fn;
  }

  setBeforeDeactivation(fn: ProfileDeactivationHook): void {
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

  getProfileGeneration(): number {
    return this.profileGeneration;
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

  updateProfileDisplayName(profileId: string, displayName: string): Promise<void> {
    const expectedProfileId = this.getActiveProfileId();
    return this.runExclusive(async () => {
      if (this.getActiveProfileId() !== expectedProfileId) throw new Error('Profile 已切换');
      await this.updateProfileDisplayNameNow(profileId, displayName);
    });
  }

  private async updateProfileDisplayNameNow(profileId: string, displayName: string): Promise<void> {
    await this.profileRegistry.updateProfileMetadata(profileId, { displayName });
    if (this.activeRuntime?.descriptor.profileId === profileId) {
      this.activeRuntime.descriptor = { ...this.activeRuntime.descriptor, displayName };
    }
    if (this.preparedRuntime?.descriptor.profileId === profileId) {
      this.preparedRuntime.descriptor = { ...this.preparedRuntime.descriptor, displayName };
    }
  }

  async hasCredential(profileId: string): Promise<boolean> {
    return this.passwordStore.hasCredential(profileId);
  }

  /** All callers that combine session changes with lifecycle work share this queue.
   * Call openProfileInTransition inside it; never recursively enqueue an operation.
   */
  runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.lifecycleTail.then(operation);
    this.lifecycleTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * Create a local account and wrap its freshly generated data key with the
   * account password. No safeStorage copy is written: the password is the only
   * way to obtain this key until a later credential-remember feature exists.
   *
   * 本地账户创建：生成 32B 数据钥，仅用密码包裹，不写 safeStorage 副本。
   */
  createLocalAccount(displayName: string, password: string): Promise<ProfileDescriptor> {
    return this.runExclusive(async () => {
      const profile = await this.profileRegistry.createLocalAccount(displayName);
      const profileKey = randomBytes(32);
      try {
        await this.passwordStore.setCredential(profile.profileId, password, profileKey);
      } catch (error) {
        // A local account without a credential can never be unlocked again.
        await this.profileRegistry.remove(profile.profileId).catch(() => undefined);
        throw error;
      } finally {
        profileKey.fill(0);
      }
      return profile;
    });
  }

  registerCloudProfile(
    cloudAccountId: string,
    displayName: string,
    identifier: string,
  ): Promise<ProfileDescriptor> {
    return this.profileRegistry.register(cloudAccountId, displayName, identifier);
  }

  openProfile(
    profileId: string,
    password?: string,
    options?: OpenProfileOptions,
  ): Promise<PreparedProfileRuntime> {
    return this.runExclusive(() => this.openProfileInTransition(profileId, password, options));
  }

  /** True when a safeStorage copy of this local account's data key exists. */
  async hasRememberedKey(profileId: string): Promise<boolean> {
    return this.rememberedKeyStore.has(profileId);
  }

  /**
   * Read a remembered (safeStorage) data-key copy. A missing or unreadable copy
   * yields null so the caller falls back to the password state; the copy is
   * never deleted on failure.
   *
   * 记住钥缺失或解封失败时返回 null，交由调用方回落到密码态，且不静默删钥。
   */
  private async readRememberedKey(profileId: string): Promise<Buffer | null> {
    if (!(await this.rememberedKeyStore.has(profileId))) return null;
    try {
      return await this.rememberedKeyStore.unlock(profileId);
    } catch (error) {
      logger.warn('Remembered local-account key is unavailable; password is required', {
        profileId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return null;
    }
  }

  /** Called only while holding the lifecycle queue. */
  private async openProfileInTransition(
    profileId: string,
    password?: string,
    options?: PrepareProfileOptions & OpenProfileOptions,
  ): Promise<PreparedProfileRuntime> {
    LocalProfileIdSchema.parse(profileId);
    if (await this.cleanup.isPending(profileId))
      throw new ResultErrorException('PROFILE_CLEANUP_PENDING', 'PROFILE_CLEANUP_PENDING');
    if (this.activeRuntime?.descriptor.profileId === profileId) return this.activeRuntime;
    const descriptor = (await this.profileRegistry.list()).find(
      (profile) => profile.profileId === profileId,
    );
    if (!descriptor) throw new Error('Profile not found');
    // A local account is always password-protected; a registered Profile keeps
    // its safeStorage key copy and needs no password to open.
    const needsPassword = descriptor.profileKind === 'local';
    // Routing for a local account: an explicit password wins; otherwise a
    // remembered safeStorage copy opens directly; without one the caller must
    // present the password state.
    let key: Buffer | null = null;
    if (needsPassword) {
      if (password) key = await this.passwordStore.unlock(profileId, password);
      else {
        key = await this.readRememberedKey(profileId);
        if (!key)
          throw new ResultErrorException('此本地账户需要密码解锁', 'PROFILE_PASSWORD_REQUIRED');
      }
    }
    // Keep the verified target key outside old runtime teardown, and never open
    // its DB before password verification.
    try {
      await this.deactivateProfileNow();
      await this.disposePreparedRuntime();
      this.preparedUnlockKey = key;
      this.preparedUnlockProfileId = key ? profileId : null;
      key = null;
      const prepared = await this.prepareDescriptor(descriptor, options);
      await this.activatePreparedProfile();
      if (needsPassword && options?.remember) await this.rememberProfileKey(profileId);
      return prepared;
    } catch (error) {
      key?.fill(0);
      await this.disposePreparedRuntime();
      throw error;
    }
  }

  /**
   * Persist the unlocked data key for "remember me". Failure (safeStorage
   * unavailable) never blocks the already-successful open: the account simply
   * asks for its password again next time.
   */
  private async rememberProfileKey(profileId: string): Promise<void> {
    if (!this.activeProfileKey) return;
    try {
      await this.rememberedKeyStore.save(profileId, this.activeProfileKey);
    } catch (error) {
      logger.warn('Could not remember local-account key; password stays required', {
        profileId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  /** Change the password of the active local account; re-wraps the same data key. */
  setCurrentProfilePassword(password: string): Promise<void> {
    const expectedProfileId = this.getActiveProfileId();
    return this.runExclusive(async () => {
      if (this.getActiveProfileId() !== expectedProfileId) throw new Error('Profile 已切换');
      await this.setCurrentProfilePasswordNow(password);
    });
  }

  private async setCurrentProfilePasswordNow(password: string): Promise<void> {
    const descriptor = this.activeRuntime?.descriptor;
    if (!descriptor || !this.activeProfileKey) throw new Error('必须先解锁 Profile');
    if (descriptor.profileKind !== 'local') {
      throw new ResultErrorException('只有本地账户可以设置密码', 'PROFILE_NOT_LOCAL_ACCOUNT');
    }
    await this.passwordStore.setCredential(descriptor.profileId, password, this.activeProfileKey);
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

  /**
   * Startup candidate. Never creates an identity: an empty registry yields
   * null so the shell presents the empty account list instead of silently
   * minting an account with no password. The shell only uses it for diagnostics;
   * it never opens the returned Profile on its own.
   *
   * 启动不再静默创建身份：注册表为空时返回 null；调用方不得据此自动打开 Profile。
   */
  async getStartupProfile(): Promise<ProfileDescriptor | null> {
    for (const profileId of await this.cleanup.pending()) {
      try {
        await this.finishCleanup(profileId);
      } catch (error) {
        logger.warn('Profile cleanup remains pending', { profileId, error });
      }
    }
    const pending = new Set(await this.cleanup.pending());
    const selected = await this.profileRegistry.getActiveProfile();
    if (selected && !pending.has(selected.profileId)) return selected;
    const available = (await this.profileRegistry.list()).find(
      (profile) => !pending.has(profile.profileId),
    );
    return available ?? null;
  }

  private async activatePreparedProfile(): Promise<void> {
    if (!this.preparedRuntime) throw new Error('No prepared profile is available for activation');
    const preparedProfileId = this.preparedRuntime.descriptor.profileId;
    let bootstrapper: ElectronBootstrapper | null = null;
    try {
      const prepared = this.preparedRuntime!;
      let profileKey = this.preparedUnlockKey;
      if (!profileKey) {
        if (prepared.descriptor.profileKind === 'local') {
          throw new Error('此本地账户需要密码解锁');
        }
        await this.keyStore.ensure(prepared.descriptor.profileId);
        profileKey = await this.keyStore.unlock(prepared.descriptor.profileId);
      }
      this.activeProfileKey = profileKey;
      this.preparedUnlockKey = null;
      this.preparedUnlockProfileId = null;
      bootstrapper = new ElectronBootstrapper(prepared.db);
      if (this.registerModules)
        await this.registerModules(bootstrapper, prepared.db, prepared.profileResolver);
      await bootstrapper.init(prepared.profileAccessContext);
      await this.profileRegistry.setActiveProfile(preparedProfileId);
      await this.profileRegistry.touch(preparedProfileId);
      this.activeRuntime = { ...prepared, bootstrapper };
      this.preparedRuntime = null;
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
    } catch (error) {
      // A failed activation may still have composed business modules (and so
      // published their repositories to the shell bridge); clear those
      // references here so the failed attempt never leaves stale repos.
      try {
        await this.beforeDeactivation?.();
      } catch (cleanupError) {
        logger.warn('Failed to run profile activation cleanup hook', { error: cleanupError });
      }
      await bootstrapper?.destroy().catch(() => undefined);
      this.activeProfileKey?.fill(0);
      this.activeProfileKey = null;
      await this.profileRegistry.setActiveProfile(null).catch(() => undefined);
      await this.profileRegistry.markError(preparedProfileId).catch(() => undefined);
      await this.disposePreparedRuntime();
      throw error;
    }
  }

  deactivateProfile(options: { preserveSelection?: boolean } = {}): Promise<void> {
    return this.runExclusive(() => this.deactivateProfileNow(options));
  }

  private async deactivateProfileNow(options: { preserveSelection?: boolean } = {}): Promise<void> {
    if (!this.activeRuntime) {
      if (this.databaseCleanupRequired) {
        await shutdownPowerSync();
        this.databaseCleanupRequired = false;
      }
      return;
    }
    const active = this.activeRuntime;
    const profileId = active.descriptor.profileId;
    // Flush profile-local owner truth before any other runtime is torn down.
    // This hook is allowed to veto deactivation: losing a due Routine occurrence
    // is worse than keeping the current Profile active for a retry.
    //
    // The activation-failure cleanup path remains best-effort above because that
    // path never exposes a successfully active Profile.
    await this.beforeDeactivation?.();
    this.profileGeneration += 1;
    // No IPC may resolve the runtime while its modules are being destroyed.
    this.activeRuntime = null;

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
    // Shell-held references were cleared by beforeDeactivation before module
    // teardown, so concurrent IPC cannot resolve a half-destroyed repository.
    await active.bootstrapper
      .destroy()
      .catch((error) => logger.error('Failed to destroy profile modules', { error }));
    // NOTE: the closure-request marker is intentionally NOT cleared here —
    // deactivateProfile also runs on profile switch/lock where the profile can
    // be reactivated; clearing the marker there would reopen the local
    // new-work gate while the account is still closed. The marker is cleared
    // ONLY when the cloud close FAILS (close handler catch path).
    this.activeRuntime = null;
    this.databaseCleanupRequired = true;
    try {
      await shutdownPowerSync();
      this.databaseCleanupRequired = false;
    } finally {
      this.activeProfileKey?.fill(0);
      this.activeProfileKey = null;
      this.preparedUnlockKey?.fill(0);
      this.preparedUnlockKey = null;
      this.preparedUnlockProfileId = null;
      if (!options.preserveSelection) {
        await this.profileRegistry.setActiveProfile(null).catch(() => undefined);
      }
    }
    logger.info('Local profile deactivated', { profileId });
  }

  removeProfile(profileId: string): Promise<void> {
    return this.runExclusive(() => this.removeProfileNow(profileId));
  }

  /**
   * "退出账号" for the active Profile, in one lifecycle-exclusive step.
   *
   * The caller owns the cloud-session hand-off because it must run while the
   * session file still exists; everything after it reuses the existing paths:
   * deactivate (the same routine the old LOCK channel used) and the unified
   * `finishCleanup` removal the chooser's delete already goes through. No
   * second deletion path is introduced here.
   *
   * A removal failure after deactivation is reported as `SIGN_OUT_PARTIAL` so
   * the renderer can leave the now-dead workspace instead of stranding it.
   */
  signOutActiveProfile(
    invalidateCloudSession: (descriptor: ProfileDescriptor) => Promise<void>,
  ): Promise<void> {
    return this.runExclusive(async () => {
      const descriptor = this.activeRuntime?.descriptor;
      if (!descriptor)
        throw new ResultErrorException('PROFILE_NOT_ACTIVE', '当前没有已登录的账号');
      await invalidateCloudSession(descriptor);
      await this.deactivateProfileNow();
      try {
        await this.removeProfileNow(descriptor.profileId);
      } catch (error) {
        throw new ResultErrorException(
          'SIGN_OUT_PARTIAL',
          error instanceof Error ? error.message : 'SIGN_OUT_PARTIAL',
        );
      }
    });
  }

  private async removeProfileNow(profileId: string): Promise<void> {
    const descriptor = (await this.profileRegistry.list()).find(
      (profile) => profile.profileId === profileId,
    );
    if (!descriptor) return;
    if (descriptor.profileId === this.activeRuntime?.descriptor.profileId)
      throw new Error('Cannot remove active profile');
    if (descriptor.profileId === this.preparedRuntime?.descriptor.profileId)
      throw new Error('Cannot remove prepared profile');
    await this.finishCleanup(descriptor.profileId);
  }

  private async finishCleanup(profileId: string): Promise<void> {
    await this.cleanup.remove(profileId, async () => {
      await this.cloudSessionStore.remove(profileId);
      await this.passwordStore.remove(profileId);
      await this.keyStore.remove(profileId);
      await this.rememberedKeyStore.remove(profileId);
      await this.profileRegistry.remove(profileId);
    });
  }

  /** These composition callbacks are used only inside runExclusive, never exposed over IPC. */
  async withInactiveLocalAccount<T>(
    profileId: string,
    password: string | undefined,
    read: (descriptor: ProfileDescriptor, paths: ProfilePathResolver) => Promise<T>,
  ): Promise<T> {
    LocalProfileIdSchema.parse(profileId);
    if (
      this.getActiveProfileId() === profileId ||
      this.preparedRuntime?.descriptor.profileId === profileId
    )
      throw new ResultErrorException('SOURCE_PROFILE_ACTIVE', 'SOURCE_PROFILE_ACTIVE');
    if (await this.cleanup.isPending(profileId))
      throw new ResultErrorException('PROFILE_CLEANUP_PENDING', 'PROFILE_CLEANUP_PENDING');
    const profile = (await this.profileRegistry.list()).find(
      (item) => item.profileId === profileId,
    );
    if (!profile || profile.profileKind !== 'local')
      throw new ResultErrorException('SOURCE_NOT_LOCAL_ACCOUNT', 'SOURCE_NOT_LOCAL_ACCOUNT');
    const passwordProtected = await this.passwordStore.hasCredential(profileId);
    let key: Buffer;
    if (passwordProtected) {
      if (password) key = await this.passwordStore.unlock(profileId, password);
      else {
        const remembered = await this.readRememberedKey(profileId);
        if (!remembered)
          throw new ResultErrorException('SOURCE_PASSWORD_REQUIRED', 'SOURCE_PASSWORD_REQUIRED');
        key = remembered;
      }
    } else {
      key = await this.keyStore.unlock(profileId);
    }
    try {
      const paths = createProfilePathResolver(this.sharedResolver.roots, profileId);
      if ((await fs.promises.lstat(paths.profileDir)).isSymbolicLink())
        throw new ResultErrorException('SOURCE_PATH_UNSAFE', 'SOURCE_PATH_UNSAFE');
      return await read(profile, paths);
    } finally {
      key.fill(0);
    }
  }

  async withActiveProfileKey<T>(profileId: string, work: (key: Buffer) => Promise<T>): Promise<T> {
    if (profileId !== this.getActiveProfileId() || !this.activeProfileKey)
      throw new ResultErrorException('PROFILE_CHANGED', 'PROFILE_CHANGED');
    const key = Buffer.from(this.activeProfileKey);
    try {
      return await work(key);
    } finally {
      key.fill(0);
    }
  }

  /** Cleanup caller already holds the lifecycle queue and has proved copy verification. */
  async removeImportedLocalAccount(profileId: string): Promise<void> {
    const descriptor = (await this.profileRegistry.list()).find(
      (item) => item.profileId === profileId,
    );
    if (descriptor?.profileKind !== 'local')
      throw new ResultErrorException('SOURCE_NOT_LOCAL_ACCOUNT', 'SOURCE_NOT_LOCAL_ACCOUNT');
    await this.removeProfileNow(profileId);
  }

  isProfileCleanupPending(profileId: string): Promise<boolean> {
    return this.cleanup.isPending(profileId);
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
      this.sharedResolver.roots,
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
    // Publish the prepared handle before owner initialization so failures close the DB.
    this.preparedRuntime = {
      descriptor,
      profileResolver,
      db,
      profileAccessContext: new DesktopProfileAccessContext(() => descriptor.localOwnerId),
    };
    await this.ensureLocalAccount(db, descriptor);
    const profileAccessContext = new DesktopProfileAccessContext(() => descriptor.localOwnerId);
    this.preparedRuntime = {
      descriptor: descriptor,
      profileResolver,
      db,
      profileAccessContext,
    };
    await this.profileRegistry.markReady(descriptor.profileId);
    logger.info('Profile prepared', {
      profileId: descriptor.profileId,
      snapshotHydrated: snapshotResult.hydrated,
    });
    return this.preparedRuntime;
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
      this.preparedRuntime = null;
      this.databaseCleanupRequired = true;
    }
    this.preparedUnlockKey?.fill(0);
    this.preparedUnlockKey = null;
    this.preparedUnlockProfileId = null;
    if (this.databaseCleanupRequired) {
      await shutdownPowerSync();
      this.databaseCleanupRequired = false;
    }
  }
}
