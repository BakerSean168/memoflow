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

/**
 * Mirrors the Account nickname invariant (2-20 chars) and the createDefault
 * fallback. The API must enforce it before a raw PowerSync upload reaches
 * Prisma, because this path bypasses the domain repository.
 */
const ACCOUNT_NICKNAME_MIN_LENGTH = 2;
const ACCOUNT_NICKNAME_MAX_LENGTH = 20;
const DEFAULT_ACCOUNT_NICKNAME = 'User';

function normalizeAccountNickname(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_ACCOUNT_NICKNAME;
  if (value.length > ACCOUNT_NICKNAME_MAX_LENGTH) {
    return value.slice(0, ACCOUNT_NICKNAME_MAX_LENGTH);
  }
  if (value.length < ACCOUNT_NICKNAME_MIN_LENGTH) return DEFAULT_ACCOUNT_NICKNAME;
  return value;
}

export const JSON_FIELDS_BY_TABLE: Record<string, ReadonlySet<string>> = {
  accounts: new Set(['profile']),
  user_preference_records: new Set(['payload']),
  goals: new Set(['tags']),
  ai_knowledge_index_entries: new Set(['keywords', 'embedding', 'chunks', 'metadata']),
};

export const BOOLEAN_FIELDS_BY_TABLE: Record<string, ReadonlySet<string>> = {
  routine_definitions: new Set(['enabled']),
  routine_preferences: new Set(['global_enabled']),
  routine_profiles: new Set(['enabled']),
  routine_profile_memberships: new Set(['enabled']),
  notifications: new Set(['is_read']),
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

/**
 * Server-side write fence for `accounts.profile` uploads.
 *
 * A PowerSync upload bypasses the domain repository, so a client row created by
 * an older build (or any malformed payload) could persist `nickname: null` and
 * make every later domain read throw. Coerce the invariant at this boundary
 * instead of trusting the client; valid values pass through unchanged.
 */
function normalizeAccountProfile(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { nickname: DEFAULT_ACCOUNT_NICKNAME };
  }
  const profile = value as Record<string, unknown>;
  return { ...profile, nickname: normalizeAccountNickname(profile.nickname) };
}

function normalizeCrudValue(tableName: string, key: string, value: unknown): unknown {
  let normalized = value;

  if (JSON_FIELDS_BY_TABLE[tableName]?.has(key) && typeof value === 'string') {
    try {
      normalized = parseJsonLikeString(value);
    } catch {
      // Malformed JSON stays untouched for every other table; the account
      // profile branch below still coerces it into a usable object.
    }
  }

  if (tableName === 'accounts' && key === 'profile') {
    return normalizeAccountProfile(normalized);
  }

  if (BOOLEAN_FIELDS_BY_TABLE[tableName]?.has(key)) {
    return normalizeBooleanLikeValue(normalized);
  }

  return normalized;
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
