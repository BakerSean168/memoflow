<!--
  Adapted from T3 Code ComposerPrimaryActions.tsx at 0b42e2e2febf51627d6c150be686c02d26ef2739.
  Copyright (c) 2026 T3 Tools Inc. MIT License; see THIRD_PARTY_NOTICES.md.
-->
<template>
  <Button
    v-if="loading"
    type="button"
    variant="outline"
    size="icon"
    class="h-8 w-8 shrink-0 rounded-full p-0 shadow-none focus-visible:ring-2 focus-visible:ring-ring"
    data-testid="ai-chat-stop-generating"
    :title="t('aiAssistant.dialogs.chat.stopGenerating')"
    :aria-label="t('aiAssistant.dialogs.chat.stopGenerating')"
    @pointerdown.prevent
    @click="$emit('stop')"
  >
    <Square class="h-3.5 w-3.5" />
  </Button>
  <Button
    v-else
    type="button"
    size="icon"
    class="h-8 w-8 shrink-0 rounded-full p-0 shadow-none focus-visible:ring-2 focus-visible:ring-ring"
    :disabled="!canSubmit"
    data-testid="ai-chat-send-message"
    :title="t('aiAssistant.dialogs.chat.sendMessage')"
    :aria-label="t('aiAssistant.dialogs.chat.sendMessage')"
    @pointerdown.prevent
    @click="$emit('send')"
  >
    <ArrowUp class="h-4 w-4" />
  </Button>
</template>

<script setup lang="ts">
import { ArrowUp, Square } from '@lucide/vue';
import { Button } from '@memoflow/ui-vue-shadcn';
import { useI18n } from 'vue-i18n';
defineProps<{ loading: boolean; canSubmit: boolean }>();
defineEmits<{ send: []; stop: [] }>();
const { t } = useI18n();
</script>
