<template>
  <AIWorkGroupRows
    v-if="hasVisibleActivity"
    :turn="resolvedTurn"
    @toggle-turn="handleToggleTurn"
    @toggle-work-group="handleToggleWorkGroup"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import AIWorkGroupRows from './AIWorkGroupRows.vue';
import {
  deriveChatTimelineRows,
  runTimingProjectionRevision,
  type AssistantTurnTimelineRow,
} from '../composables/agentActivity';
import type { ChatItem } from '../composables/types';

const props = defineProps<{
  item?: ChatItem;
  turn?: AssistantTurnTimelineRow;
}>();

const emit = defineEmits<{
  'toggle-turn': [turnKey: string, currentlyExpanded: boolean];
  'toggle-work-group': [groupId: string, currentlyExpanded: boolean];
}>();

const localExpandedTurns = ref(new Set<string>());
const localCollapsedTurns = ref(new Set<string>());
const localExpandedGroups = ref(new Set<string>());
const localCollapsedGroups = ref(new Set<string>());

function toggleSetKey(
  expandedSet: Set<string>,
  collapsedSet: Set<string>,
  key: string,
  currentlyExpanded: boolean,
) {
  if (currentlyExpanded) {
    expandedSet.delete(key);
    collapsedSet.add(key);
  } else {
    collapsedSet.delete(key);
    expandedSet.add(key);
  }
}

const resolvedTurn = computed<AssistantTurnTimelineRow>(() => {
  if (props.turn) return props.turn;
  void runTimingProjectionRevision.value;
  const fallbackItem: ChatItem = props.item ?? {
    id: 'empty',
    role: 'assistant',
    content: '',
    status: 'success',
  };
  const rows = deriveChatTimelineRows({
    timeline: [fallbackItem],
    expandedTurnKeys: localExpandedTurns.value,
    collapsedTurnKeys: localCollapsedTurns.value,
    expandedWorkGroupIds: localExpandedGroups.value,
    collapsedWorkGroupIds: localCollapsedGroups.value,
  });
  const first = rows.find((row): row is AssistantTurnTimelineRow => row.kind === 'assistant-turn');
  if (first) return first;
  return {
    kind: 'assistant-turn',
    id: `turn:item:${fallbackItem.id}`,
    turnKey: `item:${fallbackItem.id}`,
    runId: null,
    items: [fallbackItem],
    primaryItem: fallbackItem,
    status: 'completed',
    phase: 'completed',
    isActive: false,
    isWaiting: false,
    timing: null,
    elapsedMs: null,
    records: [],
    runningRecords: [],
    workRows: [],
    foldRow: null,
    approvals: [],
    askUserRequests: [],
    nativeRequests: [],
    messages: [],
    hasFailedTool: false,
  };
});

const hasVisibleActivity = computed(() => {
  const t = resolvedTurn.value;
  return Boolean(
    t.foldRow ||
    t.workRows.length > 0 ||
    t.isWaiting ||
    t.status === 'failed' ||
    t.status === 'interrupted' ||
    t.hasFailedTool,
  );
});

function handleToggleTurn(turnKey: string, currentlyExpanded: boolean) {
  if (props.turn) {
    emit('toggle-turn', turnKey, currentlyExpanded);
    return;
  }
  const nextExpanded = new Set(localExpandedTurns.value);
  const nextCollapsed = new Set(localCollapsedTurns.value);
  toggleSetKey(nextExpanded, nextCollapsed, turnKey, currentlyExpanded);
  localExpandedTurns.value = nextExpanded;
  localCollapsedTurns.value = nextCollapsed;
}

function handleToggleWorkGroup(groupId: string, currentlyExpanded: boolean) {
  if (props.turn) {
    emit('toggle-work-group', groupId, currentlyExpanded);
    return;
  }
  const nextExpanded = new Set(localExpandedGroups.value);
  const nextCollapsed = new Set(localCollapsedGroups.value);
  toggleSetKey(nextExpanded, nextCollapsed, groupId, currentlyExpanded);
  localExpandedGroups.value = nextExpanded;
  localCollapsedGroups.value = nextCollapsed;
}
</script>
