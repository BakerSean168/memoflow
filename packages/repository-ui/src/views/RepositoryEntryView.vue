<template>
  <LocalVaultWorkspaceView v-if="desktopBridge" />
  <KnowledgeSourceConnections v-else />
</template>

<script setup lang="ts">
import { inject } from 'vue';
import { repositoryUiHost } from '../repository-ui-host';
import LocalVaultWorkspaceView from './LocalVaultWorkspaceView.vue';
import KnowledgeSourceConnections from '../components/KnowledgeSourceConnections.vue';

const desktopBridge = inject(repositoryUiHost.DESKTOP_BRIDGE_KEY, undefined);
</script>
