import { useI18n } from 'vue-i18n';
import type { ChatItem } from './types';

export function useAIFormatters() {
  const { t } = useI18n();

  function typingPlaceholder(item: ChatItem): string {
    return item.role === 'assistant' && item.status === 'generating' ? '...' : '';
  }

  function getMessageStatusLabel(item: ChatItem): string {
    if (item.status === 'aborted') return t('aiAssistant.dialogs.chat.aborted');
    if (item.status === 'error')
      return item.errorMessage || t('aiAssistant.dialogs.chat.sendFailed');
    return '';
  }

  function formatExecutionOutcome(status: 'success' | 'partial' | 'failed'): string {
    return {
      success: t('aiAssistant.dialogs.automation.outcomeLabels.success'),
      partial: t('aiAssistant.dialogs.automation.outcomeLabels.partial'),
      failed: t('aiAssistant.dialogs.automation.outcomeLabels.failed'),
    }[status];
  }

  return { typingPlaceholder, getMessageStatusLabel, formatExecutionOutcome };
}
