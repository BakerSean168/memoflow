/**
 * AI Generation Validation Service
 * 纯领域验证服务：负责验证 AI 输出的业务规则。
 * 不处理基础设施、配额、对话或适配器调用。
 */

import { AIValidationError } from '../errors/ai-errors';

interface SummaryCandidate {
  core?: string;
  keyPoints?: unknown;
  actionItems?: unknown;
}

interface KnowledgeDocumentCandidate {
  title?: string;
  content?: string;
  order?: number;
}

export class AIGenerationValidationService {
  constructor() {}

  /**
   * 验证摘要输出 (Story 4.1)
   */
  validateSummaryOutput(summary: SummaryCandidate, includeActions = true): void {
    const errors: string[] = [];
    if (!summary || typeof summary !== 'object') {
      errors.push('Summary must be an object');
      throw new AIValidationError('Invalid summary structure', errors);
    }
    const { core, keyPoints, actionItems } = summary;
    if (!core || typeof core !== 'string') {
      errors.push('core missing or not string');
    } else {
      const wordCount = core.trim().split(/\s+/).length;
      if (wordCount < 50 || wordCount > 150) {
        errors.push(`core word count must be 50-150, got ${wordCount}`);
      }
    }
    if (!Array.isArray(keyPoints)) {
      errors.push('keyPoints must be array');
    } else {
      if (keyPoints.length < 3 || keyPoints.length > 5) {
        errors.push(`keyPoints count must be 3-5, got ${keyPoints.length}`);
      }
      keyPoints.forEach((kp, idx: number) => {
        if (typeof kp !== 'string') {
          errors.push(`keyPoints[${idx}] not string`);
          return;
        }
        const words = kp.trim().split(/\s+/).length;
        if (words < 15 || words > 30) {
          errors.push(`keyPoints[${idx}] word count must be 15-30, got ${words}`);
        }
      });
    }
    if (includeActions) {
      if (actionItems !== undefined) {
        if (!Array.isArray(actionItems)) {
          errors.push('actionItems must be array');
        } else if (actionItems.length > 3) {
          errors.push(`actionItems max 3, got ${actionItems.length}`);
        } else {
          actionItems.forEach((ai, idx: number) => {
            if (typeof ai !== 'string') {
              errors.push(`actionItems[${idx}] not string`);
            }
          });
        }
      }
    } else if (actionItems && Array.isArray(actionItems) && actionItems.length > 0) {
      errors.push('actionItems should be omitted when includeActions=false');
    }
    if (errors.length > 0) {
      throw new AIValidationError('Summary validation failed', errors);
    }
  }

  /**
   * 验证知识系列文档输出 (Story 4.3)
   * 业务规则：
   * - 文档数量：3-7
   * - 每个文档：title (max 60 chars), content (1000-1500 words Markdown), order
   * - 顺序：1 到 N 连续
   */
  validateKnowledgeSeriesOutput(documents: KnowledgeDocumentCandidate[], expectedCount: number): void {
    const errors: string[] = [];

    // 验证是否为数组
    if (!Array.isArray(documents)) {
      errors.push('Documents must be an array');
      throw new AIValidationError('Invalid knowledge series structure', errors);
    }

    // 验证文档数量
    if (documents.length !== expectedCount) {
      errors.push(`Expected ${expectedCount} documents, got ${documents.length}`);
    }

    if (documents.length < 3 || documents.length > 7) {
      errors.push(`Documents count must be 3-7, got ${documents.length}`);
    }

    // 验证每个文档
    const orders = new Set<number>();
    documents.forEach((doc, idx: number) => {
      if (!doc || typeof doc !== 'object') {
        errors.push(`Document[${idx}] must be an object`);
        return;
      }

      const { title, content, order } = doc;

      // 验证 title
      if (!title || typeof title !== 'string') {
        errors.push(`Document[${idx}] title missing or not string`);
      } else if (title.length > 60) {
        errors.push(`Document[${idx}] title max 60 chars, got ${title.length}`);
      }

      // 验证 content
      if (!content || typeof content !== 'string') {
        errors.push(`Document[${idx}] content missing or not string`);
      } else {
        const wordCount = content.trim().split(/\s+/).length;
        if (wordCount < 1000 || wordCount > 1500) {
          errors.push(`Document[${idx}] content must be 1000-1500 words, got ${wordCount}`);
        }
        // 验证是否为 Markdown 格式（至少包含一个标题）
        if (!content.includes('##')) {
          errors.push(`Document[${idx}] content must be Markdown with ## headings`);
        }
      }

      // 验证 order
      if (typeof order !== 'number') {
        errors.push(`Document[${idx}] order must be number`);
      } else if (order < 1 || order > documents.length) {
        errors.push(`Document[${idx}] order must be 1-${documents.length}, got ${order}`);
      } else {
        orders.add(order);
      }
    });

    // 验证顺序连续性
    if (orders.size !== documents.length) {
      errors.push('Document orders must be unique and consecutive');
    }

    if (errors.length > 0) {
      throw new AIValidationError('Knowledge series validation failed', errors);
    }
  }
}
