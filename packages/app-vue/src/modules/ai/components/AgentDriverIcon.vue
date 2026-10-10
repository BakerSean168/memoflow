<script setup lang="ts">
import { computed, type Component } from 'vue';
import { Asterisk, Bot, Pi, Terminal, Zap } from '@lucide/vue';
import type { AgentDriverKind } from '@memoflow/contracts/ai';
const props = defineProps<{ driver: AgentDriverKind | string }>();
const icons: Record<string, Component> = {
  mastra: Bot,
  codex: Terminal,
  claude: Asterisk,
  pi: Pi,
  dsh: Zap,
};
const icon = computed(() => icons[props.driver] ?? Bot);
</script>
<template>
  <component :is="icon" class="size-4 shrink-0" aria-hidden="true" />
</template>
