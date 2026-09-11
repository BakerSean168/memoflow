/**
 * PowerSync Client-Side Schema
 *
 * Defines the SQLite column types for every synced table.
 * This is the single source of truth for the client-side schema,
 * shared by both Desktop (@powersync/node) and Web (@powersync/web).
 *
 * Column type mapping from Prisma/Postgres:
 *   String / DateTime / Json / Enum → column.text
 *   Int / Boolean                    → column.integer
 *   Float                            → column.real
 *   BigInt                           → column.integer
 *   String[]                         → column.text  (JSON-serialised array)
 *
 * Notes:
 *   - PowerSync auto-provides the `id` column (TEXT PRIMARY KEY) — do NOT define it.
 *   - Relation fields are omitted — only scalar/FK columns are defined.
 *   - `@@map` names are used as table keys (snake_case SQL names).
 */

import { column, Schema, Table } from '@powersync/common';

// ──────────────────────────────────────────────
// Account
// ──────────────────────────────────────────────

const accounts = new Table({
  status: column.text,
  profile: column.text, // JSON
  created_at: column.text, // DateTime
  updated_at: column.text, // DateTime
  closed_at: column.text, // DateTime
});

/**
 * Local-only crash recovery journal for guest-to-cloud ownership adoption.
 * The identity updates and this marker commit in the same SQLite transaction;
 * Profile Registry rebind can then be completed safely after a process restart.
 */
const profile_adoption_journal = new Table(
  {
    from_owner_id: column.text,
    to_owner_id: column.text,
    display_name: column.text,
    identifier: column.text,
    adopted_at: column.integer,
  },
  { localOnly: true },
);

/**
 * Coalesced local intent for projecting the registered Profile display data
 * to the cloud Account API. The Account row remains the local source of truth;
 * this table only records that the latest projection still needs delivery.
 */
const account_profile_sync_outbox = new Table(
  {
    owner_id: column.text,
    revision: column.integer,
    requested_at: column.integer,
  },
  { localOnly: true },
);

/**
 * Local-only marker set BEFORE a cloud account-close request starts (the
 * requested/revoking window where the remote Account row is still Active).
 * Local new-work entrypoints (AI / scheduler / use-cases) fail-closed against
 * this marker so the device stops creating work the moment the user initiates
 * close, not only after the cloud saga completes.
 */
const account_closure_requested = new Table(
  {
    identity_id: column.text,
    requested_at: column.integer,
  },
  { localOnly: true },
);

// ──────────────────────────────────────────────
// Settings
// ──────────────────────────────────────────────

const user_preference_records = new Table({
  identity_id: column.text,
  namespace: column.text,
  payload: column.text, // JSON
  revision: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

// ──────────────────────────────────────────────
// Goal — Core vNext Direction + Measurement
// ──────────────────────────────────────────────

const goals = new Table({
  identity_id: column.text,
  name: column.text,
  description: column.text,
  feasibility_analysis: column.text,
  motivation: column.text,
  status: column.text,
  start_date: column.text,
  due_date: column.text,
  completed_at: column.text,
  archived_at: column.text,
  sort_order: column.integer,
  reminder_config: column.text,
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const key_results = new Table({
  identity_id: column.text,
  goal_id: column.text,
  title: column.text,
  description: column.text,
  aggregation_method: column.text,
  starting_value: column.real,
  progress_baseline_value: column.real,
  target_value: column.real,
  current_value: column.real,
  unit: column.text,
  weight: column.real,
  order: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

const goal_records = new Table({
  identity_id: column.text,
  key_result_id: column.text,
  value: column.real,
  note: column.text,
  source_type: column.text,
  source_id: column.text,
  recorded_at: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const goal_reviews = new Table({
  identity_id: column.text,
  goal_id: column.text,
  reflection: column.text,
  challenges: column.text,
  adjustments: column.text,
  system_context: column.text,
  reviewed_at: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const key_result_weight_snapshots = new Table({
  identity_id: column.text,
  goal_id: column.text,
  key_result_id: column.text,
  old_weight: column.real,
  new_weight: column.real,
  weight_delta: column.real,
  snapshot_time: column.text,
  trigger: column.text,
  reason: column.text,
  operator_id: column.text,
  created_at: column.text,
});

// ──────────────────────────────────────────────
// Task
// ──────────────────────────────────────────────

const task_templates = new Table({
  identity_id: column.text,
  name: column.text,
  description: column.text,
  status: column.text,
  outcome: column.text,
  completion_policy: column.text,
  closed_at: column.text,
  archived_at: column.text,
  abandoned_reason: column.text,
  importance: column.text,
  time_config_type: column.text,
  time_config_start_time: column.text,
  time_config_end_time: column.text,
  time_config_duration_minutes: column.integer,
  time_config_time_point: column.integer,
  time_config_time_range_start: column.integer,
  time_config_time_range_end: column.integer,
  recurrence_rule_type: column.text,
  recurrence_rule_interval: column.integer,
  recurrence_rule_days_of_week: column.text,
  recurrence_rule_end_date: column.text,
  recurrence_rule_count: column.integer,
  reminder_config_enabled: column.integer, // boolean
  reminder_config_time_offset_minutes: column.integer,
  reminder_config_unit: column.text,
  reminder_config_channel: column.text,
  last_generated_date: column.text,
  generate_ahead_days: column.integer,
  goal_id: column.text, // FK via key_result_id relation
  key_result_id: column.text, // FK
  goal_record_value: column.real,
  goal_progress_trigger: column.text,
  checklist: column.text, // JSON
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const task_instances = new Table({
  template_id: column.text, // FK
  identity_id: column.text,
  instance_date: column.text, // DateTime
  occurrence_key: column.text, // Task vNext deterministic templateId:localDate identity
  status: column.text,
  importance: column.text,
  time_config: column.text, // JSON
  actual_start_time: column.text,
  actual_end_time: column.text,
  comment: column.text,
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const task_template_history = new Table({
  identity_id: column.text,
  template_id: column.text, // FK
  action: column.text,
  changes: column.text, // JSON
  created_at: column.text,
});

const task_statistics = new Table({
  identity_id: column.text,
  calculated_at: column.text,
  template_total: column.integer,
  template_active: column.integer,
  template_paused: column.integer,
  template_archived: column.integer,
  template_one_time: column.integer,
  template_recurring: column.integer,
  instance_total: column.integer,
  instance_today: column.integer,
  instance_week: column.integer,
  instance_month: column.integer,
  instance_pending: column.integer,
  instance_in_progress: column.integer,
  instance_completed: column.integer,
  instance_skipped: column.integer,
  instance_missed: column.integer,
  completion_today: column.integer,
  completion_week: column.integer,
  completion_month: column.integer,
  completion_total: column.integer,
  completion_avg_time: column.real,
  completion_rate: column.real,
  time_all_day: column.integer,
  time_point: column.integer,
  time_range: column.integer,
  time_overdue: column.integer,
  time_upcoming: column.integer,
  distribution_by_importance: column.text, // JSON
  distribution_by_urgency: column.text, // JSON
  distribution_by_tag: column.text, // JSON
});

// ──────────────────────────────────────────────
// Shared Labels (ADR-054)
// ──────────────────────────────────────────────

const labels = new Table({
  identity_id: column.text,
  name: column.text,
  normalized_name: column.text,
  color: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const goal_labels = new Table({
  identity_id: column.text,
  goal_id: column.text,
  label_id: column.text,
});

const task_labels = new Table({
  identity_id: column.text,
  task_template_id: column.text,
  label_id: column.text,
});

// ──────────────────────────────────────────────
// Schedule
// ──────────────────────────────────────────────

const schedules = new Table({
  identity_id: column.text,
  title: column.text,
  description: column.text,
  start_time: column.text,
  end_time: column.text,
  duration: column.integer,
  has_conflict: column.integer, // boolean
  conflicting_schedules: column.text, // JSON
  priority: column.integer,
  location: column.text,
  attendees: column.text, // JSON
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

const schedule_tasks = new Table({
  identity_id: column.text,
  name: column.text,
  description: column.text,
  source_module: column.text,
  source_entity_id: column.text,
  scheduling_key: column.text,
  owner_type: column.text,
  owner_id: column.text,
  handler_key: column.text,
  payload_version: column.integer,
  source_revision: column.text,
  status: column.text,
  enabled: column.integer, // boolean
  cron_expression: column.text,
  timezone: column.text,
  start_date: column.text,
  end_date: column.text,
  max_executions: column.integer,
  next_run_at: column.text,
  last_run_at: column.text,
  execution_count: column.integer,
  last_execution_status: column.text,
  last_execution_duration: column.integer,
  consecutive_failures: column.integer,
  max_retries: column.integer,
  initial_delay_ms: column.integer,
  max_delay_ms: column.integer,
  backoff_multiplier: column.real,
  retryable_statuses: column.text, // JSON
  payload: column.text, // JSON
  tags: column.text, // JSON
  priority: column.text,
  timeout: column.integer,
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const scheduling_reconcile_operations = new Table({
  identity_id: column.text,
  owner_type: column.text,
  owner_id: column.text,
  status: column.text,
  desired_count: column.integer,
  created_count: column.integer,
  updated_count: column.integer,
  deleted_count: column.integer,
  unchanged_count: column.integer,
  failure_code: column.text,
  failure_message: column.text,
  failure_retryable: column.integer,
  started_at: column.text,
  finished_at: column.text,
  created_at: column.text,
});

const schedule_executions = new Table({
  identity_id: column.text,
  task_id: column.text, // FK
  execution_time: column.text,
  status: column.text,
  duration: column.integer,
  result: column.text, // JSON
  error: column.text,
  retry_count: column.integer,
  created_at: column.text,
});

const schedule_statistics = new Table({
  identity_id: column.text,
  total_tasks: column.integer,
  active_tasks: column.integer,
  paused_tasks: column.integer,
  completed_tasks: column.integer,
  cancelled_tasks: column.integer,
  failed_tasks: column.integer,
  total_executions: column.integer,
  successful_executions: column.integer,
  failed_executions: column.integer,
  skipped_executions: column.integer,
  timeout_executions: column.integer,
  avg_execution_duration: column.real,
  min_execution_duration: column.real,
  max_execution_duration: column.real,
  module_statistics: column.text, // JSON
  last_updated_at: column.text,
  created_at: column.text,
});

const schedule_domain_event_outbox = new Table(
  {
    identity_id: column.text,
    schedule_id: column.text,
    event_type: column.text,
    payload: column.text,
    status: column.text,
    attempts: column.integer,
    claim_token: column.text,
    claimed_at: column.text,
    next_attempt_at: column.text,
    published_at: column.text,
    last_error: column.text,
    idempotency_key: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { localOnly: true },
);

// ──────────────────────────────────────────────
// Reminder
// ──────────────────────────────────────────────

const reminder_templates = new Table({
  identity_id: column.text,
  name: column.text,
  description: column.text,
  type: column.text,
  self_enabled: column.integer, // boolean
  status: column.text,
  importance_level: column.text,
  tags: column.text, // JSON
  color: column.text,
  icon: column.text,
  next_trigger_at: column.text,
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
  trigger: column.text, // JSON
  recurrence: column.text, // JSON
  active_time: column.text, // JSON
  active_hours: column.text, // JSON
  notification_config: column.text, // JSON
  stats: column.text, // JSON
});

const reminder_groups = new Table({
  identity_id: column.text,
  name: column.text,
  description: column.text,
  color: column.text,
  icon: column.text,
  enabled: column.integer, // boolean
  status: column.text,
  order: column.integer,
  stats: column.text, // JSON
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const reminder_instances = new Table({
  template_id: column.text, // FK
  identity_id: column.text,
  trigger_at: column.text,
  status: column.text,
  result: column.text,
  processed_at: column.text,
  note: column.text,
  payload: column.text, // JSON
  created_at: column.text,
  updated_at: column.text,
});

const reminder_history = new Table({
  identity_id: column.text,
  template_id: column.text, // FK
  triggered_at: column.text,
  result: column.text,
  error: column.text,
  notification_sent: column.integer, // boolean
  notification_channel: column.text,
  created_at: column.text,
});

const reminder_statistics = new Table({
  identity_id: column.text,
  template_stats: column.text, // JSON
  group_stats: column.text, // JSON
  trigger_stats: column.text, // JSON
  calculated_at: column.text,
});

const reminder_responses = new Table({
  identity_id: column.text,
  template_id: column.text, // FK
  action: column.text,
  response_time: column.integer,
  snooze_duration_seconds: column.integer,
  timestamp: column.text,
  created_at: column.text,
});

const user_reminder_preferences = new Table({
  identity_id: column.text,
  best_time_slots: column.text, // JSON
  worst_time_slots: column.text, // JSON
  global_reminder_enabled: column.integer, // boolean
  created_at: column.text,
  updated_at: column.text,
});

// ──────────────────────────────────────────────
// Routine Coach vNext
// ──────────────────────────────────────────────

const routine_definitions = new Table({
  identity_id: column.text,
  name: column.text,
  description: column.text,
  enabled: column.integer,
  trigger_json: column.text,
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

const routine_profiles = new Table({
  identity_id: column.text,
  name: column.text,
  description: column.text,
  enabled: column.integer,
  active: column.integer,
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

const routine_profile_memberships = new Table({
  identity_id: column.text,
  profile_id: column.text,
  routine_id: column.text,
  enabled: column.integer,
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

const routine_temporary_overrides = new Table({
  identity_id: column.text,
  routine_id: column.text,
  override_json: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const routine_protocol_definitions = new Table({
  identity_id: column.text,
  name: column.text,
  definition_json: column.text,
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

const routine_protocol_sessions = new Table({
  identity_id: column.text,
  protocol_id: column.text,
  protocol_version: column.integer,
  status: column.text,
  snapshot_json: column.text,
  termination_reason: column.text,
  ended_at: column.text,
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
});

// ──────────────────────────────────────────────
// Notification
// ──────────────────────────────────────────────

const notifications = new Table({
  identity_id: column.text,
  type: column.text,
  category: column.text,
  workflow_key: column.text,
  topic: column.text,
  idempotency_key: column.text,
  title: column.text,
  content: column.text,
  importance: column.text,
  urgency: column.text,
  related_entity_type: column.text,
  related_entity_id: column.text,
  metadata: column.text, // JSON
  actions: column.text, // JSON
  navigation_intent: column.text, // JSON
  correlation_id: column.text,
  causation_id: column.text,
  read_at: column.text,
  expires_at: column.text,
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
  is_read: column.integer, // boolean
});

const notification_channels = new Table({
  identity_id: column.text,
  notification_id: column.text, // FK
  channel_type: column.text,
  status: column.text,
  recipient: column.text,
  max_retries: column.integer,
  error: column.text,
  response: column.text,
  retry_count: column.integer,
  attempts: column.integer,
  sent_at: column.text,
  failed_at: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const notification_delivery_decisions = new Table({
  identity_id: column.text,
  notification_id: column.text,
  channel: column.text,
  outcome: column.text,
  reason: column.text,
  preference_source: column.text,
  retry_at: column.text,
  created_at: column.text,
  updated_at: column.text,
});

// Durable dispatch outbox (desktop durable worker; consumed with W0 lease semantics)
const notification_dispatch_outbox = new Table({
  identity_id: column.text,
  notification_id: column.text, // FK
  source: column.text,
  occurrence_key: column.text,
  channel: column.text,
  payload_json: column.text, // JSON
  idempotency_key: column.text,
  status: column.text,
  attempt: column.integer,
  owner_token: column.text,
  claim_id: column.text,
  fencing_token: column.integer,
  lease_expires_at: column.text,
  last_heartbeat_at: column.text,
  heartbeat_interval_ms: column.integer,
  last_error: column.text,
  next_retry_at: column.text,
  dead_letter_at: column.text,
  correlation_id: column.text,
  causation_id: column.text,
  attempts_history_json: column.text, // JSON
  created_at: column.text,
  updated_at: column.text,
  finished_at: column.text,
});

// Durable desktop transport delivery receipts / acknowledgments
const desktop_delivery_acks = new Table(
  {
    idempotency_key: column.text,
    status: column.text,
    ack_id: column.text,
    payload_json: column.text,
    error: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { localOnly: true },
);

/**
 * Local-only durable operation receipts for Goal mutations (completion / archive).
 * Persisted in SQLite to guarantee idempotency across process restarts.
 */
const goal_operation_receipts = new Table(
  {
    idempotency_key: column.text,
    operation_id: column.text,
    identity_id: column.text,
    source: column.text,
    occurrence_key: column.text,
    status: column.text,
    created_at: column.text,
  },
  { localOnly: true },
);

const notification_history = new Table({
  identity_id: column.text,
  notification_id: column.text, // FK
  action: column.text,
  details: column.text,
  actor_id: column.text,
  created_at: column.text,
});

const notification_preferences = new Table({
  identity_id: column.text,
  global_channels: column.text, // JSON Partial<Record<channel, boolean>>
  workflow_overrides: column.text, // JSON workflowKey -> channel overrides
  do_not_disturb: column.text, // JSON
  rate_limit: column.text, // JSON
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const notification_templates = new Table({
  name: column.text,
  display_name: column.text,
  description: column.text,
  type: column.text,
  category: column.text,
  title_template: column.text,
  content_template: column.text,
  variables: column.text, // JSON
  default_actions: column.text, // JSON
  is_system: column.integer, // boolean
  is_active: column.integer, // boolean
  created_at: column.text,
  updated_at: column.text,
});


// ──────────────────────────────────────────────
// AI
// ──────────────────────────────────────────────

const ai_conversations = new Table({
  identity_id: column.text,
  name: column.text,
  status: column.text,
  message_count: column.integer,
  last_message_at: column.text,
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const ai_messages = new Table({
  identity_id: column.text,
  conversation_id: column.text, // FK
  role: column.text,
  content: column.text,
  token_usage: column.text, // JSON
  created_at: column.text,
});

const ai_generation_tasks = new Table({
  identity_id: column.text,
  task_type: column.text,
  status: column.text,
  conversation_id: column.text,
  run_id: column.text,
  request_id: column.text,
  trace_id: column.text,
  provider_id: column.text,
  model: column.text,
  estimated_cost_usd: column.real,
  input: column.text, // JSON
  result: column.text, // JSON
  error: column.text,
  retry_count: column.integer,
  token_usage: column.text, // JSON
  processing_ms: column.integer,
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
  completed_at: column.text,
  deleted_at: column.text,
});

const ai_usage_quotas = new Table({
  identity_id: column.text,
  quota_limit: column.integer,
  current_usage: column.integer,
  reset_period: column.text,
  last_reset_at: column.text,
  next_reset_at: column.text,
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const ai_provider_configs = new Table({
  identity_id: column.text,
  name: column.text,
  provider_type: column.text,
  base_url: column.text,
  api_key_encrypted: column.text,
  default_model: column.text,
  available_models: column.text, // JSON
  is_active: column.integer, // boolean
  is_default: column.integer, // boolean
  priority: column.integer,
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

/**
 * Desktop-only Provider onboarding state. Credentials are encrypted with the
 * same local provider vault and never enter the PowerSync upload queue.
 * The final Provider write consumes this row in the same SQLite transaction.
 */
const ai_provider_onboarding_sessions = new Table(
  {
    identity_id: column.text,
    catalog_id: column.text,
    base_url: column.text,
    target_provider_id: column.text,
    credential_encrypted: column.text,
    credential_status: column.text,
    discovery_status: column.text,
    models_json: column.text,
    verified_model_ids_json: column.text,
    expires_at: column.integer,
    consumed_at: column.integer,
    created_at: column.integer,
    updated_at: column.integer,
  },
  { localOnly: true },
);

/**
 * Device-local rebuildable AI index over the active knowledge source.
 * It is deliberately not synced: Web/API use the Prisma index table while
 * Desktop rebuilds this cache from the Local Vault.
 */
const ai_knowledge_index_entries_local = new Table(
  {
    identity_id: column.text,
    repository_id: column.text,
    resource_id: column.text,
    resource_path: column.text,
    title: column.text,
    mime_type: column.text,
    content_hash: column.text,
    status: column.text,
    summary: column.text,
    keywords_json: column.text,
    embedding_json: column.text,
    chunks_json: column.text,
    metadata_json: column.text,
    error: column.text,
    indexed_at: column.integer,
    last_requested_at: column.integer,
  },
  { localOnly: true },
);

const task_goal_outbox = new Table({
  identity_id: column.text,
  task_instance_id: column.text,
  task_template_id: column.text,
  goal_id: column.text,
  key_result_id: column.text,
  payload: column.text,
  status: column.text,
  attempts: column.integer,
  available_at: column.text,
  last_error: column.text,
  dispatched_at: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const dashboard_configs = new Table({
  identity_id: column.text,
  widget_config: column.text, // JSON
  created_at: column.text,
  updated_at: column.text,
});

// ──────────────────────────────────────────────
// Repository
// ──────────────────────────────────────────────

const repositories = new Table({
  identity_id: column.text,
  name: column.text,
  type: column.text,
  path: column.text,
  description: column.text,
  config: column.text, // JSON
  stats: column.text, // JSON
  related_goals: column.text,
  status: column.text,
  git: column.text,
  sync_status: column.text,
  last_accessed_at: column.text,
  version: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const repository_explorers = new Table({
  repository_id: column.text, // FK
  identity_id: column.text,
  name: column.text,
  description: column.text,
  current_path: column.text,
  filters: column.text, // JSON
  view_config: column.text, // JSON
  pinned_paths: column.text, // JSON
  recent_paths: column.text, // JSON
  last_scan_at: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const repository_statistics = new Table({
  identity_id: column.text,
  total_repositories: column.integer,
  active_repositories: column.integer,
  archived_repositories: column.integer,
  total_resources: column.integer,
  total_files: column.integer,
  total_folders: column.integer,
  git_enabled_repos: column.integer,
  total_commits: column.integer,
  total_references: column.integer,
  total_linked_contents: column.integer,
  total_size_bytes: column.integer, // BigInt → integer
  last_updated_at: column.text,
  created_at: column.text,
});

const folders = new Table({
  identity_id: column.text,
  repository_id: column.text, // FK
  parent_id: column.text, // FK (self)
  name: column.text,
  path: column.text,
  order: column.integer,
  is_expanded: column.integer, // boolean
  metadata: column.text, // JSON
  created_at: column.text,
  updated_at: column.text,
});

const resources = new Table({
  identity_id: column.text,
  repository_id: column.text, // FK
  folder_id: column.text, // FK
  name: column.text,
  type: column.text,
  path: column.text,
  size: column.integer,
  content: column.text,
  metadata: column.text, // JSON
  stats: column.text, // JSON
  description: column.text,
  author: column.text,
  version: column.integer,
  tags: column.text, // JSON
  category: column.text,
  status: column.text,
  created_at: column.text,
  updated_at: column.text,
  modified_at: column.text,
  deleted_at: column.text,
});

const repository_resources = new Table({
  identity_id: column.text,
  repository_id: column.text, // FK
  name: column.text,
  type: column.text,
  path: column.text,
  size: column.integer,
  description: column.text,
  author: column.text,
  version: column.text,
  tags: column.text, // JSON
  category: column.text,
  status: column.text,
  metadata: column.text, // JSON
  created_at: column.text,
  updated_at: column.text,
  modified_at: column.text,
});

// ──────────────────────────────────────────────
// Governance
// ──────────────────────────────────────────────

const rules = new Table({
  code: column.text,
  title: column.text,
  description: column.text,
  severity: column.text,
  status: column.text,
  deprecation_reason: column.text,
  replacement_rule_id: column.text,
  live_reference_location: column.text,
  tags: column.text, // JSON
  good_examples: column.text, // JSON
  bad_examples: column.text, // JSON
  author_id: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const rule_revisions = new Table({
  rule_id: column.text, // FK
  revision_number: column.integer,
  author_id: column.text,
  changed_fields: column.text, // JSON
  previous_values: column.text, // JSON
  new_values: column.text, // JSON
  change_type: column.text,
  created_at: column.text,
});

// ──────────────────────────────────────────────
// Schema Export
// ──────────────────────────────────────────────

export const PowerSyncAppSchema = new Schema({
  // Account
  accounts,
  profile_adoption_journal,
  account_profile_sync_outbox,
  account_closure_requested,
  user_preference_records,
  // Goal
  goals,
  key_results,
  goal_records,
  goal_reviews,
  key_result_weight_snapshots,
  goal_operation_receipts,
  labels,
  goal_labels,
  task_labels,
  // Task
  task_templates,
  task_instances,
  task_template_history,
  task_statistics,
  // Schedule
  schedules,
  schedule_tasks,
  scheduling_reconcile_operations,
  schedule_executions,
  schedule_statistics,
  schedule_domain_event_outbox,
  // Reminder
  reminder_templates,
  reminder_groups,
  reminder_instances,
  reminder_history,
  reminder_statistics,
  reminder_responses,
  user_reminder_preferences,
  routine_definitions,
  routine_profiles,
  routine_profile_memberships,
  routine_temporary_overrides,
  routine_protocol_definitions,
  routine_protocol_sessions,
  // Notification
  notifications,
  notification_channels,
  notification_delivery_decisions,
  notification_dispatch_outbox,
  desktop_delivery_acks,
  notification_history,
  notification_preferences,
  notification_templates,
  // Editor
  // AI
  ai_conversations,
  ai_messages,
  ai_generation_tasks,
  ai_usage_quotas,
  ai_provider_configs,
  ai_provider_onboarding_sessions,
  ai_knowledge_index_entries_local,
  task_goal_outbox,
  dashboard_configs,
  // Repository
  repositories,
  repository_explorers,
  repository_statistics,
  folders,
  resources,
  repository_resources,
  // Governance
  rules,
  rule_revisions,
});

export type PowerSyncDatabase = InstanceType<typeof Schema>;
