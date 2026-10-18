<script setup lang="ts">
/**
 * ListPageShell — 列表页标准壳（UI_PAGE_REDESIGN_PLAN §0.1）
 *
 * LinearPageHeader（sticky：标题 + 描述 + 右置操作）
 *   → 可选 FilterBar 行（#filter）
 *   → 内容 max-w-7xl mx-auto px-6 py-6（#default）
 *
 * 适用：仪表盘、目标列表、任务、提醒、通知、治理等「列表 + 过滤」页。
 */
import { LinearPageHeader } from '@memoflow/ui-vue-shadcn';

defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden bg-background">
    <LinearPageHeader :title="title" :description="description" data-testid="list-page-toolbar">
      <template #actions>
        <slot name="actions" />
      </template>
    </LinearPageHeader>

    <slot name="filter" />

    <div
      class="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-stable"
      data-scroll-host="list-page"
      data-testid="list-page-scroll-host"
    >
      <div class="mx-auto w-full max-w-7xl px-6 py-6">
        <slot />
      </div>
    </div>
  </div>
</template>
