/**
 * Core vNext architecture locks (HARD-7102).
 * Pure logic: callers provide source-file snapshots; this module reports
 * violations without touching the filesystem or process state.
 */

import { findPatternMatches } from './source-scan.mjs';

const FEATURE_ROOTS = ['packages/goal/src/', 'packages/task/src/', 'packages/reminder/src/'];
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
export const SCHEDULER_API_WRITE_PATTERN = /\bmethod\s*:\s*['"](post|put|patch|delete)['"]/i;
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

export const GOAL_LEGACY_TIME_PATTERN =
  /\b(?:dueDate|isOverdue|GoalDueDateNotSetError)\b|\bdue_date\b/;
export const GOAL_LEGACY_IDENTITY_PATTERN = /\b(?:motivation|feasibilityAnalysis)\b/;
export const GOAL_RETIRED_TEMPLATE_PATTERN =
  /\b(?:GoalTemplate|BUILT_IN_TEMPLATES|suggestedStartValue)\b/;
export const KR_LEGACY_MEASUREMENT_PATTERN =
  /\b(?:startingValue|progressBaselineValue)\b|\b(?:starting_value|progress_baseline_value)\b/;
export const KR_CLIENT_TRACKING_STATE_PATTERN = /\btrackingBaseValue\b/;
export const TASK_GOAL_OWNERLESS_KR_QUERY_PATTERN = /\bfindByKeyResultId\s*\(/;
export const TASK_GOAL_NULL_STRINGIFY_PATTERN =
  /\bkeyResultId\s*:\s*String\s*\(\s*binding\.keyResultId\s*\)/;

const GOAL_TIME_OWNER_ROOTS = [
  'packages/goal/src/',
  'packages/contracts/src/modules/goal/',
  'packages/app-vue/src/modules/goal/',
  'packages/app-react/src/screens/Goal',
];
const GOAL_TIME_OWNER_FILES = new Set([
  'packages/app-react/src/components/GoalCard.tsx',
  'packages/app-react/src/hooks/useGoals.ts',
  'packages/database/prisma/schema/goal.prisma',
  'packages/contracts/src/modules/data-portability/dtos/portable-goals.dto.ts',
  'packages/contracts/src/modules/ai/api/ai-goal-create-workflow.dto.ts',
  'packages/ai/src/server/mastra/agents/goal-planner.worker.ts',
  'packages/ai/src/server/mastra/workflows/apply-goal-plan.service.ts',
  'packages/ai/src/server/mastra/workflows/goal-create.workflow.ts',
  'apps/api/src/modules/ai/goal-plan-mutation.adapter.ts',
  'apps/desktop/src/main/modules/ai/goal-plan-mutation.adapter.ts',
  'packages/app-vue/src/modules/ai/composables/types.ts',
  'packages/app-vue/src/modules/ai/composables/useAIGoalWorkflow.ts',
  'packages/app-vue/src/modules/ai/components/AIGoalDraftEditor.vue',
  'packages/powersync-schema/src/index.ts',
  'packages/data-portability/src/server/application/use-cases/importers/goal.importer.ts',
  'packages/data-portability/src/server/application/use-cases/projections/goal.projection.ts',
  'packages/database/src/generated/prisma/schema.prisma',
]);

const KR_MEASUREMENT_OWNER_ROOTS = [
  'packages/goal/src/',
  'packages/contracts/src/modules/goal/',
  'packages/app-vue/src/modules/goal/',
  'packages/app-react/src/screens/Goal',
];
const KR_MEASUREMENT_OWNER_FILES = new Set([
  'packages/app-react/src/components/GoalCard.tsx',
  'packages/app-react/src/hooks/useGoals.ts',
  'packages/database/prisma/schema/goal.prisma',
  'packages/powersync-schema/src/index.ts',
  'packages/contracts/src/modules/data-portability/dtos/portable-goals.dto.ts',
  'packages/data-portability/src/server/application/import-store/data-portability-import-store.ts',
  'packages/data-portability/src/server/application/use-cases/importers/goal.importer.ts',
  'packages/data-portability/src/server/application/use-cases/projections/goal.projection.ts',
  'packages/data-portability/src/server/infrastructure/powersync/powersync-import-store.ts',
  'packages/app-vue/src/modules/task/composables/useTaskGoalBindingOptions.ts',
  'packages/contracts/src/modules/ai/api/ai-goal-create-workflow.dto.ts',
  'packages/ai/src/server/mastra/agents/goal-planner.worker.ts',
  'packages/ai/src/server/mastra/workflows/apply-goal-plan.service.ts',
  'apps/api/src/modules/ai/goal-plan-mutation.adapter.ts',
  'apps/desktop/src/main/modules/ai/goal-plan-mutation.adapter.ts',
  'packages/app-vue/src/modules/ai/composables/types.ts',
  'packages/app-vue/src/modules/ai/composables/useAIGoalWorkflow.ts',
  'packages/app-vue/src/modules/ai/components/AIGoalDraftEditor.vue',
  'packages/database/src/generated/prisma/schema.prisma',
]);
const KR_CLIENT_SURFACE_ROOTS = [
  'packages/app-vue/src/modules/goal/',
  'packages/app-react/src/screens/Goal',
];
const KR_CLIENT_SURFACE_FILES = new Set([
  'packages/app-react/src/components/GoalCard.tsx',
  'packages/app-react/src/hooks/useGoals.ts',
  'packages/app-vue/src/modules/task/composables/useTaskGoalBindingOptions.ts',
]);

export function isTestLikePath(relPath) {
  return (
    /(?:^|\/)(?:__tests__|__mocks__|test|tests|e2e|stories)(?:\/|$)/.test(relPath) ||
    /\.(?:spec|test|stories)\.[^.]+$/i.test(relPath)
  );
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

    if (
      relPath.startsWith('packages/notification/src/') ||
      relPath.startsWith('packages/contracts/src/modules/notification/')
    ) {
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
    if (
      relPath.startsWith('packages/task/src/') ||
      relPath.startsWith('packages/app-vue/src/modules/task/') ||
      relPath.startsWith('packages/app-react/src/screens/Task') ||
      relPath === 'packages/app-react/src/hooks/useTaskPlans.ts'
    ) {
      pushPatternViolations(
        violations,
        relPath,
        content,
        TASK_LEGACY_CLASSIFICATION_PATTERN,
        'task-legacy-classification',
      );
    }
    if (
      relPath === 'packages/contracts/src/modules/task/api/task-plan.dto.ts' ||
      relPath === 'packages/task/src/server/domain/aggregates/task-plan.state.ts'
    ) {
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

    // ADR-069 / GOAL-7205: Key Result task reads are always scoped by their owning Goal,
    // and a nullable KR link must remain null on ordinary client projections.
    if (relPath.startsWith('packages/task/src/')) {
      pushPatternViolations(
        violations,
        relPath,
        content,
        TASK_GOAL_OWNERLESS_KR_QUERY_PATTERN,
        'task-goal-ownerless-kr-query',
      );
    }
    if (relPath === 'packages/task/src/domain-client/aggregates/task-plan.ts') {
      pushPatternViolations(
        violations,
        relPath,
        content,
        TASK_GOAL_NULL_STRINGIFY_PATTERN,
        'task-goal-null-kr-stringify',
      );
    }

    // ADR-067 / GOAL-7203: Goal owns Target Timeframe, never Task-style due/overdue truth.
    // Scope this lock to Goal-owned canonical surfaces so Task dueDate/isOverdue and the
    // temporary AI GoalPlanDraft V1 compatibility contract remain independently owned.
    if (startsWithAny(relPath, GOAL_TIME_OWNER_ROOTS) || GOAL_TIME_OWNER_FILES.has(relPath)) {
      pushPatternViolations(
        violations,
        relPath,
        content,
        GOAL_LEGACY_TIME_PATTERN,
        'goal-legacy-due-time',
      );
    }

    if (startsWithAny(relPath, GOAL_TIME_OWNER_ROOTS) || GOAL_TIME_OWNER_FILES.has(relPath)) {
      pushPatternViolations(
        violations,
        relPath,
        content,
        GOAL_LEGACY_IDENTITY_PATTERN,
        'goal-legacy-identity-field',
      );
    }

    if (
      relPath.startsWith('packages/goal/src/') ||
      relPath.startsWith('packages/app-vue/src/modules/goal/')
    ) {
      pushPatternViolations(
        violations,
        relPath,
        content,
        GOAL_RETIRED_TEMPLATE_PATTERN,
        'goal-retired-template-track',
      );
    }

    // ADR-068 / GOAL-7204: canonical KR measurement is Initial/Current/Target.
    // The AI GoalPlanDraft V1 compatibility contract is intentionally outside this owner scope
    // until GOAL-7210 retires it, so its legacy input fields remain explicit and reviewable.
    if (
      startsWithAny(relPath, KR_MEASUREMENT_OWNER_ROOTS) ||
      KR_MEASUREMENT_OWNER_FILES.has(relPath)
    ) {
      pushPatternViolations(
        violations,
        relPath,
        content,
        KR_LEGACY_MEASUREMENT_PATTERN,
        'kr-legacy-measurement',
      );
    }

    // trackingBaseValue is server/backup state only; ordinary product UI must not expose it.
    if (startsWithAny(relPath, KR_CLIENT_SURFACE_ROOTS) || KR_CLIENT_SURFACE_FILES.has(relPath)) {
      pushPatternViolations(
        violations,
        relPath,
        content,
        KR_CLIENT_TRACKING_STATE_PATTERN,
        'kr-tracking-base-ui-leak',
      );
    }
  }

  // ADR-069 / GOAL-7205 positive locks: persistence must continue accepting Goal-only links,
  // and Task must own the bounded read seam consumed later by Goal Workspace.
  requireTokens(
    violations,
    fileMap,
    'packages/database/src/schema/task-goal-binding-constraint.ts',
    [
      'memoflow.task-goal-binding/v3',
      'goal_id IS NOT NULL AND key_result_id IS NULL',
      'goal_record_value IS NULL AND goal_progress_trigger IS NULL',
    ],
    'task-goal-binding-v3-missing',
  );
  requireTokens(
    violations,
    fileMap,
    'packages/task/src/server/application/ports/task-goal-context-read.port.ts',
    ['listTasksByGoal', 'listTasksByKeyResult', 'getTaskGoalContextSummary'],
    'task-goal-context-read-port-missing',
  );

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
    ['NotificationPolicy', 'NotificationDeliveryPlanOutcome', 'this.policy.evaluate'],
    'notification-delivery-plan-missing',
  );

  return { violations, auditedFiles: production.length };
}

export function formatCoreVnextArchitectureLockViolation({ file, line, kind, text }) {
  const messages = {
    'feature-scheduler-import':
      'Goal/Task/Routine feature code must not import the Scheduler aggregate/runtime package',
    'scheduler-feature-import': 'Scheduler core must remain feature-domain neutral',
    'scheduler-api-write':
      'Scheduler HTTP transport is diagnostics-only; raw worker mutation endpoints are forbidden',
    'scheduler-ipc-mutation':
      'Scheduler Electron transport is diagnostics-only; raw worker mutation channels are forbidden',
    'web-raw-scheduler-write':
      'Web mocks must not advertise raw Scheduler mutation endpoints that production does not expose',
    'source-module-execution-switch':
      'SourceModule is metadata/diagnostics only and must not select execution behavior',
    'hardcoded-shanghai-fallback':
      'Scheduling execution must receive an explicit validated timezone; Shanghai fallback is forbidden',
    'reminder-trigger-scanner':
      'Reminder must not resurrect an independent trigger scanner/runtime',
    'notification-delivery-plan-bypass':
      'Cross-domain notification.dispatch bypass is forbidden; use NotificationRequested -> DeliveryPlan',
    'notification-requested-path-missing':
      'Notification runtime must consume canonical NotificationRequested envelopes',
    'notification-delivery-plan-missing':
      'Notification creation must route multichannel decisions through NotificationPolicy / DeliveryPlan',
    'contracts-third-party-time-import':
      'Contracts must not expose third-party recurrence/calendar packages',
    'contracts-third-party-time-dto':
      'Contracts must not expose third-party recurrence/calendar DTO types',
    'ui-scheduler-internal-import':
      'UI may use read-only scheduler/client diagnostics, never Scheduler internals',
    'ui-scheduled-invocation-mutation':
      'UI must not mutate ScheduledInvocation/ScheduleTask worker state directly',
    'ai-raw-scheduler-access':
      'AI tools/adapters may read Planner/Notification product projections but must never import or mutate raw Scheduler worker state',
    'ai-retired-goal-task-draft':
      'AI production code must use canonical Goal/Task workflow contracts and must not resurrect retired Goal/Task draft fields or validators',
    'task-legacy-classification':
      'Task classification must use Shared Label; legacy string tags/custom Task color are forbidden',
    'goal-legacy-due-time':
      'Goal planning time must use startDate + GoalTimeframe target; Task-style dueDate/isOverdue truth is forbidden in Goal-owned surfaces',
    'kr-legacy-measurement':
      'KR Measurement V3 must use initialValue/currentValue/targetValue plus internal trackingBaseValue; V2 starting/baseline names are forbidden on canonical KR surfaces',
    'kr-tracking-base-ui-leak':
      'trackingBaseValue is internal aggregation state and must never appear in ordinary Goal/KR product UI',
    'task-goal-ownerless-kr-query':
      'Task Key Result reads must include the owning Goal; ownerless findByKeyResultId queries are forbidden',
    'task-goal-null-kr-stringify':
      'Goal-only Task links must preserve keyResultId=null; stringifying a nullable KR id is forbidden',
    'task-goal-binding-v3-missing':
      'Task persistence must retain the v3 Goal-only / Goal+KR binding constraint',
    'task-goal-context-read-port-missing':
      'Task must expose the ADR-069 owner-controlled Goal/KR context read port',
  };
  return `${file}:${line}: ${messages[kind] ?? kind} [${text}]`;
}
