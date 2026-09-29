<template>
  <article
    class="knowledge-markdown"
    data-testid="knowledge-markdown-preview"
    v-html="rendered"
    @click="handleClick"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  renderSafeMarkdown,
  stripMarkdownFrontmatter,
} from '../../../shared/utils/safe-markdown';

const props = defineProps<{ markdown: string; title?: string }>();
const emit = defineEmits<{ vaultLink: [target: string] }>();

function normalizeHeading(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()
    .normalize('NFKC')
    .toLocaleLowerCase();
}

const readingMarkdown = computed(() => {
  const source = stripMarkdownFrontmatter(props.markdown);
  const title = props.title?.trim();
  if (!title) return source;

  const lines = source.split(/\r?\n/);
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex < 0) return source;
  const heading = /^#\s+(.+?)\s*#*\s*$/.exec(lines[firstContentIndex] ?? '');
  if (!heading?.[1] || normalizeHeading(heading[1]) !== normalizeHeading(title)) return source;

  lines.splice(firstContentIndex, 1);
  if (lines[firstContentIndex]?.trim() === '') lines.splice(firstContentIndex, 1);
  return lines.join('\n');
});

const rendered = computed(() => renderSafeMarkdown(readingMarkdown.value));

function handleClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  const link = target?.closest<HTMLElement>('[data-vault-note]');
  const note = link?.dataset['vaultNote'];
  if (!note) return;
  event.preventDefault();
  emit('vaultLink', note);
}
</script>

<style scoped>
.knowledge-markdown {
  width: min(100%, 52rem);
  margin-inline: auto;
  padding: 2rem clamp(1.25rem, 3vw, 3rem) 4rem;
  color: hsl(var(--foreground));
  font-size: 0.95rem;
  line-height: 1.78;
  overflow-wrap: anywhere;
}

.knowledge-markdown :deep(h1),
.knowledge-markdown :deep(h2),
.knowledge-markdown :deep(h3),
.knowledge-markdown :deep(h4),
.knowledge-markdown :deep(h5),
.knowledge-markdown :deep(h6) {
  scroll-margin-top: 1rem;
  color: hsl(var(--foreground));
  font-weight: 650;
  line-height: 1.28;
  letter-spacing: -0.015em;
}

.knowledge-markdown :deep(h1) {
  margin: 0 0 1.25rem;
  font-size: 1.9rem;
}

.knowledge-markdown :deep(h2) {
  margin: 2.25rem 0 0.9rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid hsl(var(--border) / 0.7);
  font-size: 1.45rem;
}

.knowledge-markdown :deep(h3) {
  margin: 1.75rem 0 0.7rem;
  font-size: 1.18rem;
}

.knowledge-markdown :deep(h4) {
  margin: 1.4rem 0 0.6rem;
  font-size: 1.02rem;
}

.knowledge-markdown :deep(p) {
  margin: 0.8rem 0;
}

.knowledge-markdown :deep(strong) {
  font-weight: 650;
}

.knowledge-markdown :deep(a) {
  color: hsl(var(--primary));
  text-decoration: none;
  text-underline-offset: 0.18em;
}

.knowledge-markdown :deep(a:hover) {
  text-decoration: underline;
}

.knowledge-markdown :deep(.internal-link) {
  border-radius: 0.25rem;
  background: hsl(var(--primary) / 0.08);
  padding: 0.08rem 0.22rem;
  color: hsl(var(--primary));
  font-weight: 550;
}

.knowledge-markdown :deep(.vault-embed) {
  border-bottom: 1px dashed hsl(var(--primary) / 0.65);
}

.knowledge-markdown :deep(ul),
.knowledge-markdown :deep(ol) {
  margin: 0.9rem 0;
  padding-left: 1.55rem;
}

.knowledge-markdown :deep(li) {
  margin: 0.32rem 0;
  padding-left: 0.12rem;
}

.knowledge-markdown :deep(li > ul),
.knowledge-markdown :deep(li > ol) {
  margin-block: 0.25rem;
}

.knowledge-markdown :deep(blockquote) {
  margin: 1.2rem 0;
  border-left: 3px solid hsl(var(--border));
  padding: 0.15rem 0 0.15rem 1rem;
  color: hsl(var(--muted-foreground));
}

.knowledge-markdown :deep(.callout) {
  margin: 1.35rem 0;
  border: 1px solid hsl(var(--border));
  border-left: 3px solid hsl(var(--primary));
  border-radius: 0.6rem;
  background: hsl(var(--muted) / 0.32);
  padding: 0.8rem 1rem;
  color: hsl(var(--foreground));
}

.knowledge-markdown :deep(.callout > p:first-child) {
  margin-top: 0;
}

.knowledge-markdown :deep(.callout > p:last-child) {
  margin-bottom: 0;
}

.knowledge-markdown :deep(.callout-title) {
  display: inline-flex;
  align-items: center;
  margin-bottom: 0.35rem;
  font-weight: 650;
}

.knowledge-markdown :deep(code) {
  border-radius: 0.28rem;
  background: hsl(var(--muted) / 0.75);
  padding: 0.12rem 0.34rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.86em;
}

.knowledge-markdown :deep(pre) {
  overflow-x: auto;
  margin: 1.15rem 0;
  border: 1px solid hsl(var(--border));
  border-radius: 0.65rem;
  background: hsl(var(--muted) / 0.42);
  padding: 0.9rem 1rem;
  line-height: 1.62;
}

.knowledge-markdown :deep(pre code) {
  display: block;
  min-width: max-content;
  border-radius: 0;
  background: transparent;
  padding: 0;
  font-size: 0.83rem;
}

.knowledge-markdown :deep(.hljs-keyword),
.knowledge-markdown :deep(.hljs-selector-tag),
.knowledge-markdown :deep(.hljs-literal),
.knowledge-markdown :deep(.hljs-section),
.knowledge-markdown :deep(.hljs-link) {
  color: hsl(var(--primary));
}

.knowledge-markdown :deep(.hljs-string),
.knowledge-markdown :deep(.hljs-title),
.knowledge-markdown :deep(.hljs-name),
.knowledge-markdown :deep(.hljs-type),
.knowledge-markdown :deep(.hljs-attribute) {
  color: hsl(var(--foreground) / 0.92);
}

.knowledge-markdown :deep(.hljs-comment),
.knowledge-markdown :deep(.hljs-quote),
.knowledge-markdown :deep(.hljs-meta) {
  color: hsl(var(--muted-foreground));
  font-style: italic;
}

.knowledge-markdown :deep(table) {
  display: block;
  width: max-content;
  max-width: 100%;
  overflow-x: auto;
  margin: 1.25rem 0;
  border-collapse: collapse;
  border-spacing: 0;
  font-size: 0.9rem;
}

.knowledge-markdown :deep(th),
.knowledge-markdown :deep(td) {
  border: 1px solid hsl(var(--border));
  padding: 0.5rem 0.7rem;
  text-align: left;
  vertical-align: top;
}

.knowledge-markdown :deep(th) {
  background: hsl(var(--muted) / 0.55);
  font-weight: 650;
}

.knowledge-markdown :deep(tr:nth-child(even) td) {
  background: hsl(var(--muted) / 0.16);
}

.knowledge-markdown :deep(hr) {
  margin: 2rem 0;
  border: 0;
  border-top: 1px solid hsl(var(--border));
}

.knowledge-markdown :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1.25rem auto;
  border-radius: 0.5rem;
}

.knowledge-markdown :deep(mark) {
  border-radius: 0.18rem;
  background: hsl(var(--accent));
  padding: 0 0.14rem;
  color: inherit;
}

.knowledge-markdown :deep(.contains-task-list) {
  list-style: none;
  padding-left: 0.2rem;
}

.knowledge-markdown :deep(.task-list-item) {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.knowledge-markdown :deep(.task-list-item-checkbox) {
  flex: 0 0 auto;
  margin-top: 0.18rem;
}

.knowledge-markdown :deep(kbd) {
  border: 1px solid hsl(var(--border));
  border-bottom-width: 2px;
  border-radius: 0.3rem;
  background: hsl(var(--muted) / 0.6);
  padding: 0.06rem 0.35rem;
  font-size: 0.8em;
}

.knowledge-markdown :deep(del) {
  color: hsl(var(--muted-foreground));
}

@media (max-width: 640px) {
  .knowledge-markdown {
    padding: 1.25rem 1rem 3rem;
    font-size: 0.92rem;
  }

  .knowledge-markdown :deep(h1) {
    font-size: 1.6rem;
  }

  .knowledge-markdown :deep(h2) {
    font-size: 1.28rem;
  }
}
</style>
