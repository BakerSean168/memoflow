import type { App } from 'vue';
import { createCloudAuthHttpClient, createExternalAgentHttpClient } from '@memoflow/cloud-auth';
import { AUTH_SERVICE_KEY, EXTERNAL_AGENT_SERVICE_KEY } from '@memoflow/app-vue/di';
import { AUTH_WEB_SERVICE_KEY } from '../auth/service';

export function installAuthServices(app: App): void {
  const client = createCloudAuthHttpClient(undefined, { baseUrl: window.location.origin });
  app.provide(AUTH_WEB_SERVICE_KEY, client);
  // The unified password mutation path (usePassword → authentication store
  // receipt) drives the same cloud auth client.
  app.provide(AUTH_SERVICE_KEY, client);
  app.provide(EXTERNAL_AGENT_SERVICE_KEY, createExternalAgentHttpClient(window.location.origin));
}
