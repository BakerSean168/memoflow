/**
 * Fixed-window admission budgets for the hosted MCP gateway, requests per minute.
 *
 * These are admission ceilings, not capacity guarantees. They were calibrated from
 * MCP client tool-call density (a client may issue several `tools/call` requests per
 * assistant turn, and one owner may run several clients): the credential budget must
 * absorb a single aggressive agent loop, the owner budget covers concurrent clients
 * of one identity, and the IP budget only guards volumetric abuse because shared
 * egress addresses are not a per-user budget. The API host may override each value
 * through configuration.
 */
export const DEFAULT_EXTERNAL_AGENT_RATE_LIMITS = {
  ipPerMinute: 1200,
  ownerPerMinute: 480,
  credentialPerMinute: 240,
} as const;

export interface ExternalAgentRateLimits {
  readonly ipPerMinute: number;
  readonly ownerPerMinute: number;
  readonly credentialPerMinute: number;
}
