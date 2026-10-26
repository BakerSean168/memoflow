<template>
  <main class="poc-shell">
    <aside class="poc-controls" aria-label="Production Planner parity controls">
      <strong>PLAN-4304 production parity harness</strong>
      <button type="button" data-testid="fail-next-mutation" @click="failNext = true">
        Fail next mutation
      </button>
      <div>
        <strong>Last mutation</strong>
        <pre data-testid="last-command">{{ lastCommand }}</pre>
      </div>
      <div>
        <strong>Last outcome</strong>
        <pre data-testid="last-outcome">{{ lastOutcome }}</pre>
      </div>
    </aside>
    <PlannerCalendar
      class="poc-calendar"
      :projections="plannerPocFixture"
      :owner-commands="ownerCommands"
      view="week"
      locale="en-US"
      :initial-date="initialDate"
      @mutation="lastOutcome = JSON.stringify($event, null, 2)"
    />
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  PlannerCalendar,
  type PlannerMutationOutcome,
  type PlannerMutationRequest,
  type PlannerOwnerCommandRouter,
} from '@memoflow/schedule-ui';
import { plannerPocFixture } from './planner-parity.fixture';

const initialDate = Date.parse('2026-08-27T12:00:00Z');
const failNext = ref(false);
const lastCommand = ref('No owner mutation yet');
const lastOutcome = ref('No mutation outcome yet');
const ownerCommands: PlannerOwnerCommandRouter = {
  async route(command: PlannerMutationRequest): Promise<PlannerMutationOutcome> {
    lastCommand.value = JSON.stringify(command, null, 2);
    if (failNext.value) {
      failNext.value = false;
      return { status: 'failed', code: 'POC_FAILURE' };
    }
    return { status: 'applied', ownerType: command.projection.ownerCommandTarget.ownerType };
  },
};
</script>
