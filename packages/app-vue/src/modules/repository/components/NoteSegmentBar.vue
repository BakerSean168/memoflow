<template>
  <header
    class="z-10 flex min-h-12 shrink-0 flex-wrap items-center gap-1 border-b bg-background/80 px-2 py-2 backdrop-blur-sm @2xl/panel:px-4"
    data-testid="note-page-toolbar"
  >
    <!-- Phase 4：分区切换使用 tablist/tab/aria-selected（与 Schedule/Notification 一致）。 -->
    <div
      role="tablist"
      :aria-label="t('repository.segments.title')"
      class="flex min-w-0 items-center gap-1"
    >
      <button
        v-for="segment in segments"
        :key="segment.value"
        type="button"
        role="tab"
        :aria-selected="active === segment.value"
        :data-testid="`note-segment-${segment.value}`"
        class="rounded-md px-3 py-1.5 text-sm transition-colors"
        :class="
          active === segment.value
            ? 'bg-secondary font-medium text-foreground'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        "
        @click="$emit('select', segment.value)"
      >
        <component :is="segment.icon" class="mr-1.5 inline-block h-3.5 w-3.5 align-[-2px]" />
        {{ segment.label }}
      </button>
    </div>
    <div id="note-page-toolbar-actions" class="ml-auto flex min-w-0 items-center gap-1" />
  </header>
</template>

<script setup lang="ts">
/**
 * NoteSegmentBar — Note 面板顶部 [笔记 | 规范] 分区切换（UI 重构 V2 §3 / §6 Note）
 *
 * 笔记 = /repository（Local Vault 或 knowledge projection）；规范 = /governance/**。
 * 路由 path 不变，仅在 Note 壳内切换分区导航。
 */
import { computed, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { BookOpen, ShieldCheck } from '@lucide/vue';
import { shouldRenderGovernanceSegment } from '../../governance/governance-surface-policy';

export type NoteSegment = 'notes' | 'governance';

interface NoteSegmentOption {
  value: NoteSegment;
  label: string;
  icon: Component;
}

const props = defineProps<{
  active: NoteSegment;
}>();

defineEmits<{
  select: [segment: NoteSegment];
}>();

const { t } = useI18n();

const segments = computed<NoteSegmentOption[]>(() => {
  const items: NoteSegmentOption[] = [
    {
      value: 'notes',
      label: t('repository.segments.notes'),
      icon: BookOpen,
    },
  ];

  if (shouldRenderGovernanceSegment(props.active)) {
    items.push({
      value: 'governance',
      label: t('repository.segments.governance'),
      icon: ShieldCheck,
    });
  }

  return items;
});
</script>
