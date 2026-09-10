#!/usr/bin/env node
/**
 * ADR-102 / LABEL-1302: Shared Label owns only the identity-scoped registry.
 * GoalLabel and TaskLabel assignment/query persistence belongs to Goal/Task.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const labelRoot = join(root, 'packages/label/src');
const contractFile = join(root, 'packages/contracts/src/modules/label/index.ts');
const forbidden = [
  /\bGoalLabelAssignmentCommand\b/,
  /\bTaskLabelAssignmentCommand\b/,
  /\bLabelAssignmentCommand\b/,
  /\breplaceGoalLabels\b/,
  /\breplaceTaskLabels\b/,
  /\blistGoalLabels(?:ByGoalIds)?\b/,
  /\blistTaskLabels(?:ByTaskPlanIds)?\b/,
  /\bfindGoalIdsMatchingAllLabels\b/,
  /\bfindTaskPlanIdsMatchingAllLabels\b/,
  /\bsetGoalLabels\b/,
  /\bsetTaskLabels\b/,
  /\bgoal_labels\b/,
  /\btask_labels\b/,
  /\btask_template_id\b/,
];

function productionSources(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'testing') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) productionSources(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of [...productionSources(labelRoot), contractFile]) {
  const source = readFileSync(file, 'utf8');
  for (const pattern of forbidden) {
    const match = source.match(pattern);
    if (match) violations.push(`${relative(root, file)}: ${match[0]}`);
  }
}

if (violations.length) {
  console.error(
    '[label-registry-ownership-audit] FAIL: Label resurrected owner assignment knowledge:',
  );
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error(
    'Fix: keep Label registry-only; implement GoalLabel/TaskLabel assignment in the owner modules.',
  );
  process.exit(1);
}

console.log('[label-registry-ownership-audit] OK: Label production/contracts are registry-only.');
