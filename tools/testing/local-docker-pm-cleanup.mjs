export const DEFAULT_PM_CLEANUP_PREFIX = 'pm-phase-';

export function normalizeCleanupPrefix(value = DEFAULT_PM_CLEANUP_PREFIX) {
  const prefix = String(value).trim().toLowerCase();
  if (!/^pm-[a-z0-9-]+-$/u.test(prefix)) {
    throw new Error(
      'Cleanup prefix must use the fixed PM form "pm-<scope>-" with lowercase letters, digits, and hyphens only.',
    );
  }
  return prefix;
}

export function buildCleanupPreviewSql(prefix) {
  const normalized = normalizeCleanupPrefix(prefix);
  return [
    'SELECT id, email, created_at',
    'FROM cloud_auth_users',
    `WHERE email LIKE '${normalized}%@test.com'`,
    'ORDER BY created_at;',
  ].join('\n');
}

export function buildCleanupSql(prefix) {
  const normalized = normalizeCleanupPrefix(prefix);
  return [
    'BEGIN;',
    'CREATE TEMP TABLE pm_cleanup_ids ON COMMIT DROP AS',
    'SELECT id FROM cloud_auth_users',
    `WHERE email LIKE '${normalized}%@test.com';`,
    '',
    'CREATE TEMP TABLE pm_cleanup_identity_tables ON COMMIT DROP AS',
    'SELECT DISTINCT table_name',
    'FROM information_schema.columns',
    "WHERE table_schema = 'public'",
    "  AND column_name = 'identity_id';",
    '',
    'DO $pm_cleanup$',
    'DECLARE',
    '  candidate record;',
    '  deleted_tables integer;',
    '  blocked_tables text;',
    'BEGIN',
    '  LOOP',
    '    deleted_tables := 0;',
    '    FOR candidate IN',
    '      SELECT table_name FROM pm_cleanup_identity_tables ORDER BY table_name',
    '    LOOP',
    '      BEGIN',
    "        EXECUTE format('DELETE FROM public.%I WHERE identity_id IN (SELECT id FROM pm_cleanup_ids)', candidate.table_name);",
    '        DELETE FROM pm_cleanup_identity_tables pending',
    '        WHERE pending.table_name = candidate.table_name;',
    '        deleted_tables := deleted_tables + 1;',
    '      EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN',
    '        NULL;',
    '      END;',
    '    END LOOP;',
    '',
    '    EXIT WHEN NOT EXISTS (SELECT 1 FROM pm_cleanup_identity_tables);',
    '    IF deleted_tables = 0 THEN',
    "      SELECT string_agg(table_name, ', ' ORDER BY table_name)",
    '      INTO blocked_tables',
    '      FROM pm_cleanup_identity_tables;',
    "      RAISE EXCEPTION 'PM cleanup could not resolve dependent identity tables: %', blocked_tables;",
    '    END IF;',
    '  END LOOP;',
    'END',
    '$pm_cleanup$;',
    '',
    'DELETE FROM cloud_auth_users',
    'WHERE id IN (SELECT id FROM pm_cleanup_ids);',
    '',
    'COMMIT;',
  ].join('\n');
}

export function buildCleanupExecArgs(sql) {
  return [
    'exec',
    '-T',
    'postgres',
    'sh',
    '-c',
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"',
    'pm-cleanup',
    sql,
  ];
}
