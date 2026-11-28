import type { ScheduledIntent } from './contracts';

/**
 * Which host is allowed to execute a scheduled invocation.
 *
 * `invocation_attempts` and `scheduled_invocations` are replicated to every
 * Desktop profile, so a "pending" row is visible to the cloud Scheduler and to
 * the local Desktop Scheduler at the same time. Without an explicit owner both
 * hosts claim and run the same invocation — the #1125 double execution.
 *
 * The domain is business data (it travels with the invocation), not host state:
 * both hosts project the same intent, so both stamp the same tag and converge.
 * The tag lives in the existing `observability.tags` column, which already
 * round-trips through Prisma and PowerSync, so no schema migration is needed.
 */
export type SchedulerExecutionDomain = 'cloud' | 'local';

/**
 * Scheduler-lane work is cloud-executed unless a projector says otherwise.
 * Desktop keeps its queue for explicitly `local` work and for delivering
 * cloud-produced notification requests.
 */
export const DEFAULT_SCHEDULER_EXECUTION_DOMAIN: SchedulerExecutionDomain = 'cloud';

const EXECUTION_DOMAIN_TAG_PREFIX = 'execution-domain:';

const EXECUTION_DOMAIN_TAGS: Readonly<Record<SchedulerExecutionDomain, string>> = {
  cloud: `${EXECUTION_DOMAIN_TAG_PREFIX}cloud`,
  local: `${EXECUTION_DOMAIN_TAG_PREFIX}local`,
};

export function schedulerExecutionDomainTag(domain: SchedulerExecutionDomain): string {
  return EXECUTION_DOMAIN_TAGS[domain];
}

function isExecutionDomainTag(tag: string): boolean {
  return tag.startsWith(EXECUTION_DOMAIN_TAG_PREFIX);
}

/**
 * Domain recorded on an invocation, or `null` when the row carries no marker
 * (legacy rows written before this contract). Ambiguous rows — both domains
 * present, which only a foreign writer can produce — also resolve to `null`
 * so the host falls back to the default instead of trusting a contradiction.
 */
export function resolveSchedulerExecutionDomain(
  tags: readonly string[] | null | undefined,
): SchedulerExecutionDomain | null {
  if (!tags) return null;
  const matches = tags.filter(
    (tag) => tag === EXECUTION_DOMAIN_TAGS.cloud || tag === EXECUTION_DOMAIN_TAGS.local,
  );
  if (matches.length !== 1) return null;
  return matches[0] === EXECUTION_DOMAIN_TAGS.cloud ? 'cloud' : 'local';
}

/**
 * Ensure a tag set carries exactly one execution-domain tag, defaulting to the
 * cloud host. Used for persisted invocations too, so a legacy row without a
 * marker fingerprints the same as the intent that would rebuild it.
 */
export function withDefaultSchedulerExecutionDomainTags(
  tags: readonly string[] | null | undefined,
): string[] {
  const current = tags ?? [];
  const domain = resolveSchedulerExecutionDomain(current) ?? DEFAULT_SCHEDULER_EXECUTION_DOMAIN;
  return [
    ...current.filter((tag) => !isExecutionDomainTag(tag)),
    schedulerExecutionDomainTag(domain),
  ];
}

/**
 * Ensure an intent carries exactly one execution-domain tag, defaulting to the
 * cloud host. Applied before fingerprinting and persistence so both hosts
 * project the identical tag set and reconciliation does not flap.
 */
export function withDefaultSchedulerExecutionDomain<TIntent extends ScheduledIntent>(
  intent: TIntent,
): TIntent {
  const tags = withDefaultSchedulerExecutionDomainTags(intent.observability?.tags);
  return {
    ...intent,
    observability: {
      ...intent.observability,
      tags,
    },
  };
}
