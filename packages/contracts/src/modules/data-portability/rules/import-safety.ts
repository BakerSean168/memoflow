/**
 * Import Safety — banned-key detection and envelope parsing
 *
 * These helpers prevent database IDs, identity fields, credentials, and
 * other sensitive data from leaking into portable import files.
 */

import type { UserDataExportEnvelopeV2 } from '../dtos/portable-envelope.dto';
import { UserDataExportEnvelopeV2Schema } from '../dtos/portable-envelope.dto';
import type { PortableBackupEnvelopeV3 } from '../dtos/portable-v3.dto';
import { PortableBackupEnvelopeV3Schema } from '../dtos/portable-v3.dto';

// ============ Banned Key Detection ============

export const BANNED_IMPORT_FIELD_NAMES = new Set([
  'id',
  'identityid',
  'identity_id',
  'accountid',
  'account_id',
  'operatorid',
  'operator_id',
  'userid',
  'user_id',
  'createdby',
  'created_by',
  'updatedby',
  'updated_by',
  'deletedat',
  'deleted_at',
  'apikeyencrypted',
  'auth',
  'authorization',
]);

export const BANNED_IMPORT_KEY_PATTERN =
  /(token|password|secret|apiKey|api_key|sshKey|privateKey|credential|accessToken|refreshToken|sessionToken)/i;

export function isBannedPortableDataKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (BANNED_IMPORT_FIELD_NAMES.has(normalized)) return true;
  if (/^[A-Za-z][A-Za-z0-9]*Id$/.test(key)) return true;
  if (/(^|_)id$/i.test(key)) return true;
  return BANNED_IMPORT_KEY_PATTERN.test(key);
}

export function findBannedImportKey(value: unknown, path: string[] = []): string | null {
  if (value === null || value === undefined || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findBannedImportKey(value[i], [...path, String(i)]);
      if (found) return found;
    }
    return null;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const currentPath = [...path, key];
    if (isBannedPortableDataKey(key)) return currentPath.join('.');

    const found = findBannedImportKey(child, currentPath);
    if (found) return found;
  }

  return null;
}

// ============ Typed Envelope Parser ============

export type ParseUserDataExportEnvelopeResult =
  | { ok: true; envelope: UserDataExportEnvelopeV2 }
  | { ok: false; error: string };

/**
 * Parse and validate a raw object as a UserDataExportEnvelopeV2.
 *
 * Unlike the old `validateEnvelope` which returned `{ ok, data: Record<string, unknown> }`
 * and required a downstream cast, this returns a fully typed envelope on success.
 */
export function parseUserDataExportEnvelope(raw: unknown): ParseUserDataExportEnvelopeResult {
  // Server-held disclosure is a distinct, non-importable product envelope (residual 106).
  // Fail closed with an explicit message before generic schema diagnostics.
  if (
    raw !== null &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
  // Residual 885: server-held disclosure envelopes remain not-importable (portable user-data-export only).
    (raw as { kind?: unknown }).kind === 'memoflow.server-held-data-disclosure'
  ) {
    return {
      ok: false,
      error:
        'Server-held data disclosure is not importable. Export/import only memoflow.user-data-export business backups.',
    };
  }

  const result = UserDataExportEnvelopeV2Schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      ok: false,
      error: `Envelope validation failed: ${issue.path.join('.')} — ${issue.message}`,
    };
  }

  const bannedPath = findBannedImportKey(result.data.data);
  if (bannedPath) {
    return {
      ok: false,
      error: `Envelope validation failed: data.${bannedPath} — banned import field`,
    };
  }

  return { ok: true, envelope: result.data };
}


export type ParsePortableBackupEnvelopeV3Result =
  | { ok: true; envelope: PortableBackupEnvelopeV3 }
  | { ok: false; error: string };

/**
 * Parse the canonical owner-driven V3 backup envelope.
 *
 * Capability payloads are constrained to JSON at the envelope boundary and
 * must be parsed again by the owner capability schema before dry-run/apply.
 */
export function parsePortableBackupEnvelopeV3(raw: unknown): ParsePortableBackupEnvelopeV3Result {
  if (
    raw !== null &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    (raw as { kind?: unknown }).kind === 'memoflow.server-held-data-disclosure'
  ) {
    return {
      ok: false,
      error:
        'Server-held data disclosure is not importable. Export/import only memoflow.user-data-export business backups.',
    };
  }

  const result = PortableBackupEnvelopeV3Schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      ok: false,
      error: `Envelope validation failed: ${issue.path.join('.')} — ${issue.message}`,
    };
  }

  for (const [index, capability] of result.data.capabilities.entries()) {
    const bannedPath = findBannedImportKey(capability.payload);
    if (bannedPath) {
      return {
        ok: false,
        error: `Envelope validation failed: capabilities.${index}.payload.${bannedPath} — banned import field`,
      };
    }
  }

  return { ok: true, envelope: result.data };
}
