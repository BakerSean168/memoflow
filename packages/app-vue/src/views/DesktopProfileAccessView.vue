<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { UserRound } from '@lucide/vue';
import { useDesktopProfiles } from '../shared/composables/useDesktopProfiles';
import DesktopProfileList from '../shared/components/DesktopProfileList.vue';

const { t } = useI18n();
const presenter = useDesktopProfiles({ accessWindow: true });
const { profiles, selectedProfileId, refreshProfiles } = presenter;

onMounted(async () => {
  await refreshProfiles();
  const query = window.location.hash.split('?')[1];
  const targetId = new URLSearchParams(query).get('profileId');
  if (profiles.value.some((profile) => profile.profileId === targetId))
    selectedProfileId.value = targetId;
});
</script>

<template>
  <main
    class="flex min-h-screen w-full items-center justify-center bg-background px-5 py-8 text-foreground"
  >
    <div class="w-full max-w-md space-y-6" data-testid="desktop-profile-access">
      <header class="space-y-2 text-center">
        <div
          class="mx-auto flex h-11 w-11 items-center justify-center rounded-md border bg-muted/40"
        >
          <UserRound class="h-5 w-5" />
        </div>
        <h1 class="text-xl font-semibold">{{ t('auth.profileAccess.title') }}</h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {{ t('auth.profileAccess.description') }}
        </p>
      </header>

      <DesktopProfileList :presenter="presenter" />
    </div>
  </main>
</template>
