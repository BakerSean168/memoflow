/**
 * Residual 947: sole HTTP Result envelope type guards for desktop remote gateways.
 * Auth and knowledge-repository gateways import these; local isRecord/hasDataKey duals retired.
 * Envelope payload shapes remain module keep-boundaries (AuthHttpEnvelope ≠ knowledge HttpEnvelope).
 * Soft residual 1089: app-vue AI isRecord plain-object keep-boundary (rejects arrays; no force-merge).
 * Soft residual 1139: sanitize-for-ipc isPlainObject (prototype-strict) remains separate (no force-merge).
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/** Narrow unknown JSON body to a record that has a `data` key (MemoFlow HttpResponse envelope). */
export function hasDataKey(body: unknown): body is Record<string, unknown> & { data: unknown } {
  return isRecord(body) && 'data' in body;
}
