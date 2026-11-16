import type {
  RelationReadPort,
  RelationNeighborsQuery,
  RelationNeighborsPage,
  ExternalRelationNeighbor,
  RelationNodeRef,
} from '@memoflow/agent-gateway';
import type { RelationService } from '@memoflow/relation';
import type { GoalKnowledgeService, KnowledgeDocumentRefResolver } from '@memoflow/relation';
import type { GoalReadPort, TaskReadPort } from '@memoflow/agent-gateway';
import type { SubjectRef, SubjectType, RelationDTO } from '@memoflow/relation-contracts';
import { KnowledgeDocumentIdSchema } from '@memoflow/repository-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import type { GatewayReadBudget } from '@memoflow/agent-gateway';

export interface BindRelationReadPortOptions {
  readonly relationService: Pick<RelationService, 'forward' | 'reverse'>;
  readonly goalKnowledgeService?: Pick<
    GoalKnowledgeService,
    'listForGoal' | 'listGoalsForKnowledge'
  >;
  readonly goals: Pick<GoalReadPort, 'getGoal'>;
  readonly tasks?: Pick<TaskReadPort, 'getTaskPlan'>;
  readonly knowledge?: KnowledgeDocumentRefResolver;
}

async function checkNodeVisibility(
  node: RelationNodeRef,
  context: ExecutionContext,
  budget: GatewayReadBudget | undefined,
  options: BindRelationReadPortOptions,
): Promise<boolean> {
  const normalizedType = node.type === 'knowledge' ? 'note' : node.type;
  if (normalizedType === 'goal') {
    try {
      const goal = await options.goals.getGoal(node.id, context, budget);
      return goal !== null;
    } catch {
      return false;
    }
  }
  if (normalizedType === 'task') {
    if (!options.tasks) return false;
    try {
      const task = await options.tasks.getTaskPlan(node.id, context, budget);
      return task !== null;
    } catch {
      return false;
    }
  }
  if (normalizedType === 'note') {
    if (!options.knowledge) return false;
    try {
      const documentId = KnowledgeDocumentIdSchema.safeParse(node.id);
      if (!documentId.success) return false;
      const doc = await options.knowledge.resolve(context.identityId, documentId.data);
      return doc !== null;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Binds Relation and cross-domain services to the Gateway RelationReadPort.
 * Enforces cross-domain visibility rules: only relations between nodes visible
 * to the current owner are returned; edges to invisible or cross-owner nodes
 * are omitted without leaking peer existence.
 */
export function bindRelationReadPort(options: BindRelationReadPortOptions): RelationReadPort {
  return {
    async getNeighbors(
      query: RelationNeighborsQuery,
      context: ExecutionContext,
      budget?: GatewayReadBudget,
    ): Promise<RelationNeighborsPage> {
      // 1. Check source node visibility
      const isSourceVisible = await checkNodeVisibility(query.node, context, budget, options);
      if (!isSourceVisible) {
        return { items: [], hasMore: false };
      }

      // 2. Fetch candidate edges
      const normalizedSourceType = query.node.type === 'knowledge' ? 'note' : query.node.type;
      const sourceRef: SubjectRef = {
        type: normalizedSourceType as SubjectType,
        id: query.node.id,
      } as SubjectRef;

      const direction = query.direction ?? 'both';
      const candidateEdges: Array<{
        relation: RelationDTO;
        direction: 'outgoing' | 'incoming';
        target: SubjectRef;
      }> = [];

      if (direction === 'both' || direction === 'outgoing') {
        const outgoing = await options.relationService.forward(context.identityId, sourceRef);
        for (const row of outgoing) {
          candidateEdges.push({
            relation: row,
            direction: 'outgoing',
            target: row.object,
          });
        }
      }

      if (direction === 'both' || direction === 'incoming') {
        const incoming = await options.relationService.reverse(context.identityId, sourceRef);
        for (const row of incoming) {
          candidateEdges.push({
            relation: row,
            direction: 'incoming',
            target: row.subject,
          });
        }
      }

      // Deduplicate by relationId + direction
      const seen = new Set<string>();
      const deduped: typeof candidateEdges = [];
      for (const edge of candidateEdges) {
        const key = `${edge.relation.id}:${edge.direction}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(edge);
        }
      }

      // 3. Filter by relationType
      let filtered = deduped;
      if (query.relationType) {
        filtered = filtered.filter((edge) => edge.relation.relationType === query.relationType);
      }

      // 4. Filter by targetType
      if (query.targetType) {
        const normalizedTargetType = query.targetType === 'knowledge' ? 'note' : query.targetType;
        filtered = filtered.filter((edge) => edge.target.type === normalizedTargetType);
      }

      // Deterministic sort: createdAt asc, id asc
      filtered.sort((a, b) => {
        if (a.relation.createdAt !== b.relation.createdAt) {
          return a.relation.createdAt - b.relation.createdAt;
        }
        return a.relation.id.localeCompare(b.relation.id);
      });

      // 5. Visibility check for peer nodes
      // "只返回当前 owner 可见节点之间的关系；指向不可见节点的边直接省略、不泄露对端存在性"
      const visible: ExternalRelationNeighbor[] = [];
      for (const edge of filtered) {
        const targetNodeRef: RelationNodeRef = {
          type:
            edge.target.type === 'note'
              ? 'knowledge'
              : (edge.target.type as RelationNodeRef['type']),
          id: edge.target.id,
        };
        const isPeerVisible = await checkNodeVisibility(targetNodeRef, context, budget, options);
        if (!isPeerVisible) {
          // Direct omission of edges pointing to invisible nodes
          continue;
        }
        visible.push({
          relationId: edge.relation.id,
          relationType: edge.relation.relationType,
          direction: edge.direction,
          targetNode: targetNodeRef,
          createdAt: edge.relation.createdAt,
        });
      }

      // 6. Pagination
      const offset = query.offset ?? 0;
      const items = visible.slice(offset, offset + query.limit);
      const hasMore = offset + query.limit < visible.length;

      return {
        items,
        total: visible.length,
        hasMore,
      };
    },
  };
}
