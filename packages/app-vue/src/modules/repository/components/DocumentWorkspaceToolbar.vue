<template>
  <header
    class="z-10 flex min-h-11 min-w-0 shrink-0 items-center gap-2 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.82)] px-3 py-1.5 shadow-[0_1px_0_hsl(var(--border)/0.04)] backdrop-blur-sm @2xl/panel:px-4"
    data-testid="document-workspace-toolbar"
  >
    <div v-if="$slots.leading" class="flex shrink-0 items-center gap-1">
      <slot name="leading" />
    </div>

    <div class="flex min-w-0 flex-1 items-center gap-2">
      <slot />
    </div>

    <div v-if="$slots.actions" class="ml-auto flex shrink-0 items-center gap-1">
      <slot name="actions" />
    </div>
  </header>
</template>
