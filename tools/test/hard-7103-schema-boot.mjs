#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;
const host = process.env.TEST_DB_HOST ?? '127.0.0.1';
const port = Number(process.env.TEST_DB_PORT ?? '5433');
const user = process.env.TEST_DB_USER ?? 'test_user';
const password = process.env.TEST_DB_PASS ?? 'test_pass';
const suffix = `${process.pid}_${Date.now()}`;
const database = `memoflow_acceptance_${suffix}`;
const adminUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/postgres`;
const databaseUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;

const requiredTables = [
  'accounts',
  'goals',
  'key_results',
  'goal_records',
  'task_plans',
  'task_occurrences',
  'task_goal_outbox',
  'schedules',
  'scheduled_invocations',
  'invocation_attempts',
  'scheduling_reconcile_operations',
  'schedule_leases',
  'labels',
  'goal_labels',
  'task_labels',
  'task_plan_history',
  'routine_definitions',
  'routine_profiles',
  'routine_profile_memberships',
  'routine_occurrences',
  'routine_interactions',
  'routine_protocol_definitions',
  'routine_protocol_sessions',
  'routine_temporary_overrides',
  'notifications',
  'notification_delivery_decisions',
  'notification_dispatch_outbox',
  'notification_interactions',
  'notification_preferences',
  'ai_conversations',
  'ai_execution_records',
  'reliable_outbox_messages',
];

const forbiddenTables = [
  'repositories',
  'repository_explorers',
  'repository_statistics',
  'folders',
  'resources',
  'repository_resources',
  'linked_contents',
  'resource_references',
  'reminder_templates',
  'reminder_groups',
  'reminder_instances',
  'reminder_statistics',
  'user_reminder_preferences',
  'reminder_history',
  'reminder_responses',
  'reminder_occurrences',
  'schedule_tasks',
  'schedule_executions',
  'schedule_statistics',
  'task_templates',
  'task_instances',
  'task_statistics',
  'task_template_history',
  'notification_templates',
  'notification_history',
  'notification_channels',
  'ai_messages',
  'ai_generation_tasks',
  'ai_usage_quotas',
  'knowledge_generation_tasks',
  'user_settings',
  'dashboard_configs',
  'editor_workspaces',
  'editor_workspace_sessions',
  'editor_workspace_session_groups',
  'editor_workspace_session_group_tabs',
];

const admin = new Client({ connectionString: adminUrl });
let created = false;

try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;

  const result = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'nx', 'run', 'database:prisma-push', '--skip-nx-cache'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        PRISMA_HIDE_UPDATE_MESSAGE: 'true',
      },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`database:prisma-push exited ${result.status}`);

  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    const extension = await db.query(`SELECT extname FROM pg_extension WHERE extname = 'vector'`);
    if (extension.rowCount !== 1) throw new Error('pgvector extension is missing after production-like boot');

    const tables = await db.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const names = new Set(tables.rows.map((row) => row.tablename));
    const missing = requiredTables.filter((table) => !names.has(table));
    if (missing.length > 0) throw new Error(`production-like boot missing tables: ${missing.join(', ')}`);
    const forbidden = forbiddenTables.filter((table) => names.has(table));
    if (forbidden.length > 0) {
      throw new Error(`production-like boot retained retired tables: ${forbidden.join(', ')}`);
    }

    const uniqueSchedulingKey = await db.query(`
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'scheduled_invocations'
        AND indexdef ILIKE '%UNIQUE%'
        AND indexdef ILIKE '%scheduling_key%'
      LIMIT 1
    `);
    if (uniqueSchedulingKey.rowCount !== 1) {
      throw new Error('scheduled_invocations has no unique scheduling_key index after boot');
    }

    const routineMembershipUnique = await db.query(`
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'routine_profile_memberships'
        AND indexdef ILIKE '%UNIQUE%'
        AND indexdef ILIKE '%routine_id%'
        AND indexdef ILIKE '%profile_id%'
      LIMIT 1
    `);
    if (routineMembershipUnique.rowCount !== 1) {
      throw new Error('routine_profile_memberships has no routine/profile uniqueness fence after boot');
    }

    const taskGoalBinding = await db.query(`
      SELECT
        pg_get_constraintdef(oid) AS definition,
        obj_description(oid, 'pg_constraint') AS comment
      FROM pg_constraint
      WHERE conname = 'task_plans_goal_binding_complete'
        AND conrelid = 'public.task_plans'::regclass
    `);
    const taskGoalBindingRow = taskGoalBinding.rows[0];
    const taskGoalBindingDefinition = String(taskGoalBindingRow?.definition ?? '');
    if (
      taskGoalBinding.rowCount !== 1 ||
      taskGoalBindingRow?.comment !== 'memoflow.task-goal-binding/v3' ||
      !taskGoalBindingDefinition.includes('EachCompletion') ||
      !taskGoalBindingDefinition.includes('PlanCompletion') ||
      taskGoalBindingDefinition.includes('PER_INSTANCE') ||
      taskGoalBindingDefinition.includes('ALL_INSTANCES_COMPLETED')
    ) {
      throw new Error('task_plans has no canonical v3 Goal-binding constraint after boot');
    }

    console.log(
      `[hard-7103-schema-boot] passed: fresh database booted through database:prisma-push; ${tables.rowCount} public tables; ${requiredTables.length} canonical tables + retired-table absence + pgvector + vNext uniqueness fences + Task Goal-binding v3 fence verified.`,
    );
  } finally {
    await db.end();
  }
} finally {
  if (created) {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [database],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  }
  await admin.end().catch(() => undefined);
}
