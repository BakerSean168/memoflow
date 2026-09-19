/**
 * Governance Module - RPC Map
 * 规则治理模块 - RPC 映射
 *
 * 【规范说明：RPC Map】
 * 定义模块处理的 RPC（远程过程调用）请求和响应类型。
 * 字符串通道名只允许来自 governance-channels.ts。
 */

import type {
  CreateRuleReq,
  CreateRuleRes,
  UpdateRuleReq,
  UpdateRuleRes,
  GetRuleReq,
  GetRuleRes,
  DeleteRuleReq,
  DeleteRuleRes,
  ListRulesQueryInput,
  ListRulesRes,
  SearchRulesQueryInput,
  SearchRulesRes,
  GetRuleRevisionsQueryInput,
  GetRuleRevisionsRes,
  ExportGovernanceRuleBundleReq,
  ExportGovernanceRuleBundleRes,
} from '../api';
import { GovernanceChannels } from './governance-channels';

export interface GovernanceUpdateRuleRpcRequest {
  readonly ruleId: string;
  readonly body: UpdateRuleReq;
}

export type GovernanceRpcMap = {
  [GovernanceChannels.RULE_CREATE]: [CreateRuleReq, CreateRuleRes];
  [GovernanceChannels.RULE_UPDATE]: [GovernanceUpdateRuleRpcRequest, UpdateRuleRes];
  [GovernanceChannels.RULE_GET]: [GetRuleReq, GetRuleRes];
  [GovernanceChannels.RULE_DELETE]: [DeleteRuleReq, DeleteRuleRes];
  [GovernanceChannels.RULE_LIST]: [ListRulesQueryInput, ListRulesRes];
  [GovernanceChannels.RULE_SEARCH]: [SearchRulesQueryInput, SearchRulesRes];
  [GovernanceChannels.RULE_REVISIONS]: [GetRuleRevisionsQueryInput, GetRuleRevisionsRes];
  [GovernanceChannels.RULE_BUNDLE_EXPORT]: [
    ExportGovernanceRuleBundleReq,
    ExportGovernanceRuleBundleRes,
  ];
};

export type GovernanceRpcChannel = keyof GovernanceRpcMap;
export type GovernanceRpcRequest<K extends GovernanceRpcChannel> = GovernanceRpcMap[K][0];
export type GovernanceRpcResponse<K extends GovernanceRpcChannel> = GovernanceRpcMap[K][1];
