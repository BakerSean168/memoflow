<template>
  <div class="space-y-3" data-testid="routine-capsule-preview">
    <div>
      <p class="text-xs font-semibold">{{ t('routine.title') }}</p>
      <p class="mt-1 text-xs text-muted-foreground">{{ t('routine.description') }}</p>
    </div>
    <div v-if="loading" class="grid grid-cols-2 gap-2">
      <Skeleton class="h-12 rounded-lg" />
      <Skeleton class="h-12 rounded-lg" />
    </div>
    <div v-else-if="!error" class="grid grid-cols-2 gap-2">
      <div class="rounded-lg bg-muted p-2">
        <p class="text-[10px] text-muted-foreground">{{ t('routine.overview.enabled') }}</p>
        <p class="text-lg font-semibold">{{ enabledCount }}</p>
      </div>
      <div class="rounded-lg bg-muted p-2">
        <p class="text-[10px] text-muted-foreground">{{ t('routine.overview.activeProfiles') }}</p>
        <p class="text-lg font-semibold">{{ activeProfileCount }}</p>
      </div>
    </div>
    <p v-else class="text-xs text-destructive">{{ error }}</p>
    <Button class="w-full" size="sm" variant="outline" @click="emit('view-all')">
      {{ t('routine.title') }}
      <ArrowRight class="ml-1.5 h-3.5 w-3.5" />
    </Button>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowRight } from '@lucide/vue';
import { Button, Skeleton } from '@memoflow/ui-vue-shadcn';
import { useRoutineConfiguration } from '../composables/useRoutineConfiguration';

const emit = defineEmits<{ 'view-all': [] }>();
const { t } = useI18n();
const { loading, error, enabledCount, activeProfileCount, load } = useRoutineConfiguration();

onMounted(() => {
  void load();
});
</script>
