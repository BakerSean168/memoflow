<script setup lang="ts">
/**
 * Settings section navigation (Issue #927 shell).
 *
 * Owns the section-name filter only: the search box narrows the visible rows,
 * it does not search inside a section. Sections keep their existing order and
 * labels from the shell; `settings-tab-{value}` remains the stable E2E contract.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Search, X } from '@lucide/vue';
import { LinearSidebarItem } from '@memoflow/ui-vue-shadcn';

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
}>();
const { t } = useI18n();

const query = ref('');
const normalizedQuery = computed(() => query.value.trim().toLowerCase());
const visibleItems = computed(() =>
  normalizedQuery.value
    ? props.items.filter((item) => item.label.toLowerCase().includes(normalizedQuery.value))
    : props.items,
);

function clearQuery(): void {
  query.value = '';
}

function select(value: string): void {
  // Restore the full list so the section that was just picked stays reachable.
  clearQuery();
  emit('select', value);
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-sidebar/70" data-testid="settings-navigation">
    <div class="shrink-0 px-3 pb-1 pt-3">
      <div
        class="flex h-8 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors focus-within:bg-[hsl(var(--hover))] hover:bg-[hsl(var(--hover))]"
      >
        <Search class="size-4 shrink-0 text-muted-foreground/80" aria-hidden="true" />
        <input
          v-model="query"
          type="text"
          class="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          :placeholder="t('setting.navSearch.placeholder')"
          :aria-label="t('setting.navSearch.label')"
          data-testid="settings-nav-search"
          @keydown.esc.stop="clearQuery"
        />
        <button
          v-if="query"
          type="button"
          class="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
          :aria-label="t('setting.navSearch.clear')"
          data-testid="settings-nav-search-clear"
          @click="clearQuery"
        >
          <X class="size-3" aria-hidden="true" />
        </button>
      </div>
    </div>

    <nav
      class="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2"
      :aria-label="t('setting.title')"
    >
      <LinearSidebarItem
        v-for="item in visibleItems"
        :key="item.value"
        :label="item.label"
        :active="props.active === item.value"
        :data-testid="`settings-tab-${item.value}`"
        :aria-current="props.active === item.value ? 'page' : undefined"
        class="h-8"
        @click="select(item.value)"
      />
      <p
        v-if="visibleItems.length === 0"
        role="status"
        class="px-2 py-6 text-center text-xs text-muted-foreground"
        data-testid="settings-nav-empty"
      >
        {{ t('setting.navSearch.empty') }}
      </p>
    </nav>
  </div>
</template>
