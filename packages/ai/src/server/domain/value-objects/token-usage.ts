/**
 * TokenUsage Value Object - Server
 * Token 使用量值对象 - 服务端
 */

import type { TokenUsageDTO } from '@memoflow/ai-contracts';

/**
 * TokenUsage 值对象 - 服务端
 * 封装 AI 任务的 Token 消耗统计
 */
export class TokenUsage {
  private constructor(
    public readonly promptTokens: number,
    public readonly completionTokens: number,
    public readonly totalTokens: number,
  ) {}

  /**
   * 创建 TokenUsage 实例
   */
  public static create(props: {
    promptTokens: number;
    completionTokens: number;
    totalTokens?: number;
  }): TokenUsage {
    const totalTokens = props.totalTokens ?? props.promptTokens + props.completionTokens;
    return new TokenUsage(props.promptTokens, props.completionTokens, totalTokens);
  }

  /**
   * 创建空的 TokenUsage
   */
  public static zero(): TokenUsage {
    return new TokenUsage(0, 0, 0);
  }

  /**
   * 从 Server DTO 创建
   */
  public static fromDTO(dto: TokenUsageDTO): TokenUsage {
    return new TokenUsage(dto.promptTokens, dto.completionTokens, dto.totalTokens);
  }

  /**
   * 转换为 Server DTO
   */
  public toDTO(): TokenUsageDTO {
    return {
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.totalTokens,
    };
  }

  /**
   * 合并两个 TokenUsage（用于累计统计）
   */
  public add(other: TokenUsage): TokenUsage {
    return new TokenUsage(
      this.promptTokens + other.promptTokens,
      this.completionTokens + other.completionTokens,
      this.totalTokens + other.totalTokens,
    );
  }

  /**
   * 检查是否为零
   */
  public isZero(): boolean {
    return this.totalTokens === 0;
  }

  /**
   * 检查是否超过限制
   */
  public exceedsLimit(limit: number): boolean {
    return this.totalTokens > limit;
  }
}
