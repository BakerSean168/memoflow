<script setup lang="ts">
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/vue-3';
import { FileText, ListChecks, Target } from '@lucide/vue';
import { computed } from 'vue';
import type { ComposerContextEntity } from '../composables/types';

const props = defineProps<NodeViewProps>();
const entity = computed(() => props.node.attrs.entity as Omit<ComposerContextEntity, 'origin'>);
</script>

<template>
  <NodeViewWrapper
    as="span"
    contenteditable="false"
    class="inline-flex max-w-full select-none items-baseline rounded-md bg-muted px-1.5 text-xs text-foreground"
    :class="selected ? 'ring-1 ring-ring' : ''"
    :title="entity.path || entity.label"
    data-testid="ai-composer-inline-mention"
  >
    <Target v-if="entity.entityType === 'goal'" class="mr-1 inline size-3 shrink-0 self-center" />
    <ListChecks
      v-else-if="entity.entityType === 'task'"
      class="mr-1 inline size-3 shrink-0 self-center"
    />
    <FileText v-else class="mr-1 inline size-3 shrink-0 self-center" />
    <span class="truncate">{{ entity.label }}</span>
  </NodeViewWrapper>
</template>
