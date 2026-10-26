/**
 * CategoryPreference 值对象
 *
 * 分类偏好：启用状态、渠道配置、重要性级别
 * 不可变性（所有修改返回新实例）
 */

import { ValueObject } from '@memoflow/utils/domain';
import type {
  CategoryPreference as ICategoryPreference,
  CategoryPreferenceDTO,
  ChannelPreference,
} from '@memoflow/contracts/notification';
import type { ImportanceLevel } from '@memoflow/shared-primitives';

/**
 * CategoryPreference 值对象实现
 */
export class CategoryPreference
  extends ValueObject<CategoryPreferenceDTO>
  implements ICategoryPreference
{
  private constructor(props: CategoryPreferenceDTO) {
    super(props);
  }

  // ================= 工厂方法 =================

  public static create(props: CategoryPreferenceDTO): CategoryPreference {
    this.validate(props);
    return new CategoryPreference(props);
  }

  public static createDefault(): CategoryPreference {
    return new CategoryPreference({
      enabled: true,
      channels: {
        inApp: true,
        email: false,
        push: true,
        sms: false,
      },
      importance: ['Important', 'Moderate'],
    });
  }

  public static fromDTO(dto: CategoryPreferenceDTO): CategoryPreference {
    return new CategoryPreference(dto);
  }

  // ================= 校验 =================

  private static validate(props: CategoryPreferenceDTO): void {
    if (!props.channels) {
      throw new Error('Channels configuration is required');
    }
  }

  // ================= Getters =================

  public get enabled(): boolean {
    return this.props.enabled;
  }

  public get channels(): ChannelPreference {
    return { ...this.props.channels };
  }

  public get importance(): ImportanceLevel[] {
    return [...this.props.importance];
  }

  // ================= 行为方法 =================

  public setEnabled(enabled: boolean): CategoryPreference {
    return new CategoryPreference({ ...this.props, enabled });
  }

  public updateChannels(channels: Partial<ChannelPreference>): CategoryPreference {
    return new CategoryPreference({
      ...this.props,
      channels: { ...this.props.channels, ...channels },
    });
  }

  public setImportance(importance: ImportanceLevel[]): CategoryPreference {
    return new CategoryPreference({ ...this.props, importance });
  }

  // ================= 计算属性 =================

  public get hasAnyChannel(): boolean {
    const c = this.props.channels;
    return c.inApp || c.email || c.push || c.sms;
  }

  public get isEffective(): boolean {
    return this.props.enabled && this.hasAnyChannel;
  }

  // ================= 序列化 =================

  public toDTO(): CategoryPreferenceDTO {
    return {
      enabled: this.props.enabled,
      channels: { ...this.props.channels },
      importance: [...this.props.importance],
    };
  }
}
