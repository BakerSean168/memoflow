/**
 * @file Memory Monitor
 * @description
 * Development utility for monitoring memory usage in the Electron main process.
 * Provides real-time memory stats, historical snapshots, and leak detection analysis.
 *
 * @module utils/memory-monitor
 */

import { ipcMain } from 'electron';
import { DevChannels } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import { isDesktopDevelopmentRuntime } from './dev-runtime';

// ============ Types ============

/**
 * @interface MemorySnapshot
 * @description Snapshot of memory usage at a specific point in time.
 */
interface MemorySnapshot {
  /** Timestamp when the snapshot was taken. */
  timestamp: number;
  /** Heap used in MB. */
  heapUsed: number;
  /** Total heap allocated in MB. */
  heapTotal: number;
  /** External memory usage in MB. */
  external: number;
  /** Resident Set Size in MB. */
  rss: number;
  /** Memory used by ArrayBuffers in MB. */
  arrayBuffers: number;
}

/**
 * @interface MemoryTrend
 * @description Analysis of memory usage trend.
 */
interface MemoryTrend {
  /** Direction of memory usage trend. */
  direction: 'up' | 'down' | 'stable';
  /** Estimated change in memory usage per hour (MB/h). */
  changePerHour: number;
  /** Whether the trend suggests a memory leak. */
  isLikelyLeak: boolean;
}

// ============ Memory Monitor Class ============

/**
 * @class MemoryMonitor
 * @description Class responsible for monitoring memory usage.
 */
export class MemoryMonitor {
  private snapshots: MemorySnapshot[] = [];
  private interval: NodeJS.Timeout | null = null;
  private readonly maxSnapshots = 120; // Keep 2 hours of data (at 1 snapshot/min)
  private readonly leakThresholdPerHour = 10; // MB/hour threshold for leak warning

  /**
   * @method start
   * @description Starts the memory monitoring process.
   *
   * @param {number} [intervalMs=60000] - Interval between snapshots in milliseconds. Defaults to 60000 (1 minute).
   */
  start(intervalMs: number = 60000): void {
    if (this.interval) {
      console.warn('[MemoryMonitor] Already running');
      return;
    }

    console.log('[MemoryMonitor] Starting memory monitoring...');

    // Take immediate snapshot
    this.takeSnapshot();

    // Schedule regular snapshots
    this.interval = setInterval(() => {
      this.takeSnapshot();
      this.logMemoryStatus();
    }, intervalMs);
  }

  /**
   * @method stop
   * @description Stops the memory monitoring process.
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[MemoryMonitor] Stopped');
    }
  }

  /**
   * @method takeSnapshot
   * @description Captures the current memory usage snapshot.
   *
   * @returns {MemorySnapshot} The current memory snapshot.
   */
  takeSnapshot(): MemorySnapshot {
    const usage = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: usage.heapUsed / 1024 / 1024,
      heapTotal: usage.heapTotal / 1024 / 1024,
      external: usage.external / 1024 / 1024,
      rss: usage.rss / 1024 / 1024,
      arrayBuffers: usage.arrayBuffers / 1024 / 1024,
    };

    this.snapshots.push(snapshot);

    // Maintain max snapshots limit
    while (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  /**
   * @method getCurrentStatus
   * @description Gets the current memory status including the latest snapshot and trend analysis.
   *
   * @returns {MemorySnapshot & { trend: MemoryTrend }} Current status with trend.
   */
  getCurrentStatus(): MemorySnapshot & { trend: MemoryTrend } {
    const current = this.snapshots[this.snapshots.length - 1] || this.takeSnapshot();
    return {
      ...current,
      trend: this.analyzeTrend(),
    };
  }

  /**
   * @method analyzeTrend
   * @description Analyzes memory usage history to determine trends and potential leaks.
   *
   * @returns {MemoryTrend} The analysis result.
   */
  analyzeTrend(): MemoryTrend {
    if (this.snapshots.length < 5) {
      return { direction: 'stable', changePerHour: 0, isLikelyLeak: false };
    }

    const values = this.snapshots.map((s) => s.heapUsed);
    const slope = this.calculateSlope(values);

    // Calculate change per hour
    const duration =
      (this.snapshots[this.snapshots.length - 1].timestamp - this.snapshots[0].timestamp) /
      (1000 * 60 * 60);
    const changePerHour = duration > 0 ? (slope * this.snapshots.length) / duration : 0;

    let direction: MemoryTrend['direction'] = 'stable';
    if (changePerHour > 2) direction = 'up';
    else if (changePerHour < -2) direction = 'down';

    return {
      direction,
      changePerHour,
      isLikelyLeak: changePerHour > this.leakThresholdPerHour,
    };
  }

  /**
   * @method getSnapshots
   * @description Retrieves all recorded memory snapshots.
   *
   * @returns {MemorySnapshot[]} Array of memory snapshots.
   */
  getSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }

  /**
   * @method forceGC
   * @description Forces garbage collection if the environment allows it.
   * Note: Requires the application to be started with --expose-gc flag.
   *
   * @returns {boolean} True if GC was triggered, false otherwise.
   */
  forceGC(): boolean {
    if (global.gc) {
      global.gc();
      console.log('[MemoryMonitor] Forced garbage collection');
      return true;
    }
    console.warn('[MemoryMonitor] GC not available. Run with --expose-gc flag.');
    return false;
  }

  /**
   * @method logMemoryStatus
   * @description Logs current memory status to the console.
   */
  private logMemoryStatus(): void {
    const status = this.getCurrentStatus();
    const trend = status.trend;

    const trendIcon = trend.direction === 'up' ? '📈' : trend.direction === 'down' ? '📉' : '➡️';
    const leakWarning = trend.isLikelyLeak ? ' ⚠️ POSSIBLE LEAK' : '';

    console.log(
      `[Memory] Heap: ${status.heapUsed.toFixed(1)}MB / ${status.heapTotal.toFixed(1)}MB | ` +
        `RSS: ${status.rss.toFixed(1)}MB | ` +
        `${trendIcon} ${trend.changePerHour.toFixed(1)}MB/h${leakWarning}`,
    );
  }

  /**
   * @method calculateSlope
   * @description Calculates the slope of the linear regression line for the given values.
   *
   * @param {number[]} values - The data points.
   * @returns {number} The slope of the line.
   */
  private calculateSlope(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;

    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }
}

// ============ Singleton Instance ============

let memoryMonitor: MemoryMonitor | null = null;

/**
 * @function getMemoryMonitor
 * @description Retrieves the singleton instance of MemoryMonitor.
 *
 * @returns {MemoryMonitor} The memory monitor instance.
 */
export function getMemoryMonitor(): MemoryMonitor {
  if (!memoryMonitor) {
    memoryMonitor = new MemoryMonitor();
  }
  return memoryMonitor;
}

// ============ IPC Handlers ============

/**
 * @function registerMemoryMonitorIpcHandlers
 * @description Registers IPC handlers for memory monitoring.
 * Only active in development mode.
 */
export function registerMemoryMonitorIpcHandlers(): void {
  if (!isDesktopDevelopmentRuntime()) {
    return;
  }

  const monitor = getMemoryMonitor();

  ipcMain.handle(DevChannels.MEMORY_STATUS, async () => {
    return ok(monitor.getCurrentStatus());
  });

  ipcMain.handle(DevChannels.MEMORY_SNAPSHOTS, async () => {
    return ok(monitor.getSnapshots());
  });

  ipcMain.handle(DevChannels.MEMORY_FORCE_GC, async () => {
    return ok(monitor.forceGC());
  });

  console.log('[MemoryMonitor] IPC handlers registered');
}

// ============ Auto-start in Development ============

/**
 * @function initMemoryMonitorForDev
 * @description Initializes and starts the memory monitor if in development mode.
 * Also registers the necessary IPC handlers.
 */
export function initMemoryMonitorForDev(): void {
  if (!isDesktopDevelopmentRuntime()) {
    return;
  }

  const monitor = getMemoryMonitor();
  monitor.start(60000); // Check every minute

  // Register IPC handlers
  registerMemoryMonitorIpcHandlers();
}
