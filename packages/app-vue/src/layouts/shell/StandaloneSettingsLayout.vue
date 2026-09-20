<script setup lang="ts">
/**
 * StandaloneSettingsLayout — STATE D 独立设置场景内容宿主
 *
 * Settings 不进入 BusinessPanel / ShellModule Tab。顶栏由 WindowHeader 的
 * settings mode 单独拥有，因此这里仅提供一个内容滚动宿主，避免重复 48px
 * header 造成 Web 端顶部空白，同时保留 Desktop 的统一拖拽/窗控区域。
 */
</script>

<template>
  <div
    class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground"
    data-testid="standalone-settings-layout"
    data-shell-scene="settings"
  >
    <main class="min-h-0 min-w-0 flex-1 overflow-hidden">
      <slot />
    </main>
  </div>
</template>
