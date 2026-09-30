<template>
  <div class="rounded-lg border p-3">
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm font-medium">
        {{ t('goal.cards.cardsRecordCard.recordValue') }}{{ record.value }}
      </p>
      <p class="text-xs text-muted-foreground">{{ formatProductDateTime(record.recordedAt) }}</p>
    </div>
    <p class="mt-1 text-xs text-muted-foreground">{{ t(`goal.cards.cardsRecordCard.authorship.${record.authorship}`) }}</p>
    <p v-if="record.comment" class="mt-2 text-sm text-muted-foreground">{{ record.comment }}</p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { GoalRecordClientDTO } from '@memoflow/contracts/goal';
import { formatProductDateTime } from '../../../../shared/utils/product-time';

const { t } = useI18n();

defineProps<{
  record: GoalRecordClientDTO;
}>();

</script>
