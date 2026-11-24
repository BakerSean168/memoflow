import type { ExecutionContext } from '@memoflow/transport-contracts';
import type { ExternalRelationNeighbor, RelationNodeRef } from '../contracts';
import type {
  GatewayReadBudget,
  RelationNeighborsPage,
  RelationNeighborsQuery,
  RelationReadPort,
} from '../ports';

/** Structural owner edge; RelationService rows satisfy this shape. */
export interface RelationGatewayNode {
  readonly type: string;
  readonly id: string;
}
export interface RelationGatewayEdge {
  readonly id: string;
  readonly relationType: string;
  readonly createdAt: number;
  readonly subject: RelationGatewayNode;
  readonly object: RelationGatewayNode;
}
export interface RelationGatewaySource {
  forward(
    identityId: string,
    subject: RelationGatewayNode,
  ): Promise<readonly RelationGatewayEdge[]>;
  reverse(identityId: string, object: RelationGatewayNode): Promise<readonly RelationGatewayEdge[]>;
}

/**
 * Cross-domain visibility callbacks. A node type without a checker is never
 * visible, so a host cannot accidentally expose an unbound owner.
 */
export interface RelationVisibilityChecker {
  goal?(id: string, context: ExecutionContext, budget?: GatewayReadBudget): Promise<boolean>;
  task?(id: string, context: ExecutionContext, budget?: GatewayReadBudget): Promise<boolean>;
  note?(id: string, identityId: string): Promise<boolean>;
}

export interface RelationNeighborsReaderOptions {
  readonly relations: RelationGatewaySource;
  readonly visibility: RelationVisibilityChecker;
}

function normalizeNodeType(type: string): string {
  return type === 'knowledge' ? 'note' : type;
}

async function isNodeVisible(
  node: RelationNodeRef,
  context: ExecutionContext,
  budget: GatewayReadBudget | undefined,
  visibility: RelationVisibilityChecker,
): Promise<boolean> {
  const type = normalizeNodeType(node.type);
  try {
    if (type === 'goal') return (await visibility.goal?.(node.id, context, budget)) === true;
    if (type === 'task') return (await visibility.task?.(node.id, context, budget)) === true;
    if (type === 'note') return (await visibility.note?.(node.id, context.identityId)) === true;
    return false;
  } catch {
    return false;
  }
}

/**
 * One visibility-filtered cross-domain relation reader for every host.
 *
 * Only relations between nodes visible to the current owner are returned; an
 * edge to an invisible or foreign peer is omitted without leaking whether the
 * peer exists. Hosts bind their own owner services through the structural
 * source and visibility callbacks; they must not reimplement this policy.
 */
export function createRelationNeighborsReader(
  options: RelationNeighborsReaderOptions,
): RelationReadPort {
  return {
    async getNeighbors(
      query: RelationNeighborsQuery,
      context: ExecutionContext,
      budget?: GatewayReadBudget,
    ): Promise<RelationNeighborsPage> {
      // 1. Check source node visibility.
      const isSourceVisible = await isNodeVisible(query.node, context, budget, options.visibility);
      if (!isSourceVisible) return { items: [], hasMore: false };

      // 2. Fetch candidate edges from both directions.
      const sourceRef: RelationGatewayNode = {
        type: normalizeNodeType(query.node.type),
        id: query.node.id,
      };
      const direction = query.direction ?? 'both';
      const candidateEdges: Array<{
        relation: RelationGatewayEdge;
        direction: 'outgoing' | 'incoming';
        target: RelationGatewayNode;
      }> = [];

      if (direction === 'both' || direction === 'outgoing') {
        const outgoing = await options.relations.forward(context.identityId, sourceRef);
        for (const row of outgoing) {
          candidateEdges.push({ relation: row, direction: 'outgoing', target: row.object });
        }
      }
      if (direction === 'both' || direction === 'incoming') {
        const incoming = await options.relations.reverse(context.identityId, sourceRef);
        for (const row of incoming) {
          candidateEdges.push({ relation: row, direction: 'incoming', target: row.subject });
        }
      }

      // 3. Deduplicate by relation id + direction.
      const seen = new Set<string>();
      const deduped: typeof candidateEdges = [];
      for (const edge of candidateEdges) {
        const key = `${edge.relation.id}:${edge.direction}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(edge);
        }
      }

      // 4. Filter by relation type and target type.
      let filtered = deduped;
      if (query.relationType) {
        filtered = filtered.filter((edge) => edge.relation.relationType === query.relationType);
      }
      if (query.targetType) {
        const normalizedTargetType = normalizeNodeType(query.targetType);
        filtered = filtered.filter((edge) => edge.target.type === normalizedTargetType);
      }

      // Deterministic order: createdAt asc, id asc.
      filtered.sort((a, b) => {
        if (a.relation.createdAt !== b.relation.createdAt) {
          return a.relation.createdAt - b.relation.createdAt;
        }
        return a.relation.id.localeCompare(b.relation.id);
      });

      // 5. Omit edges whose peer is not visible to this owner.
      const visible: ExternalRelationNeighbor[] = [];
      for (const edge of filtered) {
        const targetNodeRef: RelationNodeRef = {
          type:
            edge.target.type === 'note'
              ? 'knowledge'
              : (edge.target.type as RelationNodeRef['type']),
          id: edge.target.id,
        };
        if (!(await isNodeVisible(targetNodeRef, context, budget, options.visibility))) continue;
        visible.push({
          relationId: edge.relation.id,
          relationType: edge.relation.relationType as ExternalRelationNeighbor['relationType'],
          direction: edge.direction,
          targetNode: targetNodeRef,
          createdAt: edge.relation.createdAt,
        });
      }

      // 6. Bounded offset page.
      const offset = query.offset ?? 0;
      const items = visible.slice(offset, offset + query.limit);
      return {
        items,
        total: visible.length,
        hasMore: offset + query.limit < visible.length,
      };
    },
  };
}
