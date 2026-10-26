#!/usr/bin/env node
/**
 * Narrow ESLint fallback for the Oxc hybrid lint gate.
 * Oxc owns native JS/TS/Nx-rule checks; ESLint keeps the unsupported Vue
 * template, Storybook, custom product-time AST and nested JSON contract rules.
 * The selected paths are derived from Git tracked and non-ignored pending files, never guessed from
 * AI/commit descriptions. Unlisted files are still checked by Oxlint.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function isResidual(pathname) {
  if (pathname.endsWith('.vue')) return true;
  if (/\.(?:story|stories)\.[cm]?[jt]sx?$/u.test(pathname)) return true;
  if (pathname.startsWith('packages/patterns/') && pathname.endsWith('.json')) return true;
  if (!/\.[cm]?[jt]sx?$/u.test(pathname)) return false;
  if (/^packages\/app-vue\/src\/(?:modules|layouts)\//u.test(pathname)) return true;
  if (pathname.startsWith('packages/app-react/src/')) return true;
  // Historical repository/AI application-test seam restrictions in the
  // root ESLint policy, retained even when projects have been moved.
  if (/^packages\/(?:ai|repository)\/src\/application-server\//u.test(pathname)) return true;
  return false;
}

export function listResidualFiles(root) {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  })
    .split('\0')
    .filter((file) => file && isResidual(file))
    .sort();
}

function main() {
  const root = process.cwd();
  const files = listResidualFiles(root);
  if (!files.length) throw new Error('ESLint residual path selection is unexpectedly empty');
  if (process.argv.includes('--list')) {
    console.log(JSON.stringify({ filesChecked: files.length, files }, null, 2));
    return;
  }
  const eslintBin = path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
  // Keep command lines below Windows CreateProcess limits, but on Linux and
  // macOS avoid repeatedly loading the Nx/TS plugin configuration.
  const chunkSize = process.platform === 'win32' ? 150 : 4000;
  for (let i = 0; i < files.length; i += chunkSize) {
    const batch = files.slice(i, i + chunkSize);
    const result = spawnSync(process.execPath, [eslintBin, ...batch], {
      cwd: root,
      stdio: 'inherit',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
      process.exitCode = result.status ?? 1;
      console.error(
        `[ESLint residual] failed for batch ${i / chunkSize + 1}: ${result.error ?? result.status}`,
      );
      return;
    }
  }
  console.log(`[ESLint residual] ${files.length} tracked files passed`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
