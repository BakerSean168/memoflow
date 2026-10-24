#!/usr/bin/env node
/**
 * Git-aware Prettier runner (VNext Q1).
 *
 * Replaces raw `prettier --check .` / `prettier --write .`, which scan the
 * whole working tree including files Git does not manage. This runner only
 * ever passes Git-managed, ignore-filtered, Prettier-supported files to
 * Prettier, classifies everything it skips, and emits a verifiable receipt.
 *
 * Modes: --all | --changed [--base <ref>] [--head <ref>] | --files a,b,c
 * Action: --check (default) | --write
 * Options: --root <dir> (default cwd), --receipt <path>
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planFiles } from './lib/git-files.mjs';

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(toolDir, '..', '..');
const CHUNK = 150;

function parseArgs(argv) {
  const args = { action: 'check', mode: null, base: 'origin/main', head: 'HEAD' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all') args.mode = 'all';
    else if (arg === '--changed') args.mode = 'changed';
    else if (arg === '--files') args.files = argv[++i].split(',').filter(Boolean);
    else if (arg === '--write') args.action = 'write';
    else if (arg === '--check') args.action = 'check';
    else if (arg === '--base') args.base = argv[++i];
    else if (arg === '--head') args.head = argv[++i];
    else if (arg === '--root') args.root = argv[++i];
    else if (arg === '--receipt') args.receipt = argv[++i];
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!args.mode && args.files) args.mode = 'files';
  if (!args.mode) args.mode = 'changed';
  return args;
}

export function stableDigest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function runPrettier(root, prettierBin, action, files) {
  const flag = action === 'write' ? '--write' : '--list-different';
  const listed = [];
  let status = 0;
  for (let i = 0; i < files.length; i += CHUNK) {
    const chunk = files.slice(i, i + CHUNK);
    const result = spawnSync(process.execPath, [prettierBin, flag, ...chunk], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && action === 'write') status = result.status;
    const lines = (result.stdout ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
    listed.push(...lines);
    if (result.status !== 0 && action === 'check' && lines.length === 0 && result.stderr) {
      process.stderr.write(result.stderr);
      status = result.status;
    }
  }
  return { listed: listed.sort(), status };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root ?? process.cwd());
  const started = Date.now();
  const plan = planFiles({ root, mode: args.mode, base: args.base, head: args.head, files: args.files });
  const prettierBin =
    process.env.QUALITY_PRETTIER_BIN ??
    path.join(workspaceRoot, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
  let listed = [];
  let toolStatus = 0;
  if (plan.checkable.length > 0) {
    ({ listed, status: toolStatus } = runPrettier(root, prettierBin, args.action, plan.checkable));
  }
  const different = args.action === 'check' ? listed : [];
  const exitCode = args.action === 'check' ? (different.length > 0 ? 1 : toolStatus) : toolStatus;
  const receipt = {
    kind: 'quality-fmt-receipt-v1',
    tool: 'prettier',
    mode: args.mode,
    action: args.action,
    base: args.mode === 'changed' ? args.base : null,
    head: args.mode === 'changed' ? args.head : null,
    filesChecked: plan.checkable.length,
    filesDifferent: different,
    filesWritten: args.action === 'write' ? listed : [],
    skipped: {
      deleted: plan.skipped.deleted.length,
      renamed: plan.skipped.renamed.length,
      ignored: plan.skipped.ignored.length,
      unsupported: plan.skipped.unsupported.length,
    },
    exitCode,
    durationMs: Date.now() - started,
  };
  receipt.digest = stableDigest(receipt);
  if (args.receipt) {
    const target = path.resolve(root, args.receipt);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  console.log(
    `fmt ${args.action} (${args.mode}): ${receipt.filesChecked} checked, ` +
      `${different.length} different, skipped ${JSON.stringify(receipt.skipped)}, ${receipt.durationMs}ms`,
  );
  if (different.length > 0) {
    for (const file of different) console.log(`  different: ${file}`);
  }
  process.exitCode = exitCode;
}

main();
