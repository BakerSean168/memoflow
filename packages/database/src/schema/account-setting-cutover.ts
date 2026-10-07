export interface AccountSettingCutoverClient {
  query(sql: string): Promise<unknown>;
}

export async function prepareAccountSettingCutover(
  client: AccountSettingCutoverClient,
): Promise<void> {
  // ADR-104/105/111 retire shadow identity/preferences, not surviving owner facts.
  // The production watcher owns the mandatory recovery backup before this step.
  await client.query('BEGIN');
  try {
    await client.query(`
      DO $$
      BEGIN
        IF to_regclass('public.accounts') IS NOT NULL THEN
          IF EXISTS (
            SELECT 1 FROM public.accounts WHERE status IS NULL OR status NOT IN (
              'Active', 'ACTIVE', 'Closed', 'CLOSED', 'Deactivated', 'DEACTIVATED',
              'Suspended', 'SUSPENDED', 'Inactive', 'INACTIVE', 'Deleted', 'DELETED'
            )
          ) THEN
            RAISE EXCEPTION 'unknown account lifecycle value; cutover refused';
          END IF;
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='accounts' AND column_name='deleted_at'
          ) THEN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='accounts' AND column_name='closed_at'
            ) THEN
              RAISE EXCEPTION 'ambiguous account closure columns; cutover refused';
            END IF;
            ALTER TABLE public.accounts RENAME COLUMN deleted_at TO closed_at;
          END IF;
          UPDATE public.accounts
          SET status = CASE WHEN status IN ('Active', 'ACTIVE') THEN 'Active' ELSE 'Closed' END;
          ALTER TABLE public.accounts ALTER COLUMN status SET DEFAULT 'Active';
          ALTER TABLE public.accounts
            DROP COLUMN IF EXISTS settings,
            DROP COLUMN IF EXISTS email_address,
            DROP COLUMN IF EXISTS email_is_verified,
            DROP COLUMN IF EXISTS email_verified_at,
            DROP COLUMN IF EXISTS email_is_primary,
            DROP COLUMN IF EXISTS phone_country_code,
            DROP COLUMN IF EXISTS phone_number,
            DROP COLUMN IF EXISTS phone_full_number,
            DROP COLUMN IF EXISTS phone_is_verified,
            DROP COLUMN IF EXISTS phone_verified_at,
            DROP COLUMN IF EXISTS version;
        END IF;
        IF to_regclass('public.cloud_auth_users') IS NOT NULL THEN
          ALTER TABLE public.cloud_auth_users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMP(3);
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='cloud_auth_users' AND column_name='status'
          ) THEN
            UPDATE public.cloud_auth_users
            SET disabled_at = COALESCE(disabled_at, updated_at)
            WHERE status IS DISTINCT FROM 'active';
            ALTER TABLE public.cloud_auth_users DROP COLUMN status;
          END IF;
          IF to_regclass('public.accounts') IS NOT NULL THEN
            UPDATE public.cloud_auth_users AS auth
            SET disabled_at = COALESCE(auth.disabled_at, auth.updated_at)
            WHERE EXISTS (SELECT 1 FROM public.accounts AS account WHERE account.id=auth.id AND account.status='Closed');
          END IF;
        END IF;
      END $$;
      DROP TABLE IF EXISTS public.user_settings;
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
