<template>
  <div class="rounded-md bg-muted/50 p-3" data-testid="goal-record-preview" aria-live="polite">
    <template v-if="preview">
      <div class="flex items-center justify-between gap-2 text-sm">
        <div>
          <p class="text-xs text-muted-foreground">{{ t('goal.recordDialog.current') }}</p>
          {{ preview.current }}
        </div>
        <span aria-hidden="true">→</span>
        <div>
          <p class="text-xs text-muted-foreground">{{ t('goal.recordDialog.after') }}</p>
          <strong>{{ preview.after }}</strong>
        </div>
        <span aria-hidden="true">→</span>
        <div>
          <p class="text-xs text-muted-foreground">{{ t('goal.recordDialog.target') }}</p>
          {{ preview.target }}
        </div>
        <span v-if="unit" class="text-xs text-muted-foreground">{{ unit }}</span>
      </div>
      <p class="mt-2 text-xs text-muted-foreground">{{ preview.afterPercentage }}%</p>
      <p
        v-if="!preview.changed"
        class="mt-2 text-xs text-muted-foreground"
        data-testid="goal-record-unchanged"
      >
        {{
          t(
            preview.method === 'Max' || preview.method === 'Min'
              ? 'goal.recordDialog.unchangedSample'
              : 'goal.recordDialog.unchanged',
          )
        }}
      </p>
    </template>
    <p v-else class="text-xs text-muted-foreground">
      {{ t('goal.recordDialog.previewUnavailable') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { GoalRecordPreview } from '@memoflow/goal/client';

defineProps<{ preview: GoalRecordPreview | null; unit?: string | null }>();
const { t } = useI18n();
</script>
