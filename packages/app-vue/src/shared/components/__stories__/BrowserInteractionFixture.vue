<script setup lang="ts">
/**
 * Deterministic real-Chromium interaction surface for T3 (#605).
 * Mount production Vue components; never simulate Tab, FocusTrap, Portal or
 * Popover behavior with DOM stubs. No API, database or native Electron access.
 */
import { ref } from 'vue';
import type { Instant } from '@memoflow/shared-primitives';
import ProductEditorFrame from '@memoflow/app-vue/shared/components/ProductEditorFrame.vue';
import ProductDateTimePicker from '@memoflow/app-vue/shared/components/ProductDateTimePicker.vue';
import ProductSingleSelectFilter from '@memoflow/app-vue/shared/components/ProductSingleSelectFilter.vue';
import AIComposerControls from '@memoflow/ai-ui/components/AIComposerControls.vue';
import { MonthDaySelector, WeekdaySelector } from '@memoflow/task-ui';

const props = defineProps<{
  scenario?: 'dialog' | 'panel' | 'picker' | 'filter' | 'recurrence' | 'model';
}>();
const scenario = props.scenario ?? new URLSearchParams(location.search).get('scenario') ?? 'dialog';
const editorOpen = ref(false);
const pickerOpen = ref(false);
const pickedTime = ref<Instant | null>(Date.parse('2026-10-16T13:45:00Z') as Instant);
const filterValue = ref('all');
const agents = [
  {
    id: 'agent:mastra',
    name: 'Mastra',
    driver: 'mastra' as const,
    configured: true,
    enabled: true,
  },
  {
    id: 'agent:blocked',
    name: 'Blocked Agent',
    driver: 'mastra' as const,
    configured: true,
    enabled: true,
    switchBlockedReason: 'incompatible' as const,
  },
];
const models = [
  {
    key: 'agent:mastra::reference::model-a',
    agentInstanceId: 'mastra',
    agentKey: 'agent:mastra',
    providerId: 'reference',
    providerName: 'Reference Provider',
    modelId: 'model-a',
    modelName: 'Model Alpha',
  },
  {
    key: 'agent:mastra::reference::model-b',
    agentInstanceId: 'mastra',
    agentKey: 'agent:mastra',
    providerId: 'reference',
    providerName: 'Reference Provider',
    modelId: 'model-b',
    modelName: 'Model Beta',
  },
  {
    key: 'agent:blocked::reference::model-c',
    agentInstanceId: 'blocked',
    agentKey: 'agent:blocked',
    providerId: 'reference',
    providerName: 'Reference Provider',
    modelId: 'model-c',
    modelName: 'Model Blocked',
  },
];
const selectedAgentId = ref('agent:mastra');
const selectedModelKey = ref(models[0]!.key);
const selectedEvidence = ref('none');
const weekdays = ref<number[]>([1]);
const monthDays = ref<number[]>([15]);
function chooseModel(modelKey: string, agentId: string) {
  selectedAgentId.value = agentId;
  selectedModelKey.value = modelKey;
  selectedEvidence.value = `${agentId}::${modelKey}`;
}
</script>

<template>
  <main
    class="relative flex h-screen flex-col gap-6 overflow-hidden bg-background p-10 text-foreground"
    data-testid="t3-interaction-fixture"
    :data-scenario="scenario"
  >
    <h1 class="text-lg font-semibold">T3 production component browser interactions</h1>

    <section v-if="scenario === 'dialog'" data-testid="t3-global-dialog">
      <button type="button" data-testid="t3-open-editor" @click="editorOpen = true">
        Open editor
      </button>
      <ProductEditorFrame
        v-model:open="editorOpen"
        presentation="dialog"
        test-id="t3-editor"
        title-id="t3-editor-title"
        initial-focus-selector="[data-testid='t3-draft']"
      >
        <template #title>Reference editor</template>
        <label for="t3-global-draft">Draft</label>
        <input id="t3-global-draft" data-testid="t3-draft" placeholder="Draft text" />
        <button type="button" data-testid="t3-editor-next">Next action</button>
        <template #footer>
          <button type="button" data-testid="t3-editor-cancel" @click="editorOpen = false">
            Cancel
          </button>
          <button type="button" data-testid="t3-editor-save" @click="editorOpen = false">
            Save
          </button>
        </template>
      </ProductEditorFrame>
    </section>

    <section
      v-else-if="scenario === 'panel'"
      class="relative h-[530px] w-[760px] overflow-hidden rounded-lg border"
      data-testid="t3-panel-container"
    >
      <button data-testid="t3-open-editor" type="button" @click="editorOpen = true">
        Open panel editor
      </button>
      <ProductEditorFrame
        v-model:open="editorOpen"
        :inert="pickerOpen"
        presentation="panel"
        test-id="t3-editor"
        title-id="t3-editor-title"
        initial-focus-selector="[data-testid='t3-draft']"
      >
        <template #title>Reference panel editor</template>
        <label for="t3-panel-draft">Draft</label>
        <input id="t3-panel-draft" data-testid="t3-draft" placeholder="Draft text" />
        <button data-testid="t3-open-picker" type="button" @click="pickerOpen = true">
          Choose date and time
        </button>
        <template #footer>
          <button type="button" data-testid="t3-editor-save" @click="editorOpen = false">
            Save
          </button>
        </template>
      </ProductEditorFrame>
      <ProductDateTimePicker
        v-model:open="pickerOpen"
        v-model="pickedTime"
        title="Reference time"
        test-id="t3-date-time-picker"
        presentation="panel"
      />
    </section>

    <section v-else-if="scenario === 'picker'">
      <button type="button" data-testid="t3-open-picker" @click="pickerOpen = true">
        Choose time
      </button>
      <ProductDateTimePicker
        v-model:open="pickerOpen"
        v-model="pickedTime"
        title="Reference time"
        test-id="t3-date-time-picker"
      />
    </section>

    <section v-else-if="scenario === 'filter'">
      <ProductSingleSelectFilter
        v-model="filterValue"
        test-id="t3-filter"
        accessible-label="Filter status"
        :options="[
          { value: 'all', label: 'All' },
          { value: 'active', label: 'Active' },
          { value: 'blocked', label: 'Disabled option', disabled: true },
        ]"
      />
      <p data-testid="t3-filter-value">{{ filterValue }}</p>
      <button type="button" data-testid="t3-filter-next">Next focus target</button>
    </section>

    <section v-else-if="scenario === 'recurrence'" class="w-[630px] space-y-6">
      <button type="button" data-testid="t3-before-weekdays">Focus before recurrence</button>
      <div data-testid="t3-weekdays"><WeekdaySelector v-model="weekdays" /></div>
      <p data-testid="t3-weekday-selection">{{ weekdays.join(',') }}</p>
      <div data-testid="t3-month-days"><MonthDaySelector v-model="monthDays" /></div>
      <p data-testid="t3-month-day-selection">{{ monthDays.join(',') }}</p>
    </section>

    <section v-else-if="scenario === 'model'" class="max-w-lg space-y-4">
      <AIComposerControls
        :agents="agents"
        :selected-agent-id="selectedAgentId"
        :models="models"
        :selected-model-key="selectedModelKey"
        permission-mode="supervised"
        :native="false"
        :disabled="false"
        @select-model="chooseModel"
      />
      <p data-testid="t3-model-selection">{{ selectedEvidence }}</p>
      <button type="button" data-testid="t3-model-next">Next focus target</button>
    </section>
  </main>
</template>
