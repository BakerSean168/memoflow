<template>
  <Dialog v-model:open="isOpen">
    <DialogScrollContent class="max-w-[1000px]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Bot class="size-5" />
          {{ t('goal.weightSuggestion.title') }}
        </DialogTitle>
        <p class="text-sm text-muted-foreground">
          {{ t('goal.weightSuggestion.subtitle') }}
        </p>
      </DialogHeader>

      <Separator />

      <div class="py-4">
        <!-- 加载状态 -->
        <Progress v-if="isLoading" :model-value="undefined" class="w-full" />

        <!-- 策略卡片 -->
        <div v-else class="grid grid-cols-1 gap-4 @md/panel:grid-cols-3">
          <Card
            v-for="strategy in strategies"
            :key="strategy.name"
            class="cursor-pointer border-0 bg-[hsl(var(--surface-raised)/0.28)] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.46)] transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:bg-[hsl(var(--surface-raised)/0.62)] hover:shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.68),0_8px_22px_-18px_rgba(0,0,0,0.5)]"
            :class="[
              selectedStrategy === strategy.name
                ? 'bg-primary/[0.07] ring-1 ring-primary/40'
                : '',
            ]"
            @click="selectedStrategy = strategy.name"
          >
            <CardHeader class="pb-2">
              <div class="flex items-center justify-between">
                <CardTitle class="text-base">{{ strategy.label }}</CardTitle>
                <Badge :class="getConfidenceBadgeClass(strategy.confidence)">
                  {{ strategy.confidence }}% {{ t('goal.weightSuggestion.matchPercent') }}
                </Badge>
              </div>
              <p class="text-xs text-muted-foreground">
                {{ strategy.description }}
              </p>
            </CardHeader>

            <CardContent class="pb-2">
              <!-- 权重可视化 -->
              <div class="mb-3 min-h-[120px]">
                <div v-for="(weight, index) in strategy.weights" :key="index" class="mb-2">
                  <div class="mb-1 flex items-center">
                    <span class="min-w-[40px] text-xs text-muted-foreground">
                      {{ t('goal.weightSuggestion.keyResultIndex', { index: index + 1 }) }}
                    </span>
                    <div class="relative mx-2 h-5 flex-1 overflow-hidden rounded-full bg-[hsl(var(--selected))]">
                      <div
                        class="flex h-full items-center justify-center transition-all"
                        :class="getWeightBarClass(weight)"
                        :style="{ width: `${(weight / 5) * 100}%` }"
                      >
                        <strong class="text-xs text-white">{{ weight }}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 推荐理由 -->
              <Alert>
                <Lightbulb class="size-4" />
                <AlertDescription class="text-xs">
                  {{ strategy.reasoning }}
                </AlertDescription>
              </Alert>
            </CardContent>

            <CardFooter class="pt-2">
              <Button
                class="w-full"
                :variant="selectedStrategy === strategy.name ? 'default' : 'secondary'"
                @click.stop="selectAndApply(strategy)"
              >
                <Check class="mr-2 size-4" />
                {{ t('goal.weightSuggestion.applyStrategy') }}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <!-- KeyResults 预览 -->
        <Card
          v-if="keyResults.length > 0"
          class="mt-4 border-0 bg-[hsl(var(--surface-raised)/0.24)] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.44)]"
        >
          <CardHeader class="pb-2">
            <CardTitle class="flex items-center gap-2 text-sm">
              <List class="size-4" />
              {{ t('goal.weightSuggestion.krList') }}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-1">
              <div
                v-for="(kr, index) in keyResults"
                :key="kr.id"
                class="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm"
              >
                <Circle class="size-4 shrink-0" :class="getWeightIconClass(kr.weight || 0)" />
                <div class="min-w-0 flex-1">
                  <div class="truncate">{{ index + 1 }}. {{ kr.title }}</div>
                  <div class="text-xs text-muted-foreground">
                    {{ getKeywordHighlight(kr.title) }}
                  </div>
                </div>
                <span class="shrink-0 text-xs text-muted-foreground">
                  {{ t('goal.weightSuggestion.current') }} {{ kr.weight || 1 }}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      <DialogFooter>
        <Button variant="outline" @click="close">{{ t('goal.weightSuggestion.cancel') }}</Button>
        <Button :disabled="!selectedStrategy" @click="confirmSelection">
          {{ t('goal.weightSuggestion.confirm') }}
        </Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { KeyResultClientDTO } from '@memoflow/contracts/goal';
import {
  Dialog,
  DialogScrollContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Button,
  Badge,
  Progress,
  Alert,
  AlertDescription,
  Separator,
} from '@memoflow/ui-vue-shadcn';
import { Bot, Check, Circle, Lightbulb, List } from '@lucide/vue';
import {
  weightRecommendationService,
  type WeightStrategy,
} from '../../utils/weight-recommendation';

const props = defineProps<{
  keyResults: KeyResultClientDTO[];
}>();

const emit = defineEmits<{
  apply: [strategy: WeightStrategy];
  close: [];
}>();

const { t } = useI18n();

const isOpen = ref(false);
const isLoading = ref(false);
const selectedStrategy = ref<string | null>(null);
const strategies = ref<WeightStrategy[]>([]);

// 生成推荐策略
function generateRecommendations() {
  isLoading.value = true;

  try {
    strategies.value = weightRecommendationService.recommendWeights(props.keyResults);

    // 默认选中置信度最高的策略
    if (strategies.value.length > 0) {
      const bestStrategy = strategies.value.reduce((best, current) =>
        current.confidence > best.confidence ? current : best,
      );
      selectedStrategy.value = bestStrategy.name;
    }
  } catch (error) {
    console.error('Failed to generate recommendations:', error);
  } finally {
    isLoading.value = false;
  }
}

// 获取置信度 Badge 样式
function getConfidenceBadgeClass(confidence: number): string {
  if (confidence >= 80) return 'bg-success text-white border-transparent';
  if (confidence >= 60) return 'bg-warning text-white border-transparent';
  return 'bg-info text-white border-transparent';
}

// 获取权重条样式
function getWeightBarClass(weight: number): string {
  if (weight >= 4) return 'bg-success';
  if (weight >= 3) return 'bg-warning';
  return 'bg-destructive';
}

// 获取权重图标颜色
function getWeightIconClass(weight: number): string {
  if (weight >= 4) return 'text-success';
  if (weight >= 3) return 'text-warning';
  return 'text-destructive';
}

// 高亮关键词
function getKeywordHighlight(title: string): string {
  const keywords = [
    'critical',
    'urgent',
    'important',
    'key',
    'revenue',
    'customer',
    '关键',
    '核心',
    '重要',
    '紧急',
    '收入',
    '客户',
  ];

  const foundKeywords = keywords.filter((kw) => title.toLowerCase().includes(kw.toLowerCase()));

  return foundKeywords.length > 0
    ? `${t('goal.weightSuggestion.hasKeywords')} ${foundKeywords.slice(0, 3).join(', ')}`
    : t('goal.weightSuggestion.noKeywords');
}

// 选择并应用策略
function selectAndApply(strategy: WeightStrategy) {
  selectedStrategy.value = strategy.name;
  confirmSelection();
}

// 确认选择
function confirmSelection() {
  if (!selectedStrategy.value) return;

  const strategy = strategies.value.find((s) => s.name === selectedStrategy.value);

  if (strategy) {
    emit('apply', strategy);
    close();
  }
}

// 打开对话框
function open() {
  if (props.keyResults.length === 0) {
    console.warn('No KeyResults to analyze');
    return;
  }

  isOpen.value = true;
  generateRecommendations();
}

// 关闭对话框
function close() {
  isOpen.value = false;
  selectedStrategy.value = null;
  emit('close');
}

defineExpose({ open, close });
</script>
