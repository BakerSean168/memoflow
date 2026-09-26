import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export function buildDesktopApp(workspaceRoot: string): void {
  execFileSync(process.execPath, [join(workspaceRoot, 'node_modules', 'nx', 'dist', 'bin', 'nx.js'), 'run', 'desktop:build'], {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: process.env,
  });
}
