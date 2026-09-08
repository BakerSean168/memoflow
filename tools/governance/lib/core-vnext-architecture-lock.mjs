/**
 * Core vNext architecture locks (HARD-7102).
 * Pure logic: callers provide source-file snapshots; this module reports
 * violations without touching the filesystem or process state.
 */

import { findPatternMatches } from './source-scan.mjs';

const FEATURE_ROOTS = [
  'packages/goal/src/',
  'packages/task/src/',
  'packages/reminder/src/',
];
const EXECUTION_ROOTS = [
  'packages/scheduler/src/server/',
  'packages/schedule-orchestration/src/',
  'packages/goal/src/server/',
  'packages/task/src/server/',
  'packages/reminder/src/server/',
];
const UI_ROOTS = [
  'packages/app-react/src/',
  'packages/app-vue/src/',
  'apps/desktop/src/renderer/',
  'apps/web/src/',
];
const AI_PRODUCT_TOOL_ROOTS = [
  'packages/ai/src/server/mastra/tools/',
  'apps/api/src/modules/ai/',
  'apps/desktop/src/main/modules/ai/',
];

export const FEATURE_SCHEDULER_IMPORT_PATTERN =
  /['"`](@memoflow\/scheduler(?:\/[a-zA-Z0-9_.\/-]*)?)['"`]/;
export const SCHEDULER_FEATURE_IMPORT_PATTERN =
  /['"`](@memoflow\/(?:goal|task|reminder|notification)(?:\/[a-zA-Z0-9_.\/-]*)?)['"`]/;
export const SCHEDULER_API_WRITE_PATTERN =
  /\bmethod\s*:\s*['"](post|put|patch|delete)['"]/i;
export const SCHEDULER_IPC_MUTATION_PATTERN =
  /\b(?:ScheduleChannels\.)?[A-Z0-9_]*(?:CREATE|UPDATE|DELETE|PAUSE|RESUME|CANCEL|COMPLETE|ENABLE|DISABLE|TRIGGER)[A-Z0-9_]*\b/;
export const WEB_RAW_SCHEDULER_WRITE_PATTERN =
  /\bhttp\.(post|put|patch|delete)\s*\(\s*(?:TASKS|`\$\{TASKS\})/;
export const SOURCE_MODULE_EXECUTION_SWITCH_PATTERN =
  /switch\s*\([^)]*(?:sourceModule|source\.module)[^)]*\)|case\s+SourceModule\.[A-Za-z0-9_]+|(?:sourceModule|source\.module)\s*={2,3}\s*SourceModule\.[A-Za-z0-9_]+|SourceModule\.[A-Za-z0-9_]+\s*={2,3}\s*(?:sourceModule|source\.module)/;
export const HARDCODED_SHANGHAI_FALLBACK_PATTERN =
  /(?:\?\?|\|\|)\s*(?:Timezone\.Shanghai|['"`]Asia\/Shanghai['"`])|(?:timezone|tz)\s*:\s*Timezone\s*=\s*(?:Timezone\.Shanghai|['"`]Asia\/Shanghai['"`])/i;
export const REMINDER_SCANNER_PATTERN =
  /\b(ReminderSchedulerService|createReminderRuntimeContribution|cronContribution|getPendingReminders)\b|reminder\.cron\.scheduler/;
export const LEGACY_NOTIFICATION_DISPATCH_PATTERN =
  /\bNOTIFICATION_DISPATCH_MESSAGE_TYPE\b|['"`]notification\.dispatch['"`]/;
export const THIRD_PARTY_TIME_IMPORT_PATTERN =
  /['"`](rrule|ical(?:\.js)?|@fullcalendar(?:\/[a-zA-Z0-9_.\/-]*)?|fullcalendar(?:\/[a-zA-Z0-9_.\/-]*)?)['"`]/i;
export const THIRD_PARTY_TIME_DTO_PATTERN =
  /\b(FullCalendar|CalendarApi|EventInput|RRuleOptions|ICalObject|ICAL)\b/;
export const UI_SCHEDULER_INTERNAL_IMPORT_PATTERN =
  /['"`](@memoflow\/scheduler\/(?:server|scheduling|electron)(?:\/[a-zA-Z0-9_.\/-]*)?)['"`]/;
export const UI_SCHEDULED_INVOCATION_MUTATION_PATTERN =
  /\b(ScheduledInvocation|SchedulingPort|createScheduleTask|updateScheduleTask|deleteScheduleTask|pauseScheduleTask|resumeScheduleTask|cancelScheduleTask|completeScheduleTask)\b|\bschedulerService\.(?:create|update|delete|pause|resume|cancel|complete)\b/;
export const AI_RAW_SCHEDULER_ACCESS_PATTERN =
  /['"`]@memoflow\/scheduler(?:\/[^'"`]*)?['"`]|\b(ScheduledInvocation|ScheduleTask|SchedulingPort|createScheduleTask|updateScheduleTask|deleteScheduleTask|pauseScheduleTask|resumeScheduleTask|cancelScheduleTask|completeScheduleTask)\b|\bschedulerService\.(?:create|update|delete|pause|resume|cancel|complete)\b/;
export const AI_RETIRED_GOAL_TASK_DRAFT_PATTERN =
  /\b(validateKeyResultsOutput|validateTasksOutput|valueType|folderId|estimatedHours|progressTrigger|PER_INSTANCE|ALL_INSTANCES_COMPLETED)\b/;
export const TASK_LEGACY_CLASSIFICATION_PATTERN =
  /\b(?:template|dto|vm|task)\.tags\b|\btask-tag-filter\b|\bfindByTags\b|\bupdateTags\b|\bupdateColor\b/;
export const TASK_LEGACY_CONTRACT_FIELD_PATTERN = /\b(?:tags|color)\??\s*:/;
export const TASK_LEGACY_PRISMA_FIELD_PATTERN = /^\s*(?:tags|color)\s+String\??(?:\s|$)/m;

export function isTestLikePath(relPath) {
  return /(?:^|\/)(?:__tests__|__mocks__|test|tests|e2e|stories)(?:\/|$)/.test(relPath)
    || /\.(?:spec|test|stories)\.[^.]+$/i.test(relPath);
}

function startsWithAny(relPath, roots) {
  return roots.some((root) => relPath.startsWith(root));
}

function pushPatternViolations(violations, file, content, pattern, kind) {
  for (const match of findPatternMatches(content, pattern)) {
    violations.push({
      file,
      line: match.line,
      kind,
      text: match.text,
    });
  }
}

function requireTokens(violations, fileMap, file, tokens, kind) {
  const content = fileMap.get(file);
  if (content === undefined) {
    violations.push({ file, line: 1, kind, text: '<missing canonical file>' });
    return;
  }
  for (const token of tokens) {
    if (!content.includes(token)) {
      violations.push({ file, line: 1, kind, text: `missing ${token}` });
    }
  }
}

/**
 * @param {Array<{relPath:string, content:string}>} files
 * @returns {{violations:Array<{file:string,line:number,kind:string,text:string}>, auditedFiles:number}}
 */
export function findCoreVnextArchitectureLockViolations(files) {
  const violations = [];
  const production = files.filter(({ relPath }) => !isTestLikePath(relPath));
  const fileMap = new Map(production.map(({ relPath, content }) => [relPath, content]));

  for (const { relPath, content } of production) {
    if (startsWithAny(relPath, FEATURE_ROOTS)) {
      pushPatternViolations(
        violations,
        relPath,
        content,
        FEATURE_SCHEDULER_IMPORT_PATTERN,
        'feature-scheduler-import',
      );
    }

    if (relPath.startsWith('packages/scheduler/src/')) {
      pushPatternViolations(
        violations,
        relPath,
        content,
        SCHEDULER_FEATURE_IMPORT_PATTERN,
        'scheduler-feature-import',
      );
      if (relPath.startsWith('packages/scheduler/src/api/')) {
        pushPatternViolations(
          violations,
          relPath,
          content,
          SCHEDULER_API_WRITE_PATTERN,
          'scheduler-api-write',
        );
      }
      if (relPath.startsWith('packages/scheduler/src/electron/')) {
        pushPatternViolations(
          violations,
          relPath,
          content,
          SCHEDULER_IPC_MUTATION_PATTERN,
          'scheduler-ipc-mutation',
        );
      }
    }

    if (startsWithAny(relPath, EXECUTION_ROOTS)) {
      pushPatternViolations(
        violations,
        relPath,
        content,
        SOURCE_MODULE_EXECUTION_SWITCH_PATTERN,
        'source-module-execution-switch',
      );
      pushPatternViolations(
        violations,
        relPath,
        content,
        HARDCODED_SHANGHAI_FALLBACK_PATTERN,
        'hardcoded-shanghai-fallback',
      );
    }

    if (relPath === 'apps/web/src/mocks/handlers/schedule.handlers.ts') {
      pushPatternViolations(
        violations,
        relPath,
        content,
        WEB_RAW_SCHEDULER_WRITE_PATTERN,
        'web-raw-scheduler-write',
      );
    }

    if (relPath.startsWith('packages/reminder/src/')) {
      pushPatternViolations(
        violations,
        relPath,
        content,
        REMINDER_SCANNER_PATTERN,
        'reminder-trigger-scanner',
      );
    }

    if (relPath.startsWith('packages/notification/src/') || relPath.startsWith('packages/contracts/src/modules/notification/')) {
      pushPatternViolations(
        violations,
        relPath,
        content,
        LEGACY_NOTIFICATION_DISPATCH_PATTERN,
        'notification-delivery-plan-bypass',
      );
    }

    if (relPath.startsWith('packages/contracts/src/')) {
      pushPatternViolations(
        violations,
        relPath,
        content,
        THIRD_PARTY_TIME_IMPORT_PATTERN,
        'contracts-third-party-time-import',
      );
      pushPatternViolations(
        violations,
        relPath,
        content,
        THIRD_PARTY_TIME_DTO_PATTERN,
        'contracts-third-party-time-dto',
      );
    }

    if (startsWithAny(relPath, UI_ROOTS)) {
      pushPatternViolations(
        violations,
        relPath,
        content,
        UI_SCHEDULER_INTERNAL_IMPORT_PATTERN,
        'ui-scheduler-internal-import',
      );
      pushPatternViolations(
        violations,
        relPath,
        content,
        UI_SCHEDULED_INVOCATION_MUTATION_PATTERN,
        'ui-scheduled-invocation-mutation',
      );
    }

    if (startsWithAny(relPath, AI_PRODUCT_TOOL_ROOTS)) {
      pushPatternViolations(
        violations,
        relPath,
        content,
        AI_RAW_SCHEDULER_ACCESS_PATTERN,
        'ai-raw-scheduler-access',
      );
    }

    if (relPath.startsWith('packages/ai/src/')) {
      pushPatternViolations(
        violations,
        relPath,
        content,
        AI_RETIRED_GOAL_TASK_DRAFT_PATTERN,
        'ai-retired-goal-task-draft',
      );
    }

    // ADR-054: Task classification is single-track Shared Label. These locks
    // intentionally target only Task-owned product/contract files so Reminder,
    // Governance and Scheduler metadata may keep their unrelated tag/color semantics.
    if (relPath.startsWith('packages/task/src/')
      || relPath.startsWith('packages/app-vue/src/modules/task/')
      || relPath.startsWith('packages/app-react/src/screens/Task')
      || relPath === 'packages/app-react/src/hooks/useTaskPlans.ts') {
      pushPatternViolations(
        violations,
        relPath,
        content,
        TASK_LEGACY_CLASSIFICATION_PATTERN,
        'task-legacy-classification',
      );
    }
    if (relPath === 'packages/contracts/src/modules/task/api/task-plan.dto.ts'
      || relPath === 'packages/task/src/server/domain/aggregates/task-plan.state.ts') {
      pushPatternViolations(
        violations,
        relPath,
        content,
        TASK_LEGACY_CONTRACT_FIELD_PATTERN,
        'task-legacy-classification',
      );
    }
    if (relPath === 'packages/contracts/src/modules/ai/api/ai-task-create-workflow.dto.ts') {
      pushPatternViolations(
        violations,
        relPath,
        content,
        /\btags\s*:\s*z\./,
        'task-legacy-classification',
      );
    }
    if (relPath === 'packages/database/prisma/schema/task.prisma') {
      pushPatternViolations(
        violations,
        relPath,
        content,
        TASK_LEGACY_PRISMA_FIELD_PATTERN,
        'task-legacy-classification',
      );
    }
  }

  // Canonical Notification path is a positive lock, not merely absence of the
  // legacy bypass: shared requests must enter CreateNotificationUseCase and its
  // NotificationPolicy / DeliveryPlan decisions.
  requireTokens(
    violations,
    fileMap,
    'packages/notification/src/server/infrastructure/runtime/notification.runtime.ts',
    [
      'NOTIFICATION_REQUESTED_MESSAGE_TYPE',
      'processNotificationRequested',
      'getCreateNotificationUseCase',
    ],
    'notification-requested-path-missing',
  );
  requireTokens(
    violations,
    fileMap,
    'packages/notification/src/server/application/use-cases/commands/create-notification.use-case.ts',
    [
      'NotificationPolicy',
      'NotificationDeliveryPlanOutcome',
      'this.policy.evaluate',
    ],
    'notification-delivery-plan-missing',
  );

  return { violations, auditedFiles: production.length };
}

export function formatCoreVnextArchitectureLockViolation({ file, line, kind, text }) {
  const messages = {
    'feature-scheduler-import': 'Goal/Task/Routine feature code must not import the Scheduler aggregate/runtime package',
    'scheduler-feature-import': 'Scheduler core must remain feature-domain neutral',
    'scheduler-api-write': 'Scheduler HTTP transport is diagnostics-only; raw worker mutation endpoints are forbidden',
    'scheduler-ipc-mutation': 'Scheduler Electron transport is diagnostics-only; raw worker mutation channels are forbidden',
    'web-raw-scheduler-write': 'Web mocks must not advertise raw Scheduler mutation endpoints that production does not expose',
    'source-module-execution-switch': 'SourceModule is metadata/diagnostics only and must not select execution behavior',
    'hardcoded-shanghai-fallback': 'Scheduling execution must receive an explicit validated timezone; Shanghai fallback is forbidden',
    'reminder-trigger-scanner': 'Reminder must not resurrect an independent trigger scanner/runtime',
    'notification-delivery-plan-bypass': 'Cross-domain notification.dispatch bypass is forbidden; use NotificationRequested -> DeliveryPlan',
    'notification-requested-path-missing': 'Notification runtime must consume canonical NotificationRequested envelopes',
    'notification-delivery-plan-missing': 'Notification creation must route multichannel decisions through NotificationPolicy / DeliveryPlan',
    'contracts-third-party-time-import': 'Contracts must not expose third-party recurrence/calendar packages',
    'contracts-third-party-time-dto': 'Contracts must not expose third-party recurrence/calendar DTO types',
    'ui-scheduler-internal-import': 'UI may use read-only scheduler/client diagnostics, never Scheduler internals',
    'ui-scheduled-invocation-mutation': 'UI must not mutate ScheduledInvocation/ScheduleTask worker state directly',
    'ai-raw-scheduler-access': 'AI tools/adapters may read Planner/Notification product projections but must never import or mutate raw Scheduler worker state',
    'ai-retired-goal-task-draft': 'AI production code must use canonical Goal/Task workflow contracts and must not resurrect retired Goal/Task draft fields or validators',
    'task-legacy-classification': 'Task classification must use Shared Label; legacy string tags/custom Task color are forbidden',
  };
  return `${file}:${line}: ${messages[kind] ?? kind} [${text}]`;
}
