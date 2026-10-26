<template>
  <div class="timeline-controls">
    <!-- 时间线滑块 -->
    <div class="timeline-slider-container">
      <div class="timeline-track">
        <div class="timeline-progress" :style="{ width: progressPercent + '%' }" />
        <input
          v-model="currentIndexModel"
          type="range"
          class="timeline-slider"
          :min="0"
          :max="maxIndex"
          :step="1"
          :aria-label="t('goal.timeline.controls.position')"
          @input="handleSliderChange"
        />
      </div>

      <!-- 时间标记 -->
      <div class="timeline-marks">
        <div
          v-for="(snapshot, index) in snapshots"
          :key="index"
          class="timeline-mark"
          :class="{ active: index === currentIndex }"
          :style="{ left: (index / maxIndex) * 100 + '%' }"
          :title="formatProductDateTime(snapshot.timestamp)"
        >
          <div class="mark-dot" />
        </div>
      </div>
    </div>

    <!-- 控制按钮和信息 -->
    <div class="controls-row">
      <!-- 播放控制 -->
      <div class="play-controls">
        <button
          type="button"
          class="control-btn"
          :title="isPlaying ? t('goal.timeline.controls.pause') : t('goal.timeline.controls.play')"
          :aria-label="
            isPlaying ? t('goal.timeline.controls.pause') : t('goal.timeline.controls.play')
          "
          @click="togglePlay"
        >
          <svg v-if="!isPlaying" viewBox="0 0 24 24" class="icon">
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
          <svg v-else viewBox="0 0 24 24" class="icon">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" fill="currentColor" />
          </svg>
        </button>

        <button
          type="button"
          class="control-btn"
          :title="t('goal.timeline.controls.prev')"
          :aria-label="t('goal.timeline.controls.prev')"
          :disabled="currentIndex === 0"
          @click="previousSnapshot"
        >
          <svg viewBox="0 0 24 24" class="icon">
            <path d="M11.67 3.87L9.9 2.1 0 12l9.9 9.9 1.77-1.77L3.54 12z" fill="currentColor" />
          </svg>
        </button>

        <button
          type="button"
          class="control-btn"
          :title="t('goal.timeline.controls.next')"
          :aria-label="t('goal.timeline.controls.next')"
          :disabled="currentIndex === maxIndex"
          @click="nextSnapshot"
        >
          <svg viewBox="0 0 24 24" class="icon">
            <path d="M5.88 4.12L13.76 12l-7.88 7.88L8 22l10-10L8 2z" fill="currentColor" />
          </svg>
        </button>

        <button
          type="button"
          class="control-btn"
          :class="{ active: loop }"
          :title="t('goal.timeline.controls.loop')"
          :aria-label="t('goal.timeline.controls.loop')"
          :aria-pressed="loop"
          @click="toggleLoop"
        >
          <svg viewBox="0 0 24 24" class="icon">
            <path
              d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>

      <!-- 速度控制 -->
      <div class="speed-controls">
        <span class="speed-label">{{ t('goal.timeline.controls.speed') }}</span>
        <button
          v-for="speedOption in speedOptions"
          :key="speedOption"
          type="button"
          class="speed-btn"
          :class="{ active: speed === speedOption }"
          :aria-pressed="speed === speedOption"
          @click="setSpeed(speedOption)"
        >
          {{ speedOption }}x
        </button>
      </div>

      <!-- 时间信息 -->
      <div class="time-info">
        <span class="current-time">{{ formatProductDateTime(currentSnapshot?.timestamp) }}</span>
        <span class="snapshot-counter">{{ currentIndex + 1 }} / {{ snapshots.length }}</span>
      </div>
    </div>

    <!-- 当前快照信息 -->
    <div v-if="currentSnapshot" class="snapshot-info">
      <div class="snapshot-reason">
        <svg viewBox="0 0 24 24" class="info-icon">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
            fill="currentColor"
          />
        </svg>
        <span>{{ currentSnapshot.reason || t('goal.timeline.controls.noDescription') }}</span>
      </div>

      <div class="snapshot-stats">
        <div class="stat-item">
          <span class="stat-label">{{ t('goal.timeline.controls.totalWeight') }}</span>
          <span class="stat-value">{{ currentSnapshot.data.totalWeight.toFixed(1) }}%</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">{{ t('goal.timeline.controls.totalProgress') }}</span>
          <span class="stat-value">{{ currentSnapshot.data.totalProgress.toFixed(1) }}%</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">{{ t('goal.timeline.controls.keyResults') }}</span>
          <span class="stat-value">{{ currentSnapshot.data.keyResults.length }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { goalUiHost } from '../../goalUiHost';
const { formatProductDateTime } = goalUiHost;
import { computed, watch, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TimelineSnapshot } from '../../utils/goal-timeline';

const { t } = useI18n();

// ==================== Props ====================

const props = defineProps<{
  /** 快照列表 */
  snapshots: TimelineSnapshot[];
  /** 当前快照索引 */
  currentIndex: number;
  /** 播放状态 */
  isPlaying: boolean;
  /** 播放速度 */
  speed: 0.5 | 1 | 2;
  /** 循环播放 */
  loop: boolean;
}>();

// ==================== Emits ====================

const emit = defineEmits<{
  (e: 'update:currentIndex', value: number): void;
  (e: 'update:isPlaying', value: boolean): void;
  (e: 'update:speed', value: 0.5 | 1 | 2): void;
  (e: 'update:loop', value: boolean): void;
  (e: 'snapshotChange', snapshot: TimelineSnapshot): void;
}>();

// ==================== State ====================

const speedOptions = [0.5, 1, 2] as const;
let playInterval: ReturnType<typeof setInterval> | null = null;

// ==================== Computed ====================

const currentIndexModel = computed({
  get: () => props.currentIndex,
  set: (value) => emit('update:currentIndex', Number(value)),
});

const maxIndex = computed(() => Math.max(0, props.snapshots.length - 1));

const progressPercent = computed(() => {
  if (maxIndex.value === 0) return 0;
  return (props.currentIndex / maxIndex.value) * 100;
});

const currentSnapshot = computed(() => props.snapshots[props.currentIndex]);

// ==================== Methods ====================

function handleSliderChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const newIndex = Number(target.value);

  if (newIndex !== props.currentIndex) {
    emit('update:currentIndex', newIndex);
    emit('snapshotChange', props.snapshots[newIndex]);
  }
}

function togglePlay() {
  emit('update:isPlaying', !props.isPlaying);
}

function previousSnapshot() {
  if (props.currentIndex > 0) {
    const newIndex = props.currentIndex - 1;
    emit('update:currentIndex', newIndex);
    emit('snapshotChange', props.snapshots[newIndex]);
  }
}

function nextSnapshot() {
  if (props.currentIndex < maxIndex.value) {
    const newIndex = props.currentIndex + 1;
    emit('update:currentIndex', newIndex);
    emit('snapshotChange', props.snapshots[newIndex]);
  } else if (props.loop) {
    // 如果启用循环，回到开始
    emit('update:currentIndex', 0);
    emit('snapshotChange', props.snapshots[0]);
  }
}

function toggleLoop() {
  emit('update:loop', !props.loop);
}

function setSpeed(newSpeed: 0.5 | 1 | 2) {
  emit('update:speed', newSpeed);
}

// ==================== Watchers ====================

// 播放逻辑
watch(
  () => props.isPlaying,
  (playing) => {
    if (playing) {
      startPlayback();
    } else {
      stopPlayback();
    }
  },
  { immediate: true },
);

// 速度变化时重启播放
watch(
  () => props.speed,
  () => {
    if (props.isPlaying) {
      stopPlayback();
      startPlayback();
    }
  },
);

function startPlayback() {
  if (playInterval) {
    clearInterval(playInterval);
  }

  const interval = 1000 / props.speed; // 基础间隔 1 秒

  playInterval = setInterval(() => {
    if (props.currentIndex < maxIndex.value) {
      nextSnapshot();
    } else if (props.loop) {
      emit('update:currentIndex', 0);
      emit('snapshotChange', props.snapshots[0]);
    } else {
      // 播放完毕，停止
      emit('update:isPlaying', false);
    }
  }, interval);
}

function stopPlayback() {
  if (playInterval) {
    clearInterval(playInterval);
    playInterval = null;
  }
}

// ==================== Lifecycle ====================

onUnmounted(() => {
  stopPlayback();
});
</script>

<style scoped>
.timeline-controls {
  width: 100%;
  padding: 16px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* 时间线滑块 */
.timeline-slider-container {
  margin-bottom: 16px;
  position: relative;
}

.timeline-track {
  position: relative;
  height: 8px;
  background: #e8e8e8;
  border-radius: 4px;
  overflow: hidden;
}

.timeline-progress {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #8bc34a);
  border-radius: 4px;
  transition: width 0.2s ease;
}

.timeline-slider {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 100%;
  height: 8px;
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  outline: none;
  cursor: pointer;
}

.timeline-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #4caf50;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}

.timeline-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.timeline-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #4caf50;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}

.timeline-slider::-moz-range-thumb:hover {
  transform: scale(1.2);
}

/* 时间标记 */
.timeline-marks {
  position: relative;
  height: 24px;
  margin-top: 8px;
}

.timeline-mark {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  cursor: pointer;
}

.mark-dot {
  width: 8px;
  height: 8px;
  background: #bbb;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.timeline-mark.active .mark-dot {
  background: #4caf50;
  transform: scale(1.5);
  box-shadow: 0 0 8px rgba(76, 175, 80, 0.5);
}

.timeline-mark:hover .mark-dot {
  transform: scale(1.3);
}

/* 控制行 */
.controls-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

/* 播放控制 */
.play-controls {
  display: flex;
  gap: 8px;
}

.control-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.control-btn:hover:not(:disabled) {
  background: #e0e0e0;
  transform: scale(1.05);
}

.control-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.control-btn.active {
  background: #4caf50;
  color: #fff;
}

.icon {
  width: 20px;
  height: 20px;
}

/* 速度控制 */
.speed-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.speed-label {
  font-size: 14px;
  color: #666;
}

.speed-btn {
  padding: 4px 12px;
  background: #f5f5f5;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.speed-btn:hover {
  background: #e0e0e0;
}

.speed-btn.active {
  background: #4caf50;
  color: #fff;
}

/* 时间信息 */
.time-info {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.current-time {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.snapshot-counter {
  font-size: 12px;
  color: #999;
}

/* 快照信息 */
.snapshot-info {
  padding-top: 12px;
  border-top: 1px solid #e8e8e8;
}

.snapshot-reason {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 14px;
  color: #666;
}

.info-icon {
  width: 18px;
  height: 18px;
  color: #4caf50;
}

.snapshot-stats {
  display: flex;
  gap: 24px;
}

.stat-item {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.stat-label {
  color: #999;
}

.stat-value {
  font-weight: 500;
  color: #333;
}

/* 响应式 */
@media (max-width: 768px) {
  .controls-row {
    flex-wrap: wrap;
  }

  .time-info {
    width: 100%;
    align-items: flex-start;
    margin-left: 0;
    margin-top: 8px;
  }

  .snapshot-stats {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
