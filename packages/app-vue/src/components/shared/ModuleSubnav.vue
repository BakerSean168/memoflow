<script setup lang="ts">
/**
 * ModuleSubnav — 模块内部导航行（Phase 4 约定）
 *
 * 承载模块级视图/筛选/分组切换（如 Schedule 的 day/week/month、
 * Notification 的 all/unread、Note 的 notes/recent）。调用方负责
 * tablist/tab + aria-selected 语义；本组件只统一位置与视觉。
 */
</script>

<template>
  <div class="flex min-h-10 shrink-0 items-center gap-1 border-t border-border/60 px-3">
    <slot />
  </div>
</template>
