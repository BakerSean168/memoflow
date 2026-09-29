<script setup lang="ts">
/**
 * ModuleHeader — 模块页面统一页头（Phase 4 约定）
 *
 * 结构（各模块页面头部的位置契约）：
 * - 第一行：`#leading`（返回/标题/计数）… `#actions`（主操作 + 次操作）；
 * - 第二行：`#subnav`（模块内部导航：筛选、视图切换、分组）。
 * 高度统一 min-h-11；列表、详情、编辑器共享同一页头位置，
 * 避免各模块手写 5 种变体 header。
 */
</script>

<template>
  <header
    class="z-10 flex min-h-11 shrink-0 flex-col justify-center border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.82)] shadow-[0_1px_0_hsl(var(--border)/0.04)] backdrop-blur-sm"
    data-testid="module-header"
  >
    <div class="flex min-h-11 items-center gap-2 px-3 @2xl/panel:px-4">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <slot name="leading" />
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <slot name="actions" />
      </div>
    </div>
    <slot name="subnav" />
  </header>
</template>
