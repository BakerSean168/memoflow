export interface KnowledgeStableDocumentIdentityCutoverQueryClient {
  query<T = Record<string, unknown>>(sql: string): Promise<{ rows: T[] }>;
}

export interface KnowledgeStableDocumentIdentityCutoverReport {
  tablePresent: boolean;
  stableIdColumnPresent: boolean;
  resetPerformed: boolean;
}

const RESET_SQL = `
DROP TABLE IF EXISTS "knowledge_write_requests";
DROP TABLE IF EXISTS "knowledge_attachment_content_cache";
DROP TABLE IF EXISTS "knowledge_attachment_projections";
DROP TABLE IF EXISTS "knowledge_note_projections";
DROP TABLE IF EXISTS "github_webhook_deliveries";
DROP TABLE IF EXISTS "knowledge_repository_connections";
`;

export async function prepareKnowledgeStableDocumentIdentityCutover(
  client: KnowledgeStableDocumentIdentityCutoverQueryClient,
): Promise<KnowledgeStableDocumentIdentityCutoverReport> {
  const inspection = await client.query<{
    table_regclass: string | null;
    stable_id_column_present: boolean;
  }>(`
    SELECT
      to_regclass('public.knowledge_write_requests') AS table_regclass,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'knowledge_write_requests'
          AND column_name = 'knowledge_document_id'
      ) AS stable_id_column_present
  `);

  const tablePresent = Boolean(inspection.rows[0]?.table_regclass);
  const stableIdColumnPresent = tablePresent
    ? Boolean(inspection.rows[0]?.stable_id_column_present)
    : false;

  if (!tablePresent || stableIdColumnPresent) {
    return { tablePresent, stableIdColumnPresent, resetPerformed: false };
  }

  await client.query(RESET_SQL);
  return { tablePresent: true, stableIdColumnPresent: false, resetPerformed: true };
}
