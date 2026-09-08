/**
 * RetryPolicy 值对象
 * 
 * 重试策略：启用状态、最大重试次数、延迟配置
 * 不可变性（所有修改返回新实例）
 */

import { ValueObject } from '@memoflow/utils/domain';
import type {
  IRetryPolicy,
  RetryPolicyDTO,
} from '@memoflow/contracts/schedule';

/**
 * RetryPolicy 值对象实现
 */
export class RetryPolicy extends ValueObject<RetryPolicyDTO> implements IRetryPolicy {

  private constructor(props: RetryPolicyDTO) {
    super(props);
  }

  // ================= 工厂方法 =================
  
  public static create(props: RetryPolicyDTO): RetryPolicy {
    this.validate(props);
    return new RetryPolicy(props);
  }

  public static createDefault(): RetryPolicy {
    return new RetryPolicy({
      enabled: true,
      maxRetries: 3,
      retryDelay: 5000, // 5秒
      backoffMultiplier: 2,
      maxRetryDelay: 60000, // 60秒
    });
  }

  public static createDisabled(): RetryPolicy {
    return new RetryPolicy({
      enabled: false,
      maxRetries: 0,
      retryDelay: 0,
      backoffMultiplier: 1,
      maxRetryDelay: 0,
    });
  }

  public static fromDTO(dto: RetryPolicyDTO): RetryPolicy {
    return new RetryPolicy(dto);
  }

  // ================= 校验 =================
  
  private static validate(props: RetryPolicyDTO): void {
    if (props.enabled) {
      if (props.maxRetries < 1) {
        throw new Error('maxRetries must be at least 1 when enabled');
      }
      if (props.retryDelay < 0) {
        throw new Error('retryDelay must be non-negative');
      }
      if (props.backoffMultiplier < 1) {
        throw new Error('backoffMultiplier must be at least 1');
      }
    }
  }

  // ================= Getters =================

  public get enabled(): boolean {
    return this.props.enabled;
  }

  public get maxRetries(): number {
    return this.props.maxRetries;
  }

  public get retryDelay(): number {
    return this.props.retryDelay;
  }

  public get backoffMultiplier(): number {
    return this.props.backoffMultiplier;
  }

  public get maxRetryDelay(): number {
    return this.props.maxRetryDelay;
  }

  // ================= 行为方法 =================

  public with(
    updates: Partial<RetryPolicyDTO>,
  ): RetryPolicy {
    const newProps = { ...this.props, ...updates };
    RetryPolicy.validate(newProps);
    return new RetryPolicy(newProps);
  }

  public setEnabled(enabled: boolean): RetryPolicy {
    return this.with({ enabled });
  }

  public setMaxRetries(maxRetries: number): RetryPolicy {
    return this.with({ maxRetries });
  }

  public shouldRetry(currentAttempt: number): boolean {
    if (!this.props.enabled) return false;
    return currentAttempt < this.props.maxRetries;
  }

  public calculateNextRetryDelay(currentAttempt: number): number {
    if (!this.props.enabled) return 0;
    const delay = this.props.retryDelay * Math.pow(this.props.backoffMultiplier, currentAttempt);
    return Math.min(delay, this.props.maxRetryDelay);
  }

  // ================= 计算属性 =================

  public get isDisabled(): boolean {
    return !this.props.enabled;
  }

  public get policyDescription(): string {
    if (!this.props.enabled) return '已禁用';
    const minDelay = Math.round(this.props.retryDelay / 1000);
    const maxDelay = Math.round(this.props.maxRetryDelay / 1000);
    return `最多重试 ${this.props.maxRetries} 次，延迟 ${minDelay}s ~ ${maxDelay}s`;
  }

  public get retryDelayFormatted(): string {
    return `${Math.round(this.props.retryDelay / 1000)} 秒`;
  }

  public get maxRetryDelayFormatted(): string {
    return `${Math.round(this.props.maxRetryDelay / 1000)} 秒`;
  }

  // ================= 序列化 =================

  public toDTO(): RetryPolicyDTO {
    return { ...this.props };
  }
}
