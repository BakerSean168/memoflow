<script setup lang="ts">
import { computed } from 'vue';
import { renderSafeMarkdown } from '../../../shared/utils/safe-markdown';

const props = defineProps<{
  content: string;
}>();

const rendered = computed(() => renderSafeMarkdown(props.content));
</script>

<template>
  <div
    class="ai-message-content min-w-0 text-sm leading-7 text-foreground"
    data-testid="ai-message-markdown"
    v-html="rendered"
  />
</template>

<style scoped>
.ai-message-content :deep(p) {
  margin: 0 0 0.8rem;
}

.ai-message-content :deep(p:last-child),
.ai-message-content :deep(ul:last-child),
.ai-message-content :deep(ol:last-child),
.ai-message-content :deep(pre:last-child),
.ai-message-content :deep(blockquote:last-child),
.ai-message-content :deep(table:last-child) {
  margin-bottom: 0;
}

.ai-message-content :deep(h1),
.ai-message-content :deep(h2),
.ai-message-content :deep(h3),
.ai-message-content :deep(h4) {
  margin: 1.35rem 0 0.55rem;
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: -0.015em;
}

.ai-message-content :deep(h1) {
  font-size: 1.2rem;
}

.ai-message-content :deep(h2) {
  font-size: 1.08rem;
}

.ai-message-content :deep(h3),
.ai-message-content :deep(h4) {
  font-size: 0.95rem;
}

.ai-message-content :deep(ul),
.ai-message-content :deep(ol) {
  margin: 0.65rem 0 0.9rem;
  padding-left: 1.35rem;
}

.ai-message-content :deep(li) {
  margin: 0.18rem 0;
}

.ai-message-content :deep(blockquote) {
  margin: 0.9rem 0;
  border-left: 2px solid hsl(var(--border));
  padding-left: 0.85rem;
  color: hsl(var(--muted-foreground));
}

.ai-message-content :deep(a) {
  color: hsl(var(--primary));
  text-decoration: underline;
  text-decoration-color: hsl(var(--primary) / 0.35);
  text-underline-offset: 0.18em;
}

.ai-message-content :deep(code) {
  border-radius: 0.3rem;
  background: hsl(var(--muted) / 0.7);
  padding: 0.12rem 0.3rem;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.84em;
}

.ai-message-content :deep(pre) {
  margin: 0.9rem 0;
  overflow-x: auto;
  border: 1px solid hsl(var(--border) / 0.65);
  border-radius: 0.65rem;
  background: hsl(var(--muted) / 0.35);
  padding: 0.85rem 0.95rem;
}

.ai-message-content :deep(pre code) {
  background: transparent;
  padding: 0;
  font-size: 0.78rem;
  line-height: 1.65;
}

.ai-message-content :deep(table) {
  margin: 0.9rem 0;
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.ai-message-content :deep(th),
.ai-message-content :deep(td) {
  border-bottom: 1px solid hsl(var(--border) / 0.65);
  padding: 0.45rem 0.55rem;
  text-align: left;
  vertical-align: top;
}

.ai-message-content :deep(th) {
  color: hsl(var(--muted-foreground));
  font-weight: 600;
}

.ai-message-content :deep(hr) {
  margin: 1.2rem 0;
  border: 0;
  border-top: 1px solid hsl(var(--border) / 0.65);
}
</style>
