<script setup lang="ts">
/** Account/Auth owner composition with capability-based password gating. */
import { inject, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeft } from '@lucide/vue';
import { Button } from '@memoflow/ui-vue-shadcn';
import { settingUiHost } from '../setting-ui-host';

const { AccountSettingsComposition, CloudPasswordSection, ExternalAgentConnectionsSection } =
  settingUiHost.components;
const { t } = useI18n();
const connectionsHeading = ref<HTMLElement | null>(null);
const connectionsTrigger = ref<{ focus(): void } | null>(null);

const page = defineModel<'overview' | 'devices' | 'applications' | 'tokens'>('page', {
  default: 'overview',
});
const cloudPasswordService = inject(settingUiHost.AUTH_SERVICE_KEY, null);
const externalAgents = inject(settingUiHost.EXTERNAL_AGENT_SERVICE_KEY, null);
watch(page, async (value, previous) => {
  await nextTick();
  if (value === 'applications' || value === 'tokens') connectionsHeading.value?.focus();
  else if (previous === 'applications' || previous === 'tokens') connectionsTrigger.value?.focus();
});
</script>

<template>
  <section class="space-y-8" data-testid="account-settings-section">
    <AccountSettingsComposition
      v-if="page === 'overview' || page === 'devices'"
      :page="page === 'devices' ? 'devices' : 'overview'"
      @update:page="page = $event"
    >
      <template v-if="cloudPasswordService" #password
        ><CloudPasswordSection v-if="cloudPasswordService"
      /></template>
      <template v-if="externalAgents" #connections>
        <ExternalAgentConnectionsSection
          ref="connectionsTrigger"
          summary
          @open="page = $event === 'oauth' ? 'applications' : 'tokens'"
        />
      </template>
    </AccountSettingsComposition>
    <section v-else class="space-y-8" data-testid="account-connections-page">
      <Button
        variant="ghost"
        class="gap-2"
        data-testid="account-connections-back"
        @click="page = 'overview'"
      >
        <ArrowLeft class="size-4" aria-hidden="true" />{{ t('account.settings.backToAccount') }}
      </Button>
      <h2 ref="connectionsHeading" tabindex="-1" class="sr-only outline-none">
        {{
          page === 'applications'
            ? t('account.externalAgents.oauthTitle')
            : t('account.externalAgents.patTitle')
        }}
      </h2>
      <ExternalAgentConnectionsSection
        v-if="externalAgents"
        :view="page === 'applications' ? 'oauth' : 'tokens'"
      />
    </section>
  </section>
</template>
