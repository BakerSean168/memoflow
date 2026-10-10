<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch, watchEffect } from 'vue';
import { routerKey } from 'vue-router';
import { KnowledgeDocumentIdSchema } from '@memoflow/contracts/repository';
import { renderSafeMarkdown } from '../../../shared/utils/safe-markdown';

const props = withDefaults(
  defineProps<{
    content: string;
    generating?: boolean;
  }>(),
  { generating: false },
);

const STREAM_MARKDOWN_RENDER_MS = 120;
const router = inject(routerKey, undefined);
function openReference(event: MouseEvent) {
  if (
    !router ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const target = event.target instanceof Element ? event.target.closest('a') : null;
  const href = target?.getAttribute('href');
  if (!href) return;
  const noteId = /^\/repository\?note=([A-Za-z0-9_-]+)$/.exec(href)?.[1];
  if (
    !/^\/(goals|tasks)\/[A-Za-z0-9_-]+$/.test(href) &&
    !KnowledgeDocumentIdSchema.safeParse(noteId).success
  )
    return;
  event.preventDefault();
  void router.push(href);
}
const rendered = ref(renderSafeMarkdown(props.content));
const contentElement = ref<HTMLElement | null>(null);
// v-html creates native links. Bind to those semantic controls after each
// render so keyboard activation works without making the text container clickable.
watchEffect(
  (onCleanup) => {
    void rendered.value;
    const links = [...(contentElement.value?.querySelectorAll('a') ?? [])];
    links.forEach((link) => link.addEventListener('click', openReference));
    onCleanup(() => links.forEach((link) => link.removeEventListener('click', openReference)));
  },
  { flush: 'post' },
);
let pendingContent = props.content;
let renderTimer: ReturnType<typeof setTimeout> | null = null;

function cancelRenderTimer() {
  if (renderTimer === null) return;
  clearTimeout(renderTimer);
  renderTimer = null;
}

function renderPendingContent() {
  cancelRenderTimer();
  rendered.value = renderSafeMarkdown(pendingContent);
}

watch(
  () => [props.content, props.generating] as const,
  ([content, generating]) => {
    pendingContent = content;
    if (!generating) {
      renderPendingContent();
      return;
    }
    if (renderTimer !== null) return;
    renderTimer = setTimeout(renderPendingContent, STREAM_MARKDOWN_RENDER_MS);
  },
);

onBeforeUnmount(cancelRenderTimer);
</script>

<template>
  <div
    ref="contentElement"
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
