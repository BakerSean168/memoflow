import { expect, it } from 'vitest';
import { nativeFailure } from './native-failure';

it.each([
  ['refresh_token_reused: do not disclose native diagnostic', 'LOCAL_AGENT_LOGIN_REQUIRED'],
  ['authentication_failed', 'LOCAL_AGENT_LOGIN_REQUIRED'],
  ['401 Unauthorized: secret', 'LOCAL_AGENT_LOGIN_REQUIRED'],
  ['unknown provider for model selected', 'LOCAL_AGENT_MODEL_UNSUPPORTED'],
  ['model_not_found', 'LOCAL_AGENT_MODEL_UNSUPPORTED'],
  ['Claude Code executable not found at private-path', 'LOCAL_AGENT_NOT_INSTALLED'],
  ['Thread native-id not found', 'LOCAL_AGENT_SESSION_UNAVAILABLE'],
  ['native server error with private configuration', 'LOCAL_AGENT_UNAVAILABLE'],
])('maps a native error to a bounded public category (%s)', (diagnostic, code) => {
  const failure = nativeFailure(diagnostic);
  expect(failure.code).toBe(code);
  expect(failure.message).not.toContain(diagnostic);
});
