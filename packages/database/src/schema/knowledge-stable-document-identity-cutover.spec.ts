import { describe, expect, it, vi } from 'vitest';
import {
  prepareKnowledgeStableDocumentIdentityCutover,
  type KnowledgeStableDocumentIdentityCutoverQueryClient,
} from './knowledge-stable-document-identity-cutover';

function result<T>(rows: T[]) {
  return { rows };
}

describe('prepareKnowledgeStableDocumentIdentityCutover', () => {
  it('does not drop anything when the table is absent', async () => {
    const query = vi.fn().mockResolvedValue(
      result([{ table_regclass: null, stable_id_column_present: false }]),
    );

    const report = await prepareKnowledgeStableDocumentIdentityCutover({
      query,
    } as KnowledgeStableDocumentIdentityCutoverQueryClient);

    expect(report).toEqual({
      tablePresent: false,
      stableIdColumnPresent: false,
      resetPerformed: false,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('does not drop anything when the stable id column is present', async () => {
    const query = vi.fn().mockResolvedValue(
      result([{ table_regclass: 'knowledge_write_requests', stable_id_column_present: true }]),
    );

    const report = await prepareKnowledgeStableDocumentIdentityCutover({
      query,
    } as KnowledgeStableDocumentIdentityCutoverQueryClient);

    expect(report).toEqual({
      tablePresent: true,
      stableIdColumnPresent: true,
      resetPerformed: false,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('resets exactly the old Knowledge server tables when the stable id column is absent', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(
        result([{ table_regclass: 'knowledge_write_requests', stable_id_column_present: false }]),
      )
      .mockResolvedValueOnce(result([]));

    const report = await prepareKnowledgeStableDocumentIdentityCutover({
      query,
    } as KnowledgeStableDocumentIdentityCutoverQueryClient);

    expect(report).toEqual({ tablePresent: true, stableIdColumnPresent: false, resetPerformed: true });
    expect(query).toHaveBeenCalledTimes(2);
    const resetSql = String(query.mock.calls[1]?.[0]);
    const tableNames = [...resetSql.matchAll(/DROP TABLE IF EXISTS "([^"]+)";/g)].map(
      ([, tableName]) => tableName,
    );
    expect(tableNames).toEqual([
      'knowledge_write_requests',
      'knowledge_attachment_content_cache',
      'knowledge_attachment_projections',
      'knowledge_note_projections',
      'github_webhook_deliveries',
      'knowledge_repository_connections',
    ]);
    expect(tableNames).toHaveLength(6);
    expect(resetSql).not.toMatch(/DROP TABLE IF EXISTS "(?!knowledge_write_requests|knowledge_attachment_content_cache|knowledge_attachment_projections|knowledge_note_projections|github_webhook_deliveries|knowledge_repository_connections)[^"]+"/);
  });

  it('propagates inspection errors', async () => {
    const error = new Error('inspection failed');
    const query = vi.fn().mockRejectedValue(error);

    await expect(
      prepareKnowledgeStableDocumentIdentityCutover({
        query,
      } as KnowledgeStableDocumentIdentityCutoverQueryClient),
    ).rejects.toBe(error);
  });
});
