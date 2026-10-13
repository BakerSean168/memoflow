import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

/**
 * E2E-only Goal surface lease database mirror.
 *
 * The goal-workflow host mocks AI workflow snapshots, so the UI's lease claims
 * cannot come from the real lease endpoint: claim fails closed ('lost') for
 * runs that do not exist in the canonical workflow store. The mocked lease
 * route therefore keeps the real claim/renew/release contract for the client,
 * and this helper mirrors every decision into the same PostgreSQL rows that
 * the API's transaction-scoped `assertNativeAiLease` fence reads. The native
 * Goal create still proves real custody against the real database; nothing
 * bypasses the fence or the fail-closed form custody checks.
 *
 * Row semantics mirror AiGoalSurfaceLeasePrismaRepository exactly: claim is a
 * fenced upsert (keep row after release so fence generations never roll
 * back), renew extends expiry under the current token+fence, release drops
 * ownership but keeps the row.
 */
export interface GoalLeaseMirrorGrant {
  runId: string;
  token: string;
  fence: number;
  expiresAt: number;
}

export interface GoalLeaseDbMirror {
  claim(grant: GoalLeaseMirrorGrant): Promise<void>;
  renew(grant: GoalLeaseMirrorGrant): Promise<void>;
  release(input: { runId: string; token: string; fence: number; now: number }): Promise<void>;
}

async function withMirrorClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  // Resolve the database exactly like the E2E API server does via
  // ensureTestDatabase(): TEST_DATABASE_URL with the shared test-container
  // default. Never trust a generic DATABASE_URL here — a developer's
  // .env.local could point the mirror at a different database than the one
  // the API reads, and the fence would silently never see the rows.
  const databaseUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://test_user:test_pass@127.0.0.1:5433/memoflow_test';
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // Match the API's UTC timestamp(3) wall-clock storage so the fence's
    // clock_timestamp() comparison sees the same instant the UI was granted.
    await client.query("SET TIME ZONE 'UTC'");
    return await work(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Resolve the registered identity for the E2E account. Account.id is the
 * identity the API derives from the JWT, and for cloud accounts it is the
 * same id as cloud_auth_users.
 */
export async function createGoalLeaseDbMirror(input: {
  email: string;
}): Promise<GoalLeaseDbMirror> {
  const identityId = await withMirrorClient(async (client) => {
    const result = await client.query<{ id: string }>(
      'SELECT id FROM cloud_auth_users WHERE email = $1 LIMIT 1',
      [input.email],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(`Goal lease mirror found no registered identity for ${input.email}`);
    }
    return row.id;
  });

  const ownership = (grant: { runId: string; token: string; fence: number }) => [
    identityId,
    grant.runId,
    grant.token,
    grant.fence,
  ];

  return {
    async claim(grant) {
      await withMirrorClient(async (client) => {
        await client.query(
          `INSERT INTO ai_goal_surface_leases
             (id, identity_id, run_id, owner_token, fence, expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, now(), now())
           ON CONFLICT (identity_id, run_id) DO UPDATE
             SET owner_token = EXCLUDED.owner_token,
                 fence = EXCLUDED.fence,
                 expires_at = EXCLUDED.expires_at,
                 updated_at = now()`,
          [randomUUID(), ...ownership(grant), new Date(grant.expiresAt)],
        );
      });
    },
    async renew(grant) {
      await withMirrorClient(async (client) => {
        await client.query(
          `UPDATE ai_goal_surface_leases
             SET expires_at = $5, updated_at = now()
           WHERE identity_id = $1 AND run_id = $2 AND owner_token = $3 AND fence = $4`,
          [...ownership(grant), new Date(grant.expiresAt)],
        );
      });
    },
    async release({ runId, token, fence, now }) {
      await withMirrorClient(async (client) => {
        await client.query(
          `UPDATE ai_goal_surface_leases
             SET owner_token = NULL, expires_at = $5, updated_at = now()
           WHERE identity_id = $1 AND run_id = $2 AND owner_token = $3 AND fence = $4`,
          [identityId, runId, token, fence, new Date(now)],
        );
      });
    },
  };
}
