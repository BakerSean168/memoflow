import type { ChatItem } from './types';

function isAgentWaiting(item: ChatItem) {
  const pending = (value: { status: string }) =>
    value.status === 'pending' || value.status === 'sending';
  // Recovered ask_user/approval cards can be pending without an open stream.
  return (
    item.approvals?.some(pending) ||
    item.askUserRequests?.some(pending) ||
    item.nativeRequests?.some(pending)
  );
}

export function isAgentActive(item: ChatItem) {
  return item.status === 'generating' && !isAgentWaiting(item);
}

export function projectAgentActivity(item: ChatItem) {
  const waiting = isAgentWaiting(item);
  const active = item.status === 'generating' && !waiting;
  const records = [
    ...(item.toolActivities ?? (item.toolActivity ? [item.toolActivity] : [])).map((call) => ({
      id: `tool:${call.toolCallId}`,
      name: call.toolName,
      builtin: true,
      state: call.state as string,
    })),
    ...(
      item.nativeActivities ??
      (item.nativeActivity ? [{ ...item.nativeActivity, state: 'running' }] : [])
    ).map((call) => ({
      id: `native:${call.toolCallId}`,
      // Old ACP titles may contain commands/arguments. Only project tool identifiers.
      name: /^[a-zA-Z_][a-zA-Z0-9_.:-]{0,79}$/u.test(call.label) ? call.label : '',
      builtin: false,
      state: call.state as string,
    })),
  ]
    .slice(-256)
    .map((call) => ({
      ...call,
      // A historical running snapshot is not evidence that a tool is still running.
      state: call.state === 'running' && item.status !== 'generating' ? 'interrupted' : call.state,
    }));
  const running = records.filter((call) => call.state === 'running');
  const phase = waiting
    ? 'waiting'
    : item.status === 'generating'
      ? running.length || item.activityUpdatedAt
        ? 'processing'
        : 'preparing'
      : item.status === 'success'
        ? 'completed'
        : item.status === 'aborted'
          ? 'cancelled'
          : item.status;
  return { active, phase, records, running };
}
