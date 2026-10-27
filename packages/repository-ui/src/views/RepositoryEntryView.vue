<template>
  <LocalVaultWorkspaceView v-if="desktopBridge" />
  <KnowledgeProjectionWorkspaceView v-else />
</template>

<script setup lang="ts">
import { inject } from 'vue';
import { repositoryUiHost } from '../repository-ui-host';
import LocalVaultWorkspaceView from './LocalVaultWorkspaceView.vue';
import KnowledgeProjectionWorkspaceView from './KnowledgeProjectionWorkspaceView.vue';

const desktopBridge = inject(repositoryUiHost.DESKTOP_BRIDGE_KEY, undefined);
</script>
