import { ipcMain } from 'electron';
import {
  RelationChannels,
  withAuthenticatedIdentity,
  type IElectronModule,
  type IElectronModuleContext,
} from '@memoflow/contracts/electron';
import {
  GoalKnowledgeLinkReqSchema,
  GoalKnowledgeListReqSchema,
  GoalsForKnowledgeReqSchema,
} from '@memoflow/contracts/relation';
import { fail, ok } from '@memoflow/contracts/result';
import type { GoalKnowledgeService } from '@memoflow/relation';

export interface GoalKnowledgeElectronModuleOptions {
  readonly service: Pick<
    GoalKnowledgeService,
    'link' | 'unlink' | 'listForGoal' | 'listGoalsForKnowledge'
  >;
}

export function createGoalKnowledgeElectronModule(
  options: GoalKnowledgeElectronModuleOptions,
): IElectronModule {
  let registered = false;
  return {
    name: 'Relation',
    register(context: IElectronModuleContext) {
      if (registered) throw new Error('GoalKnowledgeElectronModule may only register once');
      registered = true;
      ipcMain.handle(RelationChannels.GOAL_KNOWLEDGE_LINK, (_event, request: unknown) =>
        withAuthenticatedIdentity(context, async (identityId) => {
          const parsed = GoalKnowledgeLinkReqSchema.safeParse(request);
          if (!parsed.success)
            return fail({ code: 'VALIDATION_ERROR', message: 'Invalid Goal Knowledge link' });
          try {
            return ok(await options.service.link(identityId, parsed.data));
          } catch {
            return fail({ code: 'NOT_FOUND', message: 'Knowledge document not found' });
          }
        }),
      );
      ipcMain.handle(RelationChannels.GOAL_KNOWLEDGE_UNLINK, (_event, request: unknown) =>
        withAuthenticatedIdentity(context, async (identityId) => {
          const parsed = GoalKnowledgeLinkReqSchema.safeParse(request);
          if (!parsed.success)
            return fail({ code: 'VALIDATION_ERROR', message: 'Invalid Goal Knowledge unlink' });
          return ok({ unlinked: await options.service.unlink(identityId, parsed.data) });
        }),
      );
      ipcMain.handle(RelationChannels.GOAL_KNOWLEDGE_LIST, (_event, request: unknown) =>
        withAuthenticatedIdentity(context, async (identityId) => {
          const parsed = GoalKnowledgeListReqSchema.safeParse(request);
          if (!parsed.success)
            return fail({ code: 'VALIDATION_ERROR', message: 'Invalid Goal id' });
          return ok(await options.service.listForGoal(identityId, parsed.data));
        }),
      );
      ipcMain.handle(RelationChannels.GOAL_KNOWLEDGE_REVERSE_LIST, (_event, request: unknown) =>
        withAuthenticatedIdentity(context, async (identityId) => {
          const parsed = GoalsForKnowledgeReqSchema.safeParse(request);
          if (!parsed.success)
            return fail({
              code: 'VALIDATION_ERROR',
              message: 'Invalid Knowledge document reference',
            });
          return ok(await options.service.listGoalsForKnowledge(identityId, parsed.data));
        }),
      );
    },
    destroy() {
      ipcMain.removeHandler(RelationChannels.GOAL_KNOWLEDGE_LINK);
      ipcMain.removeHandler(RelationChannels.GOAL_KNOWLEDGE_UNLINK);
      ipcMain.removeHandler(RelationChannels.GOAL_KNOWLEDGE_LIST);
      ipcMain.removeHandler(RelationChannels.GOAL_KNOWLEDGE_REVERSE_LIST);
    },
  };
}
