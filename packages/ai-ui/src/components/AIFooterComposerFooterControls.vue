<!--
  Adapted from T3 Code ComposerFooterControls.tsx / ComposerPrimaryActions.tsx at
  0b42e2e2febf51627d6c150be686c02d26ef2739.
  Copyright (c) 2026 T3 Tools Inc. MIT License; see THIRD_PARTY_NOTICES.md.
-->
<template>
  <div class="mt-3 flex min-w-0 items-center gap-2" data-testid="ai-composer-footer-controls">
    <div class="flex min-w-0 flex-1 items-center" data-testid="ai-composer-attachments">
      <slot name="attachments" />
    </div>
    <div class="flex min-w-0 shrink items-center gap-1.5" data-testid="ai-composer-actions">
      <div class="flex min-w-0 items-center gap-1" data-testid="ai-composer-options">
        <slot name="options" />
      </div>
      <slot />
    </div>
  </div>
</template>
