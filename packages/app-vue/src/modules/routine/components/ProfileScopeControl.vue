<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <ProductPropertyChip
        :disabled="disabled"
        :aria-label="t('routine.form.profiles')"
        data-testid="routine-profile-picker"
      >
        <template #icon><Layers3 class="h-3.5 w-3.5" /></template>
        {{ selectedProfilesLabel }}
      </ProductPropertyChip>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-64">
      <DropdownMenuLabel>{{ t('routine.form.profiles') }}</DropdownMenuLabel>
      <DropdownMenuItem v-if="profiles.length === 0" disabled>
        {{ t('routine.profile.noProfiles') }}
      </DropdownMenuItem>
      <DropdownMenuCheckboxItem
        v-for="profile in profiles"
        :key="profile.id"
        :model-value="selectedProfileIds.includes(profile.id)"
        :data-testid="`routine-profile-membership-${profile.id}`"
        @update:model-value="toggleProfileSelection(profile.id)"
        @select.prevent
      >
        <span
          class="mr-2 h-1.5 w-1.5 shrink-0 rounded-full"
          :class="profile.active ? 'bg-success' : 'bg-muted-foreground/30'"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1 truncate">{{ profile.name }}</span>
      </DropdownMenuCheckboxItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Layers3 } from '@lucide/vue';
import type { RoutineProfileDto } from '@memoflow/contracts/routine';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@memoflow/ui-vue-shadcn';
import { ProductPropertyChip } from '../../../shared/components';

const props = defineProps<{
  profiles: readonly RoutineProfileDto[];
  disabled?: boolean;
}>();
const selectedProfileIds = defineModel<string[]>('selectedProfileIds', { required: true });
const { t } = useI18n();

const selectedProfilesLabel = computed(() => {
  const selected = props.profiles.filter((profile) =>
    selectedProfileIds.value.includes(profile.id),
  );
  if (selected.length === 0) return t('routine.form.profiles');
  if (selected.length === 1) return selected[0]!.name;
  return t('routine.form.profilesSummary', {
    name: selected[0]!.name,
    count: selected.length - 1,
  });
});

function toggleProfileSelection(profileId: string): void {
  selectedProfileIds.value = selectedProfileIds.value.includes(profileId)
    ? selectedProfileIds.value.filter((id) => id !== profileId)
    : [...selectedProfileIds.value, profileId];
}
</script>
