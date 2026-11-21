<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ArrowRight, AtSign } from '@lucide/vue';
import { Button } from '@memoflow/ui-vue-shadcn';
import { CapsulePreviewHeader, CapsulePreviewShell } from '../../../shared/components';
defineEmits<{ 'view-all': []; select: [id: string] }>();
const { t } = useI18n();
</script>
<template>
  <CapsulePreviewShell
    max-height="20rem"
    data-testid="note-capsule-preview"
    data-capsule-workspace="note"
  >
    <CapsulePreviewHeader
      :title="t('repository.hub.title')"
      :subtitle="t('repository.hub.contextTitle')"
    />
    <div class="space-y-4 px-4 pb-4">
      <p class="text-sm leading-6 text-muted-foreground">
        <AtSign class="mr-1 inline h-4 w-4" />{{ t('repository.hub.contextDescription') }}
      </p>
      <Button variant="outline" class="w-full justify-between" @click="$emit('view-all')"
        >{{ t('repository.hub.title') }}<ArrowRight class="h-4 w-4"
      /></Button>
    </div>
  </CapsulePreviewShell>
</template>
