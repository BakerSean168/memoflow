<template>
  <div class="min-w-0" data-testid="document-source-status">
    <div class="flex min-w-0 items-center gap-2">
      <div v-if="$slots.icon" class="shrink-0 text-muted-foreground">
        <slot name="icon" />
      </div>
      <span class="min-w-0 truncate text-sm font-semibold">{{ title }}</span>
      <Badge v-if="countLabel" variant="secondary" class="shrink-0 px-1.5 text-[10px]">
        {{ countLabel }}
      </Badge>
      <Badge
        v-if="statusLabel"
        :variant="statusTone === 'warning' ? 'outline' : 'secondary'"
        class="shrink-0 max-w-40 truncate px-1.5 text-[10px]"
        :data-testid="statusTestId"
      >
        {{ statusLabel }}
      </Badge>
      <Loader2
        v-if="syncing"
        class="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
        :data-testid="syncingTestId"
        :aria-label="syncingLabel"
        :title="syncingLabel"
      />
      <div v-if="$slots.actions" class="ml-auto flex shrink-0 items-center gap-0.5">
        <slot name="actions" />
      </div>
    </div>

    <div
      v-if="subtitle"
      class="mt-1 min-w-0 truncate text-[11px] text-muted-foreground"
      :title="subtitle"
    >
      {{ subtitle }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { Loader2 } from '@lucide/vue';
import { Badge } from '@memoflow/ui-vue-shadcn';

withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    countLabel?: string;
    statusLabel?: string;
    statusTone?: 'default' | 'warning';
    statusTestId?: string;
    syncing?: boolean;
    syncingLabel?: string;
    syncingTestId?: string;
  }>(),
  {
    subtitle: undefined,
    countLabel: undefined,
    statusLabel: undefined,
    statusTone: 'default',
    statusTestId: 'document-source-status-label',
    syncing: false,
    syncingLabel: undefined,
    syncingTestId: 'document-source-syncing',
  },
);
</script>
