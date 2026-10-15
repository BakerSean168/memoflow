import fs from 'node:fs';
import path from 'node:path';

/**
 * A fresh MemoFlow Profile is not enough to isolate BYOA providers: their CLIs
 * may otherwise discover the developer's actual authentication/session Home.
 * This test-only environment is shared by packaged Electron acceptance cases.
 */
export function createIsolatedNativeAgentEnvironment(runtimeRoot: string): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (
      /(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|API[_-]?KEY)/i.test(name) ||
      (/^(?:OPENAI|ANTHROPIC|KUNYOU|WINDHUB|DEEPSEEK|ZAI|GLM|DSH)_/i.test(name) &&
        /(?:BASE_URL|ENDPOINT|API_BASE)/i.test(name))
    ) {
      continue;
    }
    sanitized[name] = value;
  }

  for (const [name, subdir] of Object.entries({
    CODEX_HOME: 'codex',
    CLAUDE_CONFIG_DIR: 'claude',
    PI_CODING_AGENT_DIR: 'pi',
    DSH_HOME: 'dsh',
  })) {
    const home = path.join(runtimeRoot, 'native-agents', subdir);
    fs.mkdirSync(home, { recursive: true });
    sanitized[name] = home;
  }

  return sanitized;
}
