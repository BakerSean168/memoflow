import { ref } from 'vue';
import { toast } from 'vue-sonner';
import {
  CloudAuthChannels,
  ProfileAccessChannels,
  type ProfileSummary,
} from '@memoflow/desktop-contracts';
import { profileSchema } from './useDesktopProfileCatalog';
import { openedProfileSchema } from './useDesktopProfileCloudSignIn';
import type { DesktopProfilesSharedContext, DesktopRegisterMode } from './useDesktopProfiles';

/** Catalog actions the Profile registration composable calls into. */
export interface DesktopProfileRegistrationCross {
  enterOpenedProfile: () => Promise<boolean>;
  refreshProfiles: () => Promise<void>;
  selectAndEnter: (
    profile: ProfileSummary,
    credentials: { password?: string },
  ) => Promise<boolean>;
}

/** Registration: one form shape, two backends (cloud / local account). */
export function useDesktopProfileRegistration(
  ctx: DesktopProfilesSharedContext,
  cross: DesktopProfileRegistrationCross,
) {
  const { t, invoke, invokeScoped, accessView, loginRemember } = ctx;

  const registerMode = ref<DesktopRegisterMode>('cloud');
  const registerEmail = ref('');
  const registerName = ref('');
  const registerPassword = ref('');
  const registerPasswordConfirm = ref('');
  const registerBusy = ref(false);

  function enterRegisterState(mode: DesktopRegisterMode = 'cloud'): void {
    resetRegisterState();
    registerMode.value = mode;
    accessView.value = 'register';
  }

  function resetRegisterState(): void {
    registerEmail.value = '';
    registerName.value = '';
    registerPassword.value = '';
    registerPasswordConfirm.value = '';
    registerBusy.value = false;
  }

  /**
   * Cloud registration signs up, adopts the session and enters; the user never
   * has to sign in again. Server-side password rules are echoed verbatim.
   */
  async function submitCloudRegistration(): Promise<void> {
    if (registerBusy.value) return;
    const email = registerEmail.value.trim();
    if (!email || !registerPassword.value) {
      toast.error(t('auth.validation.passwordRequired'));
      return;
    }
    if (registerPassword.value !== registerPasswordConfirm.value) {
      toast.error(t('auth.profileAccess.passwordMismatch'));
      return;
    }
    registerBusy.value = true;
    try {
      const result = await invokeScoped(
        CloudAuthChannels.SIGN_UP,
        openedProfileSchema,
        { scope: 'auth' },
        {
          email,
          password: registerPassword.value,
          name: registerName.value.trim() || undefined,
          remember: loginRemember.value,
        },
      );
      registerPassword.value = '';
      registerPasswordConfirm.value = '';
      if (result) await cross.enterOpenedProfile();
    } finally {
      registerBusy.value = false;
    }
  }

  /**
   * Local registration creates the first-segment local account and enters.
   * The password rule is length 8–100 only, as decided for local accounts.
   */
  async function submitLocalRegistration(): Promise<void> {
    if (registerBusy.value) return;
    const displayName = registerName.value.trim();
    if (!displayName || registerPassword.value.length < 8) {
      toast.error(t('auth.profileAccess.createInvalid'));
      return;
    }
    if (registerPassword.value !== registerPasswordConfirm.value) {
      toast.error(t('auth.profileAccess.passwordMismatch'));
      return;
    }
    registerBusy.value = true;
    const createdPassword = registerPassword.value;
    try {
      const created = await invoke(ProfileAccessChannels.CREATE_LOCAL_ACCOUNT, profileSchema, {
        displayName,
        password: createdPassword,
      });
      registerPassword.value = '';
      registerPasswordConfirm.value = '';
      if (!created) return;
      registerName.value = '';
      await cross.refreshProfiles();
      await cross.selectAndEnter(created.data, { password: createdPassword });
    } finally {
      registerBusy.value = false;
    }
  }

  return {
    registerMode,
    registerEmail,
    registerName,
    registerPassword,
    registerPasswordConfirm,
    registerBusy,
    enterRegisterState,
    resetRegisterState,
    submitCloudRegistration,
    submitLocalRegistration,
  };
}
