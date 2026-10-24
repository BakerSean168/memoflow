/**
 * An interface for equatable objects.
 * 现在主要用于 DDD 基类
 */
export interface Equatable {
  /**
   * 检查当前对象是否与另一个对象相等。
   * @param other 另一个要比较的对象
   * @returns 如果两个对象相等则返回 true，否则返回 false
   */
  equals(other: unknown): boolean;
}
