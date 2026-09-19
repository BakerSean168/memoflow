/**
 * Governance Controller
 * 治理控制器
 *
 * Encapsulates Zod validation and use case orchestration.
 * 封装 Zod 验证和用例编排。
 *
 * Shared by both Express (HTTP) and IPC transport layers.
 * 供 Express（HTTP）和 IPC 传输层共用。
 *
 * RefArch Phase 2: the canonical shared `ExecutionContext` flows straight from
 * the adapters into the application port — no identity-only conversion here.
 * 接受适配器传入的 canonical `ExecutionContext`，原样交给应用层，不做
 * identity-only 转换。
 */

import type { Result } from '@memoflow/contracts/result';
import { error, ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import {
  DeleteRuleSchema,
  GetRuleRevisionsQuerySchema,
  GetRuleSchema,
  ListRulesQuerySchema,
  SearchRulesQuerySchema,
  UpdateRuleSchema,
} from '@memoflow/contracts/governance';
import type {
  CreateRuleReq,
  CreateRuleRes,
  DeleteRuleReq,
  ExportGovernanceRuleBundleRes,
  GetRuleReq,
  GetRuleRevisionsQueryInput,
  GetRuleRevisionsRes,
  GetRuleRes,
  GovernanceUpdateRuleRpcRequest,
  ListRulesQueryInput,
  ListRulesRes,
  SearchRulesQueryInput,
  SearchRulesRes,
  UpdateRuleRes,
} from '@memoflow/contracts/governance';
import { formatZodErrors } from '@memoflow/utils/result';
import type { GovernanceApplicationPort } from '../application';

/**
 * Thin controller that validates input with Zod schemas and delegates to the
 * transport-neutral governance application port.
 * 使用 Zod 做输入校验，并把调用委托给传输无关的治理应用门面。
 *
 * @param useCases - Callable governance application port shared by HTTP and Electron.
 */
export class GovernanceController {
  constructor(private readonly useCases: GovernanceApplicationPort) {}

  async createRule(input: CreateRuleReq, ctx: ExecutionContext): Promise<Result<CreateRuleRes>> {
    return this.useCases.createRule(input, ctx);
  }

  async updateRule(
    input: GovernanceUpdateRuleRpcRequest,
    ctx: ExecutionContext,
  ): Promise<Result<UpdateRuleRes>> {
    const parsed = UpdateRuleSchema.safeParse(input.body);
    if (!parsed.success) {
      return error('VALIDATION_ERROR', '参数验证失败', formatZodErrors(parsed.error.issues));
    }
    return this.useCases.updateRule(input.ruleId, parsed.data, ctx);
  }

  async updateRuleById(
    ruleId: string,
    input: unknown,
    ctx: ExecutionContext,
  ): Promise<Result<UpdateRuleRes>> {
    return this.updateRule({ ruleId, body: input } as GovernanceUpdateRuleRpcRequest, ctx);
  }

  async deleteRule(input: DeleteRuleReq, ctx: ExecutionContext): Promise<Result<null>> {
    const parsed = DeleteRuleSchema.safeParse(input);
    if (!parsed.success) {
      return error('VALIDATION_ERROR', '参数验证失败', formatZodErrors(parsed.error.issues));
    }
    const result = await this.useCases.deleteRule(parsed.data, ctx);
    if (!result.ok) return result;
    // Serialize as data:null (no { success: boolean } dual-track body).
    return ok(null);
  }

  async deleteRuleById(id: string, ctx: ExecutionContext): Promise<Result<null>> {
    return this.deleteRule({ id } as DeleteRuleReq, ctx);
  }

  async getRule(input: GetRuleReq): Promise<Result<GetRuleRes>> {
    const parsed = GetRuleSchema.safeParse(input);
    if (!parsed.success) {
      return error('VALIDATION_ERROR', '参数验证失败', formatZodErrors(parsed.error.issues));
    }
    return this.useCases.getRule(parsed.data);
  }

  async getRuleByCode(code: string): Promise<Result<GetRuleRes>> {
    return this.getRule({ code } as GetRuleReq);
  }

  async getRuleById(id: string): Promise<Result<GetRuleRes>> {
    return this.getRule({ id } as GetRuleReq);
  }

  async listRules(query: ListRulesQueryInput = {}): Promise<Result<ListRulesRes>> {
    const parsed = ListRulesQuerySchema.safeParse(query);
    if (!parsed.success) {
      return error('VALIDATION_ERROR', '参数验证失败', formatZodErrors(parsed.error.issues));
    }
    return this.useCases.listRules(parsed.data);
  }

  async searchRules(
    query: SearchRulesQueryInput,
    ctx?: ExecutionContext,
  ): Promise<Result<SearchRulesRes>> {
    const parsed = SearchRulesQuerySchema.safeParse(query);
    if (!parsed.success) {
      return error('VALIDATION_ERROR', '参数验证失败', formatZodErrors(parsed.error.issues));
    }

    return this.useCases.searchRules(parsed.data, ctx);
  }

  async exportRuleBundle(): Promise<Result<ExportGovernanceRuleBundleRes>> {
    return this.useCases.exportRuleBundle();
  }

  async getRevisions(query: GetRuleRevisionsQueryInput): Promise<Result<GetRuleRevisionsRes>> {
    const parsed = GetRuleRevisionsQuerySchema.safeParse(query);
    if (!parsed.success) {
      return error('VALIDATION_ERROR', '参数验证失败', formatZodErrors(parsed.error.issues));
    }
    return this.useCases.getRevisions(parsed.data);
  }

  async getRevisionsByRuleId(
    ruleId: string,
    query: Omit<GetRuleRevisionsQueryInput, 'ruleId'>,
  ): Promise<Result<GetRuleRevisionsRes>> {
    return this.getRevisions({ ruleId, ...query } as GetRuleRevisionsQueryInput);
  }
}
