#!/usr/bin/env node
/**
 * Changed-file style guard (issue #946).
 *
 * Rule: dimensions that already have a Tailwind theme scale (spacing, width,
 * height, inset, radius, …) must use scale utilities. Arbitrary values are
 * only allowed for real geometry that has no scale (absolute offsets, canvas /
 * chart containers, third-party integration sizes) and must be registered per
 * occurrence in `tools/quality/style-arbitrary-exemptions.json` with a reason.
 * Inline `style="…"` is never allowed; `:style` may only bind runtime values.
 *
 * Scope mirrors `fmt.mjs --check --changed`: only lines added by the current
 * change are audited, so the existing backlog cannot block the guard.
 *
 * Modes: --changed (default) [--base <ref>] [--head <ref>] | --files a,b,c
 * Options: --root <dir>, --exemptions <path>, --help
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  STYLE_RULE_SUMMARY,
  collectViolations,
  isStyleFile,
  parseAddedLines,
  validateExemptions,
} from './lib/style-guard.mjs';

const DEFAULT_EXEMPTIONS = 'tools/quality/style-arbitrary-exemptions.json';

function usage() {
  return [
    'style-guard: audit newly added style drift on changed files',
    '',
    `Rule: ${STYLE_RULE_SUMMARY}`,
    `Full rule: tools/quality/README.md`,
    `Exemptions: ${DEFAULT_EXEMPTIONS}`,
    '',
    'Usage:',
    '  node ./tools/quality/style-guard.mjs --changed [--base origin/main] [--head <ref>]',
    '  node ./tools/quality/style-guard.mjs --files a.vue,b.ts',
    '',
    '--changed audits lines added against the merge base (working tree included).',
    'Existing arbitrary values on untouched lines are not audited.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    mode: 'changed',
    base: 'origin/main',
    head: null,
    root: process.cwd(),
    exemptions: DEFAULT_EXEMPTIONS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--changed') args.mode = 'changed';
    else if (arg === '--files') {
      args.mode = 'files';
      args.files = argv[++i].split(',').filter(Boolean);
    } else if (arg === '--base') args.base = argv[++i];
    else if (arg === '--head') args.head = argv[++i];
    else if (arg === '--root') args.root = argv[++i];
    else if (arg === '--exemptions') args.exemptions = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  return args;
}

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
}

function mergeBase(root, base, head) {
  try {
    return git(root, ['merge-base', base, head]).trim();
  } catch {
    return base;
  }
}

function addedLinesFromDiff(root, base, head) {
  const from = mergeBase(root, base, head ?? 'HEAD');
  const diffArgs = [
    'diff',
    '--unified=0',
    '--no-color',
    '--no-ext-diff',
    '--diff-filter=ACMR',
    from,
  ];
  if (head) diffArgs.push(head);
  return parseAddedLines(git(root, diffArgs));
}

function addedLinesFromFiles(root, files) {
  return files
    .filter((file) => isStyleFile(file))
    .map((file) => {
      const content = readFileSync(path.join(root, file), 'utf8');
      return {
        file,
        lines: content.split(/\r?\n/u).map((text, index) => ({ line: index + 1, text })),
      };
    });
}

function loadExemptions(root, relativePath) {
  const target = path.resolve(root, relativePath);
  if (!existsSync(target)) {
    throw new Error(`exemption registry not found: ${relativePath}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(target, 'utf8'));
  } catch (error) {
    throw new Error(`exemption registry is not valid JSON: ${error.message}`);
  }
  if (parsed?.kind !== 'style-guard-exemptions-v1') {
    throw new Error(
      `exemption registry kind must be "style-guard-exemptions-v1" (${relativePath})`,
    );
  }
  if (!Array.isArray(parsed.entries)) {
    throw new Error(`exemption registry entries must be an array (${relativePath})`);
  }
  return parsed.entries;
}

function describe(violation) {
  return `${violation.file}:${violation.line}  ${violation.token}\n      ${violation.message}\n      改法: ${violation.fix}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const root = path.resolve(args.root);
  const entries = loadExemptions(root, args.exemptions);
  const readFile = (file) => readFileSync(path.join(root, file), 'utf8');
  const registryProblems = validateExemptions(entries, readFile);

  const added =
    args.mode === 'files'
      ? addedLinesFromFiles(root, args.files ?? [])
      : addedLinesFromDiff(root, args.base, args.head);
  const violations = collectViolations(added, entries).sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
  );
  const styleFileCount = added.filter(({ file }) => isStyleFile(file)).length;

  if (registryProblems.length === 0 && violations.length === 0) {
    console.log(
      `style-guard: ok (${styleFileCount} changed style file(s), ${entries.length} exemption(s))`,
    );
    return;
  }

  if (violations.length > 0) {
    console.error(`style-guard: ${violations.length} violation(s)\n  Rule: ${STYLE_RULE_SUMMARY}`);
    for (const violation of violations) console.error(`\n  ${describe(violation)}`);
  }
  if (registryProblems.length > 0) {
    console.error(`style-guard: ${registryProblems.length} exemption registry problem(s)`);
    for (const problem of registryProblems) {
      console.error(`\n  [${problem.kind}] ${problem.message}`);
    }
  }
  console.error(`\n  Full rule: tools/quality/README.md`);
  process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`style-guard: ${error.message}`);
  process.exitCode = 1;
}
