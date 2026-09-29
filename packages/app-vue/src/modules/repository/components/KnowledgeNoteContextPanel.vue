<template>
  <div class="flex h-full min-h-0 flex-col bg-background" data-testid="knowledge-note-context-panel">
    <div class="flex h-11 shrink-0 items-center gap-2 border-b px-3">
      <PanelRight class="h-4 w-4 text-muted-foreground" />
      <span class="text-sm font-medium">{{ t('repository.projection.contextTitle') }}</span>
      <Button
        variant="ghost"
        size="icon"
        class="ml-auto h-7 w-7"
        :aria-label="t('common.close')"
        data-testid="knowledge-context-close"
        @click="emit('close')"
      >
        <X class="h-3.5 w-3.5" />
      </Button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <section class="border-b px-3 py-3">
        <div class="flex items-center gap-2">
          <ListTree class="h-3.5 w-3.5 text-muted-foreground" />
          <h3 class="text-xs font-semibold">{{ t('repository.projection.outlineTitle') }}</h3>
          <Badge variant="secondary" class="ml-auto px-1.5 text-[10px]">{{ outline.length }}</Badge>
        </div>
        <div v-if="outline.length" class="mt-2 space-y-0.5">
          <button
            v-for="item in outline"
            :key="item.level + ':' + item.label"
            type="button"
            class="block w-full truncate rounded-md py-1.5 text-left text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            :class="item.level >= 3 ? 'pl-4 pr-2' : 'px-2'"
            @click="scrollToHeading(item.label)"
          >
            {{ item.label }}
          </button>
        </div>
        <p v-else class="mt-2 px-2 py-2 text-xs text-muted-foreground">
          {{ t('repository.projection.noOutline') }}
        </p>
      </section>

      <section>
        <div class="flex items-center gap-2 px-3 pt-3">
          <Link2 class="h-3.5 w-3.5 text-muted-foreground" />
          <h3 class="text-xs font-semibold">{{ t('repository.projection.linksTitle') }}</h3>
        </div>
        <KnowledgeProjectionRelationsView
          :projection-id="note.id"
          compact
          @select="emit('select', $event)"
        />
      </section>

      <section class="border-t px-3 py-3">
        <div class="flex items-center gap-2">
          <Info class="h-3.5 w-3.5 text-muted-foreground" />
          <h3 class="text-xs font-semibold">{{ t('repository.projection.metadataTitle') }}</h3>
        </div>
        <dl class="mt-2 space-y-2 text-xs">
          <div>
            <dt class="text-muted-foreground">{{ t('repository.projection.notePath') }}</dt>
            <dd class="mt-0.5 break-all font-mono text-[11px] text-foreground/90">
              {{ note.relativePath }}
            </dd>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <dt class="text-muted-foreground">{{ t('repository.projection.commitLabel') }}</dt>
              <dd class="mt-0.5 font-mono text-[11px]">{{ note.commitSha.slice(0, 8) }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">{{ t('repository.projection.updatedLabel') }}</dt>
              <dd class="mt-0.5 text-[11px]">{{ formattedUpdatedAt }}</dd>
            </div>
          </div>
          <div>
            <dt class="text-muted-foreground">{{ t('repository.projection.stableReferenceLabel') }}</dt>
            <dd class="mt-0.5 text-[11px]">
              {{
                note.knowledgeDocumentId
                  ? t('repository.projection.stableReferenceReady')
                  : t('repository.projection.stableReferenceMissing')
              }}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Badge, Button } from '@memoflow/ui-vue-shadcn';
import { Info, Link2, ListTree, PanelRight, X } from '@lucide/vue';
import type { KnowledgeNoteProjectionClientDTO } from '@memoflow/contracts/repository';
import { useI18n } from 'vue-i18n';
import { stripMarkdownFrontmatter } from '../../../shared/utils/safe-markdown';
import KnowledgeProjectionRelationsView from './KnowledgeProjectionRelationsView.vue';

const props = defineProps<{ note: KnowledgeNoteProjectionClientDTO }>();
const emit = defineEmits<{ select: [projectionId: string]; close: [] }>();
const { t, locale } = useI18n();

const outline = computed(() => {
  const source = stripMarkdownFrontmatter(props.note.markdownContent);
  const items: Array<{ level: number; label: string }> = [];
  let inFence = false;

  for (const line of source.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match?.[1] || !match[2]) continue;
    const label = match[2]
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .trim();
    if (!label || (match[1].length === 1 && label === props.note.title)) continue;
    items.push({ level: match[1].length, label });
    if (items.length >= 24) break;
  }
  return items;
});

const formattedUpdatedAt = computed(() =>
  new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(props.note.updatedAt)),
);

function scrollToHeading(label: string): void {
  const heading = document.getElementById('vault-heading:' + encodeURIComponent(label));
  heading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>
