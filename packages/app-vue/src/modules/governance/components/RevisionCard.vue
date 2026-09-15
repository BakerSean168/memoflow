<template>
  <div class="rounded-lg border p-4 bg-background">
    <div class="flex items-center justify-between gap-3 mb-3">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium">v{{ revision.revisionNumber }}</span>
        <span
          class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium"
          :class="badgeClass"
        >
          {{ changeLabel }}
        </span>
      </div>
      <span class="text-xs text-muted-foreground">{{ formattedDate }}</span>
    </div>

    <p class="text-xs text-muted-foreground mb-3">
      {{
        t('governance.revisionCard.author', {
          authorId: revision.authorId,
          fields: revision.changedFields.join(', ') || t('governance.revisionCard.noFields'),
        })
      }}
    </p>

    <div v-if="hasDiff" class="space-y-2">
      <div
        v-for="field in revision.changedFields"
        :key="field"
        class="rounded-md border border-muted p-3"
      >
        <p class="text-xs font-medium mb-2">{{ field }}</p>
        <div class="grid grid-cols-1 gap-2 text-xs @2xl/panel:grid-cols-2">
          <div class="rounded bg-destructive/5 p-2">
            <p class="text-muted-foreground mb-1">Before</p>
            <pre class="whitespace-pre-wrap break-words">{{
              stringifyValue(revision.previousValues[field])
            }}</pre>
          </div>
          <div class="rounded bg-primary/5 p-2">
            <p class="text-muted-foreground mb-1">After</p>
            <pre class="whitespace-pre-wrap break-words">{{
              stringifyValue(revision.newValues[field])
            }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RuleRevisionClientDTO } from '@memoflow/contracts/governance';
import { formatProductDateTime } from '../../../shared/utils/product-time';

const props = defineProps<{
  revision: RuleRevisionClientDTO;
}>();

const { t } = useI18n();

const formattedDate = computed(() => formatProductDateTime(props.revision.createdAt));

const hasDiff = computed(() => props.revision.changedFields.length > 0);

const changeLabel = computed(() => {
  switch (props.revision.changeType) {
    case 'Created':
      return t('governance.revisionCard.changeCreated');
    case 'Updated':
      return t('governance.revisionCard.changeUpdated');
    case 'Deprecated':
      return t('governance.revisionCard.changeDeprecated');
    case 'Reactivated':
      return t('governance.revisionCard.changeReactivated');
    default:
      return props.revision.changeType;
  }
});

const badgeClass = computed(() => {
  switch (props.revision.changeType) {
    case 'Created':
      return 'bg-success/15 text-success dark:bg-success/30 dark:text-success';
    case 'Updated':
      return 'bg-info/15 text-info dark:bg-info/30 dark:text-info';
    case 'Deprecated':
      return 'bg-warning/15 text-warning dark:bg-warning/30 dark:text-warning';
    case 'Reactivated':
      return 'bg-primary/10 text-primary';
    default:
      return 'bg-muted text-muted-foreground';
  }
});

function stringifyValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
</script>
