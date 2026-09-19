/**
 * Shared mount helpers for Task Query Cache composable specs.
 * 任务 Query Cache composable 测试的共享挂载 helper。
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
import { TASK_SERVICE_KEY } from '../../../di/keys';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      errors: { unknown: 'Unexpected error', VALIDATION_ERROR: 'Please check your input' },
      task: {
        error: {
          operationFailed: 'Task operation failed',
          loadTemplatesFailed: 'Could not load task templates',
          createFailed: 'Could not create task template',
          createSuccess: 'Task template created',
          createPlanWithTodayInstanceSuccess:
            "Task template created and today's instance generated ({count})",
          createPlanWithoutTodayInstanceSuccess:
            "Task template created without today's instance ({count})",
          createQuickTaskWithTodayInstanceSuccess: 'Quick task created for today ({count})',
          createQuickTaskWithoutTodayInstanceSuccess:
            "Quick task created, but today's pending task was not generated ({count})",
          updateFailed: 'Could not update task template',
          updateSuccess: 'Task template updated',
          deleteFailed: 'Could not delete task template',
          deleteSuccess: 'Task template deleted',
          activateFailed: 'Could not activate task template',
          activateSuccess: 'Task template activated',
          pauseFailed: 'Could not pause task template',
          pauseSuccess: 'Task template paused',
          archiveFailed: 'Could not archive task template',
          archiveSuccess: 'Task template archived',
        },
      },
    },
  },
});

export interface MountTaskComposableOptions {
  service: Record<string, unknown>;
  runtime?: ServerStateRuntime;
  /** Static identity scope, or a live resolver (tests that switch identity mid-mutation). */
  identityScope?: string | (() => string);
}

export function mountTaskComposable<T>(
  factory: () => T,
  options: MountTaskComposableOptions,
): { api: T; runtime: ServerStateRuntime } {
  let api!: T;
  const runtime = options.runtime ?? createTestServerStateRuntime();
  const pinia = createPinia();
  setActivePinia(pinia);

  const providedIdentityScope = options.identityScope;
  const resolveIdentityScope: () => string =
    typeof providedIdentityScope === 'function'
      ? providedIdentityScope
      : () => providedIdentityScope ?? 'identity-1';

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
        [TASK_SERVICE_KEY as symbol]: options.service,
        [SERVER_STATE_RUNTIME_KEY]: runtime,
        [SERVER_STATE_IDENTITY_SCOPE_KEY]: resolveIdentityScope,
      },
    },
  });

  return { api, runtime };
}

export { i18n };
