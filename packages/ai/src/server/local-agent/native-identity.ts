import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { LocalAgentDriver } from '@memoflow/contracts/ai';
import { LocalAgentError } from '../../shared/local-agent-error';

const record = z.record(z.string(), z.unknown());
const files: Record<LocalAgentDriver, readonly string[]> = {
  codex: ['config.toml', 'auth.json'],
  claude: ['settings.json', '.credentials.json'],
  pi: ['models.json', 'auth.json'],
};
async function boundedRead(path: string): Promise<string | null> {
  try {
    const file = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(1_048_577);
      let bytesRead = 0;
      while (bytesRead < buffer.length) {
        const result = await file.read(buffer, bytesRead, buffer.length - bytesRead);
        if (result.bytesRead === 0) break;
        bytesRead += result.bytesRead;
      }
      if (bytesRead > 1_048_576) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await file.close();
    }
  } catch (error) {
    if (z.object({ code: z.literal('ENOENT') }).safeParse(error).success) return null;
    throw error;
  }
}
function authenticationIdentity(driver: LocalAgentDriver, text: string, account: unknown) {
  let value: Record<string, unknown>;
  try {
    value = record.parse(JSON.parse(text));
  } catch {
    throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
  }
  if (driver === 'codex') {
    const tokens = record.safeParse(value.tokens).data;
    if (typeof tokens?.account_id === 'string') {
      value.tokens = { account_id: tokens.account_id };
      delete value.last_refresh;
    }
  } else if (
    driver === 'claude' &&
    z.object({ email: z.string().min(1) }).safeParse(account).success
  ) {
    const oauth = record.safeParse(value.claudeAiOauth).data;
    if (oauth) {
      const {
        accessToken: _access,
        refreshToken: _refresh,
        expiresAt: _expiry,
        ...identity
      } = oauth;
      value.claudeAiOauth = identity;
    }
  } else if (driver === 'pi') {
    for (const [provider, credential] of Object.entries(value)) {
      const oauth = record.safeParse(credential).data;
      if (oauth?.type === 'oauth' && typeof oauth.accountId === 'string') {
        const { access: _access, refresh: _refresh, expires: _expiry, ...identity } = oauth;
        value[provider] = identity;
      }
    }
  }
  return JSON.stringify(value);
}

/** Only the digest crosses into local binding storage; credentials remain in native homes. */
export async function nativeIdentity(
  driver: LocalAgentDriver,
  home?: string,
  account: unknown = null,
) {
  const directory =
    home ??
    (driver === 'codex'
      ? (process.env.CODEX_HOME ?? join(homedir(), '.codex'))
      : driver === 'claude'
        ? (process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'))
        : (process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent')));
  const hash = createHash('sha256').update(JSON.stringify([driver, directory, account]));
  for (const name of files[driver]) {
    const value = await boundedRead(join(directory, name));
    hash.update(
      JSON.stringify([
        name,
        value && (name === 'auth.json' || name === '.credentials.json')
          ? authenticationIdentity(driver, value, account)
          : value,
      ]),
    );
  }
  for (const name of driver === 'claude'
    ? ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL']
    : ['OPENAI_API_KEY', 'OPENAI_BASE_URL'])
    hash.update(JSON.stringify([name, process.env[name] ?? null]));
  return hash.digest('hex');
}
