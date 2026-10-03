<script setup lang="ts">
/**
 * GlobalSheet.vue
 *
 * 全局侧边抽屉组件。通过 useSheet() 命令式打开，
 * 支持动态传入任意 Vue 组件进行渲染。
 */
import { useI18n } from 'vue-i18n';
import { computed, defineComponent, h, type Component, type PropType } from 'vue';
import { _getSheetState, _closeSheet } from '@memoflow/ui-vue-shadcn';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@memoflow/ui-vue-shadcn';
import { cn } from '@memoflow/ui-vue-shadcn';

const { t } = useI18n();
const state = _getSheetState();
const componentProps = computed<Record<string, unknown>>(() => state.componentProps ?? {});

const DynamicSheetBody = defineComponent({
  name: 'DynamicSheetBody',
  props: {
    component: {
      type: [Object, Function, String] as PropType<Component | string | null>,
      default: null,
    },
    componentProps: {
      type: Object as PropType<Record<string, unknown>>,
      default: () => ({}),
    },
  },
  setup(props) {
    return () => (props.component ? h(props.component, props.componentProps) : null);
  },
});
</script>

<template>
  <Sheet
    :open="state.open"
    @update:open="
      (v) => {
        if (!v) _closeSheet();
      }
    "
  >
    <SheetContent
      :close-label="t('common.close')"
      :side="state.side"
      :class="
        cn(
          'flex h-full min-h-0 flex-col overflow-hidden bg-[hsl(var(--surface-overlay))]',
          state.class,
        )
      "
    >
      <SheetHeader
        v-if="state.title || state.description"
        class="shrink-0 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.5)] pb-4 pr-8"
      >
        <SheetTitle v-if="state.title">{{ state.title }}</SheetTitle>
        <SheetDescription v-if="state.description">{{ state.description }}</SheetDescription>
      </SheetHeader>
      <div class="min-h-0 flex-1 overflow-y-auto py-3">
        <DynamicSheetBody
          v-if="state.component"
          :component="state.component"
          :component-props="componentProps"
        />
      </div>
    </SheetContent>
  </Sheet>
</template>
