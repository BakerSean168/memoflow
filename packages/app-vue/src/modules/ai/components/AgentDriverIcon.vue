<script setup lang="ts">
import { computed, type Component } from 'vue';
import { Bot, Pi, Zap } from '@lucide/vue';
import type { AgentDriverKind } from '@memoflow/contracts/ai';
import { agentBrandGlyphs, brandGlyphTransform } from './agentBrandGlyphs';

const props = defineProps<{ driver: AgentDriverKind | string }>();

// Placeholders for drivers whose verified brand glyph has not landed yet.
const placeholderIcons: Record<string, Component> = {
  mastra: Bot,
  pi: Pi,
  dsh: Zap,
};

const glyph = computed(
  () => (agentBrandGlyphs as Record<string, (typeof agentBrandGlyphs)[string] | undefined>)[
    props.driver
  ],
);
const placeholder = computed(() => placeholderIcons[props.driver] ?? Bot);
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
  <component :is="placeholder" v-else class="size-4 shrink-0" aria-hidden="true" />
</template>
