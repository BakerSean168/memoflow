import { LocalAgentError } from '../../shared/local-agent-error';

/** Use native diagnostics only for classification; never expose or persist their text. */
export function nativeFailure(diagnostic: unknown): LocalAgentError {
  const value = typeof diagnostic === 'string' ? diagnostic.slice(0, 16_384) : '';
  if (/executable not found|native binary not found|spawn.*ENOENT/i.test(value))
    return new LocalAgentError('LOCAL_AGENT_NOT_INSTALLED');
  if (/(?:thread|session|conversation).*not found|no conversation found/i.test(value))
    return new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
  if (
    /refresh_token_reused|authentication_failed|authentication required|not authenticated|sign.?in required|invalid_api_key|\b401\b|unauthorized/i.test(
      value,
    )
  )
    return new LocalAgentError('LOCAL_AGENT_LOGIN_REQUIRED');
  if (
    /model_not_found|unknown provider for model|unknown model|model.*(?:not supported|not available|does not exist)/i.test(
      value,
    )
  )
    return new LocalAgentError('LOCAL_AGENT_MODEL_UNSUPPORTED');
  if (
    /insufficient[_ -]?quota|quota[_ -]?(?:exhausted|exceeded|reached)|credits?[_ -]?(?:exhausted|depleted)/i.test(
      value,
    )
  )
    return new LocalAgentError('LOCAL_AGENT_QUOTA_EXHAUSTED');
  if (
    /\b429\b|rate[_ -]?limit(?:[_ -]?(?:ed|ing|exceeded|reached))?|too many requests|requests per minute exceeded/i.test(
      value,
    )
  )
    return new LocalAgentError('LOCAL_AGENT_RATE_LIMITED');
  return new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
}

/** Explicit Antigravity login only: distinguish a declined Google consent from a
 * transient failure without exposing the diagnostic. */
export function antigravityLoginFailure(diagnostic: unknown): LocalAgentError {
  const value = typeof diagnostic === 'string' ? diagnostic.slice(0, 16_384) : '';
  if (
    /access_denied|denied access|user (?:denied|cancelled|canceled)|cancelled by user/i.test(value)
  )
    return new LocalAgentError('LOCAL_AGENT_LOGIN_DENIED');
  return nativeFailure(value);
}
