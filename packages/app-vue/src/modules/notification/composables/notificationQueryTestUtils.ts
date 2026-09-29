/**
 * Shared mount helpers for Notification Query Cache composable specs.
 *
 * Provides a deterministic test QueryClient (via VueQueryPlugin), a test server-state
 * runtime, a fake Notification service, and an identity-scope resolver.
 */

import { defineComponent, h, type DefineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import {
  createTestServerStateRuntime,
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
  type ServerStateRuntime,
} from '../../../platform/server-state';
import { NOTIFICATION_SERVICE_KEY } from '../../../di/keys';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      errors: {
        VALIDATION_ERROR: 'Please check your input',
        unknown: 'Unexpected error',
      },
      notification: {
        error: {
          fetchFailed: 'Failed to load notifications',
          markReadFailed: 'Failed to mark as read',
          markAllReadFailed: 'Failed to mark all as read',
          deleteFailed: 'Failed to delete notification',
          actionFailed: 'Failed to execute notification action',
          refreshStatsFailed: 'Failed to refresh stats',
        },
      },
    },
  },
});

export interface MountNotificationComposableOptions {
  service: Record<string, unknown>;
  runtime?: ServerStateRuntime;
  identityScope?: string;
}

export function mountNotificationComposable<T>(
  factory: () => T,
  options: MountNotificationComposableOptions,
): { api: T; runtime: ServerStateRuntime } {
  let api!: T;
  const runtime = options.runtime ?? createTestServerStateRuntime();
  const pinia = createPinia();
  setActivePinia(pinia);

  const Host = defineComponent({
    setup() {
      api = factory();
      return () => h('div');
    },
  }) as DefineComponent<object, object, object>;

  mount(Host, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient: runtime.queryClient }], pinia, i18n],
      provide: {
        [NOTIFICATION_SERVICE_KEY as symbol]: options.service,
        [SERVER_STATE_RUNTIME_KEY]: runtime,
        [SERVER_STATE_IDENTITY_SCOPE_KEY]: () => options.identityScope ?? 'identity-1',
      },
    },
  });

  return { api, runtime };
}

export { i18n };
