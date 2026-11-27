/**
 * Agent activity and chat timeline projection.
 *
 * Pure timeline/turn projection, shared second-tick clock, and duration
 * formatting patterns are adapted from T3 Code (MIT License, Copyright (c) 2026
 * T3 Tools Inc., https://github.com/pingdotgg/t3code).
 */

import type { AssistantRuntimeEvent } from '@memoflow/ai-contracts';
import { ref, toRaw } from 'vue';
import type { ChatAskUserRequest, ChatItem, ChatNativeRequest, ChatToolApproval } from './types';

export interface ChatRunTiming {
  readonly runId: string;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
  readonly pausedDurationMs: number;
  readonly pausedAt?: number | null;
  readonly clockOffsetMs?: number;
  readonly terminalObserved?: boolean;
}

export interface AgentActivityRecord {
  readonly id: string;
  readonly name: string;
  readonly builtin: boolean;
  readonly state: string;
}

export type ToolGroupSummaryKind = 'read' | 'search' | 'edit' | 'mixed' | 'tool';

export interface ChatTurnFoldRow {
  readonly kind: 'turn-fold';
  readonly id: string;
  readonly turnKey: string;
  readonly runId: string | null;
  readonly status: 'completed' | 'cancelled' | 'failed' | 'interrupted';
  readonly elapsedMs: number | null;
  readonly expanded: boolean;
  readonly collapsible: boolean;
}

export type ChatWorkRow =
  | {
      readonly kind: 'working';
      readonly id: string;
      readonly turnKey: string;
      readonly startedAt: number | null;
      readonly pausedDurationMs: number;
      readonly pausedAt: number | null;
      readonly clockOffsetMs: number;
      readonly isWaiting: boolean;
      readonly phase: 'preparing' | 'processing' | 'waiting';
    }
  | {
      readonly kind: 'work-live';
      readonly id: string;
      readonly groupId: string;
      readonly entry: AgentActivityRecord;
      readonly groupedEntries: ReadonlyArray<AgentActivityRecord>;
      readonly expanded: boolean;
      readonly active: boolean;
    }
  | {
      readonly kind: 'work-toggle';
      readonly id: string;
      readonly groupId: string;
      readonly hiddenCount: number;
      readonly expanded: boolean;
      readonly hasFailure: boolean;
      readonly summaryKind: ToolGroupSummaryKind;
      readonly groupedEntries: ReadonlyArray<AgentActivityRecord>;
    }
  | {
      readonly kind: 'work';
      readonly id: string;
      readonly groupId: string;
      readonly groupedEntries: ReadonlyArray<AgentActivityRecord>;
      readonly isExpandedToolGroup: boolean;
    };

export interface AssistantTurnMessagePart {
  readonly id: string;
  readonly item: ChatItem;
}

export interface UserMessageTimelineRow {
  readonly kind: 'user-message';
  readonly id: string;
  readonly item: ChatItem;
  readonly groupedWithPrevious: boolean;
  readonly groupedWithNext: boolean;
}

export interface AssistantTurnTimelineRow {
  readonly kind: 'assistant-turn';
  readonly id: string;
  readonly turnKey: string;
  readonly runId: string | null;
  readonly items: ReadonlyArray<ChatItem>;
  readonly primaryItem: ChatItem;
  readonly status: 'working' | 'waiting' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
  readonly phase:
    | 'preparing'
    | 'processing'
    | 'waiting'
    | 'completed'
    | 'cancelled'
    | 'error'
    | 'interrupted';
  readonly isActive: boolean;
  readonly isWaiting: boolean;
  readonly timing: ChatRunTiming | null;
  readonly elapsedMs: number | null;
  readonly activityUpdatedAt?: number;
  readonly records: ReadonlyArray<AgentActivityRecord>;
  readonly runningRecords: ReadonlyArray<AgentActivityRecord>;
  readonly workRows: ReadonlyArray<ChatWorkRow>;
  readonly foldRow: ChatTurnFoldRow | null;
  readonly approvals: ReadonlyArray<ChatToolApproval>;
  readonly askUserRequests: ReadonlyArray<ChatAskUserRequest>;
  readonly nativeRequests: ReadonlyArray<ChatNativeRequest>;
  readonly localAgentSource?: ChatItem['localAgentSource'];
  readonly messages: ReadonlyArray<AssistantTurnMessagePart>;
  readonly hasFailedTool: boolean;
}

export type ChatTimelineRow = UserMessageTimelineRow | AssistantTurnTimelineRow;

/**
 * Shared store-shaped clock ported from T3 Code `packages/client-runtime/src/clock.ts`.
 * A single timer serves all live rows and clears as soon as the last subscriber leaves.
 */
export interface ClockStore<A> {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => A;
}

function makeTickStore<A>(read: () => A, periodMs: number): ClockStore<A> {
  let value = read();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const schedule = () => {
    timer = setTimeout(
      () => {
        timer = undefined;
        const next = read();
        if (next !== value) {
          value = next;
          for (const listener of listeners) listener();
        }
        if (listeners.size > 0 && timer === undefined) schedule();
      },
      periodMs - (Date.now() % periodMs),
    );
  };

  return {
    subscribe: (listener) => {
      if (listeners.size === 0) {
        value = read();
        schedule();
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          clearTimeout(timer);
          timer = undefined;
        }
      };
    },
    getSnapshot: () => {
      if (timer === undefined) value = read();
      return value;
    },
  };
}

/** Epoch ms floored to the second, advancing on each wall-clock second. */
export const secondTick: ClockStore<number> = makeTickStore(
  () => Math.floor(Date.now() / 1000) * 1000,
  1000,
);

/** Subscribe to `secondTick` only while the document is visible; tears down immediately when hidden/unmounted. */
export function subscribeVisibleSecondTick(onTick: (nowMs: number) => void): () => void {
  let unsubscribeTick: (() => void) | undefined;
  let disposed = false;

  const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

  const syncSubscription = () => {
    if (disposed) return;
    if (isVisible()) {
      if (!unsubscribeTick) {
        unsubscribeTick = secondTick.subscribe(() => onTick(Date.now()));
        onTick(Date.now());
      }
    } else if (unsubscribeTick) {
      unsubscribeTick();
      unsubscribeTick = undefined;
    }
  };

  syncSubscription();
  const onVisibilityChange = () => syncSubscription();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  return () => {
    disposed = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
    unsubscribeTick?.();
    unsubscribeTick = undefined;
  };
}

function isZhLocale(locale: string | undefined): boolean {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('zh');
}

/** Duration formatter ported from T3 Code `packages/shared/src/orchestrationTimingCopy.ts`. */
export function formatDuration(durationMs: number, locale = 'en-US'): string {
  const zh = isZhLocale(locale);
  if (!Number.isFinite(durationMs) || durationMs < 0) return zh ? '0 毫秒' : '0ms';
  if (durationMs < 1_000) {
    const ms = Math.max(1, Math.round(durationMs));
    return zh ? `${ms} 毫秒` : `${ms}ms`;
  }
  if (durationMs < 10_000) {
    const seconds = Math.round(durationMs / 100) / 10;
    return zh ? `${seconds} 秒` : `${seconds}s`;
  }
  const totalSeconds = Math.round(durationMs / 1_000);
  if (totalSeconds < 60) {
    return zh ? `${totalSeconds} 秒` : `${totalSeconds}s`;
  }
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours === 0) {
    return zh ? `${minutes} 分 ${seconds} 秒` : `${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return zh ? `${hours} 小时 ${minutes} 分 ${seconds} 秒` : `${hours}h ${minutes}m ${seconds}s`;
  }
  if (seconds > 0) {
    return zh ? `${hours} 小时 ${seconds} 秒` : `${hours}h ${seconds}s`;
  }
  return zh ? `${hours} 小时` : `${hours}h`;
}

/** Live working timer formatter ported from T3 Code `TimelineWorkGroupRows.logic.ts`. */
export function formatWorkingTimer(elapsedMs: number, locale = 'en-US'): string {
  const zh = isZhLocale(locale);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return zh ? '0 秒' : '0s';
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (elapsedSeconds < 60) {
    return zh ? `${elapsedSeconds} 秒` : `${elapsedSeconds}s`;
  }
  return formatDuration(elapsedSeconds * 1_000, locale);
}

const itemRunTimingMap = new WeakMap<ChatItem, ChatRunTiming>();
export const runTimingProjectionRevision = ref(0);

function runTimingsEqual(left: ChatRunTiming | undefined, right: ChatRunTiming): boolean {
  if (!left) return false;
  return (
    left.runId === right.runId &&
    left.startedAt === right.startedAt &&
    left.completedAt === right.completedAt &&
    left.pausedDurationMs === right.pausedDurationMs &&
    (left.pausedAt ?? null) === (right.pausedAt ?? null) &&
    (left.clockOffsetMs ?? 0) === (right.clockOffsetMs ?? 0) &&
    Boolean(left.terminalObserved) === Boolean(right.terminalObserved)
  );
}

export function setItemRunTiming(item: ChatItem, timing: ChatRunTiming): void {
  const raw = toRaw(item);
  const existing = itemRunTimingMap.get(raw);
  if (runTimingsEqual(existing, timing)) return;
  itemRunTimingMap.set(raw, timing);
  runTimingProjectionRevision.value += 1;
}

export function getItemRunTiming(item: ChatItem): ChatRunTiming | null {
  const raw = toRaw(item);
  const inline = (raw as ChatItem & { runTiming?: ChatRunTiming }).runTiming;
  return inline ?? itemRunTimingMap.get(raw) ?? null;
}

/**
 * Pure event-driven run timing reducer.
 *
 * Uses only runtime envelope timestamps (`event.createdAt`), never client
 * observation timestamps, for elapsed calculations. Handles duplicate started
 * events, waiting pauses, out-of-order arrivals, and missing terminal/start events.
 */
export function reduceRunTimingOnEvent(
  previous: ChatRunTiming | undefined,
  event: AssistantRuntimeEvent,
  hasPendingWait: boolean,
  clientNowMs = Date.now(),
): ChatRunTiming {
  const sameRun = previous?.runId === event.runId ? previous : undefined;
  const base: ChatRunTiming = sameRun ?? {
    runId: event.runId,
    startedAt: null,
    completedAt: null,
    pausedDurationMs: 0,
    pausedAt: null,
    clockOffsetMs: 0,
    terminalObserved: false,
  };

  if (event.type === 'assistant.run.started') {
    const earliestStart =
      base.startedAt === null ? event.createdAt : Math.min(base.startedAt, event.createdAt);
    const clockOffsetMs =
      base.startedAt === null
        ? event.createdAt > clientNowMs
          ? event.createdAt - clientNowMs
          : 0
        : (base.clockOffsetMs ?? 0);
    // Out-of-order late started after pause/completion keeps existing pause/terminal timestamps clamped.
    const pausedAt =
      base.pausedAt != null ? Math.max(earliestStart, base.pausedAt) : (base.pausedAt ?? null);
    const completedAt = base.completedAt != null ? Math.max(earliestStart, base.completedAt) : null;
    return {
      ...base,
      startedAt: earliestStart,
      pausedAt,
      completedAt,
      clockOffsetMs,
    };
  }

  // Once a terminal outcome is observed for this run, late non-terminal events cannot reopen or shift timing.
  if (base.terminalObserved) {
    return base;
  }

  if (
    event.type === 'assistant.approval.required' ||
    event.type === 'assistant.ask_user.required' ||
    event.type === 'assistant.request.required'
  ) {
    if (base.pausedAt != null) return base;
    const pausedAt =
      base.startedAt !== null ? Math.max(base.startedAt, event.createdAt) : event.createdAt;
    return {
      ...base,
      pausedAt,
    };
  }

  if (
    event.type === 'assistant.approval.resolved' ||
    event.type === 'assistant.ask_user.resolved' ||
    event.type === 'assistant.request.resolved'
  ) {
    if (hasPendingWait || base.pausedAt == null) return base;
    const addedPause = Math.max(0, event.createdAt - base.pausedAt);
    return {
      ...base,
      pausedDurationMs: base.pausedDurationMs + addedPause,
      pausedAt: null,
    };
  }

  if (
    event.type === 'assistant.run.completed' ||
    event.type === 'assistant.run.failed' ||
    event.type === 'assistant.run.cancelled'
  ) {
    const closingPause = base.pausedAt != null ? Math.max(0, event.createdAt - base.pausedAt) : 0;
    const completedAt =
      base.startedAt !== null ? Math.max(base.startedAt, event.createdAt) : event.createdAt;
    return {
      ...base,
      completedAt,
      pausedDurationMs: base.pausedDurationMs + closingPause,
      pausedAt: null,
      terminalObserved: true,
    };
  }

  return base;
}

/**
 * Compute active generation duration in milliseconds from a `ChatRunTiming`.
 * Returns `null` when reliable runtime start/terminal boundaries are absent.
 */
export function computeRunElapsedMs(
  timing: ChatRunTiming | null | undefined,
  liveNowMs?: number,
): number | null {
  if (!timing || timing.startedAt === null || !Number.isFinite(timing.startedAt)) {
    return null;
  }
  const pausedDuration = Number.isFinite(timing.pausedDurationMs)
    ? Math.max(0, timing.pausedDurationMs)
    : 0;
  if (
    timing.terminalObserved &&
    timing.completedAt !== null &&
    Number.isFinite(timing.completedAt)
  ) {
    return Math.max(0, timing.completedAt - timing.startedAt - pausedDuration);
  }
  if (liveNowMs !== undefined && Number.isFinite(liveNowMs)) {
    if (timing.pausedAt != null && Number.isFinite(timing.pausedAt)) {
      return Math.max(0, timing.pausedAt - timing.startedAt - pausedDuration);
    }
    return Math.max(0, liveNowMs + (timing.clockOffsetMs ?? 0) - timing.startedAt - pausedDuration);
  }
  return null;
}

export function isAgentWaiting(item: ChatItem): boolean {
  const pending = (value: { status: string }) =>
    value.status === 'pending' || value.status === 'sending';
  // Recovered ask_user/approval cards can be pending without an open stream.
  return Boolean(
    item.approvals?.some(pending) ||
    item.askUserRequests?.some(pending) ||
    item.nativeRequests?.some(pending),
  );
}

export function isAgentActive(item: ChatItem) {
  return item.status === 'generating' && !isAgentWaiting(item);
}

function projectRawItemRecords(item: ChatItem): AgentActivityRecord[] {
  return [
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
}

export function projectAgentActivity(item: ChatItem) {
  const waiting = isAgentWaiting(item);
  const active = item.status === 'generating' && !waiting;
  const records = projectRawItemRecords(item);
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

function resolveItemRunId(item: ChatItem, timing: ChatRunTiming | null): string | null {
  return (
    timing?.runId ??
    item.localAgentSource?.runId ??
    item.approvals?.[0]?.runId ??
    item.askUserRequests?.[0]?.runId ??
    item.nativeRequests?.[0]?.runId ??
    item.businessOperation?.runId ??
    null
  );
}

function itemHasVisibleContent(item: ChatItem, timing: ChatRunTiming | null): boolean {
  return Boolean(
    item.role === 'user' ||
    item.content.trim() ||
    item.status !== 'success' ||
    item.attachments?.length ||
    item.toolActivity ||
    item.toolActivities?.length ||
    item.approvals?.length ||
    item.nativeActivity ||
    item.nativeActivities?.length ||
    item.nativeRequests?.length ||
    item.askUserRequests?.length ||
    item.workflowInterruption ||
    item.businessOperation ||
    (timing && timing.startedAt !== null && timing.terminalObserved),
  );
}

function isReceiptOrActivityOnlyItem(item: ChatItem): boolean {
  return (
    item.role === 'assistant' &&
    !item.content.trim() &&
    !item.workflowInterruption &&
    !item.errorMessage &&
    Boolean(
      item.approvals?.length ||
      item.askUserRequests?.length ||
      item.nativeRequests?.length ||
      item.toolActivities?.length ||
      item.toolActivity ||
      item.nativeActivities?.length ||
      item.nativeActivity ||
      item.businessOperation,
    )
  );
}

function classifyToolSummaryKind(
  records: ReadonlyArray<AgentActivityRecord>,
): ToolGroupSummaryKind {
  if (records.length === 0) return 'tool';
  let readCount = 0;
  let searchCount = 0;
  let editCount = 0;
  let otherCount = 0;
  for (const record of records) {
    const name = record.name.toLowerCase();
    if (
      name.includes('search') ||
      name.includes('query') ||
      name.includes('grep') ||
      name.includes('find')
    ) {
      searchCount += 1;
    } else if (
      name.includes('overview') ||
      name.includes('summary') ||
      name.includes('upcoming') ||
      name.includes('read') ||
      name.includes('view')
    ) {
      readCount += 1;
    } else if (
      name.includes('create') ||
      name.includes('set') ||
      name.includes('clear') ||
      name.includes('edit') ||
      name.includes('write') ||
      name.includes('start') ||
      name.includes('pause') ||
      name.includes('resume') ||
      name.includes('end') ||
      name.includes('execute')
    ) {
      editCount += 1;
    } else {
      otherCount += 1;
    }
  }
  const activeKinds = [readCount > 0, searchCount > 0, editCount > 0, otherCount > 0].filter(
    Boolean,
  ).length;
  if (activeKinds > 1) return 'mixed';
  if (searchCount > 0) return 'search';
  if (readCount > 0) return 'read';
  if (editCount > 0) return 'edit';
  return 'tool';
}

function aggregateTurnRecords(
  items: ReadonlyArray<ChatItem>,
  turnGenerating: boolean,
): AgentActivityRecord[] {
  const byId = new Map<string, AgentActivityRecord>();
  for (const item of items) {
    for (const record of projectRawItemRecords(item)) {
      const normalized: AgentActivityRecord =
        record.state === 'running' && !turnGenerating
          ? { ...record, state: 'interrupted' }
          : record;
      if (byId.has(normalized.id)) {
        byId.delete(normalized.id);
      }
      byId.set(normalized.id, normalized);
    }
  }
  return [...byId.values()].slice(-256);
}

function pickTurnTiming(
  items: ReadonlyArray<ChatItem>,
  getRunTiming: (item: ChatItem) => ChatRunTiming | null,
): ChatRunTiming | null {
  let candidate: ChatRunTiming | null = null;
  for (const item of items) {
    const timing = getRunTiming(item);
    if (!timing) continue;
    if (
      !candidate ||
      (timing.startedAt !== null && candidate.startedAt === null) ||
      (timing.terminalObserved && !candidate.terminalObserved)
    ) {
      candidate = timing;
    }
  }
  return candidate;
}

export interface DeriveChatTimelineRowsInput {
  readonly timeline: ReadonlyArray<ChatItem>;
  readonly expandedTurnKeys?: ReadonlySet<string>;
  readonly collapsedTurnKeys?: ReadonlySet<string>;
  readonly expandedWorkGroupIds?: ReadonlySet<string>;
  readonly collapsedWorkGroupIds?: ReadonlySet<string>;
  readonly getRunTiming?: (item: ChatItem) => ChatRunTiming | null;
}

/**
 * Derive T3-aligned timeline rows (grouped user bubbles, run-aggregated working/turn-fold/work-group rows)
 * from MemoFlow's `ChatItem[]` while preserving all approvals, errors, native requests, business receipts,
 * and workflow interruptions.
 */
export function deriveChatTimelineRows(input: DeriveChatTimelineRowsInput): ChatTimelineRow[] {
  const resolveTiming = input.getRunTiming ?? getItemRunTiming;
  const visibleItems = input.timeline.filter((item) =>
    itemHasVisibleContent(item, resolveTiming(item)),
  );

  // Group consecutive assistant items that share the same runId or belong to the same receipt+reply turn.
  const segments: Array<
    | { kind: 'user'; item: ChatItem }
    | { kind: 'assistant'; items: ChatItem[]; runId: string | null }
  > = [];

  for (const item of visibleItems) {
    if (item.role === 'user') {
      segments.push({ kind: 'user', item });
      continue;
    }
    const itemRunId = resolveItemRunId(item, resolveTiming(item));
    const previous = segments[segments.length - 1];
    if (previous?.kind === 'assistant') {
      const sameRun = itemRunId !== null && previous.runId === itemRunId;
      const canMergeUnkeyedReceipt =
        (itemRunId === null || previous.runId === null) &&
        (previous.items.every(isReceiptOrActivityOnlyItem) || isReceiptOrActivityOnlyItem(item));
      if (sameRun || canMergeUnkeyedReceipt) {
        previous.items.push(item);
        if (previous.runId === null && itemRunId !== null) {
          previous.runId = itemRunId;
        }
        continue;
      }
    }
    segments.push({ kind: 'assistant', items: [item], runId: itemRunId });
  }

  const rows: ChatTimelineRow[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (segment.kind === 'user') {
      const prev = segments[index - 1];
      const next = segments[index + 1];
      rows.push({
        kind: 'user-message',
        id: segment.item.id,
        item: segment.item,
        groupedWithPrevious: prev?.kind === 'user',
        groupedWithNext: next?.kind === 'user',
      });
      continue;
    }

    const { items, runId } = segment;
    const primaryItem = items[items.length - 1]!;
    const turnKey = runId ? `run:${runId}` : `item:${primaryItem.id}`;
    const timing = pickTurnTiming(items, resolveTiming);
    const isWaiting = items.some(isAgentWaiting);
    const turnGenerating = items.some((item) => item.status === 'generating');
    const isActive = turnGenerating && !isWaiting;

    const status: AssistantTurnTimelineRow['status'] = isWaiting
      ? 'waiting'
      : turnGenerating
        ? 'working'
        : items.some((item) => item.status === 'error')
          ? 'failed'
          : items.some((item) => item.status === 'aborted')
            ? 'cancelled'
            : items.some((item) => item.status === 'interrupted')
              ? 'interrupted'
              : 'completed';

    const records = aggregateTurnRecords(items, turnGenerating);
    const runningRecords = records.filter((record) => record.state === 'running');
    const activityUpdatedAt = items.reduce<number | undefined>(
      (latest, item) =>
        item.activityUpdatedAt !== undefined &&
        (latest === undefined || item.activityUpdatedAt > latest)
          ? item.activityUpdatedAt
          : latest,
      undefined,
    );

    const phase: AssistantTurnTimelineRow['phase'] = isWaiting
      ? 'waiting'
      : turnGenerating
        ? runningRecords.length > 0 || activityUpdatedAt !== undefined || timing?.startedAt != null
          ? 'processing'
          : 'preparing'
        : status === 'completed'
          ? 'completed'
          : status === 'cancelled'
            ? 'cancelled'
            : status === 'failed'
              ? 'error'
              : 'interrupted';

    const hasFailedTool = records.some((record) => record.state === 'failed');
    const workRows: ChatWorkRow[] = [];
    let foldRow: ChatTurnFoldRow | null = null;

    if (status === 'working' || status === 'waiting') {
      workRows.push({
        kind: 'working',
        id: `working:${turnKey}`,
        turnKey,
        startedAt: timing?.startedAt ?? null,
        pausedDurationMs: timing?.pausedDurationMs ?? 0,
        pausedAt: timing?.pausedAt ?? null,
        clockOffsetMs: timing?.clockOffsetMs ?? 0,
        isWaiting,
        phase: phase === 'waiting' ? 'waiting' : phase === 'preparing' ? 'preparing' : 'processing',
      });
      if (records.length > 0) {
        const groupId = `work-group:${turnKey}`;
        const expanded =
          (hasFailedTool && !input.collapsedWorkGroupIds?.has(groupId)) ||
          (input.expandedWorkGroupIds?.has(groupId) ?? false);
        const latestEntry =
          runningRecords[runningRecords.length - 1] ?? records[records.length - 1]!;
        workRows.push({
          kind: 'work-live',
          id: `work-live:${turnKey}`,
          groupId,
          entry: latestEntry,
          groupedEntries: records,
          expanded,
          active: isActive && latestEntry.state === 'running',
        });
        if (expanded) {
          workRows.push({
            kind: 'work',
            id: `work:${groupId}`,
            groupId,
            groupedEntries: records,
            isExpandedToolGroup: true,
          });
        }
      }
    } else {
      const elapsedMs = computeRunElapsedMs(timing);
      // A clean completion leaves only the reply's own timestamp: the live working
      // row and the settled "Worked for" fold both disappear. Stopped/failed turns
      // keep their status fold; a completed turn with a failed tool keeps it too so
      // the failure stays reachable.
      const cleanSuccess = status === 'completed' && !hasFailedTool;
      const showFold = !cleanSuccess;
      const unfoldByFailure = status === 'failed' || hasFailedTool;
      const turnExpanded =
        (unfoldByFailure && !input.collapsedTurnKeys?.has(turnKey)) ||
        (input.expandedTurnKeys?.has(turnKey) ?? false);
      if (showFold) {
        foldRow = {
          kind: 'turn-fold',
          id: `turn-fold:${turnKey}`,
          turnKey,
          runId,
          status,
          elapsedMs,
          expanded: turnExpanded,
          collapsible: records.length > 0,
        };
      }
      if (!cleanSuccess && records.length > 0 && turnExpanded) {
        const groupId = `work-group:${turnKey}`;
        if (records.length === 1) {
          workRows.push({
            kind: 'work',
            id: `work:${groupId}`,
            groupId,
            groupedEntries: records,
            isExpandedToolGroup: false,
          });
        } else {
          const groupExpanded =
            (hasFailedTool && !input.collapsedWorkGroupIds?.has(groupId)) ||
            (input.expandedWorkGroupIds?.has(groupId) ?? false);
          workRows.push({
            kind: 'work-toggle',
            id: `work-toggle:${turnKey}`,
            groupId,
            hiddenCount: records.length,
            expanded: groupExpanded,
            hasFailure: hasFailedTool,
            summaryKind: classifyToolSummaryKind(records),
            groupedEntries: records,
          });
          if (groupExpanded) {
            workRows.push({
              kind: 'work',
              id: `work:${groupId}`,
              groupId,
              groupedEntries: records,
              isExpandedToolGroup: true,
            });
          }
        }
      }
    }

    const approvals: ChatToolApproval[] = [];
    const seenApprovals = new Set<string>();
    const askUserRequests: ChatAskUserRequest[] = [];
    const seenAskUser = new Set<string>();
    const nativeRequests: ChatNativeRequest[] = [];
    const seenNative = new Set<string>();
    const messages: AssistantTurnMessagePart[] = [];
    let localAgentSource: ChatItem['localAgentSource'];

    for (const item of items) {
      if (item.localAgentSource) localAgentSource = item.localAgentSource;
      for (const approval of item.approvals ?? []) {
        const key = `${approval.runId}:${approval.toolCallId}`;
        if (!seenApprovals.has(key)) {
          seenApprovals.add(key);
          approvals.push(approval);
        }
      }
      for (const request of item.askUserRequests ?? []) {
        const key = `${request.runId}:${request.toolCallId}`;
        if (!seenAskUser.has(key)) {
          seenAskUser.add(key);
          askUserRequests.push(request);
        }
      }
      for (const request of item.nativeRequests ?? []) {
        const key = request.request.requestId;
        if (!seenNative.has(key)) {
          seenNative.add(key);
          nativeRequests.push(request);
        }
      }
      if (
        item.content.trim() ||
        item.workflowInterruption ||
        item.status === 'aborted' ||
        item.status === 'error'
      ) {
        messages.push({ id: item.id, item });
      }
    }

    rows.push({
      kind: 'assistant-turn',
      id: `turn:${turnKey}`,
      turnKey,
      runId,
      items,
      primaryItem,
      status,
      phase,
      isActive,
      isWaiting,
      timing,
      elapsedMs: computeRunElapsedMs(timing),
      ...(activityUpdatedAt !== undefined ? { activityUpdatedAt } : {}),
      records,
      runningRecords,
      workRows,
      foldRow,
      approvals,
      askUserRequests,
      nativeRequests,
      ...(localAgentSource ? { localAgentSource } : {}),
      messages,
      hasFailedTool,
    });
  }

  return rows;
}
