import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** File extensions Prettier can format in this repository. */
export const PRETTIER_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.vue',
  '.json',
  '.md',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.yml',
  '.yaml',
]);

/** File extensions ESLint can lint in this repository. */
export const ESLINT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.vue',
]);

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
}

/** All files tracked by Git (the managed set). Never scans the raw filesystem. */
export function listManagedFiles(root) {
  const out = git(root, ['ls-files', '-z']);
  return out.split('\0').filter(Boolean).sort();
}

/** Parse `git diff --name-status -M -z` output into change records. */
export function parseNameStatusZ(text) {
  const tokens = text.split('\0').filter((token) => token.length > 0);
  const changes = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const status = tokens[i][0];
    if (status === 'R' || status === 'C') {
      changes.push({ status, oldPath: tokens[i + 1], path: tokens[i + 2] });
      i += 2;
    } else {
      changes.push({ status, path: tokens[i + 1] });
      i += 1;
    }
  }
  return changes;
}

/**
 * Changed files between base and head. Uses a three-dot diff (merge base) for
 * local ergonomics and falls back to a two-dot diff for explicit SHA pairs
 * (CI passes exact base/head SHAs where no merge base lookup is wanted).
 */
export function listChangedFiles(root, base, head = 'HEAD') {
  let text;
  try {
    text = git(root, ['diff', '--name-status', '-M', '-z', `${base}...${head}`]);
  } catch {
    text = git(root, ['diff', '--name-status', '-M', '-z', base, head]);
  }
  const changes = parseNameStatusZ(text);
  if (head !== 'HEAD') return changes;
  // Local runs (check:focus / format:changed) must also see uncommitted
  // edits; CI passes explicit SHAs and skips this overlay.
  const byPath = new Map(changes.map((change) => [change.path, change]));
  for (const change of listWorkingTreeChanges(root)) {
    if (change.status === 'D') byPath.set(change.path, change);
    else if (!byPath.has(change.path)) byPath.set(change.path, change);
    else if (change.oldPath)
      byPath.set(change.path, { ...byPath.get(change.path), oldPath: change.oldPath });
  }
  return [...byPath.values()];
}

/** Parse `git status --porcelain -z` (tracked entries only; untracked skipped). */
export function parsePorcelainZ(text) {
  const tokens = text.split('\0').filter((token) => token.length > 0);
  const changes = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const entry = tokens[i];
    const code = entry.slice(0, 2);
    const file = entry.slice(3);
    if (code === '??') continue;
    if (code.includes('R') || code.includes('C')) {
      // Porcelain -z rename order is: "XY <new>" then a bare "<old>" token.
      changes.push({ status: 'R', oldPath: tokens[i + 1], path: file });
      i += 1;
    } else if (code.includes('D')) {
      changes.push({ status: 'D', path: file });
    } else {
      changes.push({ status: code.includes('A') ? 'A' : 'M', path: file });
    }
  }
  return changes;
}

export function listWorkingTreeChanges(root) {
  return parsePorcelainZ(git(root, ['status', '--porcelain', '-z']));
}

export function loadIgnorePatterns(root, file = '.prettierignore') {
  const target = path.join(root, file);
  if (!existsSync(target)) return [];
  return readFileSync(target, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

const REGEX_SPECIAL = /[.+^${}()|[\]\\]/g;

/**
 * Minimal gitignore-style glob → RegExp covering the pattern forms this
 * repository uses in .prettierignore: anchored paths (`/dist`,
 * `packages/.../generated`), `**` segments, single `*`, and bare basenames
 * (`pnpm-lock.yaml`). A pattern also matches everything below a directory it
 * names.
 */
export function globToRegExp(pattern) {
  let p = pattern.replace(/\/$/, '');
  let anchored = false;
  if (p.startsWith('/')) {
    anchored = true;
    p = p.slice(1);
  } else if (p.includes('/')) {
    anchored = true;
  }
  let re = '';
  for (let i = 0; i < p.length; i += 1) {
    const ch = p[i];
    if (ch === '*') {
      if (p[i + 1] === '*') {
        if (p[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else {
      re += ch.replace(REGEX_SPECIAL, '\\$&');
    }
  }
  const body = anchored ? `^${re}` : `(?:^|.*/)${re}`;
  return new RegExp(`${body}(?:/.*)?$`);
}

export function isIgnored(patterns, file) {
  return patterns.some((pattern) => globToRegExp(pattern).test(file));
}

export function classifyPath(file, patterns, extensions = PRETTIER_EXTENSIONS) {
  if (isIgnored(patterns, file)) return 'ignored';
  if (!extensions.has(path.posix.extname(file))) return 'unsupported';
  return 'checkable';
}

/**
 * Build the file plan for a fmt/lint run: the checkable set plus an auditable
 * record of everything skipped and why (deleted / renamed / ignored /
 * unsupported), so CI receipts can prove what was and was not examined.
 */
export function planFiles({ root, mode, base = 'origin/main', head = 'HEAD', files }) {
  const patterns = loadIgnorePatterns(root);
  const skipped = { deleted: [], renamed: [], ignored: [], unsupported: [] };
  let candidates = [];
  let changed = null;
  if (mode === 'all') {
    candidates = listManagedFiles(root);
  } else if (mode === 'changed') {
    changed = listChangedFiles(root, base, head);
    for (const change of changed) {
      if (change.status === 'D') {
        skipped.deleted.push(change.path);
        continue;
      }
      if (change.status === 'R' || change.status === 'C') {
        skipped.renamed.push({ from: change.oldPath, to: change.path });
      }
      candidates.push(change.path);
    }
  } else if (mode === 'files') {
    candidates = files ?? [];
  } else {
    throw new Error(`unknown mode ${mode}`);
  }
  const checkable = [];
  for (const file of [...new Set(candidates)].sort()) {
    const cls = classifyPath(file, patterns);
    if (cls === 'checkable') checkable.push(file);
    else skipped[cls].push(file);
  }
  return { checkable, skipped, changed };
}
