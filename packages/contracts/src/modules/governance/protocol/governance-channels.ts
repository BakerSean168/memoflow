/**
 * Governance RPC channels.
 * Governance RPC 通道常量。
 *
 * Runtime string names live here; GovernanceRpcMap references these constants
 * so channel identifiers have one runtime source of truth.
 *
 * 运行时字符串常量统一放在这里；GovernanceRpcMap 通过这些常量建立映射，
 * 保证通道标识只有一个运行时真值源。
 */

export const GovernanceChannels = {
  RULE_LIST: 'governance:rule:list',
  RULE_GET: 'governance:rule:get',
  RULE_SEARCH: 'governance:rule:search',
  RULE_CREATE: 'governance:rule:create',
  RULE_UPDATE: 'governance:rule:update',
  RULE_DELETE: 'governance:rule:delete',
  RULE_REVISIONS: 'governance:rule-revision:list',
  RULE_BUNDLE_EXPORT: 'governance:rule-bundle:export',
} as const;
