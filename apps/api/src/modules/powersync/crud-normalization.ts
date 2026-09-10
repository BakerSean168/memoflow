/**
 * PowerSync CRUD value normalization
 *
 * PowerSync clients send CRUD operations with string-encoded JSON and
 * string/number booleans. These helpers normalize values to their proper
 * Prisma-compatible types before upsert.
 * Residual 1091 keep-boundary: parseJsonLikeString only parses brace/bracket
 * JSON-looking strings and leaves other strings as-is; outer try/catch keeps
 * malformed JSON unchanged. Intentionally not utils parseJson/parseJsonSafe
 * (null/undefined + fallback) and not account PowerSync throw-on-invalid parseJson.
 * Soft residual 1095: data-portability parseJsonField keep-boundary (no force-merge).
 */

export const JSON_FIELDS_BY_TABLE: Record<string, ReadonlySet<string>> = {
  accounts: new Set(['profile']),
  user_preference_records: new Set(['payload']),
  goals: new Set(['tags']),
  repositories: new Set(['config', 'stats']),
  folders: new Set(['metadata']),
  resources: new Set(['metadata', 'stats']),
  editor_workspaces: new Set(['layout', 'setting']),
  editor_workspace_sessions: new Set(['layout']),
  editor_workspace_session_group_tabs: new Set(['view_state']),
  ai_knowledge_index_entries: new Set(['keywords', 'embedding', 'chunks', 'metadata']),
  dashboard_configs: new Set(['widget_config']),
};

export const BOOLEAN_FIELDS_BY_TABLE: Record<string, ReadonlySet<string>> = {
  task_templates: new Set(['reminder_config_enabled', 'is_blocked']),
  schedules: new Set(['has_conflict']),
  schedule_tasks: new Set(['enabled']),
  reminder_templates: new Set(['self_enabled']),
  reminder_groups: new Set(['enabled']),
  reminder_history: new Set(['notification_sent']),
  user_reminder_preferences: new Set(['global_reminder_enabled']),
  notifications: new Set(['is_read']),
  notification_preferences: new Set(['enabled']),
  notification_templates: new Set(['is_system', 'is_active']),
  ai_provider_configs: new Set(['is_active', 'is_default']),
  folders: new Set(['is_expanded']),
  editor_workspaces: new Set(['is_active']),
  editor_workspace_sessions: new Set(['is_active']),
  editor_workspace_session_group_tabs: new Set(['is_pinned', 'is_active']),
};

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

// Residual 1091 keep-boundary: JSON-looking strings only; non-JSON text stays string.
function parseJsonLikeString(value: string): unknown {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return JSON.parse(trimmed);
  }

  return value;
}

function normalizeBooleanLikeValue(value: unknown): unknown {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === '1' || trimmed === 'true') return true;
    if (trimmed === '0' || trimmed === 'false') return false;
  }

  return value;
}

function normalizeCrudValue(tableName: string, key: string, value: unknown): unknown {
  if (JSON_FIELDS_BY_TABLE[tableName]?.has(key) && typeof value === 'string') {
    try {
      return parseJsonLikeString(value);
    } catch {
      return value;
    }
  }

  if (BOOLEAN_FIELDS_BY_TABLE[tableName]?.has(key)) {
    return normalizeBooleanLikeValue(value);
  }

  return value;
}

export function normalizeCrudData(
  tableName: string,
  data: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!data) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      snakeToCamel(key),
      normalizeCrudValue(tableName, key, value),
    ]),
  );
}
