import type { RequestContext } from '@mastra/core/request-context';

export interface ModelUserTimeContext {
  readonly timeZone: string;
  readonly weekStartsOn: number;
}

export function readModelUserTimeContext(
  requestContext: RequestContext | { getRaw(key: string): unknown },
): ModelUserTimeContext | null {
  const raw = requestContext.getRaw('timeContext');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.timeZone !== 'string' || !row.timeZone.trim()) return null;
  if (!Number.isInteger(row.weekStartsOn)) return null;
  return {
    timeZone: row.timeZone,
    weekStartsOn: Number(row.weekStartsOn),
  };
}

export function userTimeContextInstruction(
  requestContext: RequestContext | { getRaw(key: string): unknown },
  locale: 'zh-CN' | 'en-US' | undefined,
): string {
  const context = readModelUserTimeContext(requestContext);
  if (!context) {
    throw new Error('AI model request requires canonical user TimeContext');
  }
  return locale === 'en-US'
    ? `Canonical user time context: IANA timezone=${context.timeZone}; weekStartsOn=${context.weekStartsOn}. Interpret relative/local dates in this timezone. When a Task/Reminder timezone is omitted, use this timezone; never substitute server-local time or UTC.`
    : `用户规范时间上下文：IANA 时区=${context.timeZone}；weekStartsOn=${context.weekStartsOn}。相对日期和本地日期必须按该时区解释；Task/Reminder 未显式给出时区时使用该时区，绝不能改用服务器本地时区或 UTC。`;
}
