#!/usr/bin/env node
/**
 * Fail-closed full-workspace lint gate. Nx Oxlint native batching and the
 * unsupported-policy ESLint residue are independent and run concurrently.
 * This is the single authoritative workspace:lint command; it does not
 * change the task receipt identity or allow a partial success to pass.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertBoundaryPolicyMatches } from './oxlint-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// The root ESLint config is a workspace policy document, not a project import.
const eslintConfig = (await import(pathToFileURL(path.join(root, 'eslint.config.ts')).href))
  .default;
const config = JSON.parse(await readFile(path.join(root, '.oxlintrc.json'), 'utf8'));
console.log(
  `[Oxlint policy] ${assertBoundaryPolicyMatches(config, eslintConfig)} dependency constraints verified`,
);

async function run(label, command, args) {
  const started = Date.now();
  const result = await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, NX_DAEMON: 'false' },
    });
    child.once('error', (error) => resolve({ code: 1, error: String(error) }));
    child.once('close', (code, signal) => resolve({ code: code ?? 1, signal }));
  });
  console.log(`[${label}] exit=${result.code} timeMs=${Date.now() - started}`);
  return result;
}

export async function runHybridLint({
  prepareGraph = () =>
    createRequire(import.meta.url)('@nx/devkit').createProjectGraphAsync({ exitOnError: true }),
  execute = run,
} = {}) {
  // ESLint's Nx rule reads the on-disk graph synchronously. Starting it while
  // Oxlint is still building that graph can skip rules or leave a partial locator.
  await prepareGraph();
  const [oxc, residual] = await Promise.all([
    execute('Oxlint', process.execPath, [
      path.join(root, 'node_modules', 'nx', 'dist', 'bin', 'nx.js'),
      'run-many',
      '-t',
      'lint-oxc',
      '--all',
      '--parallel=3',
      '--outputStyle=static',
    ]),
    execute('ESLint residual', process.execPath, [
      path.join(root, 'tools/quality/eslint-residual.mjs'),
    ]),
  ]);
  if (oxc.code !== 0 || residual.code !== 0 || oxc.signal || residual.signal) {
    throw new Error(`Hybrid lint failed: Oxlint=${oxc.code} ESLint-residual=${residual.code}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runHybridLint();
}
