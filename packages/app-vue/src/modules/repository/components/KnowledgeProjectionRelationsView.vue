<template>
  <div
    class="flex min-h-0 flex-col overflow-hidden"
    :class="compact ? 'h-auto' : 'h-full'"
    data-testid="knowledge-projection-relations"
  >
    <div
      class="flex min-h-10 flex-wrap items-center gap-2"
      :class="compact ? 'px-3 py-2' : 'border-b border-[hsl(var(--border-subtle))] px-4 py-2'"
    >
      <span class="text-xs font-medium text-muted-foreground">{{
        t('repository.projection.graphDepth')
      }}</span>
      <div
        class="inline-flex h-8 items-center rounded-lg bg-[hsl(var(--surface-raised)/0.5)] p-0.5 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.52)]"
        role="group"
        :aria-label="t('repository.projection.graphDepth')"
      >
        <button
          v-for="depthOption in depths"
          :key="depthOption"
          type="button"
          class="h-7 min-w-8 rounded px-2 text-xs"
          :class="
            depth === depthOption
              ? 'bg-[hsl(var(--surface-overlay))] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.62)]'
              : 'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--hover))]'
          "
          :aria-pressed="depth === depthOption"
          :data-testid="'knowledge-projection-depth-' + depthOption"
          @click="setDepth(depthOption)"
        >
          {{ depthOption }}
        </button>
      </div>
      <Badge v-if="graph?.truncated" variant="secondary">{{
        t('repository.projection.graphTruncated')
      }}</Badge>
      <span v-if="graph && !compact" class="text-xs text-muted-foreground">
        {{
          t('repository.projection.graphSummary', {
            nodes: graph.nodes.length,
            edges: graph.edges.length,
          })
        }}
      </span>
      <Button
        variant="ghost"
        size="icon"
        class="ml-auto h-8 w-8"
        :disabled="loading"
        :aria-label="t('repository.projection.refreshRelations')"
        :title="t('repository.projection.refreshRelations')"
        data-testid="knowledge-projection-relations-refresh"
        @click="loadGraph"
      >
        <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
      </Button>
    </div>

    <div
      v-if="loading"
      class="grid min-h-0 flex-1 place-items-center text-muted-foreground"
      aria-busy="true"
    >
      <Loader2 class="h-5 w-5 animate-spin" />
    </div>
    <div
      v-else-if="errorMessage"
      class="grid min-h-0 flex-1 place-items-center px-6 text-center"
      role="alert"
    >
      <div>
        <p class="text-sm text-destructive">{{ errorMessage }}</p>
        <Button class="mt-3" variant="outline" size="sm" @click="loadGraph">
          {{ t('common.retry') }}
        </Button>
      </div>
    </div>
    <div v-else-if="graph" class="min-h-0 flex-1 overflow-auto">
      <div
        class="grid min-h-full grid-cols-1"
        :class="compact ? '' : '@3xl/panel:grid-cols-2'"
      >
        <section
          class="border-b"
          :class="compact ? 'px-3 py-3' : 'p-4 @3xl/panel:border-r'"
        >
          <RelationHeading
            :icon="ArrowUpRight"
            :title="t('repository.projection.outgoingLinks')"
            :count="directOutgoingLinks.length"
          />
          <div class="mt-3 space-y-1">
            <button
              v-for="item in directOutgoingLinks"
              :key="item.edge.id"
              type="button"
              class="block w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-[hsl(var(--hover)/0.65)]"
              :data-testid="'knowledge-projection-graph-node-' + item.node.projectionId"
              @click="emit('select', item.node.projectionId)"
            >
              <span class="block truncate text-sm font-medium">{{ item.node.title }}</span>
              <span class="mt-0.5 block truncate text-xs text-muted-foreground">{{
                item.edge.context || item.node.relativePath
              }}</span>
            </button>
            <EmptyRelation v-if="directOutgoingLinks.length === 0">
              {{ t('repository.projection.noOutgoingLinks') }}
            </EmptyRelation>
          </div>
        </section>

        <section class="border-b" :class="compact ? 'px-3 py-3' : 'p-4'">
          <RelationHeading
            :icon="CornerDownLeft"
            :title="t('repository.projection.backlinks')"
            :count="directBacklinks.length"
          />
          <div class="mt-3 space-y-1">
            <button
              v-for="item in directBacklinks"
              :key="item.edge.id"
              type="button"
              class="block w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-[hsl(var(--hover)/0.65)]"
              :data-testid="'knowledge-projection-graph-node-' + item.node.projectionId"
              @click="emit('select', item.node.projectionId)"
            >
              <span class="block truncate text-sm font-medium">{{ item.node.title }}</span>
              <span class="mt-0.5 block truncate text-xs text-muted-foreground">{{
                item.edge.context || item.node.relativePath
              }}</span>
            </button>
            <EmptyRelation v-if="directBacklinks.length === 0">
              {{ t('repository.projection.noBacklinks') }}
            </EmptyRelation>
          </div>
        </section>

        <section
          class="border-b"
          :class="compact ? 'px-3 py-3' : 'p-4 @3xl/panel:border-r'"
        >
          <RelationHeading
            :icon="Network"
            :title="t('repository.projection.relatedNotes')"
            :count="relatedNodes.length"
          />
          <div class="mt-3 grid gap-1 @sm/panel:grid-cols-2">
            <button
              v-for="node in relatedNodes"
              :key="node.projectionId"
              type="button"
              class="min-w-0 rounded-md px-2 py-2 text-left transition-colors hover:bg-[hsl(var(--hover)/0.65)]"
              @click="emit('select', node.projectionId)"
            >
              <span class="block truncate text-sm font-medium">{{ node.title }}</span>
              <span class="mt-0.5 block truncate text-xs text-muted-foreground">
                {{ node.relativePath }} ·
                {{ t('repository.projection.depthValue', { depth: node.depth }) }}
              </span>
            </button>
            <EmptyRelation v-if="relatedNodes.length === 0">
              {{ t('repository.projection.noRelatedNotes') }}
            </EmptyRelation>
          </div>
        </section>

        <section class="border-b" :class="compact ? 'px-3 py-3' : 'p-4'">
          <RelationHeading
            :icon="Unlink"
            :title="t('repository.projection.unresolvedLinks')"
            :count="centerUnresolvedLinks.length"
          />
          <div class="mt-3 space-y-1">
            <div
              v-for="link in centerUnresolvedLinks"
              :key="link.id"
              class="rounded-md px-2 py-2"
            >
              <p class="truncate text-sm font-medium">{{ link.displayText }}</p>
              <p class="mt-0.5 truncate text-xs text-muted-foreground">
                {{
                  link.reason === 'ambiguous'
                    ? t('repository.projection.ambiguousLink')
                    : t('repository.projection.missingLink')
                }}
              </p>
            </div>
            <EmptyRelation v-if="centerUnresolvedLinks.length === 0">
              {{ t('repository.projection.noUnresolvedLinks') }}
            </EmptyRelation>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, watch, type Component, type PropType } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowUpRight, CornerDownLeft, Loader2, Network, RefreshCw, Unlink } from '@lucide/vue';
import { Badge, Button } from '@memoflow/ui-vue-shadcn';
import type {
  KnowledgeNoteLinkGraphEdgeDTO,
  KnowledgeNoteLinkGraphNodeDTO,
  KnowledgeNoteLinkGraphResponse,
} from '@memoflow/contracts/repository';
import { REPOSITORY_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';

const props = withDefaults(defineProps<{ projectionId: string; compact?: boolean }>(), {
  compact: false,
});
const emit = defineEmits<{ select: [projectionId: string] }>();
const { t } = useI18n();
const service = useStrictInject(REPOSITORY_SERVICE_KEY, 'RepositoryService');
const depths = [1, 2, 3] as const;
const depth = ref<1 | 2 | 3>(1);
const graph = ref<KnowledgeNoteLinkGraphResponse | null>(null);
const loading = ref(false);
const errorMessage = ref('');
let loadSequence = 0;

const RelationHeading = defineComponent({
  props: {
    icon: { type: [Object, Function] as PropType<Component>, required: true },
    title: { type: String, required: true },
    count: { type: Number, required: true },
  },
  setup(headingProps) {
    return () =>
      h('div', { class: 'flex items-center gap-2' }, [
        h(headingProps.icon, { class: 'h-4 w-4 text-muted-foreground' }),
        h('h3', { class: 'text-sm font-semibold' }, headingProps.title),
        h(Badge, { variant: 'secondary' }, () => String(headingProps.count)),
      ]);
  },
});

const EmptyRelation = defineComponent({
  setup(_, { slots }) {
    return () =>
      h('p', { class: 'py-5 text-center text-xs text-muted-foreground' }, slots.default?.());
  },
});

const nodesById = computed(
  () => new Map((graph.value?.nodes ?? []).map((node) => [node.projectionId, node])),
);
const directOutgoingLinks = computed(() =>
  (graph.value?.edges ?? [])
    .filter((edge) => edge.sourceProjectionId === props.projectionId)
    .map((edge) => ({ edge, node: nodesById.value.get(edge.targetProjectionId) }))
    .filter(
      (
        item,
      ): item is {
        edge: KnowledgeNoteLinkGraphEdgeDTO;
        node: KnowledgeNoteLinkGraphNodeDTO;
      } => Boolean(item.node),
    ),
);
const directBacklinks = computed(() =>
  (graph.value?.edges ?? [])
    .filter((edge) => edge.targetProjectionId === props.projectionId)
    .map((edge) => ({ edge, node: nodesById.value.get(edge.sourceProjectionId) }))
    .filter(
      (
        item,
      ): item is {
        edge: KnowledgeNoteLinkGraphEdgeDTO;
        node: KnowledgeNoteLinkGraphNodeDTO;
      } => Boolean(item.node),
    ),
);
const relatedNodes = computed(() =>
  (graph.value?.nodes ?? []).filter((node) => node.projectionId !== props.projectionId),
);
const centerUnresolvedLinks = computed(() =>
  (graph.value?.unresolvedLinks ?? []).filter(
    (link) => link.sourceProjectionId === props.projectionId,
  ),
);

async function loadGraph(): Promise<void> {
  const projectionId = props.projectionId;
  if (!projectionId) return;
  const sequence = ++loadSequence;
  loading.value = true;
  errorMessage.value = '';
  const result = await service.getKnowledgeNoteLinkGraph(projectionId, {
    depth: depth.value,
    maxNodes: 40,
  });
  if (sequence !== loadSequence || projectionId !== props.projectionId) return;
  loading.value = false;
  if (!result.ok) {
    graph.value = null;
    errorMessage.value = result.error.message;
    return;
  }
  graph.value = result.data;
}

function setDepth(nextDepth: 1 | 2 | 3): void {
  if (depth.value === nextDepth) return;
  depth.value = nextDepth;
  void loadGraph();
}

watch(
  () => props.projectionId,
  () => {
    loadSequence += 1;
    graph.value = null;
    errorMessage.value = '';
    loading.value = false;
    void loadGraph();
  },
  { immediate: true },
);
</script>
