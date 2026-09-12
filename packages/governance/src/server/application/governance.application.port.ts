/**
 * Governance transport-neutral application port.
 * Governance 传输无关的应用门面。
 *
 * This seam is the single callable interface exposed by the assembled
 * governance use cases. HTTP and Electron transports both depend on it.
 *
 * 这是治理用例组装完成后暴露出的唯一可调用接口。
 * HTTP 和 Electron 传输层都依赖这一个 seam。
 */

import type {
  CreateRuleReq,
  CreateRuleRes,
  DeleteRuleReq,
  DeleteRuleRes,
  ExportGovernanceRuleBundleRes,
  GetRuleReq,
  GetRuleRes,
  GetRuleRevisionsQuery,
  GetRuleRevisionsRes,
  ListRulesQuery,
  ListRulesRes,
  SearchRulesQueryInput,
  SearchRulesRes,
  UpdateRuleReq,
  UpdateRuleRes,
} from '@memoflow/contracts/governance';
import type { Result } from '@memoflow/contracts/result';
import type { ExecutionContext } from './use-cases';

/** Transport-neutral callable governance use cases. 传输层无关的治理用例调用面。 */
export interface GovernanceApplicationPort {
  createRule(req: CreateRuleReq, cx: ExecutionContext): Promise<Result<CreateRuleRes>>;
  updateRule(
    ruleId: string,
    req: UpdateRuleReq,
    cx: ExecutionContext,
  ): Promise<Result<UpdateRuleRes>>;
  deleteRule(req: DeleteRuleReq, cx: ExecutionContext): Promise<Result<DeleteRuleRes>>;
  getRule(req: GetRuleReq): Promise<Result<GetRuleRes>>;
  listRules(query: ListRulesQuery): Promise<Result<ListRulesRes>>;
  searchRules(query: SearchRulesQueryInput, cx?: ExecutionContext): Promise<Result<SearchRulesRes>>;
  getRevisions(query: GetRuleRevisionsQuery): Promise<Result<GetRuleRevisionsRes>>;
  exportRuleBundle(): Promise<Result<ExportGovernanceRuleBundleRes>>;
}
