<template>
  <Sheet :open="modelValue" @update:open="$emit('update:modelValue', $event)">
    <SheetContent
      side="right"
      :close-label="t('common.close')"
      class="w-[400px] @2xl/panel:w-[540px]"
    >
      <SheetHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
        <SheetTitle>{{ t('notification.drawer.title') }}</SheetTitle>
        <div class="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            class="h-8"
            data-testid="notification-drawer-mark-all-read"
            :disabled="unreadCount === 0"
            @click="$emit('mark-all-read')"
          >
            {{ t('notification.action.markAllRead') }}
          </Button>
          <SheetClose as-child>
            <Button
              variant="ghost"
              size="icon"
              :aria-label="t('common.close')"
              data-testid="notification-drawer-close"
            >
              <X class="h-4 w-4" />
            </Button>
          </SheetClose>
        </div>
      </SheetHeader>

      <div class="flex-1 overflow-y-auto py-4">
        <slot />
      </div>

      <SheetFooter class="border-t pt-4">
        <Button
          variant="ghost"
          class="w-full"
          data-testid="notification-drawer-view-all"
          @click="handleViewAll"
        >
          {{ t('notification.drawer.viewAll') }}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from '@memoflow/ui-vue-shadcn';
import { Button } from '@memoflow/ui-vue-shadcn';
import { X } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

interface Props {
  modelValue: boolean;
  unreadCount?: number;
}

withDefaults(defineProps<Props>(), {
  unreadCount: 0,
});

const { t } = useI18n();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'mark-all-read': [];
  'view-all': [];
}>();

const handleViewAll = () => {
  emit('view-all');
  emit('update:modelValue', false);
};
</script>
