#!/usr/bin/env node
/**
 * Vitest No-Test Audit
 *
 * Keeps empty test projects visible. `passWithNoTests: true` is only allowed
 * through this file's documented exception map.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

const CONFIG_GLOBS = ['vitest.config.ts', 'vitest.shared.ts', 'apps', 'packages'];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const PASS_WITH_NO_TESTS_TRUE = /\bpassWithNoTests\s*:\s*true\b/;
const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$/;
const IGNORED_DIRECTORIES = new Set([
  '.cache',
  '.git',
  '.nx',
  '.pytest-temp',
  '__pycache__',
  'coverage',
  'dist',
  'dist-electron',
  'node_modules',
  'reports',
]);

const PASS_WITH_NO_TESTS_EXCEPTIONS = new Map([
  // ['packages/example/vitest.config.ts', 'Reason this project intentionally has no tests yet.'],
]);

function main() {
  const violations = [];
  const configFiles = collectConfigFiles();

  for (const configFile of configFiles) {
    const content = readFileSync(join(ROOT, configFile), 'utf8');
    if (!PASS_WITH_NO_TESTS_TRUE.test(content)) continue;

    if (PASS_WITH_NO_TESTS_EXCEPTIONS.has(configFile)) {
      console.warn(
        `  ⚠ passWithNoTests exception: ${configFile} — ${PASS_WITH_NO_TESTS_EXCEPTIONS.get(configFile)}`,
      );
      continue;
    }

    violations.push({
      file: configFile,
      message: '`passWithNoTests: true` requires a documented governance exception.',
    });
  }

  const projectConfigs = collectRootVitestProjects();
  for (const projectConfig of projectConfigs) {
    const projectRoot = dirname(projectConfig);
    const testCount = countTestFiles(join(ROOT, projectRoot, 'src'));

    if (testCount === 0 && !PASS_WITH_NO_TESTS_EXCEPTIONS.has(projectConfig)) {
      violations.push({
        file: projectConfig,
        message: 'Root Vitest project has zero src test/spec files and no documented exception.',
      });
    }
  }

  if (violations.length > 0) {
    console.error(`❌ Vitest No-Test Audit FAILED — ${violations.length} violation(s):\n`);
    for (const violation of violations) {
      console.error(`  ${violation.file}: ${violation.message}`);
    }
    console.error(
      '\nAdd real tests, set passWithNoTests to false, or document a narrow exception in this audit.',
    );
    process.exit(1);
  }

  console.log(
    `✅ Vitest No-Test Audit passed (${configFiles.length} config files, ${projectConfigs.length} root projects audited)`,
  );
}

function collectConfigFiles() {
  const files = new Set();

  for (const entry of CONFIG_GLOBS) {
    const absolute = join(ROOT, entry);
    if (!existsSync(absolute)) continue;

    const statEntries = readdirSync(dirname(absolute), { withFileTypes: true });
    const basename = absolute.split(/[\\/]/).at(-1);
    const directEntry = statEntries.find((candidate) => candidate.name === basename);

    if (directEntry?.isFile()) {
      files.add(entry.replaceAll('\\', '/'));
      continue;
    }

    if (directEntry?.isDirectory()) {
      walkDirectory(absolute, (file) => {
        const normalized = relative(ROOT, file).replaceAll('\\', '/');
        if (isVitestOrViteConfig(normalized)) {
          files.add(normalized);
        }
      });
    }
  }

  return [...files].sort();
}

function collectRootVitestProjects() {
  const rootConfig = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8');
  const projects = [];
  const projectPattern = /['"](\.\/(?:apps|packages)\/[^'"]*vitest[^'"]*\.config\.ts)['"]/g;

  let match;
  while ((match = projectPattern.exec(rootConfig)) !== null) {
    projects.push(match[1].replace(/^\.\//, '').replaceAll('\\', '/'));
  }

  return projects.sort();
}

function countTestFiles(root) {
  if (!existsSync(root)) return 0;

  let count = 0;
  walkDirectory(root, (file) => {
    if (TEST_FILE_PATTERN.test(file)) {
      count++;
    }
  });
  return count;
}

function walkDirectory(root, visit) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      walkDirectory(absolute, visit);
      continue;
    }

    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name))) {
      continue;
    }

    visit(absolute);
  }
}

function isVitestOrViteConfig(file) {
  return /(^|\/)(vitest(?:\.[^/]*)?\.config|vite\.config)\.ts$/.test(file);
}

main();
