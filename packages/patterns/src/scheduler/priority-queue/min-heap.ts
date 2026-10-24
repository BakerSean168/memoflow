/**
 * MinHeap - 最小堆数据结构
 *
 * 用于优先队列调度，堆顶始终是 nextRunAt 最小（最近）的任务
 *
 * 时间复杂度：
 * - insert: O(log n)
 * - extractMin: O(log n)
 * - peek: O(1)
 * - remove: O(n) 查找 + O(log n) 调整
 * - update: O(n) 查找 + O(log n) 调整
 *
 * @module patterns/scheduler
 */

// Residual 1039: sole MinHeap lives in patterns; schedule dual file deleted.

/**
 * 堆元素接口
 */
export interface HeapItem {
  /** 任务唯一标识 */
  taskId: string;
  /** 下次执行时间（毫秒时间戳） */
  nextRunAt: number;
}

/**
 * 最小堆 - 用于优先队列调度
 *
 * 实现说明：
 * - 使用数组存储完全二叉树
 * - 父节点索引: Math.floor((i - 1) / 2)
 * - 左子节点索引: 2 * i + 1
 * - 右子节点索引: 2 * i + 2
 */
export class MinHeap<T extends HeapItem> {
  private heap: T[] = [];

  /**
   * 获取堆大小
   */
  get size(): number {
    return this.heap.length;
  }

  /**
   * 检查堆是否为空
   */
  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * 查看堆顶元素（不移除）
   * @returns 堆顶元素，如果堆为空则返回 undefined
   */
  peek(): T | undefined {
    return this.heap[0];
  }

  /**
   * 插入元素
   * @param item 要插入的元素
   */
  insert(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  /**
   * 提取最小元素（移除堆顶）
   * @returns 堆顶元素，如果堆为空则返回 undefined
   */
  extractMin(): T | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop();

    const min = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.bubbleDown(0);
    return min;
  }

  /**
   * 移除指定 taskId 的元素
   * @param taskId 任务 ID
   * @returns 是否成功移除
   */
  remove(taskId: string): boolean {
    const index = this.heap.findIndex((item) => item.taskId === taskId);
    if (index === -1) return false;

    if (index === this.heap.length - 1) {
      this.heap.pop();
    } else {
      this.heap[index] = this.heap.pop()!;
      // 需要同时向上和向下调整，因为新元素可能比父节点小或比子节点大
      this.bubbleUp(index);
      this.bubbleDown(index);
    }
    return true;
  }

  /**
   * 更新指定任务的执行时间
   * @param taskId 任务 ID
   * @param newNextRunAt 新的执行时间（毫秒时间戳）
   * @returns 是否成功更新
   */
  update(taskId: string, newNextRunAt: number): boolean {
    const index = this.heap.findIndex((item) => item.taskId === taskId);
    if (index === -1) return false;

    const oldNextRunAt = this.heap[index].nextRunAt;
    this.heap[index].nextRunAt = newNextRunAt;

    // 根据新旧值决定调整方向
    if (newNextRunAt < oldNextRunAt) {
      this.bubbleUp(index);
    } else if (newNextRunAt > oldNextRunAt) {
      this.bubbleDown(index);
    }
    return true;
  }

  /**
   * 查找指定任务
   * @param taskId 任务 ID
   * @returns 找到的元素，如果不存在则返回 undefined
   */
  find(taskId: string): T | undefined {
    return this.heap.find((item) => item.taskId === taskId);
  }

  /**
   * 检查是否包含指定任务
   * @param taskId 任务 ID
   */
  has(taskId: string): boolean {
    return this.heap.some((item) => item.taskId === taskId);
  }

  /**
   * 清空堆
   */
  clear(): void {
    this.heap = [];
  }

  /**
   * 获取所有元素（用于调试/序列化）
   * 注意：返回的是副本，修改不会影响堆
   */
  toArray(): T[] {
    return [...this.heap];
  }

  /**
   * 从数组批量构建堆
   * 使用 O(n) 的 heapify 算法
   * @param items 元素数组
   */
  static fromArray<T extends HeapItem>(items: T[]): MinHeap<T> {
    const heap = new MinHeap<T>();
    heap.heap = [...items];

    // 从最后一个非叶子节点开始，向下调整
    const lastNonLeafIndex = Math.floor((items.length - 2) / 2);
    for (let i = lastNonLeafIndex; i >= 0; i--) {
      heap.bubbleDown(i);
    }

    return heap;
  }

  // ===== Private Methods =====

  /**
   * 向上冒泡（用于插入后调整）
   */
  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].nextRunAt <= this.heap[index].nextRunAt) {
        break;
      }
      // 交换
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }

  /**
   * 向下冒泡（用于删除后调整）
   */
  private bubbleDown(index: number): void {
    const length = this.heap.length;

    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < length && this.heap[left].nextRunAt < this.heap[smallest].nextRunAt) {
        smallest = left;
      }

      if (right < length && this.heap[right].nextRunAt < this.heap[smallest].nextRunAt) {
        smallest = right;
      }

      if (smallest === index) break;

      // 交换
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }
}
