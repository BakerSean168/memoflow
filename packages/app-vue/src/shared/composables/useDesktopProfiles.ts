import { inject, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { z } from 'zod';
import type { ProfileSummary } from '@memoflow/desktop-contracts';
import { DESKTOP_BRIDGE_KEY } from '../../di/keys';
import { translateResultError } from '../utils/translate-result-error';
import {
  useDesktopProfileCatalog,
  type DesktopProfileCatalogCross,
} from './useDesktopProfileCatalog';
import {
  useDesktopProfileCloudSignIn,
  type DesktopProfileCloudSignInCross,
} from './useDesktopProfileCloudSignIn';
import {
  useDesktopProfileRegistration,
  type DesktopProfileRegistrationCross,
} from './useDesktopProfileRegistration';
import { useDesktopProfileUnlock, type DesktopProfileUnlockCross } from './useDesktopProfileUnlock';

/**
 * States the identity window swaps inside one window. `login` and `register`
 * are the formal sign-in/registration surfaces; `password` is the per-tile
 * unlock state of a local account.
 */
export type DesktopAccessView = 'select' | 'password' | 'login' | 'register';
export type DesktopRegisterMode = 'cloud' | 'local';

/**
 * State and host helpers shared by the four focused Profile composables. The
 * refs are created once here and injected, so every group operates on the
 * same instance instead of private copies.
 */
export interface DesktopProfilesSharedContext {
  t: ReturnType<typeof useI18n>['t'];
  options: { accessWindow?: boolean };
  invoke: <T>(
    channel: string,
    schema: z.ZodType<T>,
    ...args: unknown[]
  ) => Promise<{ data: T } | null>;
  invokeScoped: <T>(
    channel: string,
    schema: z.ZodType<T>,
    options: { scope?: string; silent?: boolean },
    ...args: unknown[]
  ) => Promise<{ data: T } | null>;
  profiles: Ref<ProfileSummary[]>;
  busyProfileId: Ref<string | null>;
  selectedProfileId: Ref<string | null>;
  accessView: Ref<DesktopAccessView>;
  password: Ref<string>;
  remember: Ref<boolean>;
  loginRemember: Ref<boolean>;
}

/** Registry metadata and operations shared by the access window and workspace management. */
export function useDesktopProfiles(options: { accessWindow?: boolean } = {}) {
  const bridge = inject(DESKTOP_BRIDGE_KEY, null);
  const { t } = useI18n();
  const profiles = ref<ProfileSummary[]>([]);
  const busyProfileId = ref<string | null>(null);
  const selectedProfileId = ref<string | null>(null);
  const accessView = ref<DesktopAccessView>('select');
  const password = ref('');
  const remember = ref(false);
  const loginRemember = ref(true);

  async function invoke<T>(
    channel: string,
    schema: z.ZodType<T>,
    ...args: unknown[]
  ): Promise<{ data: T } | null> {
    return invokeScoped(channel, schema, {}, ...args);
  }

  async function invokeScoped<T>(
    channel: string,
    schema: z.ZodType<T>,
    options: { scope?: string; silent?: boolean },
    ...args: unknown[]
  ): Promise<{ data: T } | null> {
    if (!bridge) return null;
    try {
      const result = z
        .object({
          ok: z.boolean(),
          data: schema.optional(),
          error: z.object({ code: z.string(), message: z.string() }).passthrough().optional(),
        })
        .parse(await bridge.invoke(channel, ...args));
      if (!result.ok) throw result.error ?? new Error(t('common.operationFailed'));
      return { data: schema.parse(result.data) };
    } catch (error) {
      if (!options.silent)
        toast.error(
          translateResultError(error, t, {
            scope: options.scope,
            fallbackKey: 'common.operationFailed',
          }),
        );
      return null;
    }
  }

  const ctx: DesktopProfilesSharedContext = {
    t,
    options,
    invoke,
    invokeScoped,
    profiles,
    busyProfileId,
    selectedProfileId,
    accessView,
    password,
    remember,
    loginRemember,
  };

  // Cross-group actions are wired after the groups run: every group reads them
  // off its `cross` holder at call time, so the function references stay the
  // exact instances each group created.
  const catalogCross = {} as DesktopProfileCatalogCross;
  const unlockCross = {} as DesktopProfileUnlockCross;
  const cloudCross = {} as DesktopProfileCloudSignInCross;
  const registrationCross = {} as DesktopProfileRegistrationCross;

  const catalog = useDesktopProfileCatalog(ctx, catalogCross);
  const unlock = useDesktopProfileUnlock(ctx, unlockCross);
  const cloud = useDesktopProfileCloudSignIn(ctx, cloudCross);
  const registration = useDesktopProfileRegistration(ctx, registrationCross);

  Object.assign(catalogCross, {
    enterPasswordState: unlock.enterPasswordState,
    resetSignInState: cloud.resetSignInState,
    resetRegisterState: registration.resetRegisterState,
  });
  Object.assign(unlockCross, { selectAndEnter: catalog.selectAndEnter });
  Object.assign(cloudCross, { enterOpenedProfile: catalog.enterOpenedProfile });
  Object.assign(registrationCross, {
    enterOpenedProfile: catalog.enterOpenedProfile,
    refreshProfiles: catalog.refreshProfiles,
    selectAndEnter: catalog.selectAndEnter,
  });

  return {
    profiles: catalog.sortedProfiles,
    snapshot: catalog.snapshot,
    busyProfileId,
    selectedProfileId,
    passwordTarget: unlock.passwordTarget,
    accessView,
    password,
    remember,
    newName: catalog.newName,
    newPassword: catalog.newPassword,
    editingProfileId: catalog.editingProfileId,
    editName: catalog.editName,
    loginEmail: cloud.loginEmail,
    loginPassword: cloud.loginPassword,
    loginRemember,
    signInBusy: cloud.signInBusy,
    githubPending: cloud.githubPending,
    githubUserCode: cloud.githubUserCode,
    registerMode: registration.registerMode,
    registerEmail: registration.registerEmail,
    registerName: registration.registerName,
    registerPassword: registration.registerPassword,
    registerPasswordConfirm: registration.registerPasswordConfirm,
    registerBusy: registration.registerBusy,
    refreshProfiles: catalog.refreshProfiles,
    openProfile: catalog.openProfile,
    selectProfile: catalog.selectProfile,
    enterPasswordState: unlock.enterPasswordState,
    enterLoginState: cloud.enterLoginState,
    enterRegisterState: registration.enterRegisterState,
    backToSelect: catalog.backToSelect,
    submitPassword: unlock.submitPassword,
    switchProfile: catalog.switchProfile,
    setAccessWindowHeight: catalog.setAccessWindowHeight,
    signInWithPassword: cloud.signInWithPassword,
    signInWithGithub: cloud.signInWithGithub,
    cancelGithubSignIn: cloud.cancelGithubSignIn,
    forgotPassword: cloud.forgotPassword,
    submitCloudRegistration: registration.submitCloudRegistration,
    submitLocalRegistration: registration.submitLocalRegistration,
    createLocalAccount: catalog.createLocalAccount,
    renameProfile: catalog.renameProfile,
    removeProfile: catalog.removeProfile,
    disposeAuth: cloud.stopGithubPolling,
  };
}
