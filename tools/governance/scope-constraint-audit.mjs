#!/usr/bin/env node
/**
 * Scope Constraint Audit
 *
 * Ensures every feature/app scope tag has a corresponding
 * @nx/enforce-module-boundaries depConstraint sourceTag entry in eslint.config.ts.
 * Prevents "new feature package without isolation rule" regressions (ADR-033 M3).
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  collectScopedProjects,
  extractSourceTagsFromEslint,
  filterRequiredFeatureScopes,
  findMissingScopeConstraints,
} from './lib/scope-constraint.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..');
const ESLINT_CONFIG = path.join(ROOT, 'eslint.config.ts');

function readProjectJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function collectProjects() {
  const projects = [];
  const roots = [path.join(ROOT, 'packages'), path.join(ROOT, 'apps'), path.join(ROOT, 'tools')];

  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const projectPath = path.join(root, entry.name, 'project.json');
      if (!existsSync(projectPath)) continue;
      const json = readProjectJson(projectPath);
      if (!json) continue;
      projects.push({
        name: json.name ?? entry.name,
        tags: Array.isArray(json.tags) ? json.tags : [],
      });
    }
  }

  const rootProject = path.join(ROOT, 'project.json');
  if (existsSync(rootProject)) {
    const json = readProjectJson(rootProject);
    if (json) {
      projects.push({
        name: json.name ?? 'memoflow',
        tags: Array.isArray(json.tags) ? json.tags : [],
      });
    }
  }

  return projects;
}

function main() {
  if (!existsSync(ESLINT_CONFIG)) {
    console.error('❌ Scope Constraint Audit FAILED');
    console.error('  - missing eslint.config.ts');
    process.exit(1);
  }

  const projects = collectProjects();
  const scopes = collectScopedProjects(projects);
  const requiredScopes = filterRequiredFeatureScopes(scopes);
  const eslintSource = readFileSync(ESLINT_CONFIG, 'utf8');
  const configuredSourceTags = extractSourceTagsFromEslint(eslintSource);
  const { missing } = findMissingScopeConstraints({
    requiredScopes,
    configuredSourceTags,
  });

  if (missing.length > 0) {
    console.error('❌ Scope Constraint Audit FAILED');
    console.error('  Missing module-boundary sourceTag entries for:');
    for (const scope of missing) {
      console.error(`  - ${scope}`);
    }
    console.error(
      '  Add a depConstraint in eslint.config.ts (featureScopeConstraints / moduleBoundaryDepConstraints).',
    );
    process.exit(1);
  }

  console.log(
    `✅ Scope Constraint Audit passed (${requiredScopes.length} required scopes covered)`,
  );
}

main();
