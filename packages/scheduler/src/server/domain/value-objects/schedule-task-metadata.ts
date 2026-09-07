/**
 * TaskMetadata 值对象（Schedule模块）
 * 
 * 任务元数据：payload、标签、优先级、超时
 * 不可变性（所有修改返回新实例）
 */

import { ValueObject } from '@memoflow/utils/domain';
import type {
  ITaskMetadata,
  TaskMetadataDTO,
  TaskPriority,
} from '@memoflow/contracts/schedule';

/**
 * TaskMetadata 值对象实现（Schedule模块专用）
 */
export class ScheduleTaskMetadata extends ValueObject<TaskMetadataDTO> implements ITaskMetadata {

  private constructor(props: TaskMetadataDTO) {
    super(props);
  }

  // ================= 工厂方法 =================
  
  public static create(props: TaskMetadataDTO): ScheduleTaskMetadata {
    return new ScheduleTaskMetadata(props);
  }

  public static createDefault(): ScheduleTaskMetadata {
    return new ScheduleTaskMetadata({
      payload: {},
      tags: [],
      priority: 'Normal',
      timeout: null,
    });
  }

  public static fromDTO(dto: TaskMetadataDTO): ScheduleTaskMetadata {
    return new ScheduleTaskMetadata(dto);
  }

  // ================= Getters =================

  public get payload(): Record<string, unknown> {
    return { ...this.props.payload };
  }

  public get tags(): string[] {
    return [...this.props.tags];
  }

  public get priority(): TaskPriority {
    return this.props.priority;
  }

  public get timeout(): number | null {
    return this.props.timeout;
  }

  // ================= 行为方法 =================

  public with(
    updates: Partial<TaskMetadataDTO>,
  ): ScheduleTaskMetadata {
    return new ScheduleTaskMetadata({ ...this.props, ...updates });
  }

  public setPayload(payload: Record<string, unknown>): ScheduleTaskMetadata {
    return this.with({ payload });
  }

  public addTag(tag: string): ScheduleTaskMetadata {
    if (this.props.tags.includes(tag)) return this;
    return this.with({ tags: [...this.props.tags, tag] });
  }

  public removeTag(tag: string): ScheduleTaskMetadata {
    return this.with({ tags: this.props.tags.filter(t => t !== tag) });
  }

  public setPriority(priority: TaskPriority): ScheduleTaskMetadata {
    return this.with({ priority });
  }

  public setTimeout(timeout: number | null): ScheduleTaskMetadata {
    return this.with({ timeout });
  }

  // ================= 计算属性 =================

  public get hasTags(): boolean {
    return this.props.tags.length > 0;
  }

  public get hasTimeout(): boolean {
    return this.props.timeout !== null;
  }

  public get hasPayload(): boolean {
    return Object.keys(this.props.payload).length > 0;
  }

  public get priorityDisplay(): string {
    const displays: Record<TaskPriority, string> = {
      Low: '低',
      Normal: '普通',
      High: '高',
      Urgent: '紧急',
    };
    return displays[this.props.priority] || this.props.priority;
  }

  public get priorityColor(): string {
    const colors: Record<TaskPriority, string> = {
      Low: 'gray',
      Normal: 'blue',
      High: 'orange',
      Urgent: 'red',
    };
    return colors[this.props.priority] || 'gray';
  }

  public get tagsDisplay(): string {
    return this.props.tags.join(', ') || '-';
  }

  public get timeoutFormatted(): string {
    if (this.props.timeout === null) return '无限制';
    const seconds = Math.round(this.props.timeout / 1000);
    if (seconds < 60) return `${seconds} 秒`;
    return `${Math.round(seconds / 60)} 分钟`;
  }

  public get payloadSummary(): string {
    const count = Object.keys(this.props.payload).length;
    return count > 0 ? `${count} 个字段` : '空';
  }

  // ================= 序列化 =================

  public toDTO(): TaskMetadataDTO {
    return {
      payload: { ...this.props.payload },
      tags: [...this.props.tags],
      priority: this.props.priority,
      timeout: this.props.timeout,
    };
  }
}
