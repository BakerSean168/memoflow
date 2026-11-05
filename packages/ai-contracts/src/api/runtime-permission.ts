import { z } from 'zod';

/** Session machine permissions; never a MemoFlow business permission preset. */
export const AIChatPermissionModeSchema = z.enum([
  'approval-required',
  'auto-accept-edits',
  'auto',
  'full-access',
]);
export type AIChatPermissionMode = z.infer<typeof AIChatPermissionModeSchema>;

/** Capabilities of the adapters, not inferred from a model's display name. */
export const AGENT_SUPPORTED_RUNTIME_MODES = {
  codex: ['approval-required', 'auto-accept-edits', 'auto', 'full-access'],
  claude: ['approval-required', 'auto-accept-edits', 'full-access'],
  pi: ['approval-required', 'auto-accept-edits', 'full-access'],
  // ACP exposes permission callbacks, but no dependable routine-action classifier.
  dsh: ['approval-required', 'full-access'],
  antigravity: ['approval-required', 'full-access'],
  // Mastra currently exposes business tools only, no machine execution tools.
  mastra: ['approval-required'],
} as const satisfies Record<string, readonly AIChatPermissionMode[]>;

export function resolveCompatibleRuntimeMode(
  mode: AIChatPermissionMode,
  supported: readonly AIChatPermissionMode[] = AIChatPermissionModeSchema.options,
): AIChatPermissionMode {
  return supported.includes(mode) ? mode : (supported[0] ?? 'approval-required');
}
