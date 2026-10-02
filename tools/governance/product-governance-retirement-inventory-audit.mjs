#!/usr/bin/env node
/** Non-destructive GOV-7901 drift lock. Reads repository files, never loads Product runtime. */
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PRODUCT_ROOTS = [
  'packages/governance',
  'packages/contracts/src/modules/governance',
  'packages/app-vue/src/modules/governance',
];
const CLASSIFICATIONS = ['RETIRE', 'KEEP_ENGINEERING', 'SHARED', 'MIGRATE_FIRST'];
const ARTIFACTS = ['source', 'generated', 'fixture', 'historical'];
const REFERENCE = /governance|rule_?revisions?|GovernanceRule/i;
// Binary blobs may embed concrete Product imports/models; generic prose is text-only.
const PRODUCT_REFERENCE =
  /@memoflow\/(?:governance|contracts\/governance)|rule_?revisions?|GovernanceRule|\bRule(?:Id|Status|Severity|ClientDTO|ServerDTO|Client|Server)\b|\bmodel\s+Rule\b|\b(?:FROM|JOIN|INTO|TABLE)\s+["`]?rules\b|\bprisma\.rule\b/i;
const MIGRATION_BLOCKERS = {
  'engineering-bundle-consumer': 'B1',
  'engineering-rule-metadata': 'B2',
  'published-product-snapshot': 'B2',
  'bundle-bridge-tests': 'B3',
  'reference-preservation-policy': 'B4',
  'governance-check-bridge': 'B5',
  'live-reference-documentation': 'B6',
};
const ROOTS = ['apps', 'packages', 'tools', 'docs', 'docker', '.github', 'reports', 'showcase'];
// Evidence mentions are not runtime dependencies; existing inventory paths still resolve.
const EVIDENCE_ROOTS = [
  'docs/architecture/adr/',
  'docs/analysis/',
  'docs/audit/',
  'docs/plan/archive/',
  'docs/plan/handoffs/',
  'reports/',
];
const REQUIRED_CLASSIFICATIONS = {
  'tools/governance/governance-rule-bundle-adapter.mjs': 'MIGRATE_FIRST',
  'tools/governance/lib/governance-rule-engineering-adapter.mjs': 'MIGRATE_FIRST',
  'tools/governance/lib/published-rule-bundle.mjs': 'MIGRATE_FIRST',
  'tools/governance/engineering-rule-adapters.json': 'MIGRATE_FIRST',
  'tools/governance/pinned-rule-bundles.json': 'MIGRATE_FIRST',
  'tools/governance/published/governance-rule-bundle.v1.json': 'MIGRATE_FIRST',
  'tools/governance/__fixtures__/governance-rule-bundle.v1.json': 'MIGRATE_FIRST',
  'tools/governance/__tests__/governance-rule-bundle-cli.test.mjs': 'MIGRATE_FIRST',
  'tools/governance/__tests__/governance-rule-bundle-hard-guards.test.mjs': 'MIGRATE_FIRST',
  'tools/governance/__tests__/governance-rule-engineering-adapter.test.mjs': 'MIGRATE_FIRST',
  'tools/governance/__tests__/published-rule-bundle.test.mjs': 'MIGRATE_FIRST',
  'AGENT.md': 'MIGRATE_FIRST',
  'tools/governance/__tests__/governance-reference-preservation.test.mjs': 'MIGRATE_FIRST',
  'project.json': 'MIGRATE_FIRST',
  'docs/governance/CHANGE_PLAYBOOK.md': 'MIGRATE_FIRST',
  'docs/governance/DECISIONS.md': 'MIGRATE_FIRST',
  'docs/governance/QUICK_REFERENCE.md': 'MIGRATE_FIRST',
  'docs/governance/README.md': 'MIGRATE_FIRST',
  'docs/standards/repository-layer-spec.md': 'MIGRATE_FIRST',
  'tools/governance/README.md': 'MIGRATE_FIRST',
  'tools/governance/package-internal-boundary-audit.mjs': 'KEEP_ENGINEERING',
  'tools/governance/lib/package-internal-boundary-runner.mjs': 'KEEP_ENGINEERING',
  'tools/governance/target-baseline-manifest.json': 'KEEP_ENGINEERING',
  'tools/governance/core-vnext-architecture-lock-audit.mjs': 'KEEP_ENGINEERING',
  'tools/governance/lib/core-vnext-architecture-lock.mjs': 'KEEP_ENGINEERING',
  'tools/governance/vnext-retirement-manifest.json': 'KEEP_ENGINEERING',
  'tools/governance/fix-governance-jsdoc.mjs': 'RETIRE',
  'tools/governance/governance-module-docs-audit.mjs': 'RETIRE',
  'apps/web/src/mocks/handlers/governance.handlers.ts': 'RETIRE',
  'apps/web/src/mocks/handlers/governance.handlers.spec.ts': 'RETIRE',
  'packages/contracts/src/mocks/governance.mock.ts': 'RETIRE',
  'packages/app-vue/src/locales/en-US/governance.ts': 'RETIRE',
  'packages/app-vue/src/locales/zh-CN/governance.ts': 'RETIRE',
  'apps/api/src/runtime/compose-governance.spec.ts': 'RETIRE',
  'apps/api/src/runtime/compose-governance.surface.spec.ts': 'RETIRE',
  'packages/database/prisma/schema/governance.prisma': 'RETIRE',
  'apps/api/src/runtime/compose-governance.ts': 'RETIRE',
  'apps/desktop/src/main/runtime/compose-governance.ts': 'RETIRE',
  'apps/api/src/server.ts': 'SHARED',
  'apps/desktop/src/main/main.ts': 'SHARED',
  'apps/desktop/src/preload/allowed-channels.ts': 'SHARED',
  'apps/web/src/platform/di-app.ts': 'SHARED',
  'apps/desktop/src/renderer/platform/di-app.ts': 'SHARED',
  'packages/app-vue/src/router/index.ts': 'SHARED',
  'packages/app-vue/src/di/types.ts': 'SHARED',
  'packages/contracts/src/shared/protocol.ts': 'SHARED',
  'packages/powersync-schema/src/index.ts': 'SHARED',
  'docker/powersync/sync-config.yaml': 'SHARED',
  'apps/api/src/modules/powersync/table-mapping.ts': 'SHARED',
  'packages/contracts/src/primitives/runtime.ts': 'SHARED',
  'packages/repository/src/server/infrastructure/runtime/repository.runtime.ts': 'SHARED',
};

function isProduct(file) {
  return PRODUCT_ROOTS.some((root) => file === root || file.startsWith(`${root}/`));
}

function repositoryRelativePath(file) {
  return (
    typeof file === 'string' &&
    file.length > 0 &&
    !/[\x00-\x1f\x7f\\:]/.test(file) &&
    !path.posix.isAbsolute(file) &&
    !file.split('/').some((part) => part === '..' || part === '.' || part === '')
  );
}

function validPath(file) {
  return (
    repositoryRelativePath(file) &&
    !/[?*\[\]{}]/.test(file) &&
    (!file.includes('/') || ROOTS.includes(file.split('/')[0]))
  );
}

/** Validate exact-path metadata before reading any manifest-selected files. */
export function validateInventory(manifest) {
  const errors = [];
  if (
    manifest?.schemaVersion !== 1 ||
    !Array.isArray(manifest?.entries) ||
    !manifest.entries.length
  ) {
    return ['Inventory requires schemaVersion 1 and non-empty entries'];
  }
  if (!/^[a-f0-9]{40}$/.test(manifest.baseline ?? '')) errors.push('Missing baseline SHA');
  if (
    manifest.decisionGate?.adr !== 'ADR-113' ||
    manifest.decisionGate?.status !== 'Proposed' ||
    manifest.decisionGate?.destructiveAllowed !== false
  ) {
    errors.push('GOV-7901 requires Proposed ADR-113 and destructiveAllowed=false');
  }
  if (
    JSON.stringify(manifest.coverage?.productRoots) !== JSON.stringify(PRODUCT_ROOTS) ||
    manifest.coverage?.referencePattern !== REFERENCE.source ||
    manifest.coverage?.binaryReferencePattern !== PRODUCT_REFERENCE.source
  ) {
    errors.push('Known Product roots/reference pattern must not be weakened');
  }
  const ids = new Set();
  const groups = new Map();
  const ownership = new Map();
  for (const entry of manifest.entries) {
    if (!entry || typeof entry !== 'object') {
      errors.push('Invalid entry');
      continue;
    }
    if (typeof entry.id !== 'string' || !/^[a-z][a-z0-9-]+$/.test(entry.id) || ids.has(entry.id))
      errors.push(`Invalid/duplicate id: ${entry.id}`);
    ids.add(entry.id);
    groups.set(entry.id, entry);
    if (!CLASSIFICATIONS.includes(entry.classification))
      errors.push(`${entry.id}: unsupported classification`);
    if (
      !ARTIFACTS.includes(entry.artifact) ||
      typeof entry.sourceOfTruth !== 'boolean' ||
      entry.sourceOfTruth !== (entry.artifact === 'source')
    )
      errors.push(`${entry.id}: invalid source/generated marker`);
    for (const field of [
      'owner',
      'surface',
      'dependencyDirection',
      'rationale',
      'gov7902',
      'gov7903',
      'verificationQuery',
    ]) {
      if (typeof entry[field] !== 'string' || !entry[field].trim())
        errors.push(`${entry.id}: missing ${field}`);
    }
    if (
      !Array.isArray(entry.symbols) ||
      !entry.symbols.length ||
      entry.symbols.some((symbol) => typeof symbol !== 'string' || !symbol.trim())
    )
      errors.push(`${entry.id}: missing symbols`);
    if (!Array.isArray(entry.paths) || !entry.paths.length) {
      errors.push(`${entry.id}: missing paths`);
      continue;
    }
    if (entry.pathMarkers !== undefined) {
      if (
        !entry.pathMarkers ||
        typeof entry.pathMarkers !== 'object' ||
        Array.isArray(entry.pathMarkers)
      ) {
        errors.push(`${entry.id}: invalid path markers`);
      } else {
        for (const [file, marker] of Object.entries(entry.pathMarkers)) {
          if (
            !entry.paths.includes(file) ||
            !ARTIFACTS.includes(marker?.artifact) ||
            typeof marker?.sourceOfTruth !== 'boolean' ||
            marker.sourceOfTruth !== (marker.artifact === 'source')
          )
            errors.push(`${entry.id}: invalid path marker: ${file}`);
        }
      }
    }
    for (const file of entry.paths) {
      if (!validPath(file)) {
        errors.push(`${entry.id}: invalid/disallowed path: ${file}`);
        continue;
      }
      if (ownership.has(file))
        errors.push(
          `${file}: duplicate/contradictory file classification (${ownership.get(file).id}, ${entry.id})`,
        );
      ownership.set(file, entry);
      if (isProduct(file) && entry.classification !== 'RETIRE')
        errors.push(
          `${file}: Product-only root must be RETIRE (prospective, not deletion authorization)`,
        );
      if (
        entry.classification === 'KEEP_ENGINEERING' &&
        !(file.startsWith('tools/') || file.startsWith('docs/') || file.startsWith('.github/'))
      )
        errors.push(`${file}: outside KEEP_ENGINEERING boundary`);
      if (
        file.startsWith('packages/database/src/generated/prisma/') &&
        ((entry.pathMarkers?.[file] ?? entry).artifact !== 'generated' ||
          entry.classification !== 'SHARED')
      )
        errors.push(`${file}: Prisma generated multi-domain client must remain SHARED/generated`);
    }
  }
  for (const [id, blocker] of Object.entries(MIGRATION_BLOCKERS)) {
    const entry = groups.get(id);
    if (
      entry?.classification !== 'MIGRATE_FIRST' ||
      typeof entry.gov7902 !== 'string' ||
      !entry.gov7902.startsWith(`${blocker}:`)
    )
      errors.push(`${id}: required MIGRATE_FIRST blocker ${blocker} missing`);
  }
  for (const [file, classification] of Object.entries(REQUIRED_CLASSIFICATIONS)) {
    if (ownership.get(file)?.classification !== classification)
      errors.push(`${file}: required ${classification} coverage missing`);
  }
  for (const root of PRODUCT_ROOTS) {
    if (![...ownership.keys()].some((file) => file.startsWith(`${root}/`)))
      errors.push(`${root}: uncovered Product root`);
  }
  return errors;
}

/** Compare live references with the inventory; historical/generated evidence is non-blocking. */
export function auditInventory(root, manifest, files) {
  const errors = validateInventory(manifest);
  if (errors.length) return errors;
  const ownership = new Map(
    manifest.entries.flatMap((entry) => entry.paths.map((file) => [file, entry])),
  );
  const realRoot = realpathSync(root);
  for (const file of ownership.keys()) {
    try {
      const full = path.join(root, file);
      const relative = path.relative(realRoot, realpathSync(full));
      if (
        relative.startsWith(`..${path.sep}`) ||
        relative === '..' ||
        path.isAbsolute(relative) ||
        !statSync(full).isFile()
      )
        errors.push(`${file}: not a repository-owned file`);
    } catch {
      errors.push(`${file}: inventory path no longer resolves`);
    }
  }
  for (const file of [...new Set(files)].sort()) {
    // Validate caller/Git paths before any file access, including evidence exemptions.
    if (!repositoryRelativePath(file)) {
      errors.push(`${file}: invalid/disallowed live path`);
      continue;
    }
    const full = path.join(root, file);
    let data;
    try {
      const relative = path.relative(realRoot, realpathSync(full));
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        errors.push(`${file}: not a repository-owned file`);
        continue;
      }
      if (!statSync(full).isFile()) continue;
      if (!ownership.has(file) && EVIDENCE_ROOTS.some((root) => file.startsWith(root))) continue;
      data = readFileSync(full);
    } catch (error) {
      // Git can list a deleted file; explicit inventory resolution fails above.
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')
        errors.push(`${file}: cannot inspect live file (${error.code ?? 'read failure'})`);
      continue;
    }
    const text = data.toString('utf8');
    const reference =
      isProduct(file) ||
      file.startsWith('tools/governance/') ||
      file.startsWith('docs/governance/') ||
      file.startsWith('docs/standards/') ||
      file.startsWith('packages/database/src/generated/prisma/') ||
      REFERENCE.test(file) ||
      PRODUCT_REFERENCE.test(text) ||
      (!data.includes(0) && REFERENCE.test(text));
    if (reference && !ownership.has(file))
      errors.push(`${file}: unclassified governance reference (review and assign exactly once)`);
  }
  return errors;
}

function main() {
  const root = path.resolve(import.meta.dirname, '../..');
  const manifest = JSON.parse(
    readFileSync(
      path.join(root, 'tools/governance/product-governance-retirement-inventory.json'),
      'utf8',
    ),
  );
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30_000 },
  )
    .split('\0')
    .filter(Boolean);
  const errors = auditInventory(root, manifest, files);
  if (errors.length) {
    console.error(
      `[product-governance-retirement-inventory] failed:\n${errors.map((error) => `- ${error}`).join('\n')}`,
    );
    process.exitCode = 1;
    return;
  }
  const counts = Object.fromEntries(
    CLASSIFICATIONS.map((classification) => [
      classification,
      {
        groups: manifest.entries.filter((entry) => entry.classification === classification).length,
        paths: manifest.entries
          .filter((entry) => entry.classification === classification)
          .reduce((sum, entry) => sum + entry.paths.length, 0),
      },
    ]),
  );
  console.log(
    `[product-governance-retirement-inventory] passed; ADR-113 Proposed; no retirement authorized; ${JSON.stringify(counts)}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(`[product-governance-retirement-inventory] ${error.message}`);
    process.exitCode = 1;
  }
}
