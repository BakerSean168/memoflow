# CLEAN-2601 — Whole-schema legacy sweep evidence

Date: 2026-09-19
Starting canonical head: `origin/feat/system-wide-vnext-convergence` at
`b1d731b4844d97d77a4d5f9baac78a27ca79b62c`
Worktree branch: `delegated/clean-2601-schema-sweep-luna`

This is the final-head implementation record for CLEAN-2601. The worktree was
started from the latest canonical branch after accepted PORT-1611. No push,
PR, merge, or SYS-3001+ work was performed.

## Governing inputs and deletion gate

The exact task is `CLEAN-2601` in
`docs/plan/archive/2026-09-16-system-vnext-execution.tasks.json`. The Phase 6
deletion list is in
`docs/plan/archive/2026-09-09-system-wide-vnext-model-convergence-implementation.md`.
The cutover is governed by
`docs/architecture/adr/ADR-111-zero-legacy-data-destructive-cutover-policy.md`:
rollback is source/deployment rollback plus fresh database reset/reseed, with
no backfill, converter, dual-read/write path, compatibility alias, or old-data
preservation.

The prerequisite portability evidence is
`docs/analysis/2026-09-18-port-1611-v3-only-cutover-evidence.md`. Owner
retirement evidence and locks were checked for Routine/Reminder
(ADR-076..079), Scheduler (ADR-081..083), Notification (ADR-085..086),
Account/Setting (ADR-092/104), Dashboard/Editor (ADR-107 and HOME-1805), AI
(AI-9612 closure evidence), and Governance (ADR-110). These records establish
that the deleted contracts have no current owner consumer. Governance
`rules`/`rule_revisions` remain protected permanent reference-feature state.

## Residue ledger from the actual canonical base

The ledger below was produced from the canonical base source/schema before
editing, then rechecked against the final worktree. “Absent before” means the
owner retirement had already removed the Prisma/runtime contract; stale
PowerSync/bootstrap/lock residue is still recorded where present.

| candidate | before-sweep residue found | CLEAN-2601 action | final state |
| --- | --- | --- | --- |
| Repository / Folder / Resource persistence | 8 Prisma models (`Repository`, `Folder`, `Resource`, `RepositoryResource`, `LinkedContent`, `ResourceReference`, `RepositoryExplorer`, `RepositoryStatistic`); 8 generated Prisma delegates; 6 PowerSync table definitions and 6 sync queries; 8 API table-mapping entries (6 identity entries plus 2 non-identity entries); Repository/Folder/Resource JSON/boolean normalizers; Desktop pre-hydration `repositories`; one account-close `tx.repository.updateMany` branch; two DB/account-closure fixtures | Removed the eight models and Account relations; added the ADR-111 destructive drop list; removed generated delegates through Prisma generation; removed mapping/normalizer/pre-hydration/consumer/test references | Zero old Prisma models/delegates, PowerSync props, sync queries, mapping entries, CRUD normalizers, or production DB delegates. Canonical Knowledge persistence and current external GitHub `repositoryId` contracts remain. |
| Reminder tables | Prisma and PowerSync model/table surface already absent after the accepted Routine cutover; 7 stale legacy PowerSync queries (`reminder_templates`, `reminder_groups`, `reminder_instances`, `reminder_statistics`, `user_reminder_preferences`, `reminder_history`, `reminder_responses`); hard bootstrap still required `reminder_templates` and `reminder_occurrences`; retirement lock was staged | Removed stale stream entries; changed fresh-boot requirements to Routine tables and added forbidden-table assertions; activated the existing `legacy-reminder-model` governance lock | RoutineDefinition/Profile/Membership/Occurrence/Interaction/TemporaryOverride/Protocol tables only; no legacy Reminder production consumer or sync surface |
| ScheduleTask / Statistic persistence | Legacy Prisma models were already absent; 4 stale PowerSync queries (`task_templates`, `task_instances`, `task_statistics`, `task_template_history`); prior Scheduler retirement SQL/evidence existed | Removed stale stream entries; added all legacy scheduler/task names to fresh-boot absence checks | TaskPlan/TaskOccurrence/TaskPlanHistory and Schedule/ScheduledInvocation/InvocationAttempt/Reconcile/lease/outbox models remain; no ScheduleTask/Statistic persistence |
| Notification Template / History / Channel | Legacy Prisma models were already absent; stale `notification_templates` system query plus `notification_channels` and `notification_history` user queries; hard bootstrap still required `notification_channels`; retirement lock was staged | Removed the three stale stream entries; changed fresh-boot expectations; activated the `legacy-notification-template` lock | Notification, DeliveryDecision, DispatchOutbox, Interaction, and Preference are retained; no template/history/channel authority |
| AI quota / generation / message rows | Accepted AI characterization found zero current Prisma/PowerSync/runtime persistence residue before this sweep; prior AI evidence already deleted `AiMessage`, `AiGenerationTask`, `AiUsageQuota`, and `KnowledgeGenerationTask` | No speculative deletion and no canonical AI redesign | `AiConversation`, `AiExecutionRecord`, provider/config/secret/onboarding state, and Knowledge index state remain. `repository_id` in the AI index is an external Knowledge binding identifier, not a relation to the deleted `repositories` table |
| Account settings / contact residue | Account settings/contact Prisma contracts were already absent; stale PowerSync `user_settings` query remained; prior `drop-legacy-user-settings.sql` and staged account-settings lock existed | Removed the stale stream query; activated `account-settings-legacy` lock | `UserPreferenceRecord` and canonical Account/Profile state remain; no `user_settings` compatibility surface |
| Dashboard / Editor orphan schema | No current Prisma model, PowerSync table, runtime route, or IPC persistence surface; Editor export marker was empty; Dashboard/Editor retirement evidence existed; Editor lock was staged | Removed the empty PowerSync export marker and activated `legacy-editor-persistence` lock; did not invent a replacement schema | No Dashboard/Editor persistence; no surviving owner consumer was forced through deletion |
| Governance reference feature | `Rule`/`RuleRevision` Prisma models, PowerSync tables, and `system_data` queries were present and intentionally permanent | No deletion | Governance reference state remains in Prisma, generated client, PowerSync schema, and sync config |

The final production-only scans found zero exact old Prisma delegate references
and zero old-table `SELECT` entries in the PowerSync/config/runtime surface.
Historical names remain only in intentional drop SQL, forbidden-table
assertions, retirement tests, manifests/evidence, and historical planning
records. Current Knowledge/GitHub API vocabulary such as `/repositories` and
`repositoryId` is an active owner contract, not the deleted persistence.

## Deleted persistence and parity changes

The only Prisma persistence family physically deleted by this batch was:

```text
Repository            -> repositories
Folder                -> folders
Resource              -> resources
RepositoryResource    -> repository_resources
LinkedContent         -> linked_contents
ResourceReference     -> resource_references
RepositoryExplorer    -> repository_explorers
RepositoryStatistic   -> repository_statistics
```

`packages/database/prisma/migrations/retire-legacy-repository-persistence.sql`
drops those tables in dependency order with `CASCADE`. It is a destructive
reset/reseed policy record, not a data migration.

Prisma and PowerSync were changed together:

- Prisma schema relations/models, generated client declarations/runtime/schema,
  API table mapping, CRUD normalization, Desktop bootstrap selection, and
  account-close/test fixtures were updated together.
- The PowerSync client schema and Docker sync config now expose only the
  canonical surface. The PowerSync anti-resurrection test checks retired
  names against the mapping, Prisma delegate resolution, and sync config.
- `pnpm nx run database:prisma-generate --skip-nx-cache` regenerated all
  tracked Prisma artifacts. No generated client output was hand-edited.

No backfill, converter, dual-read/write path, compatibility alias, redirect,
legacy reader, or old-data preservation was added. Fresh reset/reseed is the
rollback/data policy.

## Exact canonical Prisma model list

The final `packages/database/prisma/schema` contains exactly these 74 models:

```text
Account, AccountClosureOperation, AiConversation, AiExecutionRecord,
AiKnowledgeIndexEntry, AiProviderConfig, AiProviderOnboardingSession,
AiProviderSecret, CloudAuthDeviceCode, CloudAuthProviderAccount,
CloudAuthSession, CloudAuthUser, CloudAuthVerification, GithubWebhookDelivery,
Goal, GoalLabel, GoalRecord, GoalReview, Habit, HabitCheckIn,
HabitOccurrence, HabitStreakProjection, InboxReceipt, InvocationAttempt,
KeyResult, KeyResultWeightSnapshot, KnowledgeAttachmentContentCache,
KnowledgeAttachmentProjection, KnowledgeDocumentIdentity,
KnowledgeNoteProjection, KnowledgeProjectionCheckpoint,
KnowledgeRemoteBinding, KnowledgeRepositoryInstallationIntent,
KnowledgeRepositoryLease, KnowledgeSpace, KnowledgeWriteRequest, Label,
Notification, NotificationDeliveryDecisionRecord, NotificationDispatchOutbox,
NotificationInteraction, NotificationPreference, OperationAuditLog,
OutboxMessage, ProjectionCursor, Relation, RemoteHistoryFence,
RemoteRepositoryObservation, RoutineDefinition, RoutineInteraction,
RoutineOccurrence, RoutineProfile, RoutineProfileMembership,
RoutineProtocolDefinition, RoutineProtocolSession, RoutineTemporaryOverride,
Rule, RuleRevision, Schedule, ScheduleDomainEventOutbox,
ScheduleEventConsumerReceipt, ScheduleEventDeliveryLog, ScheduleLease,
ScheduleRebuildOutbox, ScheduledInvocation, SchedulingReconcileOperation,
TaskGoalOutbox, TaskLabel, TaskOccurrence, TaskPlan, TaskPlanHistory,
UserPreferenceRecord, WalletAccount, WalletTransaction
```

There are no `Repository`, `Folder`, `Resource`, `RepositoryResource`,
`LinkedContent`, `ResourceReference`, `RepositoryExplorer`,
`RepositoryStatistic`, Reminder legacy, ScheduleTask/Statistic, Notification
legacy, AI legacy, settings/contact, Dashboard, or Editor Prisma models.

## Exact canonical PowerSync schema list

`PowerSyncAppSchema` exports exactly 46 table declarations. The 36
non-local canonical declarations are:

```text
accounts, user_preference_records, goals, key_results, goal_records,
goal_reviews, key_result_weight_snapshots, task_plans, task_occurrences,
task_plan_history, labels, goal_labels, task_labels, relations, schedules,
scheduling_reconcile_operations, scheduled_invocations, invocation_attempts,
routine_definitions, routine_profiles, routine_profile_memberships,
routine_occurrences, routine_interactions, routine_temporary_overrides,
routine_protocol_definitions, routine_protocol_sessions, notifications,
notification_delivery_decisions, notification_dispatch_outbox,
notification_interactions, notification_preferences, ai_conversations,
ai_execution_records, task_goal_outbox, rules, rule_revisions
```

The 10 intentional local-only declarations are:

```text
profile_adoption_journal, account_profile_sync_outbox,
account_closure_requested, schedule_domain_event_outbox,
desktop_delivery_acks, goal_operation_receipts, ai_provider_configs,
ai_provider_onboarding_sessions, ai_provider_secrets,
ai_knowledge_index_entries_local
```

The final Docker sync config contains exactly 35 query tables: 33
`user_data` tables plus the two Governance queries in the `system_data` stream
(`rules` and `rule_revisions`). It intentionally does not auto-subscribe the
existing `accounts` control row. No retired table is defined, mapped, or
queried. The direct final-head parity check found all 35 query table names in
generated Prisma `@@map` output.

## Governance and anti-resurrection locks

`tools/governance/vnext-retirement-manifest.json` now reports 9 active locks
and 0 staged locks. CLEAN-2601 activates the previously staged locks for
legacy Editor persistence, Account settings, legacy Reminder, and legacy
Notification templates. Existing active locks for the other retired surfaces
remain unchanged. The PowerSync/API anti-resurrection surface test and fresh
bootstrap forbidden-table list cover the deleted repository, Reminder,
Scheduler, Notification, AI legacy, settings, Dashboard, and Editor names.

## Final verification

| gate | final result |
| --- | --- |
| `pnpm test:inventory` | passed; 1,183 files (`unit` 1,017, `integration` 34, `smoke` 3, `boundary-ipc` 8, `boundary-main` 6, `e2e` 57, `perf` 1, `governance` 57) |
| `pnpm test:inventory:check` | passed with the same inventory |
| `pnpm governance:check` | passed; 9 active retirement locks, 0 staged |
| `pnpm typecheck` | passed; 37 projects / 31 tasks |
| `pnpm test` | passed; 36 projects / 6 dependency tasks |
| `pnpm build` | passed; 35 projects / 1 dependency task |
| `pnpm nx run desktop:db:reset:dry --skip-nx-cache` | passed; no local DB files found, 0 files affected |
| `node tools/test/hard-7103-schema-boot.mjs` | passed; fresh PostgreSQL bootstrap, 74 public tables, 32 required canonical tables, zero forbidden retired tables |
| `pnpm nx run database:prisma-generate --skip-nx-cache` | passed; regenerated and normalized the tracked Prisma client artifacts |
| `pnpm --dir packages/database exec prisma validate --config ./prisma/prisma.config.ts` | passed |
| `pnpm nx run powersync-schema:test --skip-nx-cache` | passed; 1 file / 8 tests |
| direct PowerSync query → generated Prisma map parity | passed; 35 query tables, 0 missing maps |
| affected owner tests (`api`, `account`, `repository`, `database`, `powersync-schema`, `notification`, `reminder`, `scheduler`, `schedule`, `setting`, `ai`) | passed; all targeted suites green |
| `pnpm docs:check` | passed |
| `git diff --check` | passed |

The first inventory invocation was run before the dependency build artifacts
existed and could not import the generated contracts package; it was rerun
after the repository build/typecheck path and passed. No gate was weakened.

## Residual P3-only notes

- Intentional historical vocabulary remains in ADRs, plans, deletion SQL,
  retirement tests, forbidden-table assertions, and governance evidence.
- The current Knowledge/GitHub integration legitimately uses external
  repository identifiers and API routes; these do not point to the deleted
  Prisma tables.
- Existing Vite config-loader warnings and Nx flaky-task notices were emitted
  by successful gates; they are unrelated to this schema sweep.

No P0/P1/P2 residue remains in the CLEAN-2601 scope. This head is ready for
ChatGPT Web’s independent acceptance; SYS-3001+ remains unstarted.
