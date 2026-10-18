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

    <!-- 同主会话侧栏底部账户区共享位置、边框和 44px 高度 -->
    <div
      class="flex h-11 shrink-0 items-center border-t border-[hsl(var(--border-subtle))] px-2.5"
      data-testid="settings-navigation-footer"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-8 w-full min-w-0 justify-start gap-2 rounded-md px-1.5 text-left text-muted-foreground hover:bg-[hsl(var(--hover))] hover:text-foreground"
        data-testid="settings-return-to-app"
        @click="emit('return-to-app')"
      >
        <ArrowLeft class="h-4 w-4 shrink-0" />
        <span class="min-w-0 truncate">{{ t('shell.settings.returnToApp') }}</span>
      </Button>
    </div>
  </div>
</template>
