import type { UserTimeContext } from '@memoflow/time';
import type {
  ChatExecutionProviderConfig,
  ChatExecutionUsage,
} from './chat-execution.port';

export interface AnalyticsQueryContext {
  /** Canonical identity-scoped Product Time context exposed to model synthesis. */
  timeContext: UserTimeContext;
  dashboard?: Record<string, unknown>;
  taskDashboard?: Record<string, unknown>;
  goals: Array<Record<string, unknown>>;
  goalSearchResults: Array<Record<string, unknown>>;
  extra: Record<string, unknown>;
}

export interface AnalyticsQueryInput {
  identityId: string;
  providerConfig: ChatExecutionProviderConfig;
  question: string;
  context: AnalyticsQueryContext;
  requestId?: string;
}

export interface AnalyticsQueryResult {
  answer: string;
  highlights: string[];
  usage: ChatExecutionUsage;
}

export interface IAnalyticsQueryPort {
  query(input: AnalyticsQueryInput): Promise<AnalyticsQueryResult>;
}
