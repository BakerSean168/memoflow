import { describe, expect, it } from 'vitest';
import {
  findCoreVnextArchitectureLockViolations,
  formatCoreVnextArchitectureLockViolation,
  isTestLikePath,
} from '../lib/core-vnext-architecture-lock.mjs';

const canonicalNotificationFiles = [
  {
    relPath: 'packages/notification/src/server/infrastructure/runtime/notification.runtime.ts',
    content: `
      import { NOTIFICATION_REQUESTED_MESSAGE_TYPE } from '@memoflow/contracts/notification';
      function getCreateNotificationUseCase() { return null; }
      async function processNotificationRequested() { getCreateNotificationUseCase(); }
    `,
  },
  {
    relPath: 'packages/notification/src/server/application/use-cases/commands/create-notification.use-case.ts',
    content: `
      class NotificationPolicy { evaluate() {} }
      const NotificationDeliveryPlanOutcome = {};
      class UseCase { policy = new NotificationPolicy(); execute() { this.policy.evaluate(); } }
    `,
  },
];

function scan(...files) {
  return findCoreVnextArchitectureLockViolations([...canonicalNotificationFiles, ...files]);
}

describe('HARD-7102 core vNext architecture lock', () => {
  it('flags every HARD-7102 boundary family plus raw worker writes', () => {
    const { violations } = scan(
      {
        relPath: 'packages/task/src/server/x.ts',
        content: `import { ScheduleTask } from '@memoflow/scheduler';`,
      },
      {
        relPath: 'packages/scheduler/src/server/x.ts',
        content: `import { Goal } from '@memoflow/goal/server';`,
      },
      {
        relPath: 'packages/scheduler/src/api/routes.ts',
        content: `r.route({ method: 'post', path: '/tasks' }, [], handler);`,
      },
      {
        relPath: 'packages/scheduler/src/electron/index.ts',
        content: `ipcMain.handle(ScheduleChannels.TASK_PAUSE, handler);`,
      },
      {
        relPath: 'apps/web/src/mocks/handlers/schedule.handlers.ts',
        content: `http.delete(\`${'${TASKS}'}/:taskId\`, handler);`,
      },
      {
        relPath: 'packages/scheduler/src/server/runtime/legacy.ts',
        content: `switch (task.sourceModule) { case SourceModule.Goal: executeGoal(); }`,
      },
      {
        relPath: 'packages/goal/src/server/projector/legacy.ts',
        content: `function project(timezone: Timezone = 'Asia/Shanghai') { return timezone; }`,
      },
      {
        relPath: 'packages/reminder/src/server/runtime.ts',
        content: `const cronContribution = new ReminderSchedulerService();`,
      },
      {
        relPath: 'packages/notification/src/server/legacy.ts',
        content: `const type = 'notification.dispatch';`,
      },
      {
        relPath: 'packages/contracts/src/modules/schedule/vendor.ts',
        content: `import type { EventInput } from '@fullcalendar/core';`,
      },
      {
        relPath: 'packages/app-vue/src/modules/schedule/use-worker.ts',
        content: `import type { SchedulingPort } from '@memoflow/scheduler/scheduling'; const x: ScheduledInvocation = y;`,
      },
      {
        relPath: 'packages/task/src/server/domain/legacy-classification.ts',
        content: `function read(template) { return template.tags; }`,
      },
      {
        relPath: 'packages/contracts/src/modules/task/api/task-template.dto.ts',
        content: `export interface LegacyTaskInput { tags?: string[]; color?: string | null; }`,
      },
      {
        relPath: 'packages/database/prisma/schema/task.prisma',
        content: `model TaskTemplate {\n  id String @id\n  tags String\n}`,
      },
    );
    const kinds = new Set(violations.map((v) => v.kind));
    expect(kinds).toEqual(expect.objectContaining({}));
    for (const kind of [
      'feature-scheduler-import',
      'scheduler-feature-import',
      'scheduler-api-write',
      'scheduler-ipc-mutation',
      'web-raw-scheduler-write',
      'source-module-execution-switch',
      'hardcoded-shanghai-fallback',
      'reminder-trigger-scanner',
      'notification-delivery-plan-bypass',
      'contracts-third-party-time-import',
      'contracts-third-party-time-dto',
      'ui-scheduler-internal-import',
      'ui-scheduled-invocation-mutation',
      'task-legacy-classification',
    ]) {
      expect(kinds.has(kind), `missing violation kind ${kind}`).toBe(true);
    }
  });

  it('accepts the canonical read-only and handler-key boundaries', () => {
    const { violations } = scan(
      {
        relPath: 'packages/task/src/schedule-execution/index.ts',
        content: `export { createTaskScheduledHandlerRegistration } from '../server/infrastructure/scheduled-handler';`,
      },
      {
        relPath: 'packages/reminder/src/server/domain/repositories/i-reminder-template-repository.ts',
        content: `findByNextTriggerBefore(beforeTime: number, identityId?: string): Promise<ReminderTemplate[]>;`,
      },
      {
        relPath: 'packages/scheduler/src/server/value/schedule-config.ts',
        content: `function createDefault(timezone: Timezone) { return timezone; }`,
      },
      {
        relPath: 'packages/scheduler/src/server/query.ts',
        content: `if (query.sourceModule && query.sourceEntityId) return find(query.sourceModule);`,
      },
      {
        relPath: 'packages/scheduler/src/api/routes.ts',
        content: `r.route({ method: 'get', path: '/tasks' }, [auth], handler);`,
      },
      {
        relPath: 'packages/scheduler/src/electron/index.ts',
        content: `ipcMain.handle(ScheduleChannels.TASK_GET_BY_ID, handler);`,
      },
      {
        relPath: 'packages/app-react/src/hooks/useScheduleTasks.ts',
        content: `import type { ScheduleTask } from '@memoflow/scheduler/client'; schedulerService.listTasks();`,
      },
      {
        relPath: 'apps/web/src/mocks/handlers/schedule.handlers.ts',
        content: `http.get(TASKS, handler); http.get(\`${'${TASKS}'}/:taskId\`, handler);`,
      },
      {
        relPath: 'packages/contracts/src/modules/schedule/product-time.ts',
        content: `export interface RecurrenceRule { frequency: 'daily' | 'weekly'; }`,
      },
      {
        relPath: 'packages/contracts/src/modules/task/api/task-template.dto.ts',
        content: `export interface TaskInput { labelIds?: string[]; }`,
      },
      {
        relPath: 'packages/task/src/server/domain/aggregates/task-template.state.ts',
        content: `export interface TaskTemplateState { labels: readonly string[]; }`,
      },
      {
        relPath: 'packages/database/prisma/schema/task.prisma',
        content: `model TaskTemplate { id String @id }\nmodel TaskLabel { labelId String }`,
      },
      {
        relPath: 'packages/app-vue/src/modules/task/TaskView.vue',
        content: `const labelIds = template.labels.map((label) => label.id);`,
      },
    );
    expect(violations).toHaveLength(0);
  });

  it('requires the canonical NotificationRequested -> policy/DeliveryPlan path', () => {
    const files = canonicalNotificationFiles.map((file) => ({ ...file }));
    files[0].content = `export const x = 1;`;
    files[1].content = `export class CreateNotificationUseCase {}`;
    const { violations } = findCoreVnextArchitectureLockViolations(files);
    const kinds = violations.map((v) => v.kind);
    expect(kinds).toContain('notification-requested-path-missing');
    expect(kinds).toContain('notification-delivery-plan-missing');
  });

  it('ignores test/story fixtures so anti-resurrection examples do not trip production gates', () => {
    expect(isTestLikePath('packages/task/src/x.spec.ts')).toBe(true);
    expect(isTestLikePath('packages/app-vue/src/x.stories.ts')).toBe(true);
    const { violations } = scan({
      relPath: 'packages/task/src/__tests__/legacy.spec.ts',
      content: `import { ScheduleTask } from '@memoflow/scheduler';`,
    });
    expect(violations).toHaveLength(0);
  });

  it('formats actionable gate failures', () => {
    const message = formatCoreVnextArchitectureLockViolation({
      file: 'packages/scheduler/src/api/routes.ts',
      line: 42,
      kind: 'scheduler-api-write',
      text: `method: 'post'`,
    });
    expect(message).toContain('packages/scheduler/src/api/routes.ts:42');
    expect(message).toContain('diagnostics-only');
  });
});
