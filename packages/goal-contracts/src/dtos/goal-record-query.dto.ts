/**
 * Goal Record Query Options DTO
 * 进度记录查询选项
 *
 * 用于：
 * - API 请求参数（前端调用）
 * - Repository 查询参数（后端仓储）
 */

/**
 * 进度记录查询选项
 */
export interface GoalRecordQueryOptionsDTO {
  /**
   * 开始时间（可选）
   * 只返回 recordedAt >= startTime 的记录
   * 使用 Unix 时间戳（毫秒）
   */
  startTime?: number;

  /**
   * 结束时间（可选）
   * 只返回 recordedAt <= endTime 的记录
   * 使用 Unix 时间戳（毫秒）
   */
  endTime?: number;

  /**
   * 排序方式（默认 'asc'）
   * - 'asc': 按时间升序（最早的在前）
   * - 'desc': 按时间降序（最新的在前）
   */
  orderBy?: 'asc' | 'desc';

  /**
   * 限制返回数量（可选）
   */
  limit?: number;
}
