import { describe, it, expect } from 'vitest';
import {
  findScheduleNotificationSeparationViolations,
  formatScheduleNotificationSeparationViolation,
  isSchedulerScanRoot,
  LEGACY_NOTIFICATION_PORT_PATTERN,
  NOTIFICATION_IMPORT_PATTERN,
  SOURCE_MODULE_EXECUTION_SWITCH_PATTERN,
} from '../lib/schedule-notification-separation.mjs';

describe('NOTIFICATION_IMPORT_PATTERN', () => {
  it('matches static, require and dynamic imports of @memoflow/notification', () => {
    expect(`import { x } from '@memoflow/notification';`).toMatch(NOTIFICATION_IMPORT_PATTERN);
    expect(`import { x } from '@memoflow/notification/schedule-execution';`).toMatch(
      NOTIFICATION_IMPORT_PATTERN,
    );
    expect(`const x = require('@memoflow/notification/schedule-execution');`).toMatch(
      NOTIFICATION_IMPORT_PATTERN,
    );
    expect(`const x = await import('@memoflow/notification');`).toMatch(
      NOTIFICATION_IMPORT_PATTERN,
    );
  });

  it('catches the anti-resurrection bypass forms: side-effect import, deep subpath, multiline from', () => {
    // Side-effect import has no `from`/`require(`/`import(` on the same line.
    expect(`import '@memoflow/notification';`).toMatch(NOTIFICATION_IMPORT_PATTERN);
    // Deep nested subpath (the legacy character class excluded `/`).
    expect(`import { x } from '@memoflow/notification/server/infrastructure';`).toMatch(
      NOTIFICATION_IMPORT_PATTERN,
    );
    expect(
      `import { deliverer } from '@memoflow/notification/server/infrastructure/deliverers';`,
    ).toMatch(NOTIFICATION_IMPORT_PATTERN);
    // `from` on one line, specifier on the next.
    expect(`  '@memoflow/notification/server/infrastructure';`).toMatch(
      NOTIFICATION_IMPORT_PATTERN,
    );
    // Double-quoted and template-literal specifiers.
    expect(`import "@memoflow/notification/server/infrastructure";`).toMatch(
      NOTIFICATION_IMPORT_PATTERN,
    );
  });

  it('does not match other packages or commented imports', () => {
    expect(`import { x } from '@memoflow/task';`).not.toMatch(NOTIFICATION_IMPORT_PATTERN);
    expect(`import { x } from '@memoflow/notifications';`).not.toMatch(NOTIFICATION_IMPORT_PATTERN);
    // Comment stripping is handled by findPatternMatches, not the raw pattern.
    expect(`const x = require('@memoflow/notification-shared');`).not.toMatch(
      NOTIFICATION_IMPORT_PATTERN,
    );
  });
});

describe('LEGACY_NOTIFICATION_PORT_PATTERN', () => {
  it('matches the removed legacy delivery symbols', () => {
    expect(
      `import { ScheduleNotificationPort } from '@memoflow/notification/schedule-execution';`,
    ).toMatch(LEGACY_NOTIFICATION_PORT_PATTERN);
    expect(`scheduleNotificationPort:`).toMatch(LEGACY_NOTIFICATION_PORT_PATTERN);
    expect(`createNotificationPrismaScheduleNotificationPort(`).toMatch(
      LEGACY_NOTIFICATION_PORT_PATTERN,
    );
  });

  it('does not match unrelated identifiers', () => {
    expect(`const notificationPort = x;`).not.toMatch(LEGACY_NOTIFICATION_PORT_PATTERN);
    expect(`scheduleNotification`).not.toMatch(LEGACY_NOTIFICATION_PORT_PATTERN);
  });
});

describe('SOURCE_MODULE_EXECUTION_SWITCH_PATTERN', () => {
  it('matches switch dispatch on sourceModule / SourceModule', () => {
    expect(`switch (task.sourceModule) {`).toMatch(SOURCE_MODULE_EXECUTION_SWITCH_PATTERN);
    expect(`switch (execution.sourceModule) {`).toMatch(SOURCE_MODULE_EXECUTION_SWITCH_PATTERN);
    expect(`switch (sourceModule) {`).toMatch(SOURCE_MODULE_EXECUTION_SWITCH_PATTERN);
  });

  it('does not match if-cascades or unrelated switches', () => {
    expect(`if (task.sourceModule === SourceModule.Reminder) {`).not.toMatch(
      SOURCE_MODULE_EXECUTION_SWITCH_PATTERN,
    );
    expect(`switch (workflowKey) {`).not.toMatch(SOURCE_MODULE_EXECUTION_SWITCH_PATTERN);
  });
});

describe('isSchedulerScanRoot', () => {
  it('accepts only the scheduler orchestration + scheduling roots', () => {
    expect(isSchedulerScanRoot('packages/schedule-orchestration/src/execution/router.ts')).toBe(
      true,
    );
    expect(isSchedulerScanRoot('packages/schedule/src/server/infrastructure/scheduling/x.ts')).toBe(
      true,
    );
    expect(isSchedulerScanRoot('packages/task/src/server/infrastructure/x.ts')).toBe(false);
    expect(isSchedulerScanRoot('packages/notification/src/server/runtime.ts')).toBe(false);
  });
});

describe('findScheduleNotificationSeparationViolations', () => {
  it('flags notification imports, legacy symbols and sourceModule switches (positive fixture)', () => {
    const files = [
      {
        relPath: 'packages/schedule-orchestration/src/execution/router.ts',
        content: [
          `import { ScheduleNotificationPort } from '@memoflow/notification/schedule-execution';`,
          `export function route(task) {`,
          `  switch (task.sourceModule) {`,
          `    case SourceModule.Reminder: return reminder;`,
          `  }`,
          `  const port: ScheduleNotificationPort = schedulerPort;`,
          `}`,
        ].join('\n'),
      },
    ];
    const { violations, auditedFiles } = findScheduleNotificationSeparationViolations(files);
    expect(auditedFiles).toBe(1);
    expect(violations.length).toBeGreaterThanOrEqual(3);
    const kinds = violations.map((v) => v.kind);
    expect(kinds).toContain('notification-import');
    expect(kinds).toContain('legacy-notification-port');
    expect(kinds).toContain('source-module-switch');
  });

  it('flags the anti-resurrection bypass forms inside scheduler sources', () => {
    const files = [
      {
        relPath: 'packages/schedule-orchestration/src/execution/router.ts',
        content: [
          `import '@memoflow/notification';`,
          `import { deliverer } from '@memoflow/notification/server/infrastructure/deliverers';`,
          `import { x } from`,
          `  '@memoflow/notification/server/infrastructure';`,
          `export const ok = true;`,
        ].join('\n'),
      },
    ];
    const { violations, auditedFiles } = findScheduleNotificationSeparationViolations(files);
    expect(auditedFiles).toBe(1);
    expect(violations.length).toBeGreaterThanOrEqual(3);
    for (const v of violations) {
      expect(v.kind).toBe('notification-import');
    }
    const lines = violations.map((v) => v.line);
    expect(lines).toContain(1); // side-effect import
    expect(lines).toContain(2); // deep subpath
    expect(lines).toContain(4); // multiline from specifier
  });

  it('passes domain-neutral if-cascade dispatch and out-of-scope domains (negative fixture)', () => {
    const files = [
      {
        relPath: 'packages/schedule-orchestration/src/execution/router.ts',
        content: [
          `import { SourceModule } from '@memoflow/contracts/schedule';`,
          `export function route(task) {`,
          `  if (task.sourceModule === SourceModule.Reminder) return reminder;`,
          `  if (task.sourceModule === SourceModule.Task) return taskSource;`,
          `  return fallback;`,
          `}`,
        ].join('\n'),
      },
      {
        relPath: 'packages/task/src/server/infrastructure/schedule-execution-source.ts',
        content: `import { NotificationRequestedWriterPort } from '@memoflow/notification-contracts';\nswitch (source.sourceModule) { ... }`,
      },
      {
        relPath: 'packages/notification/src/server/infrastructure/adapters/prisma/x.ts',
        content: `import { createNotificationPrismaScheduleNotificationPort } from './y';`,
      },
    ];
    const { violations, auditedFiles } = findScheduleNotificationSeparationViolations(files);
    expect(auditedFiles).toBe(1); // only the schedule-orchestration file is in scope
    expect(violations).toHaveLength(0);
  });

  it('ignores matches inside comments', () => {
    const files = [
      {
        relPath: 'packages/schedule-orchestration/src/execution/router.ts',
        content: [
          `// import { ScheduleNotificationPort } from '@memoflow/notification/schedule-execution';`,
          `/* switch (task.sourceModule) { ... } */`,
          `export const ok = true;`,
        ].join('\n'),
      },
    ];
    const { violations } = findScheduleNotificationSeparationViolations(files);
    expect(violations).toHaveLength(0);
  });
});

describe('formatScheduleNotificationSeparationViolation', () => {
  it('produces a readable message', () => {
    const message = formatScheduleNotificationSeparationViolation({
      file: 'packages/schedule-orchestration/src/execution/router.ts',
      line: 3,
      kind: 'notification-import',
      text: `from '@memoflow/notification'`,
    });
    expect(message).toContain('packages/schedule-orchestration/src/execution/router.ts:3');
    expect(message).toContain('NOTIF-3302');
  });
});
