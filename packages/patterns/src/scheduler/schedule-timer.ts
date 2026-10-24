/**
 * IScheduleTimer - 调度器 Timer 抽象接口
 *
 * 允许不同运行时提供自己的 timer 实现
 * - Node.js / Electron: 使用 global.setTimeout
 * - 测试环境: 可使用 fake timers
 *
 * @module patterns/scheduler
 */

// Residual 1039: sole schedule timer lives in patterns; schedule dual file deleted.

/**
 * Timer 抽象接口
 */
export interface IScheduleTimer {
  /**
   * 设置定时器
   * @param callback 回调函数
   * @param delayMs 延迟毫秒数
   * @returns timer ID (类型由具体实现决定)
   */
  setTimeout(callback: () => void, delayMs: number): unknown;

  /**
   * 清除定时器
   * @param id timer ID
   */
  clearTimeout(id: unknown): void;

  /**
   * 获取当前时间戳（毫秒）
   */
  now(): number;
}

/**
 * Node.js / Electron 默认 Timer 实现
 */
export class NodeTimer implements IScheduleTimer {
  setTimeout(callback: () => void, delayMs: number): NodeJS.Timeout {
    return global.setTimeout(callback, delayMs);
  }

  clearTimeout(id: unknown): void {
    global.clearTimeout(id as NodeJS.Timeout);
  }

  now(): number {
    return Date.now();
  }
}

/**
 * 测试用 Fake Timer
 * 用于单元测试，可手动控制时间流逝
 */
export class FakeTimer implements IScheduleTimer {
  private currentTime: number;
  private timers: Map<number, { callback: () => void; triggerAt: number }> = new Map();
  private nextId = 1;

  constructor(initialTime: number = Date.now()) {
    this.currentTime = initialTime;
  }

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId++;
    this.timers.set(id, {
      callback,
      triggerAt: this.currentTime + delayMs,
    });
    return id;
  }

  clearTimeout(id: unknown): void {
    this.timers.delete(id as number);
  }

  now(): number {
    return this.currentTime;
  }

  /**
   * 推进时间并触发到期的定时器
   * @param ms 推进的毫秒数
   */
  tick(ms: number): void {
    this.currentTime += ms;
    this.runPendingTimers();
  }

  /**
   * 设置当前时间
   * @param time 新的时间戳
   */
  setTime(time: number): void {
    this.currentTime = time;
    this.runPendingTimers();
  }

  /**
   * 运行所有到期的定时器
   */
  private runPendingTimers(): void {
    const pending = Array.from(this.timers.entries())
      .filter(([, timer]) => timer.triggerAt <= this.currentTime)
      .sort((a, b) => a[1].triggerAt - b[1].triggerAt);

    for (const [id, timer] of pending) {
      this.timers.delete(id);
      timer.callback();
    }
  }

  /**
   * 获取待执行的定时器数量
   */
  getPendingCount(): number {
    return this.timers.size;
  }

  /**
   * 清除所有定时器
   */
  clearAll(): void {
    this.timers.clear();
  }
}
