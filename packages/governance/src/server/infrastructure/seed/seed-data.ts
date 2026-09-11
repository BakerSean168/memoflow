/**
 * Governance seed data for local examples and demo environments.
 * 治理模块在本地示例与演示环境中的种子数据。
 *
 * Seeds curated rules that mirror the repository's current architectural
 * conventions, so the module can stay a runnable example instead of a dead README.
 * 写入一组反映仓库当前架构约定的精选规则，
 * 让该模块保持“可运行示例”，而不是停留在静态 README。
 */
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { prisma } from '@memoflow/database';
import { Language } from '@memoflow/contracts/governance';
import { RuleSeverity } from '@memoflow/contracts/governance';
import { RuleStatus } from '@memoflow/contracts/governance';
import { SnippetType } from '@memoflow/contracts/governance';

/**
 * In-memory seed snippet shape before persistence serialization.
 * 持久化序列化之前的内存种子代码片段结构。
 */
interface SeedCodeSnippet {
  language: string;
  content: string;
  type: string;
  caption: string | null;
}

/**
 * In-memory seed rule shape before Prisma upsert.
 * Prisma upsert 之前的内存种子规则结构。
 */
const GOVERNANCE_SEED_AUTHOR_ID = '00000000-0000-4000-8000-000000000001';

interface SeedRule {
  code: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  tags: string[];
  liveReferenceLocation: string;
  goodExamples: SeedCodeSnippet[];
  badExamples: SeedCodeSnippet[];
}

/**
 * Builds one seed code snippet record.
 * 构造单条种子代码片段记录。
 */
const makeSnippet = (
  language: string,
  type: string,
  content: string,
  caption: string,
): SeedCodeSnippet => ({
  language,
  type,
  content,
  caption,
});

/**
 * Canonical rule examples used by the governance demo module.
 * 治理示范模块使用的规范规则样例。
 */
export const GOVERNANCE_SEED_RULES: SeedRule[] = [
  {
    code: 'DDD-001',
    title: 'Entity Props Pattern',
    description: 'Entities MUST encapsulate constructor arguments inside a dedicated Props object to keep signatures stable and explicit.',
    severity: RuleSeverity.Mandatory,
    status: RuleStatus.Active,
    tags: ['ddd', 'entity', 'architecture', 'consistency'],
    liveReferenceLocation: 'packages/governance/src/server/domain/aggregates/rule.ts',
    goodExamples: [
      makeSnippet(
        Language.TypeScript,
        SnippetType.GoodExample,
        `interface RuleProps {
  code: string;
  title: string;
}

class Rule {
  private constructor(private readonly props: RuleProps) {}
}
`,
        'Entity constructor receives a single props object.',
      ),
    ],
    badExamples: [
      makeSnippet(
        Language.TypeScript,
        SnippetType.BadExample,
        `class Rule {
  constructor(
    private readonly code: string,
    private readonly title: string,
    private readonly description: string,
    private readonly severity: string,
  ) {}
}
`,
        'Long positional constructor arguments are fragile and error-prone.',
      ),
    ],
  },
  {
    code: 'DDD-002',
    title: 'No Logic in DTOs',
    description: 'DTOs MUST remain pure data contracts. Validation and business rules belong to Value Objects, Entities, and Use Cases.',
    severity: RuleSeverity.Mandatory,
    status: RuleStatus.Active,
    tags: ['ddd', 'dto', 'contracts', 'separation-of-concerns'],
    liveReferenceLocation: 'packages/contracts/src/modules/governance/aggregates/rule-client.ts',
    goodExamples: [
      makeSnippet(
        Language.TypeScript,
        SnippetType.GoodExample,
        `export interface CreateRuleReq {
  code: string;
  title: string;
  description: string;
}
`,
        'DTO remains a pure shape declaration.',
      ),
    ],
    badExamples: [
      makeSnippet(
        Language.TypeScript,
        SnippetType.BadExample,
        `export class CreateRuleReq {
  constructor(public code: string) {}

  normalizeCode(): string {
    return this.code.trim().toUpperCase();
  }
}
`,
        'Behavior in DTOs creates hidden domain logic in the wrong layer.',
      ),
    ],
  },
  {
    code: 'DDD-003',
    title: 'Layer Isolation',
    description: 'Domain and application layers MUST not directly depend on infrastructure details such as Prisma clients or HTTP adapters.',
    severity: RuleSeverity.Mandatory,
    status: RuleStatus.Active,
    tags: ['ddd', 'layering', 'infrastructure', 'dependency-inversion'],
    liveReferenceLocation: 'packages/governance/src/server/domain/repositories/i-rule-repository.ts',
    goodExamples: [
      makeSnippet(
        Language.TypeScript,
        SnippetType.GoodExample,
        `export interface IRuleRepository {
  findByCode(code: string): Promise<Rule | null>;
}

class SearchRulesUseCase {
  constructor(private readonly repo: IRuleRepository) {}
}
`,
        'Use case depends on abstraction, not infrastructure.',
      ),
    ],
    badExamples: [
      makeSnippet(
        Language.TypeScript,
        SnippetType.BadExample,
        `import { prisma } from '@memoflow/database';

class SearchRulesUseCase {
  async execute(code: string) {
    return prisma.rule.findUnique({ where: { code } });
  }
}
`,
        'Application layer is tightly coupled to persistence implementation.',
      ),
    ],
  },
  {
    code: 'DDD-004',
    title: 'Value Object Collections',
    description: 'Collections in aggregates MUST use Value Objects for normalization and invariants instead of passing primitive strings directly.',
    severity: RuleSeverity.Recommended,
    status: RuleStatus.Active,
    tags: ['ddd', 'value-object', 'collection', 'invariants'],
    liveReferenceLocation: 'packages/governance/src/server/domain/value-objects/rule-tag.ts',
    goodExamples: [
      makeSnippet(
        Language.TypeScript,
        SnippetType.GoodExample,
        `class Rule {
  private tags = new Set<RuleTag>();

  addTag(raw: string) {
    this.tags.add(RuleTag.create(raw));
  }
}
`,
        'RuleTag enforces normalization for every collection entry.',
      ),
    ],
    badExamples: [
      makeSnippet(
        Language.TypeScript,
        SnippetType.BadExample,
        `class Rule {
  private tags: string[] = [];

  addTag(raw: string) {
    this.tags.push(raw);
  }
}
`,
        'Primitive collection bypasses normalization and duplicate checks.',
      ),
    ],
  },
  {
    code: 'DDD-005',
    title: 'Factory Method Pattern',
    description: 'Aggregates MUST expose static factory methods and hide constructors to guarantee invariant validation at creation time.',
    severity: RuleSeverity.Recommended,
    status: RuleStatus.Active,
    tags: ['ddd', 'factory-method', 'aggregate', 'invariants'],
    liveReferenceLocation: 'packages/governance/src/server/domain/entities/rule-revision.ts',
    goodExamples: [
      makeSnippet(
        Language.TypeScript,
        SnippetType.GoodExample,
        `class RuleRevision {
  private constructor(private readonly props: RuleRevisionProps) {}

  static create(props: RuleRevisionProps): RuleRevision {
    return new RuleRevision(props);
  }
}
`,
        'Factory method centralizes creation and validation flow.',
      ),
    ],
    badExamples: [
      makeSnippet(
        Language.TypeScript,
        SnippetType.BadExample,
        `class RuleRevision {
  constructor(public readonly props: RuleRevisionProps) {}
}
`,
        'Public constructor allows bypassing validation and lifecycle controls.',
      ),
    ],
  },
];

/**
 * Serializes snippet records into the persistence JSON shape.
 * 将代码片段记录序列化为持久化 JSON 结构。
 */
const toPersistenceSnippets = (snippets: SeedCodeSnippet[]): string => JSON.stringify(
  snippets.map((snippet) => ({
    id: randomUUID(),
    language: snippet.language,
    content: snippet.content,
    type: snippet.type,
    caption: snippet.caption,
  })),
);

/**
 * Upserts governance seed rules into the backing database.
 * 将治理种子规则 upsert 到底层数据库。
  * @param authorId - 
  * @returns any - 
 */
export async function seedGovernanceRules(authorId = GOVERNANCE_SEED_AUTHOR_ID): Promise<number> {
  for (const rule of GOVERNANCE_SEED_RULES) {
    await prisma.rule.upsert({
      where: { code: rule.code },
      create: {
        code: rule.code,
        title: rule.title,
        description: rule.description,
        severity: rule.severity,
        status: rule.status,
        tags: JSON.stringify(rule.tags),
        goodExamples: toPersistenceSnippets(rule.goodExamples),
        badExamples: toPersistenceSnippets(rule.badExamples),
        authorId,
        liveReferenceLocation: rule.liveReferenceLocation,
      },
      update: {
        title: rule.title,
        description: rule.description,
        severity: rule.severity,
        status: rule.status,
        tags: JSON.stringify(rule.tags),
        goodExamples: toPersistenceSnippets(rule.goodExamples),
        badExamples: toPersistenceSnippets(rule.badExamples),
        authorId,
        liveReferenceLocation: rule.liveReferenceLocation,
      },
    });
  }

  return GOVERNANCE_SEED_RULES.length;
}

const shouldRunAsScript = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (shouldRunAsScript) {
  seedGovernanceRules()
    .then((count) => {
      console.log(`[governance:seed] Seeded ${count} governance rules`);
    })
    .catch((err) => {
      console.error('[governance:seed] Failed to seed governance rules:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}


