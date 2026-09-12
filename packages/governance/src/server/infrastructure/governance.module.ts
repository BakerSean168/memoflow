/**
 * createGovernanceModule — explicit composition root for the governance server runtime.
 * createGovernanceModule —— 治理模块服务端运行时的显式组合根。
 *
 * The outer app selects concrete adapters and passes them in here.
 * This module then assembles the application layer exactly once and exposes a
 * stable facade to HTTP / IPC transports.
 *
 * 外层应用负责选择具体适配器并传入这里。
 * 组合根只做一次组装，然后向 HTTP / IPC 等传输层暴露稳定门面。
 *
 * Governance uses this file as the package's living documentation example for
 * the target monorepo pattern: one composition root per module, constructor
 * injection only, no hidden service locator.
 */

import type { IRuleRepository, IRuleRevisionRepository } from '../domain';
import {
  CreateRuleUseCase,
  UpdateRuleUseCase,
  DeleteRuleUseCase,
  GetRuleUseCase,
  ListRulesUseCase,
  SearchRulesUseCase,
  GetRuleRevisionsUseCase,
  ExportGovernanceRuleBundleUseCase,
  type GovernanceApplicationPort,
} from '../application';
import type {
  GovernanceRuntimeAdapter,
  GovernanceRuntimeAdaptersInput,
} from './runtime';

/**
 * Everything the governance server runtime needs from the outside world.
 * 治理模块服务端运行时向外部索取的全部依赖。
 *
 * Refactor rule for other modules:
 * - only put ports or runtime adapters here
 * - never put transport objects (Express req/res, ipcMain, Router) here
 * - never hide these dependencies behind a singleton container
 */
export interface GovernanceModuleDependencies {
  readonly ruleRepository: IRuleRepository;
  readonly revisionRepository: IRuleRevisionRepository;
  readonly runtimeAdapters?: GovernanceRuntimeAdaptersInput;
}

/**
 * Primary governance composition root return type.
 * 治理模块主组合根返回类型。
 *
 * `api` is the only callable surface.
 * `start` / `dispose` own runtime side effects.
 */
export interface GovernanceModuleInstance {
  readonly api: GovernanceApplicationPort;
  start(): void;
  dispose(): void;
}

function createGovernanceUseCases(
  dependencies: GovernanceModuleDependencies,
): {
  readonly createRule: CreateRuleUseCase;
  readonly updateRule: UpdateRuleUseCase;
  readonly deleteRule: DeleteRuleUseCase;
  readonly getRule: GetRuleUseCase;
  readonly listRules: ListRulesUseCase;
  readonly searchRules: SearchRulesUseCase;
  readonly getRevisions: GetRuleRevisionsUseCase;
  readonly exportRuleBundle: ExportGovernanceRuleBundleUseCase;
} {
  const { ruleRepository, revisionRepository } = dependencies;

  return {
    createRule: new CreateRuleUseCase(ruleRepository, revisionRepository),
    updateRule: new UpdateRuleUseCase(ruleRepository, revisionRepository),
    deleteRule: new DeleteRuleUseCase(ruleRepository),
    getRule: new GetRuleUseCase(ruleRepository),
    listRules: new ListRulesUseCase(ruleRepository),
    searchRules: new SearchRulesUseCase(ruleRepository),
    getRevisions: new GetRuleRevisionsUseCase(revisionRepository),
    exportRuleBundle: new ExportGovernanceRuleBundleUseCase(ruleRepository, revisionRepository),
  };
}

function normalizeRuntimeAdapters(
  runtimeAdapters?: GovernanceRuntimeAdaptersInput,
): readonly GovernanceRuntimeAdapter[] {
  if (!runtimeAdapters) {
    return [];
  }

  if (Array.isArray(runtimeAdapters)) {
    return Array.from(runtimeAdapters);
  }

  return [runtimeAdapters as GovernanceRuntimeAdapter];
}

/**
 * Canonical composition root.
 * 规范化的治理模块主组合根。
 *
 * This is the file other modules should copy first when migrating away from a
 * container-based assembly. The expected reading order is:
 * 1. define `Dependencies`
 * 2. define transport-neutral `ApplicationPort`
 * 3. assemble use cases once
 * 4. wrap them in `api`
 * 5. let the module instance own `start` / `dispose`
 *
 * @param dependencies - GovernanceModuleDependencies describing ports and runtime adapters
 * @returns GovernanceModuleInstance - assembled module instance with api and lifecycle
 */
export function createGovernanceModule(
  dependencies: GovernanceModuleDependencies,
): GovernanceModuleInstance {
  const { ruleRepository, revisionRepository } = dependencies;
  const runtimeAdapters = normalizeRuntimeAdapters(dependencies.runtimeAdapters);
  const useCases = createGovernanceUseCases({ ruleRepository, revisionRepository });
  let started = false;

  const api: GovernanceApplicationPort = {
    createRule: (req, cx) => useCases.createRule.execute(req, cx),
    updateRule: (ruleId, req, cx) => useCases.updateRule.execute(ruleId, req, cx),
    deleteRule: (req, cx) => useCases.deleteRule.execute(req, cx),
    getRule: (req) => useCases.getRule.execute(req),
    listRules: (query) => useCases.listRules.execute(query),
    searchRules: (query, cx) => useCases.searchRules.execute(query, cx),
    getRevisions: (query) => useCases.getRevisions.execute(query),
    exportRuleBundle: () => useCases.exportRuleBundle.execute(),
  };

  return {
    api,
    start(): void {
      if (started) {
        return;
      }

      for (const runtime of runtimeAdapters) {
        runtime.start();
      }

      started = true;
    },
    dispose(): void {
      if (!started) {
        return;
      }

      for (const runtime of [...runtimeAdapters].reverse()) {
        runtime.stop();
      }

      started = false;
    },
  };
}