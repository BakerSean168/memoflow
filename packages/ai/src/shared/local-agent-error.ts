import type { LocalAgentDriver } from '@memoflow/ai-contracts';

/** Public failures contain no provider stderr, credentials, configuration or raw protocol data. */
export const LOCAL_AGENT_FAILURES = {
  NOT_FOUND: 'Local Agent connection or conversation was not found.',
  CONFLICT: 'This local Agent resource changed or already has an active turn.',
  LOCAL_AGENT_NOT_INSTALLED: 'The configured Agent executable could not be started.',
  LOCAL_AGENT_LOGIN_REQUIRED: 'Sign in using the Agent’s native login command, then refresh.',
  LOCAL_AGENT_LOGIN_DENIED: 'The provider account did not approve the sign-in request.',
  LOCAL_AGENT_UNAVAILABLE: 'The local Agent is unavailable. Check its native configuration.',
  LOCAL_AGENT_RATE_LIMITED:
    'The Agent provider is rate limiting requests. Try again later or choose another model.',
  LOCAL_AGENT_QUOTA_EXHAUSTED:
    'The Agent provider has insufficient quota. Switch provider or retry after the quota resets.',
  LOCAL_AGENT_MODEL_UNSUPPORTED: 'The selected model is not available from this Agent.',
  LOCAL_AGENT_SESSION_UNAVAILABLE:
    'The native session cannot be resumed with this connection. Start a new conversation.',
  LOCAL_AGENT_REQUEST_EXPIRED: 'This Agent request is no longer active.',
  LOCAL_AGENT_UNSUPPORTED_INPUT:
    'This local Agent connection currently supports text and MemoFlow references. Remove attachments to continue.',
  LOCAL_AGENT_PROTOCOL_ERROR:
    'The local Agent returned an unsupported or invalid protocol message.',
  LOCAL_AGENT_PERMISSION_DENIED: 'This local Agent operation is not authorized.',
  LOCAL_AGENT_RESULT_UNCERTAIN:
    'The operation outcome is uncertain. Check its saved receipt before retrying.',
  LOCAL_AGENT_TOOLS_UNAVAILABLE:
    'MemoFlow business tools are unavailable on this local Agent session. The model can chat, but Goal panel tools could not be connected.',
} as const;
export type LocalAgentFailureCode = keyof typeof LOCAL_AGENT_FAILURES;
export function localAgentFailureMessage(
  code: LocalAgentFailureCode,
  driver?: LocalAgentDriver,
): string {
  return code === 'LOCAL_AGENT_LOGIN_REQUIRED' && driver === 'antigravity'
    ? 'Google sign-in is required. Open Settings → AI → Providers → Antigravity and select “Sign in with Google”.'
    : LOCAL_AGENT_FAILURES[code];
}

export class LocalAgentError extends Error {
  constructor(
    readonly code: LocalAgentFailureCode,
    readonly driver?: LocalAgentDriver,
  ) {
    super(localAgentFailureMessage(code, driver));
    this.name = 'LocalAgentError';
  }
}
