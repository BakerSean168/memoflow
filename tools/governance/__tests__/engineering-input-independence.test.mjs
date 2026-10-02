import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { auditEngineeringInputDependencies } from '../engineering-input-dependency-audit.mjs';
import {
  computeEngineeringRuleHash,
  loadEngineeringRuleSource,
} from '../lib/engineering-rule-source.mjs';
import { runPackageInternalBoundaryAudit } from '../lib/package-internal-boundary-runner.mjs';
import { executeEngineeringCheck } from '../lib/engineering-rule-runner.mjs';
import {
  runEngineeringChecks,
  runMappedEngineeringChecks,
  createAutofixProposalReport,
} from '../lib/governance-rule-engineering-adapter.mjs';

const childEnv = { ...process.env };
delete childEnv.FORCE_COLOR;
delete childEnv.NODE_OPTIONS;

const ROOT = path.join(import.meta.dirname, '../../..');
const read = (file) => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));
const native = loadEngineeringRuleSource({ root: ROOT });
// The Product snapshot is comparison data only; it is never a native input.
const legacy = read('tools/governance/published/governance-rule-bundle.v1.json');
const legacyRegistry = read('tools/governance/engineering-rule-adapters.json');
const registry = { schemaVersion: 1, adapters: native.adapters };
const withoutIdentity = ({ bundle: _bundle, ...report }) => report;
const withoutProposalIdentity = ({ bundleSemanticHash: _bundleSemanticHash, ...report }) => report;
const ACTIVE_MODULES = [
  'tools/governance/engineering-rule-adapter.mjs',
  'tools/governance/lib/engineering-rule-runner.mjs',
  'tools/governance/lib/engineering-rule-source.mjs',
  'tools/governance/lib/governance-rule-engineering-adapter.mjs',
  'tools/governance/lib/package-internal-boundary-runner.mjs',
  'tools/governance/lib/package-internal-boundary.mjs',
];
const ACTIVE_FILES = [
  ...ACTIVE_MODULES,
  'tools/governance/engineering-rules.json',
  'tools/governance/pinned-engineering-rules.json',
];

function filesUnder(root) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
    .sort();
}

function cli(root, mode) {
  return spawnSync(
    process.execPath,
    [
      '--permission',
      `--allow-fs-read=${root}`,
      '--import',
      path.join(root, 'deny-network.mjs'),
      path.join(root, 'tools/governance/engineering-rule-adapter.mjs'),
      '--source',
      'tools/governance/engineering-rules.json',
      '--mode',
      mode,
    ],
    { cwd: root, encoding: 'utf8', env: childEnv },
  );
}

describe('GOV-7902 parity and independent Engineering input', () => {
  it('preserves all five rules descriptive metadata and snippets with real-owner references', () => {
    expect(native.rules).toHaveLength(5);
    expect(legacy.rules).toHaveLength(5);
    for (const [i, rule] of native.rules.entries()) {
      const {
        provenance: _provenance,
        engineering: _engineering,
        liveReferenceLocation: _liveReferenceLocation,
        ...content
      } = legacy.rules[i];
      const { referencePath, ...newContent } = rule;
      expect(newContent).toEqual(content);
      expect(referencePath).not.toMatch(/governance/);
      expect(readFileSync(path.join(ROOT, referencePath), 'utf8').length).toBeGreaterThan(0);
    }
  });

  for (const status of ['passed', 'failed']) {
    it(`preserves check/report/proposal semantics for a ${status} runner`, async () => {
      const executeCheck = vi.fn(async () => ({
        status,
        exitCode: status === 'passed' ? 0 : 1,
        stdout: status === 'passed' ? 'audited 1 files' : '',
        stderr: status === 'failed' ? 'violation' : '',
      }));
      const oldReport = await runMappedEngineeringChecks({
        bundle: legacy,
        registry: legacyRegistry,
        executeCheck,
      });
      const newReport = await runEngineeringChecks({ source: native, registry, executeCheck });
      expect(executeCheck).toHaveBeenCalledTimes(2);
      expect(executeCheck.mock.calls[0]).toEqual(executeCheck.mock.calls[1]);
      expect(withoutIdentity(newReport)).toEqual(withoutIdentity(oldReport));
      expect(newReport.summary).toEqual({
        totalRules: 5,
        mappedRules: 1,
        unmappedRules: 4,
        failedChecks: status === 'failed' ? 1 : 0,
      });
      expect(newReport.rules.filter((rule) => rule.mapping === 'mapped')).toEqual([
        expect.objectContaining({
          ruleKey: 'DDD-003',
          enforcement: 'partial',
          check: expect.objectContaining({ status }),
        }),
      ]);
      expect(newReport.rules.filter((rule) => rule.mapping === 'unmapped')).toEqual(
        ['DDD-001', 'DDD-002', 'DDD-004', 'DDD-005'].map((ruleKey) =>
          expect.objectContaining({
            ruleKey,
            enforcement: 'none',
            check: null,
          }),
        ),
      );
      const proposal = createAutofixProposalReport({ report: newReport, registry });
      expect(withoutProposalIdentity(proposal)).toEqual(
        withoutProposalIdentity(
          createAutofixProposalReport({ report: oldReport, registry: legacyRegistry }),
        ),
      );
      expect(proposal.mutationPolicy).toBe('proposal-only');
      expect(proposal.proposals).toHaveLength(status === 'failed' ? 1 : 0);
      if (status === 'failed')
        expect(proposal.proposals[0]).toMatchObject({
          kind: 'review-required',
          directMutation: false,
        });
    });
  }

  it('audits exactly the active native dependency closure', () => {
    const closure = auditEngineeringInputDependencies(ROOT);
    expect(closure).toEqual([...ACTIVE_MODULES].sort());
    expect(closure).toContain('tools/governance/lib/engineering-rule-source.mjs');
    expect(closure).not.toContain('tools/governance/lib/published-rule-bundle.mjs');
    expect(closure).not.toContain('tools/governance/governance-rule-bundle-adapter.mjs');
    expect(
      closure.every((file) => !file.includes('__fixtures__') && !file.includes('legacy-')),
    ).toBe(true);
  });

  it('runs all modes on passing and failing Goal owner fixtures with only the active Engineering closure', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gov7902-independent-'));
    const compat = mkdtempSync(path.join(os.tmpdir(), 'gov7902-compat-'));
    try {
      for (const file of ACTIVE_FILES) {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        cpSync(path.join(ROOT, file), path.join(root, file));
      }
      expect(filesUnder(root)).toEqual([...ACTIVE_FILES].sort());
      // Node permissions deny filesystem writes and process/worker execution. Network APIs
      // are blocked explicitly because Node 24 permissions do not cover networking.
      writeFileSync(
        path.join(root, 'deny-network.mjs'),
        `
        import { syncBuiltinESMExports } from 'node:module';
        import http from 'node:http'; import https from 'node:https';
        import net from 'node:net'; import tls from 'node:tls'; import dgram from 'node:dgram';
        import dns from 'node:dns';
        const deny = () => { throw new Error('Network denied in native isolation'); };
        globalThis.fetch = deny; globalThis.WebSocket = deny;
        for (const api of [http, https]) { api.request = deny; api.get = deny; }
        net.connect = deny; net.createConnection = deny; net.Socket.prototype.connect = deny;
        tls.connect = deny; dgram.createSocket = deny;
        for (const api of [dns, dns.promises]) for (const key of Object.keys(api)) {
          if (key === 'lookup' || key.startsWith('resolve')) api[key] = deny;
        }
        syncBuiltinESMExports();
      `,
      );
      for (const absent of [
        'packages/governance',
        'packages/contracts',
        'packages/database',
        'tools/governance/published',
        'tools/governance/__fixtures__',
      ])
        expect(existsSync(path.join(root, absent))).toBe(false);
      for (const file of [
        ...ACTIVE_MODULES,
        'tools/governance/governance-rule-bundle-adapter.mjs',
        'tools/governance/lib/published-rule-bundle.mjs',
        'tools/governance/engineering-rule-adapters.json',
        'tools/governance/pinned-rule-bundles.json',
        'tools/governance/published/governance-rule-bundle.v1.json',
      ]) {
        mkdirSync(path.dirname(path.join(compat, file)), { recursive: true });
        cpSync(path.join(ROOT, file), path.join(compat, file));
      }
      cpSync(path.join(root, 'deny-network.mjs'), path.join(compat, 'deny-network.mjs'));
      const subject = path.join(root, 'packages/goal/src/server/domain/aggregates/goal.ts');
      mkdirSync(path.dirname(subject), { recursive: true });
      for (const failed of [false, true]) {
        const content =
          readFileSync(
            path.join(ROOT, 'packages/goal/src/server/domain/aggregates/goal.ts'),
            'utf8',
          ) + (failed ? "\nimport { prisma } from '@memoflow/database';\n" : '');
        writeFileSync(subject, content);
        const legacySubject = path.join(compat, path.relative(root, subject));
        mkdirSync(path.dirname(legacySubject), { recursive: true });
        writeFileSync(legacySubject, content);
        expect(executeEngineeringCheck(root, native.adapters[0])).toMatchObject({
          status: failed ? 'failed' : 'passed',
          exitCode: failed ? 1 : 0,
        });
        const result = runPackageInternalBoundaryAudit(root);
        const executeCheck = async () => ({
          status: result.passed ? 'passed' : 'failed',
          exitCode: result.passed ? 0 : 1,
          stdout: result.passed ? `audited ${result.auditedFiles} files` : '',
          stderr: result.passed ? '' : JSON.stringify(result.violations),
        });
        const oldReport = await runMappedEngineeringChecks({
          bundle: legacy,
          registry: legacyRegistry,
          executeCheck,
        });
        const newReport = await runEngineeringChecks({
          source: native,
          registry,
          executeCheck: (adapter) => executeEngineeringCheck(root, adapter),
        });
        expect(withoutIdentity(newReport)).toEqual(withoutIdentity(oldReport));
        expect(
          withoutProposalIdentity(createAutofixProposalReport({ report: newReport, registry })),
        ).toEqual(
          withoutProposalIdentity(
            createAutofixProposalReport({ report: oldReport, registry: legacyRegistry }),
          ),
        );
        for (const mode of ['check', 'report', 'autofix-proposal']) {
          const result = cli(root, mode);
          const legacyResult = spawnSync(
            process.execPath,
            [
              '--permission',
              `--allow-fs-read=${compat}`,
              '--import',
              path.join(compat, 'deny-network.mjs'),
              path.join(compat, 'tools/governance/governance-rule-bundle-adapter.mjs'),
              '--bundle',
              'tools/governance/published/governance-rule-bundle.v1.json',
              '--mode',
              mode,
            ],
            { cwd: compat, encoding: 'utf8', env: childEnv },
          );
          expect(legacyResult.status).toBe(result.status);
          expect(legacyResult.stderr).toBe('');
          if (mode === 'check')
            expect(result.stdout.split('\n').slice(1)).toEqual(
              legacyResult.stdout.split('\n').slice(1),
            );
          else if (mode === 'report')
            expect(withoutIdentity(JSON.parse(result.stdout))).toEqual(
              withoutIdentity(JSON.parse(legacyResult.stdout)),
            );
          else
            expect(withoutProposalIdentity(JSON.parse(result.stdout))).toEqual(
              withoutProposalIdentity(JSON.parse(legacyResult.stdout)),
            );
          expect(result.error).toBeUndefined();
          expect(result.stderr).toBe('');
          expect(result.status).toBe(mode === 'check' && failed ? 1 : 0);
          if (mode === 'check') {
            expect(result.stdout).toContain(`failed=${failed ? 1 : 0}`);
            expect(result.stdout).toContain(
              `DDD-003: package-internal-boundary [partial] ${failed ? 'failed' : 'passed'}`,
            );
          } else if (mode === 'report') {
            expect(withoutIdentity(JSON.parse(result.stdout))).toEqual(withoutIdentity(oldReport));
            expect(JSON.parse(result.stdout).summary).toEqual({
              totalRules: 5,
              mappedRules: 1,
              unmappedRules: 4,
              failedChecks: failed ? 1 : 0,
            });
          } else {
            const proposal = JSON.parse(result.stdout);
            expect(withoutProposalIdentity(proposal)).toEqual(
              withoutProposalIdentity(
                createAutofixProposalReport({ report: oldReport, registry: legacyRegistry }),
              ),
            );
            expect(proposal.mutationPolicy).toBe('proposal-only');
            expect(proposal.proposals).toHaveLength(failed ? 1 : 0);
            if (failed)
              expect(proposal.proposals[0]).toMatchObject({
                kind: 'review-required',
                directMutation: false,
              });
          }
          expect(readFileSync(subject, 'utf8')).toBe(content);
          for (const file of ACTIVE_FILES)
            expect(readFileSync(path.join(root, file))).toEqual(
              readFileSync(path.join(ROOT, file)),
            );
          expect(filesUnder(root)).toEqual(
            [...ACTIVE_FILES, 'deny-network.mjs', path.relative(root, subject)].sort(),
          );
        }
      }
      for (const code of [
        "require('node:fs').writeFileSync('forbidden', 'x')",
        "fetch('https://example.invalid')",
        "require('node:net').connect(443, 'example.invalid')",
      ]) {
        const denied = spawnSync(
          process.execPath,
          [
            '--permission',
            `--allow-fs-read=${root}`,
            '--import',
            path.join(root, 'deny-network.mjs'),
            '-e',
            code,
          ],
          { cwd: root, encoding: 'utf8', env: childEnv },
        );
        expect(denied.status).not.toBe(0);
        expect(denied.stderr).toMatch(/ERR_ACCESS_DENIED|Network denied/);
      }
      // A Product violation is ignored only by the native runner; global baseline stays strict.
      const product = path.join(root, 'packages/governance/src/server/domain/subject.ts');
      mkdirSync(path.dirname(product), { recursive: true });
      writeFileSync(product, "import { prisma } from '@memoflow/database';\n");
      writeFileSync(subject, 'export const value = 1;\n');
      expect(executeEngineeringCheck(root, native.adapters[0]).status).toBe('passed');
      expect(runPackageInternalBoundaryAudit(root).passed).toBe(false);
      const invalid = cli(root, 'apply');
      expect(invalid.status).toBe(1);
      expect(invalid.stderr).toContain('Unsupported mode: apply');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(compat, { recursive: true, force: true });
    }
  }, 30_000);

  it.each([
    ["import '@memoflow/governance';", /external dependency/],
    ["export * from './published/secret.mjs';", /forbidden (?:active dependency|input path)/],
    ["import('node:fs');", /dynamic module/],
    ["globalThis.fetch('https://example.invalid');", /network dependency/],
    ["const request = globalThis['fetch'];", /network dependency/],
    ["import { writeFileSync as write } from 'node:fs';", /read-only/],
    ["import * as fs from 'node:fs';", /read-only/],
    ["import { createRequire } from 'node:module';", /unsupported builtin/],
    ["export * from '../../../outside.mjs';", /forbidden active dependency/],
  ])('rejects active closure tampering: %s', (code, error) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gov7902-closure-'));
    try {
      mkdirSync(path.join(root, 'tools/governance'), { recursive: true });
      writeFileSync(path.join(root, ACTIVE_MODULES[0]), code);
      expect(() => auditEngineeringInputDependencies(root)).toThrow(error);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects closure symlink escapes and Product inputs added to a subject scanner', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gov7902-contained-'));
    const outside = mkdtempSync(path.join(os.tmpdir(), 'gov7902-outside-'));
    try {
      for (const file of ACTIVE_MODULES) {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        cpSync(path.join(ROOT, file), path.join(root, file));
      }
      const scanner = path.join(root, 'tools/governance/lib/package-internal-boundary-runner.mjs');
      writeFileSync(
        scanner,
        readFileSync(scanner, 'utf8') +
          "\nconst input = 'tools/governance/published/input.json';\n",
      );
      expect(() => auditEngineeringInputDependencies(root)).toThrow(/forbidden input path/);
      cpSync(path.join(ROOT, 'tools/governance/lib/package-internal-boundary-runner.mjs'), scanner);
      const entry = path.join(root, ACTIVE_MODULES[0]);
      rmSync(entry);
      const external = path.join(outside, 'entry.mjs');
      writeFileSync(external, '');
      symlinkSync(external, entry);
      expect(() => auditEngineeringInputDependencies(root)).toThrow(/escapes repository/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('checks native source and external pins without mutation', () => {
    const before = ACTIVE_FILES.map((file) => readFileSync(path.join(ROOT, file), 'utf8'));
    const result = spawnSync(
      process.execPath,
      ['tools/governance/engineering-rule-source-audit.mjs', '--check'],
      { cwd: ROOT, encoding: 'utf8', env: childEnv },
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(read('tools/governance/pinned-engineering-rules.json').sources).toEqual([
      {
        path: 'tools/governance/engineering-rules.json',
        semanticHash: computeEngineeringRuleHash(native),
      },
    ]);
    expect(ACTIVE_FILES.map((file) => readFileSync(path.join(ROOT, file), 'utf8'))).toEqual(before);
  });
});
