import { computed, ref, watch, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TimelineData, TimelineSnapshot } from '../utils/goal-timeline';
import type { GoalClientDTO, KeyResultClientDTO } from '@memoflow/goal-contracts';
import { getKeyResultProgressPercentage } from '../utils/progress';

export const useGoalTimeline = (goalRef: Ref<GoalClientDTO | null>) => {
  const { t } = useI18n();
  const loadingSnapshots = ref(false);
  const currentIndex = ref(0);
  const isPlaying = ref(false);
  const speed = ref<0.5 | 1 | 2>(1);
  const loop = ref(false);

  const timelineData = computed<TimelineData | null>(() => {
    const goal = goalRef.value;
    const keyResults = goal?.keyResults ?? [];
    if (!goal || !keyResults.length) return null;

    const snapshot: TimelineSnapshot = {
      timestamp: Date.now(),
      data: {
        totalWeight: keyResults.reduce(
          (sum: number, kr: KeyResultClientDTO) => sum + (kr.weight ?? 0),
          0,
        ),
        totalProgress: goal.overallProgress,
        keyResults: keyResults.map((kr: KeyResultClientDTO) => ({
          id: String(kr.id ?? ''),
          title: kr.title ?? t('goal.keyResultFallback'),
          weight: kr.weight ?? 0,
          progress: getKeyResultProgressPercentage(kr.progress),
        })),
      },
    };

    return {
      snapshots: [snapshot],
      stats: {
        totalSnapshots: 1,
        totalChanges: 0,
        avgWeightChange: 0,
      },
    };
  });

  const currentSnapshot = computed(() => {
    const snapshots = timelineData.value?.snapshots ?? [];
    return snapshots[currentIndex.value] ?? null;
  });

  const hasTimeline = computed(() => (timelineData.value?.snapshots.length ?? 0) > 0);

  watch(
    () => timelineData.value?.snapshots.length,
    () => {
      currentIndex.value = 0;
      isPlaying.value = false;
    },
  );

  return {
    timelineData,
    currentSnapshot,
    hasTimeline,
    loadingSnapshots,
    currentIndex,
    isPlaying,
    speed,
    loop,
  };
};
