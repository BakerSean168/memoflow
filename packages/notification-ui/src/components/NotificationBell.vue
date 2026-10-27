<template>
  <div class="relative inline-block">
    <Button
      data-testid="notification-bell-icon"
      variant="ghost"
      size="icon"
      :aria-label="t('nav.notifications')"
      :disabled="loading"
      @click="$emit('click')"
    >
      <Bell class="h-5 w-5" />
      <span
        v-if="hasUnread"
        class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground"
      >
        {{ displayCount }}
      </span>
    </Button>
    <Tooltip>
      <TooltipTrigger as-child>
        <span class="sr-only">{{ tooltipText }}</span>
      </TooltipTrigger>
      <TooltipContent>
        {{ tooltipText }}
      </TooltipContent>
    </Tooltip>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import { Tooltip, TooltipTrigger, TooltipContent } from '@memoflow/ui-vue-shadcn';
import { Bell } from '@lucide/vue';

interface Props {
  unreadCount?: number;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  unreadCount: 0,
  loading: false,
});

defineEmits<{
  click: [];
}>();

const { t } = useI18n();

const hasUnread = computed(() => props.unreadCount > 0);

const displayCount = computed(() => {
  return props.unreadCount > 99 ? '99+' : props.unreadCount.toString();
});

const tooltipText = computed(() => {
  return hasUnread.value
    ? t('notification.bell.unreadCount', { count: props.unreadCount })
    : t('notification.bell.title');
});
</script>
