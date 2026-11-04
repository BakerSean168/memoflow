import { computed } from 'vue';
import { toast } from 'vue-sonner';
import type { ProfileSummary } from '@memoflow/desktop-contracts';
import type { DesktopProfilesSharedContext } from './useDesktopProfiles';

/** Catalog actions the local Profile unlock composable calls into. */
export interface DesktopProfileUnlockCross {
  selectAndEnter: (profile: ProfileSummary, credentials: { password?: string }) => Promise<boolean>;
}

/** Local Profile unlock: the per-tile password state of the access window. */
export function useDesktopProfileUnlock(
  ctx: DesktopProfilesSharedContext,
  cross: DesktopProfileUnlockCross,
) {
  const { t, profiles, busyProfileId, selectedProfileId, accessView, password, remember } = ctx;

  const passwordTarget = computed(
    () => profiles.value.find((profile) => profile.profileId === selectedProfileId.value) ?? null,
  );

  function enterPasswordState(profile: ProfileSummary): void {
    selectedProfileId.value = profile.profileId;
    password.value = '';
    remember.value = false;
    accessView.value = 'password';
  }

  async function submitPassword(): Promise<void> {
    const profile = passwordTarget.value;
    if (!profile || busyProfileId.value) return;
    if (password.value.length < 8) {
      toast.error(t('auth.profileAccess.passwordRequired'));
      return;
    }
    busyProfileId.value = profile.profileId;
    const entered = await cross.selectAndEnter(profile, { password: password.value });
    if (!entered) busyProfileId.value = null;
    password.value = '';
  }

  return {
    passwordTarget,
    enterPasswordState,
    submitPassword,
  };
}
