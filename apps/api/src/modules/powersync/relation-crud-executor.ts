import { CreateRelationReqSchema } from '@memoflow/contracts/relation';
import type { CrudOperation } from './crud-executor.js';
import { normalizeCrudData } from './crud-normalization.js';

interface RelationRow {
  readonly id: string;
  readonly identityId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly relationType: string;
  readonly objectType: string;
  readonly objectId: string;
}

interface RelationCrudDelegate {
  findFirst(args: { where: Record<string, unknown> }): Promise<RelationRow | null>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
}

export interface RelationCrudDatabase {
  readonly relation?: RelationCrudDelegate;
}

/**
 * Applies immutable Shared Relation PowerSync writes.
 *
 * Relation edges are PUT/DELETE only. The server re-validates the subject/object
 * contract so an offline client cannot persist a path-derived `note` id, and all
 * id-based operations remain scoped to the authenticated identity.
 */
export async function executeRelationCrudOperation(
  db: RelationCrudDatabase,
  identityId: string,
  operation: CrudOperation,
): Promise<void> {
  const relation = db.relation;
  if (!relation) throw new Error('Relation Prisma delegate is unavailable');

  if (operation.op === 'PATCH') {
    throw new Error('Relation PATCH is not supported; use DELETE + PUT');
  }

  if (operation.op === 'DELETE') {
    await relation.deleteMany({ where: { id: operation.id, identityId } });
    return;
  }

  const normalized = normalizeCrudData('relations', operation.data);
  const parsed = CreateRelationReqSchema.parse({
    subject: { type: normalized.subjectType, id: normalized.subjectId },
    relationType: normalized.relationType,
    object: { type: normalized.objectType, id: normalized.objectId },
  });

  const byId = await relation.findFirst({ where: { id: operation.id, identityId } });
  if (byId) {
    if (!sameEdge(byId, parsed)) {
      throw new Error('Relation id already belongs to a different edge');
    }
    return;
  }

  const exact = await relation.findFirst({
    where: {
      identityId,
      subjectType: parsed.subject.type,
      subjectId: parsed.subject.id,
      relationType: parsed.relationType,
      objectType: parsed.object.type,
      objectId: parsed.object.id,
    },
  });
  if (exact) return;

  await relation.create({
    data: {
      id: operation.id,
      identityId,
      subjectType: parsed.subject.type,
      subjectId: parsed.subject.id,
      relationType: parsed.relationType,
      objectType: parsed.object.type,
      objectId: parsed.object.id,
    },
  });
}

function sameEdge(
  row: RelationRow,
  edge: ReturnType<typeof CreateRelationReqSchema.parse>,
): boolean {
  return (
    row.subjectType === edge.subject.type &&
    row.subjectId === edge.subject.id &&
    row.relationType === edge.relationType &&
    row.objectType === edge.object.type &&
    row.objectId === edge.object.id
  );
}
