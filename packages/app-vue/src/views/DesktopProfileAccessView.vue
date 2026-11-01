<script setup lang="ts">
import { onMounted } from 'vue';
import { useDesktopProfiles } from '../shared/composables/useDesktopProfiles';
import DesktopProfileList from '../shared/components/DesktopProfileList.vue';

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
      <DesktopProfileList :presenter="presenter" />
    </div>
  </main>
</template>
