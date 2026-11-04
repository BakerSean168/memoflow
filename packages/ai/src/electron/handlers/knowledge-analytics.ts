import { ipcMain } from 'electron';
import { AIChannels, type IElectronModuleContext } from '@memoflow/desktop-contracts';
import { withAuthenticatedValue, type AIElectronHandlerDeps } from './context';

/**
 * Knowledge note and analytics/evaluation channels.
 * 知识笔记与 analytics/evaluation 通道。
 */
export function registerKnowledgeAnalyticsHandlers(
  ctx: IElectronModuleContext,
  deps: AIElectronHandlerDeps,
): void {
  const { instance: aiModule, installed } = deps;
  const { knowledge, evaluationOperations } = aiModule;

  // -- Knowledge Notes --
  ipcMain.handle(AIChannels.KNOWLEDGE_QUERY, async (_, dto) =>
    withAuthenticatedValue(ctx, async (requestContext) =>
      knowledge.queryKnowledge(dto, requestContext),
    ),
  );
  installed.push(AIChannels.KNOWLEDGE_QUERY);
  ipcMain.handle(AIChannels.KNOWLEDGE_EXPAND, async (_, dto) =>
    withAuthenticatedValue(ctx, async (requestContext) =>
      knowledge.expandKnowledge(dto, requestContext),
    ),
  );
  installed.push(AIChannels.KNOWLEDGE_EXPAND);
  ipcMain.handle(AIChannels.KNOWLEDGE_REINDEX, async (_, dto) =>
    withAuthenticatedValue(ctx, async (requestContext) =>
      knowledge.reindexKnowledge(dto ?? {}, requestContext),
    ),
  );
  installed.push(AIChannels.KNOWLEDGE_REINDEX);

  // -- Evaluation & Operations --
  ipcMain.handle(AIChannels.ANALYTICS_QUERY, async (_, dto) =>
    withAuthenticatedValue(ctx, async (requestContext) =>
      evaluationOperations.queryAnalytics(dto, requestContext),
    ),
  );
  installed.push(AIChannels.ANALYTICS_QUERY);
  ipcMain.handle(AIChannels.EVALUATION_OVERVIEW_GET, async (_, dto) =>
    withAuthenticatedValue(ctx, async () =>
      evaluationOperations.getEvaluationOverview(dto ?? {}),
    ),
  );
  installed.push(AIChannels.EVALUATION_OVERVIEW_GET);
}
