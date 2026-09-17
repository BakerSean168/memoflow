/**
 * API module shared-handle contract surface (RefArch Phase 6).
 * API 模块共享 handle 契约表面（RefArch 阶段 6）。
 *
 * Scans every audited feature api module plus the app-local PowerSync/Dashboard
 * modules: each `*ApiModuleDef` binds the shared `ServerModuleHandle`, and no
 * module reads `context.db`, imports Prisma, or constructs repositories / module
 * instances inside `register()`. The registration context is transport-only, so
 * deleting an `extends ServerModuleHandle` or reintroducing `context.db` turns
 * this suite red.
 *
 * 扫描所有被审计的 feature api 模块及 app-local PowerSync/Dashboard 模块：
 * 每个 `*ApiModuleDef` 绑定共享 `ServerModuleHandle`，且任何模块都不读取
 * `context.db`、不 import Prisma、不在 `register()` 内构造 repository/模块实例。
 * 注册上下文仅含 transport，因此删除 `extends ServerModuleHandle` 或重新引入
 * `context.db` 都会让本套件变红。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '../../../../..');

const FEATURE_API_MODULES = [
  'governance',
  'goal',
  'task',
  'account',
  'ai',
  'data-portability',
  'notification',
  'repository',
  'schedule',
  'setting',
].map((pkg) => resolve(REPO_ROOT, `packages/${pkg}/src/api/module.ts`));

const ROUTINE_TRANSPORT_MARKER = resolve(REPO_ROOT, 'packages/reminder/src/api/module.ts');

const APP_LOCAL_MODULES = [
  resolve(REPO_ROOT, 'apps/api/src/modules/powersync/module.ts'),
  resolve(REPO_ROOT, 'apps/api/src/modules/dashboard/module.ts'),
];

/** Strips comments so prose about `context.db` never trips the code assertions.
 *  剥离注释，使关于 `context.db` 的 prose 不会触发代码断言。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('feature api modules shared-handle contract (Phase 6)', () => {
  for (const modulePath of FEATURE_API_MODULES) {
    const fileName = modulePath.slice(REPO_ROOT.length + 1);
    const source = stripComments(readFileSync(modulePath, 'utf8'));

    it(`${fileName}: binds the shared ServerModuleHandle and exposes no db/prisma`, () => {
      expect(source).toMatch(/extends ServerModuleHandle</);
      expect(source).not.toMatch(/context\.db/);
      expect(source).not.toMatch(/ctx\.db/);
      expect(source).not.toMatch(/\bPrismaClient\b/);
      expect(source).not.toMatch(/from '@memoflow\/database'/);
    });

    it(`${fileName}: does not construct repositories or module instances in register`, () => {
      expect(source).not.toMatch(/create[A-Za-z]+PrismaRepositories\(/);
      expect(source).not.toMatch(/create[A-Za-z]+PrismaModule\(/);
      expect(source).not.toMatch(/new Prisma[A-Za-z]+\(/);
    });
  }

  it('Routine keeps the audited package marker without resurrecting legacy Reminder HTTP transport', () => {
    const source = stripComments(readFileSync(ROUTINE_TRANSPORT_MARKER, 'utf8'));
    expect(source).toContain('export {}');
    expect(source).not.toMatch(/extends ServerModuleHandle</);
    expect(source).not.toMatch(/register\s*\(/);
    expect(source).not.toMatch(/router\./);
    expect(source).not.toMatch(/context\.db|ctx\.db|\bPrismaClient\b/);
  });

  for (const modulePath of APP_LOCAL_MODULES) {
    const fileName = modulePath.slice(REPO_ROOT.length + 1);
    const source = stripComments(readFileSync(modulePath, 'utf8'));

    it(`${fileName}: returns an IApiModule handle and exposes no db/prisma`, () => {
      // App-local factories return `IApiModule`, which itself extends the
      // shared ServerModuleHandle contract.
      expect(source).toMatch(/: IApiModule/);
      expect(source).not.toMatch(/context\.db/);
      expect(source).not.toMatch(/ctx\.db/);
      expect(source).not.toMatch(/\bPrismaClient\b/);
      expect(source).not.toMatch(/ServerModuleContext</);
    });
  }

  it('the IApiModuleContext itself extends the canonical transport context', () => {
    const contracts = stripComments(
      readFileSync(resolve(REPO_ROOT, 'apps/api/src/shared/contracts/api-module.ts'), 'utf8'),
    );
    expect(contracts).toMatch(/IApiModuleContext extends ServerTransportModuleContext/);
    expect(contracts).toMatch(/IApiModule extends ServerModuleHandle<IApiModuleContext>/);
    expect(contracts).not.toMatch(/context\s*:\s*\{[^}]*db/);
  });
});
