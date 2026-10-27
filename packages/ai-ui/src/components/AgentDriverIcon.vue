<script setup lang="ts">
import { computed } from 'vue';
import { Bot } from '@lucide/vue';
import type { AgentDriverKind } from '@memoflow/ai-contracts';
import { agentBrandGlyphs, brandGlyphTransform } from './agent-brand-glyphs';

const props = defineProps<{ driver: AgentDriverKind | string }>();

const glyph = computed(
  () =>
    (agentBrandGlyphs as Record<string, (typeof agentBrandGlyphs)[string] | undefined>)[
      props.driver
    ],
);
</script>
<template>
  <svg
    v-if="glyph"
    :viewBox="glyph.viewBox"
    fill="currentColor"
    aria-hidden="true"
    class="size-4 shrink-0"
  >
    <g :transform="brandGlyphTransform(glyph)">
      <path v-for="sourcePath of glyph.paths" :key="sourcePath" :d="sourcePath" />
    </g>
  </svg>
  <Bot v-else class="size-4 shrink-0" aria-hidden="true" />
</template>
