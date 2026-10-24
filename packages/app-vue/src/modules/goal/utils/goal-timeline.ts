import { formatProductDateTime } from '../../../shared/utils/product-time';

export interface TimelineSnapshot {
  timestamp: number;
  reason?: string;
  data: {
    totalWeight: number;
    totalProgress: number;
    keyResults: Array<{
      id: string;
      title: string;
      weight: number;
      progress: number;
    }>;
  };
}

export interface TimelineData {
  snapshots: TimelineSnapshot[];
  stats: {
    totalSnapshots: number;
    totalChanges: number;
    avgWeightChange: number;
  };
}

/** Soft residual 1216: timeline timestamp via product-time (empty '-'). */
export const formatTimelineTimestamp = (timestamp: number) => formatProductDateTime(timestamp, '-');
