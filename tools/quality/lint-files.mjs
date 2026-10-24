#!/usr/bin/env node
/**
 * File-level ESLint feedback for changed files (used by check:focus).
 * Project-level semantic lint stays with Nx (`nx affected -t lint`); this
 * runner only answers "is what I just edited lint-clean" in seconds.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLINT_EXTENSIONS, classifyPath, loadIgnorePatterns, planFiles } from './lib/git-files.mjs';

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(toolDir, '..', '..');

function main() {
  const argv = process.argv.slice(2);
  let base = 'origin/main';
  let head = 'HEAD';
  let root = process.cwd();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') base = argv[++i];
    else if (argv[i] === '--head') head = argv[++i];
    else if (argv[i] === '--root') root = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  root = path.resolve(root);
  const plan = planFiles({ root, mode: 'changed', base, head });
  const patterns = loadIgnorePatterns(root);
  const targets = plan.checkable.filter(
    (file) => classifyPath(file, patterns, ESLINT_EXTENSIONS) === 'checkable' && existsSync(path.join(root, file)),
  );
  if (targets.length === 0) {
    console.log('lint-files: no lintable changed files');
    return;
  }
  const eslintBin =
    process.env.QUALITY_ESLINT_BIN ?? path.join(workspaceRoot, 'node_modules', 'eslint', 'bin', 'eslint.js');
  const result = spawnSync(process.execPath, [eslintBin, ...targets], {
    cwd: root,
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
}

main();
