#!/usr/bin/env node

/**
 * Target Baseline Audit
 *
 * Scans all repo-owned project.json files and checks that each project
 * has the required targets for its category, as defined in the manifest.
 *
 * Exit codes:
 *   0 - All projects comply (or only documented exemptions)
 *   1 - Undocumented gaps found
 *   2 - Manifest or configuration error
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const MANIFEST_PATH = join(import.meta.dirname, 'target-baseline-manifest.json');
const PROJECT_DIRECTORIES = ['apps', 'packages', 'tools'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function findProjectJsonFiles(dir) {
  const results = [];
  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === '.nx')
        continue;
      const full = join(current, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry === 'project.json') {
        results.push(full);
      }
    }
  };
  walk(dir);
  return results;
}

function collectProjectJsonFiles() {
  const results = [join(ROOT, 'project.json')];

  for (const directory of PROJECT_DIRECTORIES) {
    results.push(...findProjectJsonFiles(join(ROOT, directory)));
  }

  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // Load manifest
  let manifest;
  try {
    manifest = loadJson(MANIFEST_PATH);
  } catch (err) {
    console.error(`[target-baseline-audit] ERROR: Cannot load manifest: ${err.message}`);
    process.exit(2);
  }

  // Validate manifest structure
  const requiredFields = ['projectCategories', 'projectRules', 'exemptions'];
  for (const field of requiredFields) {
    if (!manifest[field]) {
      console.error(`[target-baseline-audit] ERROR: Manifest missing required field: ${field}`);
      process.exit(2);
    }
  }

  const { projectCategories, projectRules, exemptions } = manifest;

  // Build exemption lookup: "project:target" -> exemption entry
  const exemptionMap = new Map();
  for (const entry of exemptions) {
    if (!entry.project || !entry.target || !entry.reason) {
      console.error(
        `[target-baseline-audit] ERROR: Exemption entry missing required fields (project, target, reason): ${JSON.stringify(entry)}`,
      );
      process.exit(2);
    }
    // Temporary exemptions must have owner and targetDate
    if (entry.type === 'temporary' && (!entry.owner || !entry.targetDate)) {
      console.error(
        `[target-baseline-audit] ERROR: Temporary exemption ${entry.project}:${entry.target} must have owner and targetDate fields`,
      );
      process.exit(2);
    }
    exemptionMap.set(`${entry.project}:${entry.target}`, entry);
  }

  // Scan project.json files
  const projectFiles = collectProjectJsonFiles();

  const gaps = [];
  const documentedExemptions = [];
  const unclassifiedProjects = [];
  const invalidExemptions = [];
  const seen = new Set();

  for (const filePath of projectFiles) {
    let config;
    try {
      config = loadJson(filePath);
    } catch {
      continue;
    }

    const name = config.name;
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);

    const category = projectRules[name];
    if (!category) {
      unclassifiedProjects.push({ name, path: relative(ROOT, filePath) });
      continue;
    }

    const categoryDef = projectCategories[category];
    if (!categoryDef) {
      console.error(
        `[target-baseline-audit] ERROR: Project "${name}" references unknown category "${category}"`,
      );
      process.exit(2);
    }

    const requiredTargets = categoryDef.requiredTargets ?? [];
    const existingTargets = config.targets ? Object.keys(config.targets) : [];

    for (const target of requiredTargets) {
      // Check if target exists (either explicitly defined or inferred by Nx plugins)
      // We only check explicitly defined targets in project.json
      const hasTarget = existingTargets.includes(target);
      if (hasTarget) continue;

      const key = `${name}:${target}`;
      const exemption = exemptionMap.get(key);
      if (exemption) {
        documentedExemptions.push({ project: name, target, reason: exemption.reason });
      } else {
        gaps.push({
          project: name,
          category,
          target,
          path: relative(ROOT, filePath),
        });
      }
    }
  }

  const manifestOnlyProjects = Object.keys(projectRules).filter((name) => !seen.has(name));

  for (const entry of exemptions) {
    if (!seen.has(entry.project)) {
      invalidExemptions.push({
        project: entry.project,
        target: entry.target,
        reason: `project not found in audit scope (root project.json, ${PROJECT_DIRECTORIES.join(', ')})`,
      });
      continue;
    }

    const category = projectRules[entry.project];
    const requiredTargets = projectCategories[category]?.requiredTargets ?? [];
    if (!requiredTargets.includes(entry.target)) {
      invalidExemptions.push({
        project: entry.project,
        target: entry.target,
        reason: `target is not required for category "${category}"`,
      });
    }
  }

  // ── Output ───────────────────────────────────────────────────────────────

  console.log(`\n[target-baseline-audit] Scanned ${seen.size} projects\n`);

  if (unclassifiedProjects.length > 0) {
    console.warn('--- Unclassified Projects (not in manifest) ---');
    for (const p of unclassifiedProjects) {
      console.warn(`  ${p.name} (${p.path})`);
    }
    console.warn('');
    // Unclassified projects are a manifest error
    console.error(
      '[target-baseline-audit] FAIL: Unclassified projects found. Add them to projectRules in the manifest.',
    );
    process.exit(2);
  }

  if (manifestOnlyProjects.length > 0) {
    console.error('--- Manifest Entries Without Matching Projects ---');
    for (const project of manifestOnlyProjects) {
      console.error(`  ${project}`);
    }
    console.error('');
    console.error(
      '[target-baseline-audit] FAIL: projectRules contains project(s) outside the repo-owned audit scope.',
    );
    process.exit(2);
  }

  if (invalidExemptions.length > 0) {
    console.error('--- Invalid Exemptions ---');
    for (const exemption of invalidExemptions) {
      console.error(`  ${exemption.project}: "${exemption.target}" — ${exemption.reason}`);
    }
    console.error('');
    console.error(
      "[target-baseline-audit] FAIL: exemptions must reference an existing repo-owned project and one of that category's required targets.",
    );
    process.exit(2);
  }

  if (documentedExemptions.length > 0) {
    console.log('--- Documented Exemptions ---');
    for (const e of documentedExemptions) {
      console.log(`  ${e.project}: missing "${e.target}" — ${e.reason}`);
    }
    console.log('');
  }

  if (gaps.length > 0) {
    console.error('--- Undocumented Gaps ---');
    for (const g of gaps) {
      console.error(
        `  ${g.project} [${g.category}]: missing required target "${g.target}" (${g.path})`,
      );
    }
    console.error('');
    console.error(`[target-baseline-audit] FAIL: ${gaps.length} undocumented gap(s) found.`);
    console.error(
      'Either add the target or register an exemption in tools/governance/target-baseline-manifest.json',
    );
    process.exit(1);
  }

  console.log(
    `[target-baseline-audit] passed. ${documentedExemptions.length} documented exemption(s).`,
  );
  process.exit(0);
}

main();
