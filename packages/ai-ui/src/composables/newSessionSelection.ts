import { AIChatPermissionModeSchema } from '@memoflow/ai-contracts';
import type { AIChatPermissionMode, LocalAgentModelOptions } from '@memoflow/ai-contracts';

/**
 * New-conversation composer selection memory (issue #925).
 *
 * Two identity-scoped layers, both read only while a conversation still has no
 * selection:
 *  - sticky: the last Agent/model/thinking level/runtime permission the user
 *    chose. Every explicit composer selection writes it back.
 *  - new-session default: an explicit Settings choice. While it is enabled and
 *    still resolvable it wins over sticky; otherwise sticky applies.
 *
 * Neither layer mutates an existing conversation, the send-time validation or
 * the business permission cap (#861): an applied permission mode still goes
 * through `resolveCompatibleRuntimeMode`.
 */
export interface ComposerSessionSelection {
  /** `local_agent` is a native instance connection; `builtin` covers Mastra agents. */
  runtimeKind: 'local_agent' | 'builtin';
  /** Native Agent connection id (identity-bound). */
  connectionId?: string;
  /** Native model id. */
  modelId?: string;
  /** Mastra Agent instance id. */
  agentInstanceId?: string;
  /** Mastra composer model key (`agent:<instance>::<connection>::<model>`). */
  modelKey?: string;
  reasoningEffort?: string;
  serviceTier?: string;
  /** Per-model native options, keyed exactly like the composer's in-memory map. */
  nativeOptions?: Record<string, LocalAgentModelOptions>;
  permissionMode?: AIChatPermissionMode;
}

export interface NewSessionDefaultConfig {
  enabled: boolean;
  selection: ComposerSessionSelection | null;
}

/** `pending` means the directory cannot confirm the model yet; never a fallback. */
export type NewSessionAvailability = 'ready' | 'pending' | 'unavailable';
export type NewSessionSelectionSource = 'explicit' | 'sticky' | 'none';

export interface NewSessionSelectionInput {
  explicit: NewSessionDefaultConfig | null;
  sticky: ComposerSessionSelection | null;
  availability?: (selection: ComposerSessionSelection) => NewSessionAvailability;
}

export interface NewSessionSelectionResolution {
  selection: ComposerSessionSelection | null;
  source: NewSessionSelectionSource;
  /** An enabled explicit default exists but cannot be used, so sticky/empty applies. */
  explicitDefaultFallback: boolean;
}

const STICKY_SELECTION_STORAGE_PREFIX = 'ai:composer:sticky-selection:v1';
const NEW_SESSION_DEFAULT_STORAGE_PREFIX = 'ai:composer:new-session-default:v1';

function scopedStorageKey(prefix: string, identity: string): string {
  return `${prefix}:${encodeURIComponent(identity || 'default')}`;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function sanitizeNativeOptions(value: unknown): Record<string, LocalAgentModelOptions> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>).flatMap(([key, raw]) => {
    if (!key || !raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const record = raw as Record<string, unknown>;
    const options: LocalAgentModelOptions = {};
    const reasoningEffort = text(record.reasoningEffort);
    const serviceTier = text(record.serviceTier);
    if (reasoningEffort) options.reasoningEffort = reasoningEffort;
    if (serviceTier) options.serviceTier = serviceTier;
    return Object.keys(options).length ? [[key, options] as const] : [];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/** Persisted values are untrusted: keep only fields the composer can consume. */
export function sanitizeComposerSelection(value: unknown): ComposerSessionSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const runtimeKind =
    record.runtimeKind === 'local_agent'
      ? 'local_agent'
      : record.runtimeKind === 'builtin'
        ? 'builtin'
        : null;
  if (!runtimeKind) return null;
  const selection: ComposerSessionSelection = { runtimeKind };
  if (runtimeKind === 'local_agent') {
    const connectionId = text(record.connectionId);
    const modelId = text(record.modelId);
    if (!connectionId || !modelId) return null;
    selection.connectionId = connectionId;
    selection.modelId = modelId;
  } else {
    const agentInstanceId = text(record.agentInstanceId);
    const modelKey = text(record.modelKey);
    if (agentInstanceId) selection.agentInstanceId = agentInstanceId;
    if (modelKey) selection.modelKey = modelKey;
  }
  const reasoningEffort = text(record.reasoningEffort);
  const serviceTier = text(record.serviceTier);
  if (reasoningEffort) selection.reasoningEffort = reasoningEffort;
  if (serviceTier) selection.serviceTier = serviceTier;
  const permission = AIChatPermissionModeSchema.safeParse(record.permissionMode);
  if (permission.success) selection.permissionMode = permission.data;
  const nativeOptions = sanitizeNativeOptions(record.nativeOptions);
  if (nativeOptions) selection.nativeOptions = nativeOptions;
  return selection;
}

export function readStickySelection(identity: string): ComposerSessionSelection | null {
  try {
    const raw = localStorage.getItem(scopedStorageKey(STICKY_SELECTION_STORAGE_PREFIX, identity));
    if (!raw) return null;
    return sanitizeComposerSelection(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeStickySelection(
  selection: ComposerSessionSelection,
  identity: string,
): ComposerSessionSelection {
  try {
    localStorage.setItem(
      scopedStorageKey(STICKY_SELECTION_STORAGE_PREFIX, identity),
      JSON.stringify(selection),
    );
  } catch {
    /* Storage restrictions only lose the memory; the current session keeps working. */
  }
  return selection;
}

export function readNewSessionDefault(identity: string): NewSessionDefaultConfig {
  try {
    const raw = localStorage.getItem(
      scopedStorageKey(NEW_SESSION_DEFAULT_STORAGE_PREFIX, identity),
    );
    if (!raw) return { enabled: false, selection: null };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return { enabled: false, selection: null };
    const record = parsed as Record<string, unknown>;
    const selection = sanitizeComposerSelection(record.selection);
    return { enabled: record.enabled === true && selection !== null, selection };
  } catch {
    return { enabled: false, selection: null };
  }
}

export function writeNewSessionDefault(config: NewSessionDefaultConfig, identity: string): void {
  try {
    const selection = config.selection ? sanitizeComposerSelection(config.selection) : null;
    localStorage.setItem(
      scopedStorageKey(NEW_SESSION_DEFAULT_STORAGE_PREFIX, identity),
      JSON.stringify({ enabled: selection ? config.enabled : false, selection }),
    );
  } catch {
    /* Storage restrictions only lose the default; the composer keeps its own state. */
  }
}

/**
 * Explicit default > sticky > untouched composer. An unavailable explicit
 * default never silently becomes another instance: it falls back to sticky and
 * reports the fallback so the caller can surface one notice.
 */
export function resolveNewSessionSelection(
  input: NewSessionSelectionInput,
): NewSessionSelectionResolution {
  const availability = input.availability ?? (() => 'ready');
  const explicit = input.explicit?.enabled ? input.explicit.selection : null;
  if (explicit) {
    if (availability(explicit) !== 'unavailable')
      return { selection: explicit, source: 'explicit', explicitDefaultFallback: false };
    if (input.sticky)
      return { selection: input.sticky, source: 'sticky', explicitDefaultFallback: true };
    return { selection: null, source: 'none', explicitDefaultFallback: true };
  }
  if (input.sticky)
    return { selection: input.sticky, source: 'sticky', explicitDefaultFallback: false };
  return { selection: null, source: 'none', explicitDefaultFallback: false };
}

/** Native options to seed for an applied selection, in the composer's key shape. */
export function nativeOptionsForSelection(
  selection: ComposerSessionSelection,
): { key: string; options: LocalAgentModelOptions } | null {
  if (selection.runtimeKind !== 'local_agent' || !selection.connectionId || !selection.modelId)
    return null;
  const key = `${selection.connectionId}::${selection.modelId}`;
  const options: LocalAgentModelOptions = {};
  const fromMap = selection.nativeOptions?.[key];
  const reasoningEffort = fromMap?.reasoningEffort ?? selection.reasoningEffort;
  const serviceTier = fromMap?.serviceTier ?? selection.serviceTier;
  if (reasoningEffort) options.reasoningEffort = reasoningEffort;
  if (serviceTier) options.serviceTier = serviceTier;
  return Object.keys(options).length ? { key, options } : null;
}
