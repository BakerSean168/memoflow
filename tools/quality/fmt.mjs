#!/usr/bin/env node
/**
 * Git-aware Oxfmt runner.
 *
 * Avoids raw `oxfmt .`, which scans the
 * whole working tree including files Git does not manage. This runner only
 * ever passes Git-managed, ignore-filtered, Oxfmt-supported files to
 * Oxfmt, classifies everything it skips, and emits a verifiable receipt.
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

function invokeOxfmt(root, bin, action, files) {
  if (!files.length) return { listed: [], status: 0 };
  const listed = [];
  // Keep each argv well under OS command-line limits on Windows/Linux/macOS.
  for (let i = 0; i < files.length; i += CHUNK) {
    const chunk = files.slice(i, i + CHUNK);
    const result = spawnSync(bin, [action, ...chunk], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    const entries = (result.stdout ?? '')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);
    // --list-different returns 1 for differences, 0 for no differences.
    // Other statuses or an error without reported paths fail closed.
    if (
      result.status !== 0 &&
      (action !== '--list-different' || result.status !== 1 || !entries.length)
    ) {
      throw new Error(
        `Oxfmt ${action} exited ${result.status}: ${result.stderr ?? result.stdout ?? ''}`,
      );
    }
    const selected = new Set(chunk);
    for (const entry of entries) {
      if (!selected.has(entry))
        throw new Error(`Unexpected Oxfmt result outside planned files: ${entry}`);
    }
    listed.push(...entries);
  }
  return { listed: [...new Set(listed)].sort(), status: 0 };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root ?? process.cwd());
  const started = Date.now();
  const plan = planFiles({
    root,
    mode: args.mode,
    base: args.base,
    head: args.head,
    files: args.files,
  });
  const oxfmtBin =
    process.env.QUALITY_OXFMT_BIN ?? path.join(workspaceRoot, 'node_modules', '.bin', 'oxfmt');
  // Oxfmt --write reports a summary rather than the files it changed. Read
  // the exact set first, then write only that set, then verify convergence.
  const { listed: different } = invokeOxfmt(root, oxfmtBin, '--list-different', plan.checkable);
  if (args.action === 'write' && different.length > 0) {
    for (let i = 0; i < different.length; i += CHUNK) {
      const chunk = different.slice(i, i + CHUNK);
      const result = spawnSync(oxfmtBin, ['--write', ...chunk], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      if (result.error || result.status !== 0) {
        throw new Error(`Oxfmt write failed: ${result.error ?? result.stderr ?? result.stdout}`);
      }
    }
    const { listed: remaining } = invokeOxfmt(root, oxfmtBin, '--list-different', different);
    if (remaining.length) throw new Error(`Oxfmt write did not converge: ${remaining.join(', ')}`);
  }
  const exitCode = args.action === 'check' && different.length > 0 ? 1 : 0;
  const receipt = {
    kind: 'quality-fmt-receipt-v1',
    tool: 'oxfmt',
    mode: args.mode,
    action: args.action,
    base: args.mode === 'changed' ? args.base : null,
    head: args.mode === 'changed' ? args.head : null,
    filesChecked: plan.checkable.length,
    filesDifferent: args.action === 'check' ? different : [],
    filesWritten: args.action === 'write' ? different : [],
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
