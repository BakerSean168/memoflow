/**
 * Governance client seam.
 * Governance 客户端公开 seam。
 *
 * The governance package only exposes one client-facing interface:
 * callers depend on this seam, while DTO/schema truth stays in
 * `@memoflow/contracts/governance`.
 *
 * 治理模块只保留一个客户端公开 seam：
 * 调用方依赖这里，DTO/schema 真值继续集中在
 * `@memoflow/contracts/governance`。
 */

import type { IResultHttpClient } from '@memoflow/http-client';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import { error, type Result } from '@memoflow/contracts/result';
import {
  GovernanceChannels,
  type CreateRuleReq,
  type CreateRuleRes,
  type DeleteRuleReq,
  type DeleteRuleRes,
  type ExportGovernanceRuleBundleRes,
  type GetRuleReq,
  type GetRuleRes,
  type GetRuleRevisionsQueryInput,
  type GetRuleRevisionsRes,
  type GovernanceRpcRequest,
  type ListRulesQueryInput,
  type ListRulesRes,
  type SearchRulesQueryInput,
  type SearchRulesRes,
  type UpdateRuleReq,
  type UpdateRuleRes,
} from '@memoflow/contracts/governance';

/**
 * Stable governance client interface used by UI callers.
 * UI-specific view models stay outside this package.
 *
 * 面向 UI 调用方的稳定治理客户端接口。
 * UI 展示模型不再放在 governance 包内。
 */
export interface GovernanceClientPort {
  createRule(req: CreateRuleReq): Promise<Result<CreateRuleRes>>;
  getRule(req: GetRuleReq): Promise<Result<GetRuleRes>>;
  updateRule(ruleId: string, req: UpdateRuleReq): Promise<Result<UpdateRuleRes>>;
  deleteRule(req: DeleteRuleReq): Promise<Result<DeleteRuleRes>>;
  listRules(query?: ListRulesQueryInput): Promise<Result<ListRulesRes>>;
  searchRules(query: SearchRulesQueryInput): Promise<Result<SearchRulesRes>>;
  getRevisions(query: GetRuleRevisionsQueryInput): Promise<Result<GetRuleRevisionsRes>>;
  exportRuleBundle(): Promise<Result<ExportGovernanceRuleBundleRes>>;
}

class HttpGovernanceClient implements GovernanceClientPort {
  private readonly baseUrl = '/governance/rules';

  constructor(private readonly httpClient: IResultHttpClient) {}

  createRule(req: CreateRuleReq): Promise<Result<CreateRuleRes>> {
    return this.httpClient.post(this.baseUrl, req);
  }

  getRule(req: GetRuleReq): Promise<Result<GetRuleRes>> {
    if ('id' in req && req.id) {
      return this.httpClient.get(`${this.baseUrl}/${req.id}`);
    }

    if ('code' in req && req.code) {
      return this.httpClient.get(`${this.baseUrl}/by-code/${req.code}`);
    }

    return Promise.resolve(error('VALIDATION_ERROR', 'Must provide either id or code'));
  }

  updateRule(ruleId: string, req: UpdateRuleReq): Promise<Result<UpdateRuleRes>> {
    return this.httpClient.patch(`${this.baseUrl}/${ruleId}`, req);
  }

  deleteRule(req: DeleteRuleReq): Promise<Result<DeleteRuleRes>> {
    return this.httpClient.delete(`${this.baseUrl}/${req.id}`);
  }

  listRules(query?: ListRulesQueryInput): Promise<Result<ListRulesRes>> {
    return this.httpClient.get(this.baseUrl, { params: query });
  }

  searchRules(query: SearchRulesQueryInput): Promise<Result<SearchRulesRes>> {
    return this.httpClient.get(`${this.baseUrl}/search`, { params: query });
  }

  getRevisions(query: GetRuleRevisionsQueryInput): Promise<Result<GetRuleRevisionsRes>> {
    return this.httpClient.get(`${this.baseUrl}/${query.ruleId}/revisions`, {
      params: {
        page: query.page,
        pageSize: query.pageSize,
      },
    });
  }

  exportRuleBundle(): Promise<Result<ExportGovernanceRuleBundleRes>> {
    return this.httpClient.get(`${this.baseUrl}/bundle`);
  }
}

class IpcGovernanceClient implements GovernanceClientPort {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  createRule(req: CreateRuleReq): Promise<Result<CreateRuleRes>> {
    return this.ipcClient.invoke(GovernanceChannels.RULE_CREATE, req);
  }

  getRule(req: GetRuleReq): Promise<Result<GetRuleRes>> {
    return this.ipcClient.invoke(GovernanceChannels.RULE_GET, req);
  }

  updateRule(ruleId: string, req: UpdateRuleReq): Promise<Result<UpdateRuleRes>> {
    const payload: GovernanceRpcRequest<typeof GovernanceChannels.RULE_UPDATE> = {
      ruleId,
      body: req,
    };
    return this.ipcClient.invoke(GovernanceChannels.RULE_UPDATE, payload);
  }

  deleteRule(req: DeleteRuleReq): Promise<Result<DeleteRuleRes>> {
    return this.ipcClient.invoke(GovernanceChannels.RULE_DELETE, req);
  }

  listRules(query?: ListRulesQueryInput): Promise<Result<ListRulesRes>> {
    return this.ipcClient.invoke(GovernanceChannels.RULE_LIST, query ?? {});
  }

  searchRules(query: SearchRulesQueryInput): Promise<Result<SearchRulesRes>> {
    return this.ipcClient.invoke(GovernanceChannels.RULE_SEARCH, query);
  }

  getRevisions(query: GetRuleRevisionsQueryInput): Promise<Result<GetRuleRevisionsRes>> {
    return this.ipcClient.invoke(GovernanceChannels.RULE_REVISIONS, query);
  }

  exportRuleBundle(): Promise<Result<ExportGovernanceRuleBundleRes>> {
    return this.ipcClient.invoke(GovernanceChannels.RULE_BUNDLE_EXPORT, {});
  }
}

/**
 * Creates the governance HTTP client seam.
 * 创建治理模块的 HTTP client seam。
 *
 * @param httpClient - Shared Result HTTP client supplied by the app layer.
 * @returns GovernanceClientPort backed by HTTP transport.
 */
export function createGovernanceHttpClient(
  httpClient: IResultHttpClient,
): GovernanceClientPort {
  return new HttpGovernanceClient(httpClient);
}

/**
 * Creates the governance IPC client seam.
 * 创建治理模块的 IPC client seam。
 *
 * @param ipcClient - Shared IResultIpcClient (ResultIpcClient) supplied by the app layer.
 * @returns GovernanceClientPort backed by IPC transport.
 */
export function createGovernanceIpcClient(
  ipcClient: IResultIpcClient,
): GovernanceClientPort {
  return new IpcGovernanceClient(ipcClient);
}