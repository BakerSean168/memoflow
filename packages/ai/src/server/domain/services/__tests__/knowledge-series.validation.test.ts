/**
 * Knowledge Series Validation Tests
 * Story 4.3: Test validateKnowledgeSeriesOutput method
 */

import { describe, it, expect } from 'vitest';
import { AIGenerationValidationService } from '../ai-generation-validation-service';
import { AIValidationError } from '../../errors/ai-errors';

interface KnowledgeSeriesTestDocument {
  title: string;
  content: string;
  order?: number;
}

describe('AIGenerationValidationService.validateKnowledgeSeriesOutput', () => {
  const service = new AIGenerationValidationService();

  // Helper to assert validation error contains specific message
  function expectValidationError(fn: () => void, expectedMessage: string) {
    try {
      fn();
      expect.fail('Expected validation to throw AIValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(AIValidationError);
      const validationError = error as AIValidationError;
      const hasMessage = validationError.validationErrors.some((msg) =>
        msg.includes(expectedMessage),
      );
      expect(hasMessage).toBe(true);
    }
  }

  function makeDocument(
    order: number,
    overrides: Partial<KnowledgeSeriesTestDocument> = {},
  ): KnowledgeSeriesTestDocument {
    // Generate ~1000 words by repeating 'Word ' 1000 times
    return {
      title: `Knowledge Document ${order}: Fundamentals`,
      content: `## Introduction

This is a comprehensive guide about the fundamentals. ${'Word '.repeat(1000)}

## Core Concepts

Important concepts here.

## Practical Examples

Examples and use cases.

## Summary

Key takeaways from this document.`,
      order,
      ...overrides,
    };
  }

  function makeValidSeries(count: number) {
    return Array.from({ length: count }, (_, i) => makeDocument(i + 1));
  }

  describe('Valid inputs', () => {
    it('should accept 3 documents', () => {
      const docs = makeValidSeries(3);
      expect(() => service.validateKnowledgeSeriesOutput(docs, 3)).not.toThrow();
    });

    it('should accept 5 documents', () => {
      const docs = makeValidSeries(5);
      expect(() => service.validateKnowledgeSeriesOutput(docs, 5)).not.toThrow();
    });

    it('should accept 7 documents', () => {
      const docs = makeValidSeries(7);
      expect(() => service.validateKnowledgeSeriesOutput(docs, 7)).not.toThrow();
    });
  });

  describe('Invalid structure', () => {
    it('should reject non-array input', () => {
      expect(() =>
        service.validateKnowledgeSeriesOutput({} as unknown as KnowledgeSeriesTestDocument[], 5),
      ).toThrow('Invalid knowledge series structure');
    });

    it('should reject wrong document count', () => {
      const docs = makeValidSeries(3);
      expectValidationError(
        () => service.validateKnowledgeSeriesOutput(docs, 5),
        'Expected 5 documents',
      );
    });

    it('should reject too few documents', () => {
      const docs = makeValidSeries(2);
      expectValidationError(
        () => service.validateKnowledgeSeriesOutput(docs, 2),
        'Documents count must be 3-7',
      );
    });

    it('should reject too many documents', () => {
      const docs = makeValidSeries(8);
      expectValidationError(
        () => service.validateKnowledgeSeriesOutput(docs, 8),
        'Documents count must be 3-7',
      );
    });
  });

  describe('Invalid document properties', () => {
    it('should reject document without title', () => {
      const docs = [makeDocument(1, { title: '' }), makeDocument(2), makeDocument(3)];
      expectValidationError(() => service.validateKnowledgeSeriesOutput(docs, 3), 'title missing');
    });

    it('should reject title longer than 60 chars', () => {
      const longTitle = 'A'.repeat(61);
      const docs = [makeDocument(1, { title: longTitle }), makeDocument(2), makeDocument(3)];
      expectValidationError(
        () => service.validateKnowledgeSeriesOutput(docs, 3),
        'title max 60 chars',
      );
    });

    it('should reject document without content', () => {
      const docs = [makeDocument(1, { content: '' }), makeDocument(2), makeDocument(3)];
      expectValidationError(
        () => service.validateKnowledgeSeriesOutput(docs, 3),
        'content missing',
      );
    });

    it('should reject content too short', () => {
      const shortContent = 'Too short content';
      const docs = [makeDocument(1, { content: shortContent }), makeDocument(2), makeDocument(3)];
      expectValidationError(
        () => service.validateKnowledgeSeriesOutput(docs, 3),
        'content must be 1000-1500 words',
      );
    });

    it('should reject content too long', () => {
      const longContent = '## Heading\n\n' + 'Word '.repeat(1600);
      const docs = [makeDocument(1, { content: longContent }), makeDocument(2), makeDocument(3)];
      expectValidationError(
        () => service.validateKnowledgeSeriesOutput(docs, 3),
        'content must be 1000-1500 words',
      );
    });

    it('should reject content without Markdown headings', () => {
      const noMarkdown = 'Word '.repeat(1100); // Valid word count but no headings
      const docs = [makeDocument(1, { content: noMarkdown }), makeDocument(2), makeDocument(3)];
      expectValidationError(
        () => service.validateKnowledgeSeriesOutput(docs, 3),
        'content must be Markdown with ## headings',
      );
    });

    it('should reject document without order', () => {
      const docs = [makeDocument(1, { order: undefined }), makeDocument(2), makeDocument(3)];
      expectValidationError(
        () => service.validateKnowledgeSeriesOutput(docs, 3),
        'order must be number',
      );
    });

    it('should reject order out of range', () => {
      const docs = [makeDocument(0), makeDocument(2), makeDocument(3)];
      expectValidationError(
        () => service.validateKnowledgeSeriesOutput(docs, 3),
        'order must be 1-3',
      );
    });
  });

  describe('Order uniqueness and continuity', () => {
    it('should reject duplicate orders', () => {
      const docs = [makeDocument(1), makeDocument(1), makeDocument(3)];
      expectValidationError(
        () => service.validateKnowledgeSeriesOutput(docs, 3),
        'Document orders must be unique and consecutive',
      );
    });

    it('should reject non-consecutive orders', () => {
      const docs = [makeDocument(1), makeDocument(3), makeDocument(5)];
      expectValidationError(
        () => service.validateKnowledgeSeriesOutput(docs, 3),
        'Document orders must be unique and consecutive',
      );
    });

    it('should accept orders in any sequence as long as they are unique 1-N', () => {
      const docs = [makeDocument(3), makeDocument(1), makeDocument(2)];
      expect(() => service.validateKnowledgeSeriesOutput(docs, 3)).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle exactly 1000 words', () => {
      const content = '## Title\n\n' + 'Word '.repeat(998); // ~1000 words with heading
      const docs = [makeDocument(1, { content }), makeDocument(2), makeDocument(3)];
      expect(() => service.validateKnowledgeSeriesOutput(docs, 3)).not.toThrow();
    });

    it('should handle exactly 1500 words', () => {
      const content = '## Title\n\n' + 'Word '.repeat(1498); // ~1500 words with heading
      const docs = [makeDocument(1, { content }), makeDocument(2), makeDocument(3)];
      expect(() => service.validateKnowledgeSeriesOutput(docs, 3)).not.toThrow();
    });

    it('should handle title with exactly 60 chars', () => {
      const title = 'A'.repeat(60);
      const docs = [makeDocument(1, { title }), makeDocument(2), makeDocument(3)];
      expect(() => service.validateKnowledgeSeriesOutput(docs, 3)).not.toThrow();
    });
  });
});
