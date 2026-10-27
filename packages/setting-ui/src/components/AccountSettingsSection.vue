<script setup lang="ts">
/** Account/Auth owner composition with capability-based password gating. */
import { inject } from 'vue';
import { settingUiHost } from '../setting-ui-host';

const { AccountProfileSection, CloudPasswordSection, ExternalAgentConnectionsSection } =
  settingUiHost.components;

const cloudPasswordService = inject(settingUiHost.AUTH_SERVICE_KEY, null);
const externalAgents = inject(settingUiHost.EXTERNAL_AGENT_SERVICE_KEY, null);

</script>

<template>
  <section class="space-y-8" data-testid="account-settings-section">
    <AccountProfileSection />
    <CloudPasswordSection v-if="cloudPasswordService" />
    <ExternalAgentConnectionsSection v-if="externalAgents" />
  </section>
</template>
