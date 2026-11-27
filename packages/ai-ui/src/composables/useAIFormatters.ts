import { useI18n } from 'vue-i18n';
import type { ChatItem } from './types';

/** One formatter per locale/options pair; message lists re-render on every stream tick. */
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(
  locale: string,
  key: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const cacheKey = `${locale}:${key}`;
  let formatter = dateFormatters.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateFormatters.set(cacheKey, formatter);
  }
  return formatter;
}

export function useAIFormatters() {
  const { t, locale } = useI18n();

  function typingPlaceholder(item: ChatItem): string {
    return item.role === 'assistant' && item.status === 'generating' ? '...' : '';
  }

  function getMessageStatusLabel(item: ChatItem): string {
    if (item.status === 'aborted') return t('aiAssistant.dialogs.chat.aborted');
    if (item.status === 'error')
      return item.errorMessage || t('aiAssistant.dialogs.chat.sendFailed');
    return '';
  }

  /**
   * Ported from T3 Code `timestampFormat.formatDayAwareTimestamp`: today shows the
   * wall-clock time, yesterday says so, older messages prefix a short date.
   */
  function formatMessageTimestamp(createdAt?: number, nowMs = Date.now()): string {
    if (createdAt === undefined || !Number.isFinite(createdAt)) return '';
    const date = new Date(createdAt);
    const now = new Date(nowMs);
    const time = dateFormatter(locale.value, 'time', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
    const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
    if (dayDiff <= 0) return time;
    if (dayDiff === 1) return t('aiAssistant.chatPage.message.yesterdayAt', { time });
    const dateLabel = dateFormatter(
      locale.value,
      date.getFullYear() === now.getFullYear() ? 'short-date' : 'short-date-year',
      date.getFullYear() === now.getFullYear()
        ? { month: 'short', day: 'numeric' }
        : { year: 'numeric', month: 'short', day: 'numeric' },
    ).format(date);
    return `${dateLabel} ${time}`;
  }

  function formatMessageTimestampTooltip(createdAt?: number): string {
    if (createdAt === undefined || !Number.isFinite(createdAt)) return '';
    return dateFormatter(locale.value, 'tooltip', {
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(new Date(createdAt));
  }

  function formatExecutionOutcome(status: 'success' | 'partial' | 'failed'): string {
    return {
      success: t('aiAssistant.dialogs.automation.outcomeLabels.success'),
      partial: t('aiAssistant.dialogs.automation.outcomeLabels.partial'),
      failed: t('aiAssistant.dialogs.automation.outcomeLabels.failed'),
    }[status];
  }

  return {
    typingPlaceholder,
    getMessageStatusLabel,
    formatExecutionOutcome,
    formatMessageTimestamp,
    formatMessageTimestampTooltip,
  };
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
