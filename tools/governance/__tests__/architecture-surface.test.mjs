/**
 * Architecture-surface audit mutation fixtures (RefArch Phase 6).
 * 架构表面审计 mutation fixtures（RefArch 阶段 6）。
 *
 * Every rule has a positive fixture (real code passes) and mutated negative
 * fixtures (removing an adapter injection, wiring the executor into the approve
 * path, or removing a receipt validator turns the audit red). The audit runs as
 * a child process against a temp root so deletions/bypasses are provably
 * detected rather than asserted by `toContain` on prose.
 *
 * 每条规则都有 positive fixture（真实代码通过）与 mutated negative fixture
 * （删除 adapter injection、在 approve path 接入 executor、移除 receipt
 * validator 都会让审计变红）。审计以子进程运行在临时根目录上，因此删除/绕过
 * 可被确实检测，而不是靠对 prose 的 `toContain` 断言。
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseSource,
  findInterfaceDeclaration,
  findClassDeclaration,
  classImplements,
  containsCallTo,
  containsStringLiteral,
  collectImports,
} from '../lib/architecture-surface.mjs';

const AUDIT_SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'architecture-surface-audit.mjs',
);

/** Runs the audit against a temp root + manifest; returns { status, stdout }.
 *  The manifest is written to a temp file (never into the root, so the
 *  positive real-code run does not pollute the repository).
 *  将 manifest 写入临时文件（绝不写入 root，避免 positive real-code run 污染仓库）。 */
function runAudit(tempRoot, manifest) {
  const manifestFile = path.join(mkdtempSync(path.join(os.tmpdir(), 'arch-surface-manifest-')), 'manifest.json');
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  const result = spawnSync(process.execPath, [AUDIT_SCRIPT], {
    env: {
      ...process.env,
      ARCHITECTURE_SURFACE_ROOT: tempRoot,
      ARCHITECTURE_SURFACE_MANIFEST: manifestFile,
    },
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

/** Creates a temp root from a set of relative file → content pairs. */
function createTempRoot(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'arch-surface-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

const PORT_FILE = `export interface GoalDependencyReadPort {
  readonly taskIds: string[];
}`;

const PROVIDER_OK = `import type { GoalDependencyReadPort } from './ports';
export class PrismaTaskBindingReadPort implements GoalDependencyReadPort {
  readonly taskIds: string[] = [];
}`;

const PROVIDER_MUTATED = `import type { GoalDependencyReadPort } from './ports';
export class PrismaTaskBindingReadPort {
  readonly taskIds: string[] = [];
}`;

function readPortManifest() {
  return {
    version: 1,
    readPorts: [
      {
        ruleId: 'READ_PORT_GOAL_TASK_BINDING',
        port: { symbol: 'GoalDependencyReadPort', file: 'contracts/ports.ts' },
        consumerDirs: ['consumer'],
        providers: [
          {
            file: 'task/prisma-task-binding-read-port.ts',
            class: 'PrismaTaskBindingReadPort',
          },
        ],
        injections: [
          {
            file: 'host/compose-goal.ts',
            refs: ['new PrismaTaskBindingReadPort(', 'taskBindingReadPort'],
          },
        ],
      },
    ],
    aiApproval: null,
    reliableReceipt: null,
  };
}

describe('lib predicates (positive fixtures)', () => {
  it('finds an exported interface declaration', () => {
    const source = parseSource(`export interface GoalDependencyReadPort {}`, 'p.ts');
    expect(findInterfaceDeclaration(source, 'GoalDependencyReadPort')).not.toBeNull();
  });

  it('detects class implements a port via the heritage clause', () => {
    const source = parseSource(PROVIDER_OK, 'p.ts');
    const classDecl = findClassDeclaration(source, 'PrismaTaskBindingReadPort');
    expect(classDecl).not.toBeNull();
    expect(classImplements(classDecl, 'GoalDependencyReadPort')).toBe(true);
  });

  it('detects a banned call inside a method body', () => {
    const source = parseSource(
      `class Facade { private async dispatchApprove() { await this.kernel.executeApproved('x', 1, 'r'); } }`,
      'f.ts',
    );
    const classDecl = findClassDeclaration(source, 'Facade');
    const method = classDecl.members[0];
    expect(containsCallTo(method.body, 'executeApproved')).toBe(true);
  });

  it('detects a banned capability literal', () => {
    const source = parseSource(`const kinds = ['tool.mutation'] as const;`, 'e.ts');
    expect(containsStringLiteral(source, 'tool.mutation')).toBe(true);
  });

  it('collects imported binding names', () => {
    const source = parseSource(
      `import { assertValidBusinessOperationReceipt, BusinessOperationReceipt } from '@memoflow/contracts/reliable-messaging';`,
      'a.ts',
    );
    const names = collectImports(source).flatMap((imp) => imp.names);
    expect(names).toContain('assertValidBusinessOperationReceipt');
    expect(names).toContain('BusinessOperationReceipt');
  });
});

describe('lib predicates (mutated negative fixtures)', () => {
  it('a class that dropped `implements` no longer satisfies the port', () => {
    const source = parseSource(PROVIDER_MUTATED, 'p.ts');
    const classDecl = findClassDeclaration(source, 'PrismaTaskBindingReadPort');
    expect(classDecl).not.toBeNull();
    expect(classImplements(classDecl, 'GoalDependencyReadPort')).toBe(false);
  });

  it('an approve path that never calls the executor stays lifecycle-only', () => {
    const source = parseSource(
      `class Facade { private async dispatchApprove() { return this.kernel.approve('x', 1); } }`,
      'f.ts',
    );
    const classDecl = findClassDeclaration(source, 'Facade');
    const method = classDecl.members[0];
    expect(containsCallTo(method.body, 'executeApproved')).toBe(false);
  });

  it('a turn engine without the mutation literal is safe', () => {
    const source = parseSource(`const kinds = ['tool.proposal'] as const;`, 'e.ts');
    expect(containsStringLiteral(source, 'tool.mutation')).toBe(false);
  });
});

describe('architecture-surface audit (positive real-code run)', () => {
  it('passes against the real repository manifest', () => {
    const result = runAudit(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
      JSON.parse(
        readFileSync(
          path.join(
            path.dirname(fileURLToPath(import.meta.url)),
            '..',
            'architecture-surface-manifest.json',
          ),
          'utf8',
        ),
      ),
    );
    expect(result.status).toBe(0);
  }, 120000);
});

describe('architecture-surface audit (mutated negative fixtures)', { timeout: 15_000 }, () => {
  it('removing an adapter `implements` clause makes the read-port rule red', () => {
    const root = createTempRoot({
      'contracts/ports.ts': PORT_FILE,
      'task/prisma-task-binding-read-port.ts': PROVIDER_MUTATED,
      'consumer/use-case.ts': `import type { GoalDependencyReadPort } from '../contracts/ports';
export function use(port: GoalDependencyReadPort): string[] { return port.taskIds; }`,
      'host/compose-goal.ts': `import { PrismaTaskBindingReadPort } from '../task/prisma-task-binding-read-port';
export function composeGoal() {
  const taskBindingReadPort = new PrismaTaskBindingReadPort();
  return { taskBindingReadPort };
}`,
    });
    try {
      const result = runAudit(root, readPortManifest());
      expect(result.status).toBe(1);
      expect(result.output).toMatch(/does not implement GoalDependencyReadPort/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a missing declared provider file fails closed', () => {
    const root = createTempRoot({
      'contracts/ports.ts': PORT_FILE,
      'consumer/use-case.ts': `import type { GoalDependencyReadPort } from '../contracts/ports';`,
      'host/compose-goal.ts': `export const taskBindingReadPort = {};`,
    });
    try {
      const result = runAudit(root, readPortManifest());
      expect(result.status).toBe(1);
      expect(result.output).toMatch(
        /provider file missing task\/prisma-task-binding-read-port\.ts/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a consumer that deep-imports the provider goes red', () => {
    const root = createTempRoot({
      'contracts/ports.ts': PORT_FILE,
      'task/prisma-task-binding-read-port.ts': PROVIDER_OK,
      'consumer/use-case.ts': `import { PrismaTaskBindingReadPort } from '../task/prisma-task-binding-read-port';
export const leaked = PrismaTaskBindingReadPort;`,
      'host/compose-goal.ts': `import { PrismaTaskBindingReadPort } from '../task/prisma-task-binding-read-port';
export function composeGoal() {
  const taskBindingReadPort = new PrismaTaskBindingReadPort();
  return { taskBindingReadPort };
}`,
    });
    try {
      const result = runAudit(root, readPortManifest());
      expect(result.status).toBe(1);
      expect(result.output).toMatch(/imports provider concrete infrastructure/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('wiring the executor into the approve path goes red', () => {
    const root = createTempRoot({
      'facade.ts': `export class AssistantFacade {
  private async dispatchApprove() {
    await this.kernel.executeApproved('prop-1', 2, 'req-1');
  }
}`,
    });
    const manifest = {
      version: 1,
      readPorts: [],
      aiApproval: {
        ruleId: 'AI_APPROVAL_LIFECYCLE_ONLY',
        assistantFacade: {
          file: 'facade.ts',
          class: 'AssistantFacade',
          lifecycleMethods: ['dispatchApprove', 'dispatchRevise', 'dispatchReject'],
          bannedCalls: ['executeApproved'],
        },
        turnEngines: { files: ['engine.ts'], bannedLiterals: ['tool.mutation'] },
        mutationCallers: { call: 'executeApproved', allowlist: ['kernel.ts'] },
      },
      reliableReceipt: null,
    };
    writeFileSync(
      path.join(root, 'engine.ts'),
      `export class DirectTurnEngine { readonly kind = 'engine.direct_turn'; }`,
    );
    try {
      const result = runAudit(root, manifest);
      expect(result.status).toBe(1);
      expect(result.output).toMatch(/dispatchApprove must not call executeApproved/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a turn engine offering the mutation literal goes red', () => {
    const root = createTempRoot({
      'engine.ts': `export const OFFERED = ['tool.mutation'] as const;`,
      'facade.ts': `export class AssistantFacade {
  private async dispatchApprove() { return; }
  private async dispatchRevise() { return; }
  private async dispatchReject() { return; }
}`,
    });
    const manifest = {
      version: 1,
      readPorts: [],
      aiApproval: {
        ruleId: 'AI_APPROVAL_LIFECYCLE_ONLY',
        assistantFacade: {
          file: 'facade.ts',
          class: 'AssistantFacade',
          lifecycleMethods: ['dispatchApprove', 'dispatchRevise', 'dispatchReject'],
          bannedCalls: ['executeApproved'],
        },
        turnEngines: { files: ['engine.ts'], bannedLiterals: ['tool.mutation'] },
        mutationCallers: { call: 'executeApproved', allowlist: ['kernel.ts'] },
      },
      reliableReceipt: null,
    };
    try {
      const result = runAudit(root, manifest);
      expect(result.status).toBe(1);
      expect(result.output).toMatch(/must not offer capability literal "tool\.mutation"/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('removing the receipt validator call goes red', () => {
    const root = createTempRoot({
      'contracts/receipt.ts': `export type BusinessOperationReceipt = { id: string };`,
      'contracts/ports.ts': `export function assertValidBusinessOperationReceipt(receipt: unknown) { return receipt as BusinessOperationReceipt; }`,
      'adapters/goal.ts': `import { assertValidBusinessOperationReceipt } from '../contracts/ports';
export function load() {
  return { id: 'x' };
}`,
    });
    const manifest = {
      version: 1,
      readPorts: [],
      aiApproval: null,
      reliableReceipt: {
        ruleId: 'RELIABLE_RECEIPT_CANONICAL',
        validatorFile: 'contracts/ports.ts',
        canonicalFiles: ['contracts/receipt.ts'],
        canonicalTypes: ['BusinessOperationReceipt'],
        validators: ['assertValidBusinessOperationReceipt'],
        receiptAdapters: ['adapters/goal.ts'],
      },
    };
    try {
      const result = runAudit(root, manifest);
      expect(result.status).toBe(1);
      expect(result.output).toMatch(/must import and call assertValidBusinessOperationReceipt/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a local duplicate canonical type goes red', () => {
    const root = createTempRoot({
      'contracts/receipt.ts': `export type BusinessOperationReceipt = { id: string };`,
      'contracts/ports.ts': `export function assertValidBusinessOperationReceipt(receipt: unknown) { return receipt; }`,
      'adapters/goal.ts': `import { assertValidBusinessOperationReceipt } from '../contracts/ports';
export function load() {
  return assertValidBusinessOperationReceipt({ id: 'x' });
}`,
      'adapters/local.ts': `export type BusinessOperationReceipt = { local: true };`,
    });
    const manifest = {
      version: 1,
      readPorts: [],
      aiApproval: null,
      reliableReceipt: {
        ruleId: 'RELIABLE_RECEIPT_CANONICAL',
        validatorFile: 'contracts/ports.ts',
        canonicalFiles: ['contracts/receipt.ts'],
        canonicalTypes: ['BusinessOperationReceipt'],
        validators: ['assertValidBusinessOperationReceipt'],
        receiptAdapters: ['adapters/goal.ts'],
      },
    };
    try {
      const result = runAudit(root, manifest);
      expect(result.status).toBe(1);
      expect(result.output).toMatch(
        /defines a local duplicate of canonical type BusinessOperationReceipt/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
