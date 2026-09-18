/**
 * AI API Module Definition — transport-only seam.
 * AI API 模块定义 —— 纯传输层 seam。
 *
 * This factory is host-composed: `apps/api` owns every ingredient via
 * `apps/api/src/runtime/compose-ai.ts`, which selects the Prisma repositories,
 * builds the Mastra runtime and host capability ports, and hands an
 * already-assembled `AIModuleInstance` to `createAIApiModule({ instance })`.
 * This file never reads the database from the registration context, never reads
 * environment configuration, and never constructs repositories, service
 * adapters, or a package-level active instance.
 *
 * 本工厂由宿主组合：`apps/api` 通过 `apps/api/src/runtime/compose-ai.ts` 拥有全部
 * 原料——选择 Prisma repository、构建 Mastra runtime 与宿主能力 port，并把
 * 已装配好的 `AIModuleInstance` 交给 `createAIApiModule({ instance })`。本文件不从
 * 注册 context 读取数据库、不读取环境配置，也不构造 repository、service adapter
 * 或包级全局实例。
 *
 * AI-VNEXT-07: Mastra is the only runtime. Legacy Python AIService adapters,
 * AgentHost runtime, goal-generation, agent-runtime, assistant-facade and
 * checkpoint controllers/routes are removed. The remaining surface is provider
 * config, conversations, open chat (Mastra-owned), knowledge and analytics.
 *
 * AI-VNEXT-07：Mastra 是唯一 runtime。旧 Python AIService adapter、AgentHost
 * runtime、goal-generation、agent-runtime、assistant-facade 与 checkpoint
 * controller/route 已删除。剩余 surface 为 provider config、conversations、
 * open chat (Mastra 托管)、knowledge 与 analytics。
 *
 * Registration and lifecycle follow the governance reference pattern:
 * 1. Controllers wired to their proven application capability port.
 * 2. `instance.start()` once, then mount route groups; a partial route set is
 *    rolled back on any mount failure.
 * 3. `destroy()` for cleanup, idempotent and a no-op after `failed`.
 */

import type { ServerModuleHandle, ServerTransportModuleContext } from '@memoflow/contracts/shared';
import { createLogger } from '@memoflow/utils/logger';
import type { AITransportModuleInstance } from '../server/infrastructure';
import {
  registerAICapabilitiesRoutes,
  registerAIAnalyticsQueryRoutes,
  registerAIEvaluationReportRoutes,
  registerAIProviderRoutes,
  registerAIProviderOnboardingRoutes,
  registerAIChatRoutes,
  registerAIKnowledgeQueryRoutes,
  registerAIRuntimeRoutes,
} from './routes';
import { AICapabilitiesController } from '../server/transport/ai-capabilities.controller';
import { AIAnalyticsQueryController } from '../server/transport/ai-analytics-query.controller';
import { AIEvaluationReportController } from '../server/transport/ai-evaluation-report.controller';
import { AIProviderConfigController } from '../server/transport/ai-provider-config.controller';
import { AIChatController } from '../server/transport/ai-chat.controller';
import { AIKnowledgeQueryController } from '../server/transport/ai-knowledge-query.controller';

const logger = createLogger('AIApi');

/**
 * Transport-only context for AI registration. It reuses the canonical shared
 * `ServerTransportModuleContext` and deliberately carries no `db`, so this seam
 * can never become a second composition root.
 *
 * AI 注册专用的纯传输层上下文。它复用统一的 `ServerTransportModuleContext`，并且
 * 刻意不携带 `db`，从类型边界上阻止这里演变成第二个 composition root。
 */
export type AIApiModuleContext = ServerTransportModuleContext;

/**
 * AI API module handle extending the shared server-module lifecycle contract.
 *
 * AI API 模块句柄，继承统一的服务端模块生命周期契约，负责 register/destroy 生命周期。
 */
export interface AIApiModuleDef extends ServerModuleHandle<AIApiModuleContext> {}

/**
 * Options carrying the already-assembled, host-owned AI module instance.
 *
 * AI API 模块创建选项，仅携带已经由宿主完整装配好的 AI 模块实例。
 */
export interface AIApiModuleOptions {
  readonly instance: AITransportModuleInstance;
}

type ModuleHandleState = 'created' | 'registered' | 'disposed' | 'failed';

/**
 * Create the transport-only AI API module definition from a host-assembled
 * `AIModuleInstance`. The host (`apps/api`) owns repository selection, Mastra
 * runtime construction, capability ports and all business composition; this
 * factory only wires controllers/routes and the shared lifecycle.
 *
 * 从宿主已经装配好的 `AIModuleInstance` 创建纯传输层 AI API 模块。repository 选择、
 * Mastra runtime 构建、能力 port 与业务组合均由 `apps/api` 负责；本工厂只负责
 * controller/route 接线以及统一模块生命周期。
 *
 * @param options The already-assembled AI module instance supplied by the host. / 宿主提供的、已完成组合的 AI 模块实例选项。
 * @returns An idempotent server transport module handle for AI routes. / 用于 AI 路由注册与销毁的幂等服务端传输模块句柄。
 */
export function createAIApiModule(options: AIApiModuleOptions): AIApiModuleDef {
  if (!options?.instance) {
    throw new Error('[FAIL-CLOSED] createAIApiModule requires options.instance');
  }

  let state: ModuleHandleState = 'created';

  return {
    name: 'AI',

    async register(context) {
      if (state !== 'created') {
        throw new Error(
          `AIApiModule.register() called while in '${state}' state; a handle may only register once from 'created'`,
        );
      }

      const { router, middleware, openApiRegistry } = context;

      try {
        // ---------------------------------------------------------------
        // 1. Controllers — each receives only the proven capability it consumes.
        //    控制器 — 每个控制器只接收其实际消费的 capability。
        // ---------------------------------------------------------------
        const capabilitiesController = new AICapabilitiesController({
          getCapabilities: options.instance.providerManagement.getCapabilities,
        });
        const providerController = new AIProviderConfigController(
          options.instance.providerManagement,
        );
        const chatController = new AIChatController(options.instance.assistantConversation);

        // Routes always register — unavailable capabilities return SERVICE_UNAVAILABLE
        // from the runtime service surface.
        const knowledgeQueryController = new AIKnowledgeQueryController(options.instance.knowledge);
        const analyticsQueryController = new AIAnalyticsQueryController(
          options.instance.evaluationOperations,
        );
        const evaluationReportController = new AIEvaluationReportController(
          options.instance.evaluationOperations,
        );

        // ---------------------------------------------------------------
        // 2. 创建路由（注入平台中间件）并挂载到主路由
        // ---------------------------------------------------------------
        const capabilityRoutes = registerAICapabilitiesRoutes(
          capabilitiesController,
          middleware,
          openApiRegistry,
        );
        const providerRoutes = registerAIProviderRoutes(
          providerController,
          middleware,
          openApiRegistry,
        );
        const providerOnboardingRoutes = registerAIProviderOnboardingRoutes(
          providerController,
          middleware,
          openApiRegistry,
        );
        const chatRoutes = registerAIChatRoutes(chatController, middleware, openApiRegistry);
        const runtimeRoutes = registerAIRuntimeRoutes(
          options.instance.mastraRuntime,
          middleware,
          options.instance.workflowRuntime,
        );
        const knowledgeQueryRoutes = registerAIKnowledgeQueryRoutes(
          knowledgeQueryController,
          middleware,
          openApiRegistry,
        );
        const analyticsQueryRoutes = registerAIAnalyticsQueryRoutes(
          analyticsQueryController,
          middleware,
          openApiRegistry,
        );
        const evaluationReportRoutes = registerAIEvaluationReportRoutes(
          evaluationReportController,
          middleware,
          openApiRegistry,
        );

        // Start the instance once BEFORE mounting any route: a failed start
        // must never leave a partial route set on the host router.
        await options.instance.start();

        // Record the stack length before the first mount so a later mount
        // failure can roll back the already-installed AI routes.
        const stackLen = router.stack.length;
        try {
          router.use('/ai/providers', providerRoutes);
          router.use('/ai', providerOnboardingRoutes);
          router.use('/ai', capabilityRoutes);
          router.use('/ai/chat', chatRoutes);
          router.use('/ai/runtime', runtimeRoutes);
          router.use('/ai/knowledge', knowledgeQueryRoutes);
          router.use('/ai/analytics', analyticsQueryRoutes);
          router.use('/ai', evaluationReportRoutes);
        } catch (mountError) {
          router.stack.length = stackLen;
          throw mountError;
        }

        state = 'registered';
      } catch (error) {
        state = 'failed';
        try {
          await options.instance.dispose();
        } catch (disposeError) {
          logger.error(
            'AIApiModule: instance dispose failed during failed registration',
            disposeError,
          );
        }
        throw error;
      }
    },

    async destroy() {
      if (state === 'disposed' || state === 'failed') {
        return;
      }
      state = 'disposed';
      await options.instance.dispose();
    },
  };
}
