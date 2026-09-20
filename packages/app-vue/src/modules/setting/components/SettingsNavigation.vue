<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ArrowLeft } from '@lucide/vue';
import { Button, LinearSidebarItem } from '@memoflow/ui-vue-shadcn';

export interface SettingsNavigationItem {
  value: string;
  label: string;
}

const props = defineProps<{
  items: readonly SettingsNavigationItem[];
  active: string;
}>();
const emit = defineEmits<{
  select: [value: string];
  'return-to-app': [];
}>();
const { t } = useI18n();
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-sidebar/70" data-testid="settings-navigation">
    <div class="shrink-0 px-3 pb-2 pt-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="w-full justify-start gap-2 px-2 text-muted-foreground"
        data-testid="settings-return-to-app"
        @click="emit('return-to-app')"
      >
        <ArrowLeft class="h-4 w-4" />
        {{ t('shell.settings.returnToApp') }}
      </Button>
    </div>

    <nav
      class="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2"
      :aria-label="t('setting.title')"
    >
      <LinearSidebarItem
        v-for="item in props.items"
        :key="item.value"
        :label="item.label"
        :active="active === item.value"
        :data-testid="`settings-tab-${item.value}`"
        :aria-current="active === item.value ? 'page' : undefined"
        class="h-8"
        @click="emit('select', item.value)"
      />
    </nav>
  </div>
</template>
