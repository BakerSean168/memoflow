<script setup lang="ts">
/**
 * FilterBar — 「状态 Tabs + 过滤下拉 + 搜索框」标准行（UI_PAGE_REDESIGN_PLAN §0.5）
 *
 * 纯布局容器，全部内容 slot 化：
 *   #tabs     状态 Tabs（含计数）
 *   #filters  过滤下拉组
 *   #search   搜索框（右对齐）
 *   #trailing 行尾附加控件（如视图切换）
 *
 * task / goal / notification 等列表页共用。
 */
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-2 border-b border-border bg-background px-6 py-2"
    data-testid="filter-bar"
  >
    <slot name="tabs" />
    <slot name="filters" />
    <div class="ml-auto flex items-center gap-2">
      <slot name="search" />
      <slot name="trailing" />
    </div>
  </div>
</template>
