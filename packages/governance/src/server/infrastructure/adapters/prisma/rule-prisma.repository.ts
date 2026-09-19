/**
 * RulePrismaRepository — Prisma-backed IRuleRepository implementation.
 * RulePrismaRepository —— 基于 Prisma 的 IRuleRepository 实现。
 *
 * Implements IRuleRepository using Prisma ORM with PostgreSQL/SQLite.
 * 使用 Prisma ORM（PostgreSQL/SQLite）实现 IRuleRepository 接口。
 *
 * Key characteristics:
 * 主要特性：
 * - Upsert semantics: save() handles both insert and update
 *   Upsert 语义：save() 同时处理插入和更新
 * - Atomic saveWithRevision: rule + revision persisted in a single transaction
 *   原子化 saveWithRevision：规则 + 修订版本在单个事务中持久化
 * - Throws structured errors on infrastructure failure
 *   基础设施失败时抛出结构化异常
 * - Filter support: status (single/array), severity, tags (OR logic)
 *   过滤支持：状态（单值/数组）、严重级别、标签（OR 逻辑）
 *
 * @internal Concrete Prisma implementation — consumers should use IRuleRepository interface.
 * @internal Prisma 具体实现 —— 消费方应使用 IRuleRepository 接口。
 */

import type { Prisma, PrismaClient } from '@memoflow/database';
import type {
  IRuleRepository,
  RuleFilter,
} from '../../../domain/repositories/i-rule-repository';
import type { Rule } from '../../../domain/aggregates/rule';
import type { RuleRevision } from '../../../domain/entities/rule-revision';
import { RuleId } from '../../../domain/value-objects/rule-id';
import { toResultErrorException } from '@memoflow/contracts/result';
import { mapInfraErrorToResultError } from '@memoflow/utils/errors';
import { RulePrismaMapper } from './mappers/rule-prisma.mapper';
import { RuleRevisionPrismaMapper } from './mappers/rule-revision-prisma.mapper';
import { createEventBusAdapter, publishAggregateEvents } from '@memoflow/patterns';
import { eventBus } from '@memoflow/utils/domain';

const eventBusAdapter = createEventBusAdapter(eventBus);

/**
 * Prisma Rule Repository
 *
 * Uses PrismaClient for database access
  * @param prismaClient - 
 */
export class RulePrismaRepository implements IRuleRepository {
  private readonly prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  /**
   * Saves a rule (upsert: insert if new, update if existing).
   * 保存规则（存在则更新，不存在则插入）。
   *
   * Uses Prisma upsert to handle both cases in a single operation.
   * 使用 Prisma upsert 在单次操作中处理两种情况。
   *
   * @param rule - Domain Rule aggregate to persist 要持久化的领域规则聚合根
   */
  async save(rule: Rule): Promise<void> {
    try {
      const prismaData = RulePrismaMapper.toPersistence(rule);

      await this.prisma.rule.upsert({
        where: { id: rule.id },
        create: {
          ...prismaData,
          id: rule.id,
          createdAt: rule.createdAt,
          updatedAt: rule.updatedAt,
        },
        update: {
          ...prismaData,
          updatedAt: rule.updatedAt,
        },
      });

      await publishAggregateEvents(rule, { eventBus: eventBusAdapter });
    } catch (err) {
      throw toResultErrorException(mapInfraErrorToResultError(err, 'Failed to save rule'));
    }
  }

  /**
   * Atomically saves a rule and its associated revision in a single transaction.
   * 在单个事务中原子化保存规则及其关联的修订版本。
   *
   * Uses Prisma interactive transaction to ensure both operations succeed or fail together.
   * 使用 Prisma 交互式事务确保两个操作同时成功或失败。
   *
   * @param rule - Domain Rule aggregate 领域规则聚合根
   * @param revision - Associated RuleRevision entity 关联的修订版本实体
   */
  async saveWithRevision(rule: Rule, revision: RuleRevision): Promise<void> {
    try {
      const prismaData = RulePrismaMapper.toPersistence(rule);

      const revisionData = RuleRevisionPrismaMapper.toPersistence(revision);

      await this.prisma.$transaction(async (tx) => {
        await tx.rule.upsert({
          where: { id: rule.id },
          create: {
            ...prismaData,
            id: rule.id,
            createdAt: rule.createdAt,
            updatedAt: rule.updatedAt,
          },
          update: {
            ...prismaData,
            updatedAt: rule.updatedAt,
          },
        });

        await tx.ruleRevision.create({ data: revisionData });
      });

      await publishAggregateEvents(rule, { eventBus: eventBusAdapter });
    } catch (err) {
      throw toResultErrorException(
        mapInfraErrorToResultError(err, 'Failed to save rule with revision'),
      );
    }
  }

  /**
   * Finds a rule by its unique ID.
   * 根据唯一 ID 查找规则。
   *
   * @param id - Rule ID (branded type) 规则 ID（品牌类型）
   * @returns The Rule or null if not found 返回规则，未找到时返回 null
   */
  async findById(id: RuleId): Promise<Rule | null> {
    try {
      const prismaRule = await this.prisma.rule.findUnique({
        where: { id },
      });

      if (!prismaRule) {
        return null;
      }

      return RulePrismaMapper.toDomain(prismaRule);
    } catch (err) {
      throw toResultErrorException(mapInfraErrorToResultError(err, 'Failed to find rule by ID'));
    }
  }

  /**
   * Finds a rule by its unique code (e.g. 'DDD-001').
   * 根据唯一代码查找规则（例如 'DDD-001'）。
   *
   * @param code - Rule code string 规则代码字符串
   * @returns The Rule or null if not found 返回规则，未找到时返回 null
   */
  async findByCode(code: string): Promise<Rule | null> {
    try {
      const prismaRule = await this.prisma.rule.findUnique({
        where: { code },
      });

      if (!prismaRule) {
        return null;
      }

      return RulePrismaMapper.toDomain(prismaRule);
    } catch (err) {
      throw toResultErrorException(
        mapInfraErrorToResultError(err, 'Failed to find rule by code'),
      );
    }
  }

  /**
   * Retrieves all rules, optionally filtered by status/severity/tags.
   * 获取所有规则，可按状态/严重级别/标签过滤。
   *
   * Results are ordered by updatedAt DESC (most recently updated first).
   * 结果按 updatedAt 降序排列（最近更新的排在前面）。
   *
   * Filter semantics:
   * 过滤语义：
   * - status: single value or array (IN clause) 状态：单值或数组（IN 子句）
   * - severity: exact match 严重级别：精确匹配
   * - tags: OR logic — matches if any tag matches (JSON contains)
   *   标签：OR 逻辑 —— 匹配任一标签即可（JSON 包含匹配）
   *
   * @param filter - Optional filter criteria 可选的过滤条件
   * @returns Array of Rule aggregates 规则聚合数组
   */
  async findAll(filter?: RuleFilter): Promise<Rule[]> {
    try {
      const where: Prisma.RuleWhereInput = {};

      // Filter by status
      if (filter?.status) {
        if (Array.isArray(filter.status)) {
          where.status = { in: filter.status };
        } else {
          where.status = filter.status;
        }
      }

      // Filter by severity
      if (filter?.severity) {
        where.severity = filter.severity;
      }

      // Filter by tags (JSON contains)
      // Note: SQLite JSON support is limited, so we use string matching
      if (filter?.tags && filter.tags.length > 0) {
        // For each tag, check if it's in the tags JSON array
        // This is a simplified approach; production might need full-text search
        const tagConditions: Prisma.RuleWhereInput[] = filter.tags.map((tag) => ({
          tags: { contains: `"${tag}"` },
        }));
        where.OR = tagConditions;
      }

      const prismaRules = await this.prisma.rule.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
      });

      return RulePrismaMapper.toDomainMany(prismaRules);
    } catch (err) {
      throw toResultErrorException(mapInfraErrorToResultError(err, 'Failed to find rules'));
    }
  }

  /**
   * Searches rules by keyword across code, title, description, and tags.
   * 通过关键词在代码、标题、描述和标签中搜索规则。
   *
   * Keyword conditions use OR (match any field).
   * Tag filter conditions are ANDed with keywords (must satisfy both).
   * 关键词条件使用 OR（匹配任一字段）。
   * 标签过滤条件与关键词使用 AND（必须同时满足）。
   *
   * @param query - Search keyword 搜索关键词
   * @param filter - Optional additional filters 可选的附加过滤条件
   * @returns Matched Rule aggregates 匹配到的规则聚合数组
   */
  async search(query: string, filter?: RuleFilter): Promise<Rule[]> {
    try {
      const keyword = query.trim();
      if (keyword.length === 0) {
        return [];
      }

      const keywordConditions: Prisma.RuleWhereInput[] = [
        { code: { contains: keyword, mode: 'insensitive' } },
        { title: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
        { tags: { contains: keyword, mode: 'insensitive' } },
      ];

      const where: Prisma.RuleWhereInput = {};
      const andClauses: Prisma.RuleWhereInput[] = [{ OR: keywordConditions }];

      if (filter?.tags && filter.tags.length > 0) {
        const tagConditions: Prisma.RuleWhereInput[] = filter.tags.map((tag) => ({
          tags: { contains: `"${tag}"` },
        }));
        andClauses.push({ OR: tagConditions });
      }

      where.AND = andClauses;

      // Apply additional filters. 应用附加过滤条件。
      if (filter?.status) {
        if (Array.isArray(filter.status)) {
          where.status = { in: filter.status };
        } else {
          where.status = filter.status;
        }
      }

      if (filter?.severity) {
        where.severity = filter.severity;
      }

      const prismaRules = await this.prisma.rule.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
      });

      return RulePrismaMapper.toDomainMany(prismaRules);
    } catch (err) {
      throw toResultErrorException(mapInfraErrorToResultError(err, 'Failed to search rules'));
    }
  }

  /**
   * Deletes a rule by ID (hard delete).
   * 根据 ID 删除规则（硬删除）。
   *
   * Returns NOT_FOUND if the rule does not exist.
   * 如果规则不存在，返回 NOT_FOUND。
   *
   * @param id - Rule ID to delete 要删除的规则 ID
   */
  async delete(id: RuleId): Promise<void> {
    try {
      await this.prisma.rule.delete({
        where: { id },
      });
    } catch (err) {
      throw toResultErrorException(mapInfraErrorToResultError(err, 'Failed to delete rule'));
    }
  }

  /**
   * Checks if a rule with the given code already exists.
   * 检查指定代码的规则是否已存在。
   *
   * @param code - Rule code to check 要检查的规则代码
   * @returns true if exists, false if not 存在返回 true，否则返回 false
   */
  async exists(code: string): Promise<boolean> {
    try {
      const count = await this.prisma.rule.count({
        where: { code },
      });

      return count > 0;
    } catch (err) {
      throw toResultErrorException(
        mapInfraErrorToResultError(err, 'Failed to check rule existence'),
      );
    }
  }
}
