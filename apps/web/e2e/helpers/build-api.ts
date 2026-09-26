import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function buildApiApp(workspaceRoot: string): void {
  if (
    process.env.E2E_PREBUILT_ARTIFACT === '1' &&
    existsSync(join(workspaceRoot, 'apps', 'api', 'dist', 'main.js'))
  ) {
    console.log('[playwright-api-server] using verified API build artifact');
    return;
  }
  execFileSync(process.execPath, [join(workspaceRoot, 'node_modules', 'nx', 'dist', 'bin', 'nx.js'), 'run', 'api:build'], {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: process.env,
  });
}
