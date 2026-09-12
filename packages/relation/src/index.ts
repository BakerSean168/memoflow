export * from '@memoflow/contracts/relation';
export type { AddRelationInput, RelationRepository } from './domain/relation-repository';
export { RelationService } from './application/relation-service';
export {
  createGoalRelationCleanupCapability,
  type GoalRelationCleanupCapability,
} from './application/goal-relation-cleanup';
export { createRelationModuleManifest } from './application/module-manifest';
export {
  GoalKnowledgeService,
  type KnowledgeDocumentRefResolver,
} from './application/goal-knowledge-service';
export { PrismaRelationRepository } from './infrastructure/prisma/prisma-relation.repository';
export { PowerSyncRelationRepository } from './infrastructure/powersync/powersync-relation.repository';
export { PrismaGoalRelationCleanupCapability } from './infrastructure/prisma/prisma-goal-relation-cleanup';
export { PowerSyncGoalRelationCleanupCapability } from './infrastructure/powersync/powersync-goal-relation-cleanup';
