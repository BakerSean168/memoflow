import { LocalAgentError } from '../../shared/local-agent-error';

/** Use native diagnostics only for classification; never expose or persist their text. */
export function nativeFailure(diagnostic: unknown): LocalAgentError {
  const value = typeof diagnostic === 'string' ? diagnostic.slice(0, 16_384) : '';
  if (/executable not found|native binary not found|spawn.*ENOENT/i.test(value))
    return new LocalAgentError('LOCAL_AGENT_NOT_INSTALLED');
  if (/(?:thread|session|conversation).*not found|no conversation found/i.test(value))
    return new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
  if (
    /refresh_token_reused|authentication_failed|invalid_api_key|\b401\b|unauthorized/i.test(value)
  )
    return new LocalAgentError('LOCAL_AGENT_LOGIN_REQUIRED');
  if (
    /model_not_found|unknown provider for model|unknown model|model.*(?:not supported|not available|does not exist)/i.test(
      value,
    )
  )
    return new LocalAgentError('LOCAL_AGENT_MODEL_UNSUPPORTED');
  return new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
}
