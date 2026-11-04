import { isRecord } from '@memoflow/utils/shared';

export interface NotificationPreferenceSchemaQueryClient {
  query(
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
}

export interface NotificationPreferenceHierarchyReport {
  tablePresent: boolean;
  legacyColumns: string[];
  rowsScanned: number;
  rowsMigrated: number;
}

const LEGACY_MODULES = ['task', 'goal', 'schedule', 'reminder', 'account', 'system'] as const;

const LEGACY_CHANNELS = [
  ['inApp', 'InApp'],
  ['email', 'Email'],
  ['push', 'Push'],
  ['sms', 'Sms'],
] as const;

const ALL_VNEXT_CHANNELS = ['InApp', 'Email', 'Push', 'Desktop', 'Sms', 'Webhook'] as const;

type JsonRecord = Record<string, unknown>;
type ChannelPreferences = Record<string, boolean>;
type WorkflowOverrides = Record<string, ChannelPreferences>;

function parseRecord(value: unknown): JsonRecord {
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isEmptyRecordJson(value: unknown): boolean {
  return Object.keys(parseRecord(value)).length === 0;
}

function mapLegacyChannelFlags(
  category: unknown,
  globalFallback: JsonRecord,
  enabled: boolean,
): ChannelPreferences {
  const categoryRecord = isRecord(category) ? category : null;
  const migrated: ChannelPreferences = {};

  for (const [legacyKey, vnextKey] of LEGACY_CHANNELS) {
    const categoryValue = categoryRecord?.[legacyKey];
    const fallbackValue = globalFallback[legacyKey];
    migrated[vnextKey] =
      enabled && categoryRecord !== null
        ? typeof categoryValue === 'boolean'
          ? categoryValue
          : typeof fallbackValue === 'boolean'
            ? fallbackValue
            : false
        : false;
  }

  return migrated;
}

/**
 * Converts the legacy notification preference storage into the vNext hierarchy.
 *
 * Important semantic detail: the legacy `channels` column was an OR-derived
 * persistence summary, not a user-owned global preference. For enabled users we
 * therefore preserve effective per-module behavior as `<module>.general`
 * workflow overrides and leave vNext global preferences empty. The legacy
 * master `enabled=false` switch is the only case promoted to a global vNext
 * disable, because otherwise newly introduced channels/workflows could wake up.
 */
export function migrateLegacyNotificationPreference(input: {
  enabled: unknown;
  channels: unknown;
  categories: unknown;
}): { globalChannels: ChannelPreferences; workflowOverrides: WorkflowOverrides } {
  const enabled = input.enabled !== false;
  const globalFallback = parseRecord(input.channels);

  if (!enabled) {
    return {
      globalChannels: Object.fromEntries(ALL_VNEXT_CHANNELS.map((channel) => [channel, false])),
      workflowOverrides: {},
    };
  }

  const categories = parseRecord(input.categories);
  const workflowOverrides: WorkflowOverrides = {};
  for (const moduleName of LEGACY_MODULES) {
    workflowOverrides[`${moduleName}.general`] = mapLegacyChannelFlags(
      categories[moduleName],
      globalFallback,
      true,
    );
  }

  return { globalChannels: {}, workflowOverrides };
}

/**
 * Idempotent pre-step for migration-less Prisma `db push` deployments.
 * It adds the vNext columns with safe defaults and copies legacy behavior before
 * Prisma is allowed to retire `enabled/channels/categories`.
 */
export async function prepareNotificationPreferenceHierarchy(
  client: NotificationPreferenceSchemaQueryClient,
): Promise<NotificationPreferenceHierarchyReport> {
  const tableResult = await client.query(
    `SELECT to_regclass('public.notification_preferences') AS regclass`,
  );
  if (!tableResult.rows[0]?.regclass) {
    return { tablePresent: false, legacyColumns: [], rowsScanned: 0, rowsMigrated: 0 };
  }

  const columnsResult = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notification_preferences'
  `);
  const columns = new Set(columnsResult.rows.map((row) => String(row.column_name)));
  const legacyColumns = ['enabled', 'channels', 'categories'].filter((column) =>
    columns.has(column),
  );

  await client.query('BEGIN');
  try {
    await client.query(`
      ALTER TABLE notification_preferences
        ADD COLUMN IF NOT EXISTS global_channels TEXT NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS workflow_overrides TEXT NOT NULL DEFAULT '{}'
    `);

    if (legacyColumns.length === 0) {
      await client.query('COMMIT');
      return { tablePresent: true, legacyColumns, rowsScanned: 0, rowsMigrated: 0 };
    }

    const enabledExpression = columns.has('enabled') ? 'enabled' : 'TRUE AS enabled';
    const channelsExpression = columns.has('channels') ? 'channels' : `'{}'::text AS channels`;
    const categoriesExpression = columns.has('categories')
      ? 'categories'
      : `'{}'::text AS categories`;
    const rowsResult = await client.query(`
      SELECT id,
             ${enabledExpression},
             ${channelsExpression},
             ${categoriesExpression},
             global_channels,
             workflow_overrides
      FROM notification_preferences
      FOR UPDATE
    `);

    let rowsMigrated = 0;
    for (const row of rowsResult.rows) {
      const alreadyMigrated =
        !isEmptyRecordJson(row.global_channels) || !isEmptyRecordJson(row.workflow_overrides);
      if (alreadyMigrated) continue;

      const migrated = migrateLegacyNotificationPreference({
        enabled: row.enabled,
        channels: row.channels,
        categories: row.categories,
      });
      await client.query(
        `UPDATE notification_preferences
         SET global_channels = $1, workflow_overrides = $2
         WHERE id = $3`,
        [
          JSON.stringify(migrated.globalChannels),
          JSON.stringify(migrated.workflowOverrides),
          row.id,
        ],
      );
      rowsMigrated += 1;
    }

    await client.query('COMMIT');
    return {
      tablePresent: true,
      legacyColumns,
      rowsScanned: rowsResult.rows.length,
      rowsMigrated,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
