import { describe, it, expect } from 'vitest';
import {
  findBoundaryViolations,
  getWithinPackageLayer,
  shouldSkipSourceFile,
} from '../lib/package-internal-boundary.mjs';

const APPLICATION_RULE = {
  layer: 'server/application',
  forbidden: ['server/transport', 'server/infrastructure', 'client', 'electron', 'api'],
  forbiddenExternalSpecifiers: ['@memoflow/database', '@prisma/client'],
};

const DOMAIN_RULE = {
  layer: 'server/domain',
  forbidden: [
    'server/application',
    'server/transport',
    'server/infrastructure',
    'client',
    'electron',
    'api',
  ],
  forbiddenExternalSpecifiers: ['@memoflow/database', '@prisma/client'],
};

describe('findBoundaryViolations — forbidden external @memoflow/database', () => {
  it('flags `import type { PrismaClient } from "@memoflow/database"` in server/application', () => {
    const content = [
      "import type { PrismaClient } from '@memoflow/database';",
      '',
      'export const create = async (db: PrismaClient) => db.user.findMany();',
    ].join('\n');
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/goal/src/server/application/use-cases/commands/relation.use-cases.ts',
      ...APPLICATION_RULE,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      file: 'packages/goal/src/server/application/use-cases/commands/relation.use-cases.ts',
      line: 1,
      layer: 'server/application',
      specifier: '@memoflow/database',
    });
  });

  it('flags `import { PrismaClient } from "@memoflow/database"` in server/domain', () => {
    const content =
      "import { PrismaClient } from '@memoflow/database';\n\nexport const x: PrismaClient | null = null;\n";
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/foo/src/server/domain/repositories/i-repository.ts',
      ...DOMAIN_RULE,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].layer).toBe('server/domain');
    expect(violations[0].specifier).toBe('@memoflow/database');
    expect(violations[0].message).toContain("forbidden external specifier '@memoflow/database'");
  });

  it('flags dynamic `import("@memoflow/database")` in server/application', () => {
    const content = "const db = await import('@memoflow/database');\n";
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/foo/src/server/application/lazy.ts',
      ...APPLICATION_RULE,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].specifier).toBe('@memoflow/database');
  });

  it('flags bare side-effect `import "@memoflow/database"` in server/application', () => {
    const content = "import '@memoflow/database';\n";
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/foo/src/server/application/bootstrap-db.ts',
      ...APPLICATION_RULE,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      file: 'packages/foo/src/server/application/bootstrap-db.ts',
      line: 1,
      layer: 'server/application',
      specifier: '@memoflow/database',
    });
  });

  it('flags bare side-effect `import "@memoflow/database"` in server/domain', () => {
    const content = "import '@memoflow/database';\n";
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/foo/src/server/domain/setup.ts',
      ...DOMAIN_RULE,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].layer).toBe('server/domain');
    expect(violations[0].specifier).toBe('@memoflow/database');
  });

  it('flags subpath `import { prisma } from "@memoflow/database/prisma"` in server/application', () => {
    const content =
      "import { prisma } from '@memoflow/database/prisma';\n\nexport const client = prisma;\n";
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/foo/src/server/application/db/prisma.ts',
      ...APPLICATION_RULE,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      file: 'packages/foo/src/server/application/db/prisma.ts',
      layer: 'server/application',
      specifier: '@memoflow/database/prisma',
    });
    expect(violations[0].message).toContain(
      "forbidden external specifier '@memoflow/database/prisma'",
    );
  });

  it('flags deeper subpath `import type ... from "@memoflow/database/prisma/generated"` in server/domain', () => {
    const content = "import type { PrismaClient } from '@memoflow/database/prisma/generated';\n";
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/foo/src/server/domain/repositories/i-repository.ts',
      ...DOMAIN_RULE,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].specifier).toBe('@memoflow/database/prisma/generated');
  });

  it('flags bare side-effect `import "@memoflow/database/prisma"` in server/domain', () => {
    const content = "import '@memoflow/database/prisma';\n";
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/foo/src/server/domain/setup.ts',
      ...DOMAIN_RULE,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].specifier).toBe('@memoflow/database/prisma');
  });

  it('flags `import { PrismaClient } from "@prisma/client"` in server/application', () => {
    const content =
      "import { PrismaClient } from '@prisma/client';\n\nexport const create = async (db: PrismaClient) => db.user.findMany();\n";
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/goal/src/server/application/use-cases/commands/relation.use-cases.ts',
      ...APPLICATION_RULE,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      file: 'packages/goal/src/server/application/use-cases/commands/relation.use-cases.ts',
      line: 1,
      layer: 'server/application',
      specifier: '@prisma/client',
    });
    expect(violations[0].message).toContain("forbidden external specifier '@prisma/client'");
  });

  it('flags `import { PrismaClient } from "@prisma/client"` in server/domain', () => {
    const content =
      "import { PrismaClient } from '@prisma/client';\n\nexport const x: PrismaClient | null = null;\n";
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/foo/src/server/domain/repositories/i-repository.ts',
      ...DOMAIN_RULE,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      layer: 'server/domain',
      specifier: '@prisma/client',
    });
  });
});

describe('findBoundaryViolations — positive cases', () => {
  it('allows server/application importing domain Port / contracts / utils', () => {
    const content = [
      "import type { IRelationRepository, RelationDTO } from '../../domain/repositories';",
      "import { SomeContractType } from '@memoflow/contracts/goal';",
      "import { someUtil } from '@memoflow/utils';",
      "import { localHelper } from './local-helper';",
    ].join('\n');
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/goal/src/server/application/use-cases/commands/relation.use-cases.ts',
      ...APPLICATION_RULE,
    });
    expect(violations).toEqual([]);
  });

  it('allows server/domain importing from itself and shared layers', () => {
    const content = [
      "import type { SubjectRef } from '../aggregates/subject';",
      "import { ValueObject } from '@memoflow/domain-shared';",
    ].join('\n');
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/goal/src/server/domain/repositories/i-relation-repository.ts',
      ...DOMAIN_RULE,
    });
    expect(violations).toEqual([]);
  });

  it('allows bare side-effect `import "@memoflow/utils"` in server/domain', () => {
    const content = "import '@memoflow/utils';\n";
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/goal/src/server/domain/side-effect.ts',
      ...DOMAIN_RULE,
    });
    expect(violations).toEqual([]);
  });

  it('allows bare side-effect `import "@memoflow/utils"` in server/application', () => {
    const content = "import '@memoflow/utils';\n";
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/goal/src/server/application/side-effect.ts',
      ...APPLICATION_RULE,
    });
    expect(violations).toEqual([]);
  });

  it('allows `@memoflow/database` in server/infrastructure (rule has no forbidden external specifiers)', () => {
    const content = "import { prisma } from '@memoflow/database';\n";
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/foo/src/server/infrastructure/adapters/prisma.ts',
      layer: 'server/infrastructure',
      forbidden: ['client', 'electron', 'api'],
      forbiddenExternalSpecifiers: [],
    });
    expect(violations).toEqual([]);
  });

  it('allows `@prisma/client` in server/infrastructure (rule has no forbidden external specifiers)', () => {
    const content = "import { PrismaClient } from '@prisma/client';\n";
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/foo/src/server/infrastructure/adapters/prisma.ts',
      layer: 'server/infrastructure',
      forbidden: ['client', 'electron', 'api'],
      forbiddenExternalSpecifiers: [],
    });
    expect(violations).toEqual([]);
  });

  it('does not flag specifiers that merely share a prefix with the forbidden root', () => {
    const content = [
      "import { x } from '@memoflow/databaseX';",
      "import { schema } from '@memoflow/database-schema';",
    ].join('\n');
    const violations = findBoundaryViolations({
      content,
      relPath: 'packages/foo/src/server/application/unrelated.ts',
      ...APPLICATION_RULE,
    });
    expect(violations).toEqual([]);
  });
});

describe('shouldSkipSourceFile — test fixture exclusion', () => {
  it('skips *.spec.ts, *.test.ts and __tests__ paths', () => {
    expect(
      shouldSkipSourceFile('relation.use-cases.spec.ts', '/x/relation.use-cases.spec.ts'),
    ).toBe(true);
    expect(shouldSkipSourceFile('prisma.test.ts', '/x/prisma.test.ts')).toBe(true);
    expect(shouldSkipSourceFile('index.ts', '/x/__tests__/index.ts')).toBe(true);
  });

  it('does not skip production files (fixture exclusion only)', () => {
    expect(shouldSkipSourceFile('relation.use-cases.ts', '/x/relation.use-cases.ts')).toBe(false);
    expect(
      shouldSkipSourceFile('prisma.repository.ts', '/x/infrastructure/prisma.repository.ts'),
    ).toBe(false);
  });
});

describe('getWithinPackageLayer', () => {
  it('resolves in-package server layer targets', () => {
    expect(getWithinPackageLayer('@/server/infrastructure')).toBe('server/infrastructure');
    expect(getWithinPackageLayer('../../server/infrastructure')).toBe('server/infrastructure');
    expect(getWithinPackageLayer('@/server/transport')).toBe('server/transport');
  });

  it('returns null for external specifiers', () => {
    expect(getWithinPackageLayer('@memoflow/database')).toBeNull();
    expect(getWithinPackageLayer('@memoflow/contracts/goal')).toBeNull();
  });
});
