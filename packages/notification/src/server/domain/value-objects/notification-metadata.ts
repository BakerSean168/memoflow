/**
 * NotificationMetadata 值对象
 *
 * 通知元数据：图标、图片、颜色、声音、徽章等
 * 不可变性（所有修改返回新实例）
 */

import { ValueObject } from '@memoflow/utils/domain';
import type {
  NotificationMetadata as INotificationMetadata,
  NotificationMetadataDTO,
} from '@memoflow/contracts/notification';

/**
 * NotificationMetadata 值对象实现
 */
export class NotificationMetadata
  extends ValueObject<NotificationMetadataDTO>
  implements INotificationMetadata
{
  private constructor(props: NotificationMetadataDTO) {
    super(props);
  }

  // ================= 工厂方法 =================

  public static create(props: NotificationMetadataDTO): NotificationMetadata {
    return new NotificationMetadata(props);
  }

  public static createDefault(): NotificationMetadata {
    return new NotificationMetadata({
      icon: null,
      image: null,
      color: null,
      sound: null,
      badge: null,
    });
  }

  public static fromDTO(dto: NotificationMetadataDTO): NotificationMetadata {
    return new NotificationMetadata(dto);
  }

  // ================= Getters =================

  public get icon(): string | null {
    return this.props.icon;
  }

  public get image(): string | null {
    return this.props.image;
  }

  public get color(): string | null {
    return this.props.color;
  }

  public get sound(): string | null {
    return this.props.sound;
  }

  public get badge(): number | null {
    return this.props.badge;
  }

  public get data(): unknown {
    return this.props.data;
  }

  // ================= 行为方法 =================

  public setIcon(icon: string | null): NotificationMetadata {
    return new NotificationMetadata({ ...this.props, icon });
  }

  public setColor(color: string | null): NotificationMetadata {
    return new NotificationMetadata({ ...this.props, color });
  }

  public setBadge(badge: number | null): NotificationMetadata {
    return new NotificationMetadata({ ...this.props, badge });
  }

  // ================= 计算属性 =================

  public get hasIcon(): boolean {
    return this.props.icon !== null;
  }

  public get hasImage(): boolean {
    return this.props.image !== null;
  }

  public get hasSound(): boolean {
    return this.props.sound !== null;
  }

  // ================= 序列化 =================

  public toDTO(): NotificationMetadataDTO {
    return { ...this.props };
  }
}
