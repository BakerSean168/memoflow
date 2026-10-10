/** Public failures contain no provider stderr, credentials, configuration or raw protocol data. */
export const LOCAL_AGENT_FAILURES = {
  NOT_FOUND: 'Local Agent connection or conversation was not found.',
  CONFLICT: 'This local Agent resource changed or already has an active turn.',
  LOCAL_AGENT_NOT_INSTALLED: 'The configured Agent executable could not be started.',
  LOCAL_AGENT_LOGIN_REQUIRED: 'Sign in using the Agent’s native login command, then refresh.',
  LOCAL_AGENT_UNAVAILABLE: 'The local Agent is unavailable. Check its native configuration.',
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
} as const;
export type LocalAgentFailureCode = keyof typeof LOCAL_AGENT_FAILURES;
export class LocalAgentError extends Error {
  constructor(readonly code: LocalAgentFailureCode) {
    super(LOCAL_AGENT_FAILURES[code]);
    this.name = 'LocalAgentError';
  }
}
