<script setup lang="ts">
/** Account/Auth owner composition with capability-based password gating. */
import { defineAsyncComponent, inject } from 'vue';
import { AccountProfileSection } from '@memoflow/account-ui';
import { AUTH_SERVICE_KEY, EXTERNAL_AGENT_SERVICE_KEY } from '../../../di/keys';

const CloudPasswordSection = defineAsyncComponent(() =>
  import('@memoflow/account-ui').then((module) => module.CloudPasswordSection),
);
const cloudPasswordService = inject(AUTH_SERVICE_KEY, null);
const externalAgents = inject(EXTERNAL_AGENT_SERVICE_KEY, null);
const ExternalAgentConnectionsSection = defineAsyncComponent(() =>
  import('@memoflow/account-ui').then((module) => module.ExternalAgentConnectionsSection),
);
</script>

<template>
  <section class="space-y-8" data-testid="account-settings-section">
    <AccountProfileSection />
    <CloudPasswordSection v-if="cloudPasswordService" />
    <ExternalAgentConnectionsSection v-if="externalAgents" />
  </section>
</template>
